import { GoogleGenAI } from "@google/genai";
import { GameState, Team, CommandType, KnowledgeBase, BattleRecord, AIState } from "../types";
import { AI_CONFIG } from "../constants";

export interface TacticalResult {
  globalAnalysis: string; // 总体情况分析
  command: CommandType;
  purchaseUpgrade?: string;
  teammateReports: {
    id: string;
    report: string; // 队友报告的情况和策略
    strategy: AIState; // 建议的状态
  }[];
  isError: boolean;
}

const TIMEOUT = AI_CONFIG.REQUEST_TIMEOUT;

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
let hasNotifiedSuccess = false;

async function checkOllamaStatus() {
  const now = Date.now();
  if (now - lastOllamaCheck < 60000) return ollamaAvailable; // 每分钟检查一次
  
  try {
    const response = await fetch(`${AI_CONFIG.OLLAMA_API_BASE}/api/tags`, { 
      method: 'GET'
    }).catch(err => {
      return null;
    });
    
    const isOk = !!(response && response.ok);
    ollamaAvailable = isOk;
  } catch (e) {
    ollamaAvailable = false;
  }
  lastOllamaCheck = now;
  return ollamaAvailable;
}

// 简单的规则引擎，作为 AI 离线时的降级方案
function getRuleBasedTactics(state: GameState, team: Team): TacticalResult {
  const isAlly = team === Team.ALLY;
  const allies = (isAlly ? state.allies : state.enemies).filter(t => t.health > 0);
  const myBase = state.beds.find(b => b.team === team);
  const enemyBase = state.beds.find(b => b.team !== team);
  
  const isUnderAttack = (myBase?.captureProgress || 0) > 0;
  const canCapture = (enemyBase?.captureProgress || 0) < 4000;
  
  let command = CommandType.FREE_PLANNING;
  let analysis = "执行自主战术规程。";
  
  if (isUnderAttack) {
    command = CommandType.DEFEND;
    analysis = "检测到基地受袭，全员回防！";
  } else if (allies.length >= 3) {
    command = CommandType.ATTACK;
    analysis = "我方战力充沛，发起总攻。";
  }

  return {
    globalAnalysis: analysis,
    command: command,
    teammateReports: allies.map(a => {
      let strategy = AIState.ATTACK_CORE;
      let report = "收到指令，正在推进。";
      
      if (isUnderAttack) {
        strategy = AIState.DEFEND_CORE;
        report = "正在回防基地！";
      } else if (a.health < 40) {
        strategy = AIState.SEEK_HEALTH;
        report = "状态不佳，寻找补给。";
      }
      
      return { id: a.id, report, strategy };
    }),
    isError: true
  };
}

export const getTacticalAdvice = async (state: GameState, team: Team): Promise<TacticalResult> => {
  const isAlly = team === Team.ALLY;
  const allies = (isAlly ? state.allies : state.enemies).filter(t => t.health > 0);
  const enemies = (isAlly ? state.enemies : [state.player, ...state.allies]).filter(t => t.health > 0);
  const myBase = state.beds.find(b => b.team === team);
  const enemyBase = state.beds.find(b => b.team !== team);

  const isPlayerAuto = isAlly && state.isAIControlled;

  const prompt = `
    你现在是坦克大战中的顶级指挥官（模型: ${AI_CONFIG.OLLAMA_MODEL}）。你的智商已被设定为最高等级。
    
    目标: 彻底击败${isAlly ? '敌方' : '玩家和他的盟友'}。
    ${isPlayerAuto ? '【特急指令】玩家已开启 AI 代打模式，请你直接接管玩家坦克的控制，将其视为你的王牌战力进行调度。' : ''}
    
    当前战场局势:
    - 我方存活坦克: ${allies.length}
    - 敌方存活坦克: ${enemies.length}
    - 玩家坦克生命值: ${state.player.health}% ${isPlayerAuto ? '(当前由你代打控制)' : ''}
    - 我方基地占领进度: ${myBase?.captureProgress || 0}/5000
    - 敌方基地占领进度: ${enemyBase?.captureProgress || 0}/5000

    请展现你的战略天赋。不要只进行简单的攻击，要考虑包抄、诱敌、优先摧毁敌方核心、以及在危急时刻保护基地。
    
    【重要：对话要求】
    在 teammateReports 的 report 字段中，请让坦克手们像在无线电中真实交流一样。
    例如：“1号收到，正在从左翼包抄！”、“2号弹药充足，请求总攻！”、“基地告急，我正在全速回援！”
    
    必须以 JSON 格式返回:
    {
      "globalAnalysis": "当前整体战略意图（如：全线突击、防守反击、围魏救赵）",
      "command": "当前主命令关键词（中文，如：全军突击、固守基地、搜索物资）",
      "teammateReports": [
        { "id": "坦克ID", "report": "战术执行反馈（展现个性和实时行动）", "strategy": "ATTACK_CORE/DEFEND_CORE/SEEK_HEALTH/PATHFINDING/AMBUSH/RECON/SURROUND_MOVE" }
      ],
      "purchaseUpgrade": "FIRE_RATE/DAMAGE/SPEED/REGEN/HASTE"
    }
  `;

  const useOllamaFirst = AI_CONFIG.USE_OLLAMA_FIRST;

  if (useOllamaFirst) {
    const ollamaRes = await tryOllama(prompt, allies);
    if (ollamaRes) return ollamaRes;
  }

  // Try Gemini
  try {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (apiKey && apiKey !== 'PLACEHOLDER_API_KEY') {
      const ai: any = new GoogleGenAI({ apiKey } as any);
      const model = ai.getGenerativeModel({ model: "gemini-1.5-flash" });
      const response = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        systemInstruction: "你是一位精通坦克战术的AI指挥官。必须以 JSON 格式回答。必须用中文回答。",
        generationConfig: { temperature: 0.8 }
      });
      
      const text = response.response.text();
      const match = text.match(/\{.*\}/s);
      if (match) {
        const res = JSON.parse(match[0]);
        return { ...res, isError: false };
      }
    }
  } catch (error) {
    console.warn("Gemini Error:", error);
  }

  if (!useOllamaFirst) {
    const ollamaRes = await tryOllama(prompt, allies);
    if (ollamaRes) return ollamaRes;
  }

  // Final Fallback: Rule-based
  return getRuleBasedTactics(state, team);
};

async function tryOllama(prompt: string, allies: any[]): Promise<TacticalResult | null> {
  const isOllamaRunning = await checkOllamaStatus();
  if (!isOllamaRunning) return null;

  try {
    const response = await fetchWithTimeout(`${AI_CONFIG.OLLAMA_API_BASE}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: AI_CONFIG.OLLAMA_MODEL,
        prompt: prompt,
        system: "你是一位精通坦克战术的AI指挥官。必须以 JSON 格式回答。必须用中文回答。",
        stream: false,
        options: {
          temperature: 0.7,
          num_predict: 800,
        }
      }),
    });

    if (response.ok) {
      const data = await response.json();
      const match = data.response.match(/\{.*\}/s);
      if (match) {
        const result = JSON.parse(match[0]);
        return { ...result, isError: false };
      }
    }
  } catch (error: any) {
    // 静默处理错误
    ollamaAvailable = false;
    lastOllamaCheck = Date.now();
  }
  return null;
}

export const reflectOnBattle = async (record: BattleRecord, kb: KnowledgeBase): Promise<{ learnedTactic?: string, playerPattern?: string, innovation?: string }> => {
  const prompt = `
    战斗结束分析报告:
    - 获胜方: ${record.winner}
    - 玩家击杀数: ${record.playerStats.kills}
    - 玩家得分: ${record.playerStats.score}
    - 历史已学战术: ${kb.learnedTactics.join(', ')}
    - 已知玩家模式: ${kb.playerPatterns.join(', ')}

    请作为 AI 战略分析专家，进行以下分析:
    1. 从本次战斗中总结出一条新的有效战术。
    2. 观察并记录玩家的一项行为特征。
    3. 提出一个针对未来的创新策略构想。

    请严格按 JSON 格式返回: {"tactic": "战术描述", "pattern": "玩家模式", "innovation": "创新构想"}
  `;

  try {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (apiKey && apiKey !== 'PLACEHOLDER_API_KEY') {
      const ai: any = new GoogleGenAI({ apiKey } as any);
      const model = ai.getGenerativeModel({ model: "gemini-1.5-flash" });
      const response = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        systemInstruction: "你是一位精通坦克战术的AI战略专家。必须以 JSON 格式回答。必须用中文回答。",
        generationConfig: {
          temperature: 0.9,
        }
      });
      
      const text = response.response.text();
      const match = text.match(/\{.*\}/s);
      if (match) {
        const reflectionResult = JSON.parse(match[0]);
        return { learnedTactic: reflectionResult.tactic, playerPattern: reflectionResult.pattern, innovation: reflectionResult.innovation };
      }
    }
  } catch (error) {
    console.error("Reflection failed:", error);
  }

  return {};
};
