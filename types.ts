
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
  detourTimer?: number;
  detourSide?: number; // 1 for right, -1 for left
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

export interface Wall extends GameObject {
  type: WallType;
  health: number;
}

export interface GameState {
  player: Tank;
  allies: Tank[];
  enemies: Tank[];
  bullets: Bullet[];
  walls: Wall[];
  beds: Bed[];
  items: Item[]; // 替换原来的 healthPacks
  width: number;
  height: number;
  isGameOver: boolean;
  winner: Team | null;
  isPaused: boolean;
  activeMenu: boolean;
  activeTab: 'SCOREBOARD' | 'COMMAND' | 'SETTINGS';
  currentCommand: CommandType;
  enemyCommand: CommandType;
  commandCount: number;
  isAIControlled: boolean;
  isAutoAimEnabled: boolean;
  isAutoFireEnabled: boolean;
  controlMode: ControlMode;
}
