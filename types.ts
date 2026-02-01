
export enum Team {
  ALLY = 'ALLY',
  ENEMY = 'ENEMY',
  PLAYER = 'PLAYER'
}

export enum WallType {
  MUD = 'MUD',
  GLASS = 'GLASS',
  STONE = 'STONE',
  WATER = 'WATER',
  SWAMP = 'SWAMP',
  REBOUND = 'REBOUND',
  IRON = 'IRON',
  BULLETPROOF = 'BULLETPROOF'
}

export enum CommandType {
  ATTACK = 'ATTACK',
  DEFEND = 'DEFEND',
  CAPTURE = 'CAPTURE',
  SURROUND = 'SURROUND',
  RECON = 'RECON',
  FREE_PLANNING = 'FREE_PLANNING',
  FREE = 'FREE'
}

export enum ControlMode {
  DESKTOP = 'DESKTOP',
  MOBILE = 'MOBILE'
}

export enum GameMode {
  NORMAL = 'NORMAL'
}

export interface Vector2D {
  x: number;
  y: number;
}

export interface GameObject {
  id: string;
  pos: Vector2D;
  size: number;
}

export interface Bed extends GameObject {
  team: Team;
  captureProgress: number; 
  capturingTeam: Team | null;
}

export enum ItemType {
  SPEED = 'SPEED',
  DEFENSE = 'DEFENSE',
  HEAL = 'HEAL',
  DAMAGE = 'DAMAGE'
}

export interface Item extends GameObject {
  id: string;
  type: ItemType;
  spawnTime: number;
}

export enum AIState {
  ATTACK_CORE = 'ATTACK_CORE',
  DEFEND_CORE = 'DEFEND_CORE',
  ENGAGE_TANK = 'ENGAGE_TANK',
  RETREAT = 'RETREAT',
  STRAFE = 'STRAFE',
  AMBUSH = 'AMBUSH',
  PATHFINDING = 'PATHFINDING',
  SEEK_HEALTH = 'SEEK_HEALTH',
  RECON = 'RECON',
  SURROUND_MOVE = 'SURROUND_MOVE'
}

export interface Tank extends GameObject {
  team: Team;
  nickname?: string;
  rotation: number;
  targetRotation?: number;
  turretRotation: number;
  targetTurretRotation?: number;
  health: number;
  maxHealth: number;
  speed: number;
  currentSpeed?: number;
  targetSpeed?: number;
  lastShot: number;
  color: string;
  isAI: boolean;
  isLeader?: boolean;
  score: number;
  kills: number;
  assists: number;
  respawnTimer: number;
  spawnPos: Vector2D;
  aiState?: AIState;
  role?: 'OFFENSE' | 'DEFENSE';
  activeCommand?: CommandType;
  lastDialogue?: string;
  flankAngle?: number;
  ambushPos?: Vector2D;
  stuckTimer?: number;
  reverseTimer?: number;
  lastPos?: Vector2D;
  reconTarget?: Vector2D;
  patrolIdx?: number;
  detourTimer?: number;
  detourSide?: number; // 1 for right, -1 for left
  lastFinalAngle?: number;
  regenTicks?: number;
  lastRegenTime?: number;
  recentDamagers?: { id: string, time: number }[];
  currentTargetId?: string;
  // 增加 Buff 状态
  buffs?: {
    speedTimer?: number;
    defenseTimer?: number;
    defenseValue?: number; // 伤害减免比例 0.1 - 0.9
    damageTimer?: number;
    healTimer?: number;
    lastHealBuffRegenTime?: number;
    nextHealBuffRegenInterval?: number;
  };
}

export interface Bullet extends GameObject {
  team: Team;
  ownerId: string;
  rotation: number;
  speed: number;
  damage: number;
}

export enum EffectType {
  EXPLOSION = 'EXPLOSION',
  HIT = 'HIT',
  DESTRUCTION = 'DESTRUCTION',
  MUZZLE_FLASH = 'MUZZLE_FLASH',
  SMOKE = 'SMOKE',
  SHOCKWAVE = 'SHOCKWAVE',
  SPARK = 'SPARK'
}

export interface VisualEffect extends GameObject {
  type: EffectType;
  startTime: number;
  duration: number;
  color?: string;
  rotation?: number;
  velocity?: Vector2D;
  opacity?: number;
}

export interface Wall extends GameObject {
  type: WallType;
  health: number;
}

export interface TeamUpgrades {
  damage: number; // 永久伤害加成 (0.1, 0.2, ...)
  defense: number; // 永久防御加成
  speed: number; // 永久速度加成
  regen: number; // 永久回血加成
  haste: number; // 永久急迫加成 (射速/子弹速度)
}

export interface Landmine extends GameObject {
  team: Team;
  ownerId: string;
}

export interface GameState {
  player: Tank;
  allies: Tank[];
  enemies: Tank[];
  bullets: Bullet[];
  landmines: Landmine[];
  walls: Wall[];
  beds: Bed[];
  items: Item[]; // 替换原来的 healthPacks
  effects: VisualEffect[];
  width: number;
  height: number;
  isGameOver: boolean;
  winner: Team | null;
  isPaused: boolean;
  activeMenu: boolean;
  activeTab: 'SCOREBOARD' | 'COMMANDS' | 'SETTINGS' | 'SHOP';
  enemyActiveMenu: boolean;
  enemyActiveTab: 'SCOREBOARD' | 'COMMANDS' | 'SETTINGS' | 'SHOP';
  currentCommand: CommandType;
  enemyCommand: CommandType;
  commandCount: number;
  mousePos: Vector2D;
  isAIControlled: boolean;
  isAutoAimEnabled: boolean;
  isAutoFireEnabled: boolean;
  isMemoryEnabled: boolean; // 是否开启 AI 记忆功能
  isPrivacyModeEnabled: boolean; // 隐私模式：不向外部 AI 发送战况
  isPerfOverlayEnabled: boolean; // 性能监控：HUD 显示 FPS/卡顿信息
  fps?: number;
  longTaskCount?: number;
  controlMode: ControlMode;
  gameMode: GameMode;
  gold: number; // Ally gold
  landmineCount: number; // 玩家持有的地雷数量
  teamUpgrades: TeamUpgrades; // Ally team upgrades
  enemyGold: number;
  enemyTeamUpgrades: TeamUpgrades;
  knowledgeBase?: KnowledgeBase;
  tacticalAdvice?: string;
  isAIConnected: boolean;
  currentAIModel?: string; // 当前使用的 AI 模型
  lastAIResponseTime?: number; // 上次 AI 响应时间（毫秒）
}

export interface BattleRecord {
  id: string;
  timestamp: number;
  winner: Team | null;
  playerStats: {
    kills: number;
    score: number;
    deathCount: number;
  };
  dominantStrategy?: string; // AI 总结的主导策略
  playerBehavior?: string; // AI 对玩家行为的观察记录
}

export interface KnowledgeBase {
  battleHistory: BattleRecord[];
  learnedTactics: string[];
  playerPatterns: string[];
  innovationNotes: string[]; // AI 的创新想法记录
}
