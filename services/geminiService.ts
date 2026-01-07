import { GoogleGenAI } from "@google/genai";
import { GameState, Team, CommandType, KnowledgeBase, BattleRecord, AIState } from "../types";

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

export const getTacticalAdvice = async (state: GameState, team: Team): Promise<TacticalResult> => {
  const isAlly = team === Team.ALLY;
  const allies = isAlly ? state.allies : state.enemies;
  const foes = isAlly ? state.enemies.filter(e => e.health > 0) : [state.player, ...state.allies].filter(a => a.health > 0);
  const friends = isAlly ? [state.player, ...state.allies].filter(a => a.health > 0) : state.enemies.filter(e => e.health > 0);
  
  const myBase = isAlly ? state.beds[0] : state.beds[1];
  const enemyBase = isAlly ? state.beds[1] : state.beds[0];
  const myGold = isAlly ? state.gold : state.enemyGold;

  // 地形特征提取
  const wallTypes = state.walls.reduce((acc: any, w) => {
    acc[w.type] = (acc[w.type] || 0) + 1;
    return acc;
  }, {});
  const wallDensity = state.walls.length / (state.width * state.height / (60 * 60));
  const terrainContext = `掩体密度:${wallDensity > 0.1 ? '极高' : '开阔'}, 主要墙体:${Object.entries(wallTypes).slice(0, 2).map(([k, v]) => k).join(',')}`;

  const prompt = `
    你是一位坦克战术指挥官。请分析当前局势并为每一位队友制定策略。
    
    战场态势 (${isAlly ? '盟军' : '敌军'}):
    - 友军: ${friends.length} (名单: ${allies.map(a => a.nickname).join(', ')})
    - 敌方: ${foes.length}
    - 经济: ${myGold} Gold
    - 基地进度: 我方${myBase.captureProgress}, 敌方${enemyBase.captureProgress}
    - 地形: ${terrainContext}

    输出要求:
    1. globalAnalysis: 简短的总体战术总结 (15字内)。
    2. command: 核心指令 (${Object.values(CommandType).join(', ')})。
    3. purchaseUpgrade: 升级建议 (damage, defense, speed, regen, haste | null)。
    4. teammateReports: 为列表中的每个队友 (${allies.map(a => a.id).join(', ')}) 生成一份报告。
       - report: 队友的口吻报告 (如 "我在A点伏击", "正在建立封锁线", "装甲受损，请求补给")。
       - strategy: 对应 AIState (${Object.values(AIState).join(', ')})。

    请严格按 JSON 格式返回: 
    {
      "globalAnalysis": "...",
      "command": "...",
      "purchaseUpgrade": "...",
      "teammateReports": [{"id": "...", "report": "...", "strategy": "..."}]
    }
  `;

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

  // Fallback to Ollama
  try {
    const response = await fetch("http://localhost:11434/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-oss:120b-cloud",
        prompt: prompt,
        system: "你是一位精通坦克战术的AI指挥官。必须以 JSON 格式回答。必须用中文回答。",
        stream: false,
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
    console.error("Ollama API Error:", error);
  }

  // Final Fallback
  return {
    globalAnalysis: "维持现状，全军警戒。",
    command: CommandType.ATTACK,
    teammateReports: allies.map(a => ({ id: a.id, report: "正在待命。", strategy: AIState.ATTACK_CORE })),
    isError: true
  };
};

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
