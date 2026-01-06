
import { GameState, CommandType, Team } from "../types";

export interface TacticalAdviceResponse {
  command: CommandType;
  dialogue: string;
}

export const getTacticalAdvice = async (state: GameState, team: Team): Promise<TacticalAdviceResponse> => {
  try {
    const isAlly = team === Team.ALLY;
    const myTanks = (isAlly ? state.allies : state.enemies).filter(t => t.health > 0).length + (isAlly && state.player.health > 0 ? 1 : 0);
    const enemyTanks = (isAlly ? state.enemies : [state.player, ...state.allies]).filter(t => t.health > 0).length;
    
    const myBase = state.beds.find(b => b.team === team);
    const enemyBase = state.beds.find(b => b.team !== team);

    const prompt = `
      你现在是坦克大战中的${isAlly ? '友方' : '敌方'}指挥官。你的目标是击败${isAlly ? '敌方' : '玩家和他的盟友'}。
      
      当前战场局势:
      - 我方剩余坦克: ${myTanks}
      - 敌方剩余坦克: ${enemyTanks}
      - 玩家坦克生命值: ${state.player.health}%
      - 我方基地占领进度: ${myBase?.captureProgress || 0}/1000
      - 敌方基地占领进度: ${enemyBase?.captureProgress || 0}/1000
      - ${isAlly ? '当前' : '对方'}指令: ${state.currentCommand}

      可用的指令类型:
      - ATTACK: 全力进攻敌方或其基地
      - DEFEND: 撤退并防守自己的基地
      - CAPTURE: 尝试占领中立或敌方据点
      - SURROUND: 包围并消灭敌方
      - RECON: 分散侦察
      - FREE: 自主作战

      请根据局势输出你的下一步策略。
      必须以 JSON 格式返回，格式如下:
      {
        "command": "指令代码",
        "dialogue": "一句简短的中文战场语音"
      }
    `;

    const response = await fetch("http://localhost:11434/api/generate", {
      method: "POST",
      body: JSON.stringify({
        model: "gpt-oss:120b-cloud",
        prompt: prompt,
        stream: false,
        format: "json"
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.statusText}`);
    }

    const data = await response.json();
    const result = JSON.parse(data.response);

    return {
      command: result.command as CommandType || CommandType.FREE,
      dialogue: result.dialogue || (isAlly ? "保持阵型，继续推进！" : "维持现状，继续战斗。")
    };
  } catch (error) {
    console.error("Ollama API Error:", error);
    return {
      command: CommandType.FREE,
      dialogue: "通讯链路不稳定，执行预设自主作战方案。"
    };
  }
};
