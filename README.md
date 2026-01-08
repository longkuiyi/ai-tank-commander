<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />

# AI Tank Commander: Tactical Arena
AI 驱动的实时坦克战术竞技场（Canvas + React + Ollama / Gemini）
</div>

---

## 概览
这是一个俯视角实时坦克对战原型：玩家可手动操控，也可以一键交给 AI 接管；盟友与敌方坦克都会根据“战术指令 + 局部 AI 行为”协同推进，在基地占领进度、地形减速与可破坏掩体的共同约束下完成战斗决策。

---

## 核心特性（优点一眼看懂）
- **AI 指挥官接入**：可通过 Ollama 调用大模型生成全局战术与队友无线电报告，并支持降级策略（规则引擎）。
- **双端控制**：桌面端 WASD 移动 + 鼠标炮塔指向 + 按住鼠标射击；移动端虚拟摇杆与开火按钮。
- **基地占领机制**：双方各有一个基地；进入占领范围推进进度，防守方可回退进度，进度达阈值即判定胜负。
- **环境与掩体**：水域/泥沼会降低坦克与子弹速度；反弹墙会让子弹产生反射；玻璃/泥墙等可被摧毁。
- **成长与经济**：击杀获得金币；军需商城可购买全队永久升级（伤害/防御/速度/回血/急迫）。
- **战斗辅助**：自瞄与自动射击可开关；支持 AI 代打接管玩家坦克。
- **性能优化**：墙体与坦克使用空间网格加速碰撞/命中检测；AI 逻辑分帧执行；渲染使用视口裁剪。

---

## 技术栈与实现要点
- **前端**：React + TypeScript + Vite
- **渲染**：HTML5 Canvas 2D（单画布世界坐标渲染，视口裁剪）
- **战斗与物理**：基础碰撞检测 + 子弹反射 + 坦克重叠推开（Push-out）+ 平滑绕路策略
- **AI**：
  - 首选：Ollama `/api/generate`（通过 Vite 代理解决浏览器跨域）
  - 可选：Gemini（需要 `VITE_GEMINI_API_KEY`）
  - 兜底：规则引擎（AI 离线时仍可运行）

---

## 玩法与战场系统

### 胜利条件
- 双方各拥有一个基地（我方 / 敌方），基地周围有明显的占领圈与装饰。
- 坦克进入敌方基地的占领半径会增加“占领进度”，离开则停止推进。
- 防守方若在圈内，则会快速压制并回退对方的占领进度。
- 某一方基地占领进度达到阈值后，本局结束并判定胜负。

### 单位类型
- 玩家坦克
  - 支持键鼠或移动端虚拟摇杆操作。
  - 可在系统设置中开启“AI 代打”“自动瞄准”“自动射击”。
- 盟友坦克
  - 会根据当前战术指令（进攻 / 占点 / 包围 / 侦查 / 防守）自动行动。
  - 在 HUD 左侧“战术指挥链路”中会以对话形式汇报战况。
- 敌方坦克
  - 拥有自己的指挥官逻辑，会对玩家与我方基地做出针对性行动。

### 地形与障碍物
- 水域（WATER）
  - 坦克经过会显著减速。
  - 子弹穿过时会被减速，形成“水中减速线”效果。
- 泥沼与泥土墙（SWAMP / MUD）
  - 泥沼区域会强烈限制移动速度，适合作为天然减速陷阱。
  - 泥土墙可被子弹摧毁，用火力“开路”。
- 反弹墙（REBOUND）
  - 子弹命中后会根据碰撞方向反射。
  - 适用于打角度和间接火力。
- 玻璃墙（GLASS）
  - 半透明视效，能被迅速破坏，适合设计“临时掩体”玩法。

### 物资与增益
- 地图上会定期刷出随机物资：
  - 速度加成：短时间内获得高额移速增益。
  - 防御加成：显著减免受到的伤害。
  - 持续回血：在一定时间内持续恢复生命。
  - 伤害加成：提高单发伤害输出。
- 我方坦克在己方基地附近会获得额外缓慢回血。

### 军需商城（SHOP）
- 通过击败敌方坦克获取金币。
- 在 HUD 菜单中选择“军需商城”，可为全队购买永久提升：
  - 伤害（damage）
  - 防御（defense）
  - 移动速度（speed）
  - 自动回血效率（regen）
  - 射速与子弹速度（haste）

---

## 操作与快捷键
- **移动（桌面端）**：W / A / S / D
- **瞄准**：鼠标指向决定炮塔方向
- **开火**：按住鼠标左键（移动端为开火按钮）
- **菜单 Tab（打开/切换）**：J（军需商城）/ P（战场情报局）/ Z（系统设置）/ L 或 E（战术指令集）

---

## AI 行为与开关

### 顶层指挥系统
- AI 指挥官会周期性获取战场快照，并调用大模型生成：
  - 全局形势分析（`globalAnalysis`）
  - 当前主战术指令（`command`）
  - 各坦克无线电汇报（`teammateReports`：包含坦克 ID、文本汇报、建议策略）
- 这些信息会：
  - 映射为游戏内战术指令（进攻 / 占点 / 包围 / 防守 / 侦查 / 自由规划）。
  - 在 HUD 中以“战术分析”“队友聊天”形式展示给玩家。

### AI 代打（Autopilot）
- 可在“系统设置”菜单中切换 AI 代打开关。
- 开启后：
  - 玩家坦克移动速度获得额外倍率加成（见 `AI_AUTOPILOT_SPEED_MULT`）。
  - 顶层指挥逻辑会直接控制玩家坦克的行动与对话。
  - 菜单会短暂自动弹出，模拟“AI 下达指令”的过程。

### 自动瞄准与自动射击
- 自动瞄准：
  - 自动搜索一定范围内最近的敌方坦克，并将炮塔对准目标。
  - 若前方有堵路的可破坏墙体，也会优先锁定以开路。
- 自动射击：
  - 在瞄准角度足够接近目标时自动开火。
  - 支持桌面端与移动端。

---

## 快速启动

```bash
git clone <repo-url>
cd ai-tank-commander-tactical-arena
npm install
```

### 可选：启用 Ollama 大模型
- 安装并启动 Ollama（默认监听 `http://localhost:11434`）
- 拉取任意可用模型（示例）：

```bash
ollama pull gpt-oss:120b-cloud
```

项目会通过 Vite 代理访问 Ollama：
- 浏览器请求：`/api-ollama/api/tags`、`/api-ollama/api/generate`
- 实际转发：`http://localhost:11434/api/tags`、`http://localhost:11434/api/generate`

### 运行
```bash
npm run dev
```
打开 `http://localhost:3000`。

## 配置入口
- AI 模型与超时：`AI_CONFIG` in [constants.ts](file:///Users/diqunfang/Desktop/tankGemini/ai-tank-commander-tactical-arena/constants.ts#L86-L92)
- 代理设置：Vite `server.proxy` in [vite.config.ts](file:///Users/diqunfang/Desktop/tankGemini/ai-tank-commander-tactical-arena/vite.config.ts#L8-L27)
- Gemini Key（可选）：设置环境变量 `VITE_GEMINI_API_KEY`

---

## 开发者指南（文件结构与可调参数）

### 关键文件
- 游戏主循环与渲染：
  - [GameCanvas.tsx](file:///Users/diqunfang/Desktop/tankGemini/ai-tank-commander-tactical-arena/components/GameCanvas.tsx)
- HUD、菜单与军需商城：
  - [HUD.tsx](file:///Users/diqunfang/Desktop/tankGemini/ai-tank-commander-tactical-arena/components/HUD.tsx)
- AI 指挥官与大模型调用：
  - [geminiService.ts](file:///Users/diqunfang/Desktop/tankGemini/ai-tank-commander-tactical-arena/services/geminiService.ts)
- AI 记忆系统与战后学习：
  - [memoryService.ts](file:///Users/diqunfang/Desktop/tankGemini/ai-tank-commander-tactical-arena/services/memoryService.ts)
- 全局常量与数值平衡：
  - [constants.ts](file:///Users/diqunfang/Desktop/tankGemini/ai-tank-commander-tactical-arena/constants.ts)
- 类型定义与基础枚举：
  - [types.ts](file:///Users/diqunfang/Desktop/tankGemini/ai-tank-commander-tactical-arena/types.ts)

### 常见可调参数
- 地图大小、单位尺寸等：
  - `WORLD_WIDTH` / `WORLD_HEIGHT`
  - `TANK_SIZE` / `BULLET_SIZE` / `WALL_SIZE` / `BED_SIZE`
- 速度与数值：
  - `PLAYER_SPEED` / `AI_SPEED` / `AI_AUTOPILOT_SPEED_MULT`
  - `BULLET_SPEED` / `BULLET_DAMAGE`
  - 各类 Buff 时长与系数（`ITEM_BUFF_VALUES` 等）
- 地形减速与子弹减速：
  - `WATER_SLOW_FACTOR` / `SWAMP_SLOW_FACTOR`
  - `BULLET_WATER_SLOW_FACTOR` / `BULLET_SWAMP_SLOW_FACTOR`
- 基地相关：
  - `CAPTURE_TIME_REQUIRED`（占领所需进度）
  - `CAPTURE_RADIUS`（占领半径）

### AI 相关配置
- 优先使用的模型与请求超时：
  - `AI_CONFIG.OLLAMA_MODEL`
  - `AI_CONFIG.REQUEST_TIMEOUT`
- 是否优先尝试 Ollama：
  - `AI_CONFIG.USE_OLLAMA_FIRST`

---

## 贡献
- 欢迎提交 PR：AI 策略、性能优化、地图/障碍物玩法、UI 与交互都很适合扩展。
