
import { GoogleGenAI } from "@google/genai";
import { GameState, Team } from "../types";

export const getTacticalAdvice = async (state: GameState): Promise<{ text: string, isError: boolean, status?: number }> => {
  try {
    const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });
    
    const enemyCount = state.enemies.filter(e => e.health > 0).length;
    const allyCount = state.allies.filter(a => a.health > 0).length + 1;
    const playerHealth = state.player.health;
    
    const prompt = `
      当前坦克大战局势:
      - 友军剩余: ${allyCount}
      - 敌军剩余: ${enemyCount}
      - 你的健康值: ${playerHealth}%
      - 墙体状态: 包含泥土、玻璃、石头、水域和反弹墙。

      请为指挥官提供一句简短的中文战术分析。
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-1.5-flash',
      contents: prompt,
      config: {
        systemInstruction: "你是一位精通坦克战术的AI顾问。保持极简且专业。必须用中文回答。",
        temperature: 0.7,
      }
    });

    return { text: response.text || "战场分析中...", isError: false };
  } catch (error: any) {
    console.error("Gemini API Error:", error);
    return { 
      text: "战术通讯链路受磁场干扰，正在尝试重连...", 
      isError: true 
    };
  }
};
