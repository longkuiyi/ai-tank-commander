import { GoogleGenAI } from "@google/genai";
import { GameState, Team, CommandType, KnowledgeBase, BattleRecord, AIState } from "../types";
import { AI_CONFIG } from "../constants";
import { t, getLanguage } from "../utils/i18n";

export interface TacticalResult {
  globalAnalysis: string; // Overall situation analysis
  command: CommandType;
  purchaseUpgrade?: string;
  teammateReports: {
    id: string;
    report: string; // Teammate's report and strategy
    strategy: AIState; // Suggested state
  }[];
  isError: boolean;
  aiModel?: string; // AI model used
  responseTime?: number; // Response time (ms)
}

const TIMEOUT = AI_CONFIG.REQUEST_TIMEOUT;

// Rate limiter
class RateLimiter {
  private lastCallTime = 0;
  private callCount = 0;
  private readonly minInterval: number;
  private readonly maxCallsPerMinute: number;

  constructor(minInterval = 1000, maxCallsPerMinute = 60) {
    this.minInterval = minInterval;
    this.maxCallsPerMinute = maxCallsPerMinute;
  }

  async waitIfNeeded(): Promise<void> {
    const now = Date.now();
    const timeSinceLastCall = now - this.lastCallTime;

    // Reset counter (per minute)
    if (timeSinceLastCall > 60000) {
      this.callCount = 0;
    }

    // Check if rate limit exceeded
    if (this.callCount >= this.maxCallsPerMinute) {
      const waitTime = 60000 - timeSinceLastCall;
      if (waitTime > 0) {
        const seconds = Math.ceil(waitTime / 1000);
        logger.warn(t('ai.warn.rateLimit').replace('{seconds}', String(seconds)));
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
      this.callCount = 0;
    }

    // Ensure minimum interval
    if (timeSinceLastCall < this.minInterval) {
      await new Promise(resolve => setTimeout(resolve, this.minInterval - timeSinceLastCall));
    }

    this.lastCallTime = Date.now();
    this.callCount++;
  }
}

const geminiRateLimiter = new RateLimiter(1000, 60); // Max 60 calls per minute

// Dynamic API Key management
let dynamicGeminiKey = localStorage.getItem('VITE_GEMINI_API_KEY') || '';

if (typeof window !== 'undefined') {
  window.addEventListener('api-key-updated', (e: any) => {
    dynamicGeminiKey = e.detail;
    logger.info(t('ai.info.apiKeyUpdated'));
  });
}

async function fetchWithTimeout(resource: string, options: any = {}) {
  const { timeout = TIMEOUT } = options;
  
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(resource, {
      ...options,
      signal: controller.signal  
    });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    throw error;
  }
}

let ollamaAvailable = true;
let lastOllamaCheck = 0;
let consecutiveFailures = 0;
const MAX_CHECK_INTERVAL = 300000; // Max 5 minutes

// Logger utility (avoids outputting sensitive info in production)
const isDev = import.meta.env.DEV;
const logger = {
  info: isDev ? (msg: string, ...args: any[]) => console.log(`[AI-INFO] ${msg}`, ...args) : () => {},
  warn: isDev ? (msg: string, ...args: any[]) => console.warn(`[AI-WARN] ${msg}`, ...args) : () => {},
  error: (msg: string, ...args: any[]) => console.error(`[AI-ERROR] ${msg}`, ...args),
};

async function checkOllamaStatus() {
  const now = Date.now();
  // Dynamically adjust check interval: more failures = longer interval
  const checkInterval = Math.min(60000 * Math.pow(2, consecutiveFailures), MAX_CHECK_INTERVAL);
  
  if (now - lastOllamaCheck < checkInterval) return ollamaAvailable;
  
  try {
    const response = await fetch(`${AI_CONFIG.OLLAMA_API_BASE}/api/tags`, { 
      method: 'GET',
      signal: AbortSignal.timeout(3000)
    }).catch(() => {
      return null;
    });
    
    const isOk = !!(response && response.ok);
    ollamaAvailable = isOk;
    
    if (isOk) {
      if (consecutiveFailures > 0) {
        logger.info(t('ai.info.ollamaRestored'));
      }
      consecutiveFailures = 0;
    } else {
      consecutiveFailures++;
      logger.warn(t('ai.warn.ollamaUnavailable').replace('{count}', String(consecutiveFailures)));
    }
  } catch (e) {
    ollamaAvailable = false;
    consecutiveFailures++;
    logger.warn(t('ai.warn.ollamaFailed').replace('{count}', String(consecutiveFailures)));
  }
  lastOllamaCheck = now;
  return ollamaAvailable;
}

// Extract JSON logic (more robust: supports ```json blocks / removes trailing commas / extracts braces)
function extractJSON(text: string): any | null {
  const tryParse = (candidate: string) => {
    try {
      // 1) Remove markdown code fence
      let s = candidate
        .replace(/```(?:json)?/gi, '')
        .replace(/```/g, '')
        .trim();

      // 2) Common AI output: trailing commas
      s = s.replace(/,\s*([}\]])/g, '$1');

      // 3) Remove invisible control characters (keep newline/tab)
      s = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

      // 4) Fix potential illegal escape or unescaped newlines returned by some AIs
      s = s.replace(/\n/g, '\\n').replace(/\r/g, '\\r');
      // Ensure JSON structure (braces, quotes, colons) isn't broken
      // This is a complex fix, safer to fix only inside string values
      // Standard parse first since tryParse is called multiple times

      return JSON.parse(s);
    } catch (e) {
      // If parsing fails, try more aggressive fix: replace all non-structural newlines
      try {
        let s = candidate.trim();
        // Match JSON string values and fix newlines inside them
        s = s.replace(/"([^"]*)"/g, (match, group) => {
          return '"' + group.replace(/\n/g, '\\n').replace(/\r/g, '\\r') + '"';
        });
        return JSON.parse(s);
      } catch {
        return null;
      }
    }
  };

  // Priority: markdown code block
  const block = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (block?.[1]) {
    const parsed = tryParse(block[1]);
    if (parsed) return parsed;
  }

  // Second best: extract first and last curly braces
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first !== -1 && last !== -1 && last > first) {
    const parsed = tryParse(text.slice(first, last + 1));
    if (parsed) return parsed;
  }

  // Fallback: crude match (might consume multiple JSONs)
  try {
    const match = text.match(/\{.*\}/s);
    if (match?.[0]) {
      const parsed = tryParse(match[0]);
      if (parsed) return parsed;
    }
  } catch {
    // ignore
  }

  logger.error(t('ai.error.jsonParse'));
  return null;
}

// Simple rule engine as a fallback for offline AI
function getRuleBasedTactics(state: GameState, team: Team): TacticalResult {
  const isAlly = team === Team.ALLY;
  const allies = (isAlly ? state.allies : state.enemies).filter(t => t.health > 0);
  const enemies = (isAlly ? state.enemies : [state.player, ...state.allies]).filter(t => t.health > 0);
  const myBase = state.beds.find(b => b.team === team);
  const enemyBase = state.beds.find(b => b.team !== team);
  
  const myBaseProgress = myBase?.captureProgress || 0;
  const enemyBaseProgress = enemyBase?.captureProgress || 0;
  const isUnderAttack = myBaseProgress > 0;
  const capturingEnemy = enemyBaseProgress > 0;
  const isCritical = myBaseProgress > 3000; // Base critical
  const isNearVictory = enemyBaseProgress > 3500; // Near victory
  
  let command = CommandType.FREE_PLANNING;
  let analysis = t('ai.analysis.ruleBased');
  
  // Smart decision: choose strategy based on battle severity
  if (isCritical) {
    command = CommandType.DEFEND;
    analysis = t('ai.analysis.critical');
  } else if (isUnderAttack) {
    command = CommandType.DEFEND;
    const defendAnalyses = [
      t('ai.analysis.underAttack.1'),
      t('ai.analysis.underAttack.2'),
      t('ai.analysis.underAttack.3'),
      t('ai.analysis.underAttack.4')
    ];
    analysis = defendAnalyses[Math.floor(Math.random() * defendAnalyses.length)];
  } else if (isNearVictory) {
    command = CommandType.CAPTURE;
    analysis = t('ai.analysis.nearVictory');
  } else if (capturingEnemy) {
    command = CommandType.CAPTURE;
    const captureAnalyses = [
      t('ai.analysis.capturing.1'),
      t('ai.analysis.capturing.2'),
      t('ai.analysis.capturing.3'),
      t('ai.analysis.capturing.4')
    ];
    analysis = captureAnalyses[Math.floor(Math.random() * captureAnalyses.length)];
  } else if (allies.length > enemies.length + 1) {
    command = CommandType.ATTACK;
    const attackAnalyses = [
      t('ai.analysis.attack.1'),
      t('ai.analysis.attack.2'),
      t('ai.analysis.attack.3'),
      t('ai.analysis.attack.4')
    ];
    analysis = attackAnalyses[Math.floor(Math.random() * attackAnalyses.length)];
  } else if (allies.length < enemies.length - 1) {
    command = CommandType.RECON;
    analysis = t('ai.analysis.recon');
  } else {
    command = CommandType.FREE_PLANNING;
    const freeAnalyses = [
      t('ai.analysis.free.1'),
      t('ai.analysis.free.2'),
      t('ai.analysis.free.3'),
      t('ai.analysis.free.4')
    ];
    analysis = freeAnalyses[Math.floor(Math.random() * freeAnalyses.length)];
  }

  return {
    globalAnalysis: analysis,
    command: command,
    teammateReports: allies.map(a => {
      let strategy = AIState.ATTACK_CORE;
      let report = t('ai.report.receive');
      
      const reports = {
        criticalDefend: [t('ai.report.criticalDefend.1'), t('ai.report.criticalDefend.2'), t('ai.report.criticalDefend.3')],
        defend: [t('ai.report.defend.1'), t('ai.report.defend.2'), t('ai.report.defend.3'), t('ai.report.defend.4')],
        attack: [t('ai.report.attack.1'), t('ai.report.attack.2'), t('ai.report.attack.3'), t('ai.report.attack.4')],
        health: [t('ai.report.health.1'), t('ai.report.health.2'), t('ai.report.health.3'), t('ai.report.health.4')],
        capture: [t('ai.report.capture.1'), t('ai.report.capture.2'), t('ai.report.capture.3'), t('ai.report.capture.4')],
        victory: [t('ai.report.victory.1'), t('ai.report.victory.2'), t('ai.report.victory.3')]
      };

      const getRandom = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];

      if (isCritical) {
        strategy = AIState.DEFEND_CORE;
        report = getRandom(reports.criticalDefend);
      } else if (isUnderAttack) {
        strategy = AIState.DEFEND_CORE;
        report = getRandom(reports.defend);
      } else if (a.health < 40) {
        strategy = AIState.SEEK_HEALTH;
        report = getRandom(reports.health);
      } else if (isNearVictory) {
        strategy = AIState.ATTACK_CORE;
        report = getRandom(reports.victory);
      } else if (capturingEnemy) {
        strategy = AIState.ATTACK_CORE;
        report = getRandom(reports.capture);
      } else {
        strategy = AIState.ATTACK_CORE;
        report = getRandom(reports.attack);
      }
      
      return { id: a.id, report, strategy };
    }),
    isError: true
  };
}

function normalizeCommand(raw: any): CommandType | null {
  if (!raw) return null;
  if (Object.values(CommandType).includes(raw as CommandType)) return raw as CommandType;

  const s = String(raw).trim();
  if (!s) return null;

  // Common Chinese/Natural Language Mapping
  if (/(突击|进攻|总攻|集火)/.test(s)) return CommandType.ATTACK;
  if (/(回防|防守|固守|守备|保护基地|基地告急)/.test(s)) return CommandType.DEFEND;
  if (/(占领|夺取|推进占领|据点)/.test(s)) return CommandType.CAPTURE;
  if (/(包围|合围|口袋阵|夹击)/.test(s)) return CommandType.SURROUND;
  if (/(侦查|侦察|测绘|扫描)/.test(s)) return CommandType.RECON;
  if (/(自由|自主|机动|规程|调整)/.test(s)) return CommandType.FREE_PLANNING;

  // Case insensitive / underscore compatibility
  const upper = s.toUpperCase();
  if (upper === 'FREE') return CommandType.FREE_PLANNING;
  if (upper === 'FREE_PLANNING') return CommandType.FREE_PLANNING;

  return null;
}

function normalizePurchaseUpgrade(raw: any): string | undefined {
  if (!raw) return undefined;
  const s = String(raw).trim();
  if (!s) return undefined;

  // Legacy field compatibility: FIRE_RATE -> haste
  const upper = s.toUpperCase();
  if (upper === 'FIRE_RATE') return 'haste';

  const lower = s.toLowerCase();
  const allowed = ['damage', 'defense', 'speed', 'regen', 'haste', 'landmine'];
  if (allowed.includes(lower)) return lower;

  // AI compatibility for DAMAGE/SPEED etc.
  if (allowed.includes(upper.toLowerCase())) return upper.toLowerCase();
  return undefined;
}

function commandNameZh(cmd: CommandType): string {
  switch (cmd) {
    case CommandType.ATTACK: return t('command.attack.name');
    case CommandType.DEFEND: return t('command.defend.name');
    case CommandType.CAPTURE: return t('command.capture.name');
    case CommandType.SURROUND: return t('command.surround.name');
    case CommandType.RECON: return t('command.recon.name');
    case CommandType.FREE_PLANNING: return t('command.free.name');
    default: return String(cmd);
  }
}

function upgradeNameZh(upgrade?: string): string {
  if (!upgrade) return '';
  return t(`game.upgrade.${upgrade}`);
}

function formatDetailedAnalysis(state: GameState, team: Team, base: string, cmd: CommandType, purchaseUpgrade?: string): string {
  const isAlly = team === Team.ALLY;
  const myAlive = (isAlly ? state.allies : state.enemies).filter(t => t.health > 0).length + (isAlly ? (state.player.health > 0 ? 1 : 0) : 0);
  const enemyAlive = (isAlly ? state.enemies : [state.player, ...state.allies]).filter(t => t.health > 0).length;
  const myBase = state.beds.find(b => b.team === team);
  const enemyBase = state.beds.find(b => b.team !== team);
  const myBasePct = myBase ? Math.round((myBase.captureProgress / 5000) * 100) : 0;
  const enemyBasePct = enemyBase ? Math.round((enemyBase.captureProgress / 5000) * 100) : 0;
  const gold = isAlly ? state.gold : state.enemyGold;

  const bullets: string[] = [];

  if (cmd === CommandType.DEFEND) {
    bullets.push(t('ai.analysis.defendBullets.1').replace('{percent}', String(myBasePct)));
    if (state.player.health < 45 && isAlly) {
      bullets.push(t('ai.analysis.defendBullets.2').replace('{percent}', String(Math.round(state.player.health))));
    }
    bullets.push(t('ai.analysis.defendBullets.3'));
  } else if (cmd === CommandType.CAPTURE) {
    bullets.push(t('ai.analysis.captureBullets.1').replace('{percent}', String(enemyBasePct)));
    bullets.push(t('ai.analysis.captureBullets.2'));
  } else if (cmd === CommandType.ATTACK) {
    bullets.push(t('ai.analysis.attackBullets.1').replace('{my}', String(myAlive)).replace('{enemy}', String(enemyAlive)));
    bullets.push(t('ai.analysis.attackBullets.2'));
  } else if (cmd === CommandType.SURROUND) {
    bullets.push(t('ai.analysis.surroundBullets.1').replace('{my}', String(myAlive)).replace('{enemy}', String(enemyAlive)));
    bullets.push(t('ai.analysis.surroundBullets.2'));
  } else if (cmd === CommandType.RECON) {
    bullets.push(t('ai.analysis.reconBullets.1'));
    bullets.push(t('ai.analysis.reconBullets.2'));
  } else {
    bullets.push(t('ai.analysis.freeBullets.1'));
    bullets.push(t('ai.analysis.freeBullets.2'));
  }

  const header = t('ai.analysis.header')
    .replace('{cmd}', commandNameZh(cmd))
    .replace('{myAlive}', String(myAlive))
    .replace('{enemyAlive}', String(enemyAlive))
    .replace('{myBasePct}', String(myBasePct))
    .replace('{enemyBasePct}', String(enemyBasePct))
    .replace('{gold}', String(gold));

  const body = base ? t('ai.analysis.judgment').replace('{base}', base) : '';
  const detail = bullets.length ? t('ai.analysis.points').replace('{points}', bullets.join('\n- ')) : '';
  const upgrade = purchaseUpgrade ? t('ai.analysis.upgrade').replace('{upgrade}', upgradeNameZh(purchaseUpgrade)) : '';

  return `${header}${body}${detail}${upgrade}`.trim();
}

function enrichTacticalResult(state: GameState, team: Team, result: TacticalResult): TacticalResult {
  const normalizedCmd = normalizeCommand((result as any).command) || getRuleBasedTactics(state, team).command;
  const normalizedUpgrade = normalizePurchaseUpgrade((result as any).purchaseUpgrade);
  const baseRaw = typeof (result as any).globalAnalysis === 'string' ? (result as any).globalAnalysis : '';
  
  // Remove hardcoded Chinese word replacements, use more general processing (if needed)
  const base = baseRaw;

  return {
    ...result,
    command: normalizedCmd,
    purchaseUpgrade: normalizedUpgrade,
    teammateReports: Array.isArray((result as any).teammateReports) ? (result as any).teammateReports : [],
    globalAnalysis: formatDetailedAnalysis(state, team, base, normalizedCmd, normalizedUpgrade),
  };
}

export const getTacticalAdvice = async (
  state: GameState,
  team: Team,
  options?: { allowNetwork?: boolean }
): Promise<TacticalResult> => {
  const startTime = performance.now();
  const allowNetwork = options?.allowNetwork !== false;

  // Privacy mode: no external network requests (Ollama/Gemini), direct to rule engine
  if (!allowNetwork) {
    const elapsed = performance.now() - startTime;
    return enrichTacticalResult(state, team, { ...getRuleBasedTactics(state, team), aiModel: 'rule-based', responseTime: elapsed });
  }

  const isAlly = team === Team.ALLY;
  const allies = (isAlly ? state.allies : state.enemies).filter(t => t.health > 0);
  const enemies = (isAlly ? state.enemies : [state.player, ...state.allies]).filter(t => t.health > 0);
  const myBase = state.beds.find(b => b.team === team);
  const enemyBase = state.beds.find(b => b.team !== team);

  const isPlayerAuto = isAlly && state.isAIControlled;

  const prompt = `
    ${t('ai.prompt.role').replace('{model}', AI_CONFIG.OLLAMA_MODEL)}
    
    ${t('ai.prompt.goal').replace('{target}', isAlly ? t('game.enemy') : t('game.teammate'))}
    ${isPlayerAuto ? t('ai.prompt.autoMode') : ''}
    
    ${t('ai.prompt.situation')}
    ${t('ai.prompt.alliesAlive').replace('{count}', String(allies.length))}
    ${t('ai.prompt.enemiesAlive').replace('{count}', String(enemies.length))}
    ${t('ai.prompt.playerHealth').replace('{health}', String(state.player.health)).replace('{autoInfo}', isPlayerAuto ? t('ai.prompt.playerAutoInfo') : '')}
    ${t('ai.prompt.myBaseProgress').replace('{progress}', String(myBase?.captureProgress || 0))}
    ${t('ai.prompt.enemyBaseProgress').replace('{progress}', String(enemyBase?.captureProgress || 0))}

    ${t('ai.prompt.strategyNote')}
    
    ${t('ai.prompt.dialogueRequirement')}
    
    ${t('ai.prompt.formatRequirement')}
    {
      "globalAnalysis": "${t('ai.prompt.analysisPlaceholder')}",
      "command": "ATTACK/DEFEND/CAPTURE/SURROUND/RECON/FREE_PLANNING",
      "teammateReports": [
        { "id": "ID", "report": "${t('ai.prompt.reportPlaceholder')}", "strategy": "ATTACK_CORE/DEFEND_CORE/SEEK_HEALTH/PATHFINDING/AMBUSH/RECON/SURROUND_MOVE" }
      ],
      "purchaseUpgrade": "damage/defense/speed/regen/haste/landmine"
    }
  `;

  const useOllamaFirst = AI_CONFIG.USE_OLLAMA_FIRST;
  let usedModel = 'rule-based';

  if (useOllamaFirst) {
    const ollamaRes = await tryOllama(prompt);
    if (ollamaRes) {
      usedModel = 'ollama';
      const elapsed = performance.now() - startTime;
      logger.info(t('ai.info.aiResponse').replace('{model}', 'Ollama').replace('{time}', elapsed.toFixed(0)));
      return enrichTacticalResult(state, team, { ...ollamaRes, aiModel: usedModel, responseTime: elapsed });
    }
  }

  // Try Gemini with rate limiting
  try {
    const envApiKey = import.meta.env.VITE_GEMINI_API_KEY;
    const apiKey = dynamicGeminiKey || (envApiKey !== 'PLACEHOLDER_API_KEY' ? envApiKey : '');

    if (apiKey) {
      await geminiRateLimiter.waitIfNeeded();
      
      const ai = new GoogleGenAI({ apiKey });
      const model = (ai as any).getGenerativeModel({ model: "gemini-1.5-flash" });
      const response = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        systemInstruction: t('ai.prompt.systemInstruction').replace('{lang}', t(`home.language.${getLanguage().split('-')[0]}`)),
        generationConfig: { temperature: 0.8 }
      });
      
      const text = response.response.text();
      const result = extractJSON(text);
      if (result) {
        usedModel = 'gemini';
        const elapsed = performance.now() - startTime;
        logger.info(t('ai.info.aiResponse').replace('{model}', 'Gemini').replace('{time}', elapsed.toFixed(0)));
        return enrichTacticalResult(state, team, { ...result, isError: false, aiModel: usedModel, responseTime: elapsed });
      }
    }
  } catch (error) {
    logger.error(t('ai.error.geminiFailed'), error);
  }

  if (!useOllamaFirst) {
    const ollamaRes = await tryOllama(prompt);
    if (ollamaRes) {
      usedModel = 'ollama';
      const elapsed = performance.now() - startTime;
      logger.info(t('ai.info.aiResponse').replace('{model}', 'Ollama').replace('{time}', elapsed.toFixed(0)));
      return enrichTacticalResult(state, team, { ...ollamaRes, aiModel: usedModel, responseTime: elapsed });
    }
  }

  // Final Fallback: Rule-based
  const elapsed = performance.now() - startTime;
  logger.warn(t('ai.warn.ruleFallback').replace('{time}', elapsed.toFixed(0)));
  return enrichTacticalResult(state, team, { ...getRuleBasedTactics(state, team), aiModel: usedModel, responseTime: elapsed });
};

async function tryOllama(prompt: string): Promise<TacticalResult | null> {
  const isOllamaRunning = await checkOllamaStatus();
  if (!isOllamaRunning) {
    logger.warn(t('ai.warn.ollamaSkipped'));
    return null;
  }

  try {
    logger.info(t('ai.info.callingOllama').replace('{model}', AI_CONFIG.OLLAMA_MODEL));
    const response = await fetchWithTimeout(`${AI_CONFIG.OLLAMA_API_BASE}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: AI_CONFIG.OLLAMA_MODEL,
        prompt: prompt,
        system: t('ai.prompt.systemInstruction').replace('{lang}', t('home.language.zh')),
        stream: false,
        options: {
          temperature: 0.7,
          num_predict: 256,
        }
      }),
    });

    if (response.ok) {
      const data = await response.json();
      const result = extractJSON(data.response);
      if (result) {
        return { ...result, isError: false };
      } else {
        logger.warn(t('ai.error.jsonParse'));
      }
    } else {
      logger.error(`${t('ai.error.ollamaCallError')}: ${response.status} ${response.statusText}`);
    }
  } catch (error: any) {
    logger.error(t('ai.error.ollamaCallError'), error.message || error);
    ollamaAvailable = false;
    lastOllamaCheck = Date.now();
    consecutiveFailures++;
  }
  return null;
}

export const reflectOnBattle = async (
  record: BattleRecord,
  kb: KnowledgeBase,
  options?: { allowNetwork?: boolean }
): Promise<{ learnedTactic?: string, playerPattern?: string, innovation?: string }> => {
  const startTime = performance.now();
  const allowNetwork = options?.allowNetwork !== false;

  if (!allowNetwork) {
    logger.info(t('ai.info.privacySkipReflection'));
    return {};
  }

  const prompt = `
    ${t('ai.prompt.reflectionTitle')}
    - ${t('gameover.victory')}: ${record.winner}
    - ${t('scoreboard.kills')}: ${record.playerStats.kills}
    - ${t('scoreboard.score')}: ${record.playerStats.score}
    - ${t('scoreboard.learnedTactics')}: ${kb.learnedTactics.join(', ')}
    - ${t('scoreboard.playerPatterns')}: ${kb.playerPatterns.join(', ')}

    ${t('ai.prompt.reflectionInstruction')}

    ${t('ai.prompt.formatRequirement')} {"tactic": "...", "pattern": "...", "innovation": "..."}
  `;

  try {
    logger.info(t('ai.info.startingReflection'));
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (apiKey && apiKey !== 'PLACEHOLDER_API_KEY') {
      await geminiRateLimiter.waitIfNeeded();
      
      const ai = new GoogleGenAI(apiKey);
      const model = (ai as any).getGenerativeModel({ model: "gemini-1.5-flash" });
      const response = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        systemInstruction: t('ai.prompt.systemInstruction').replace('{lang}', t('home.language.zh')),
        generationConfig: {
          temperature: 0.9,
        }
      });
      
      const text = response.response.text();
      const reflectionResult = extractJSON(text);
      if (reflectionResult) {
        const elapsed = performance.now() - startTime;
        logger.info(t('ai.info.reflectionComplete').replace('{time}', elapsed.toFixed(0)));
        return { 
          learnedTactic: reflectionResult.tactic, 
          playerPattern: reflectionResult.pattern, 
          innovation: reflectionResult.innovation 
        };
      }
    }
  } catch (error) {
    logger.error(t('ai.error.reflectionFailed'), error);
  }

  return {};
};
