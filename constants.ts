
import { ItemType } from './types';

export const WORLD_WIDTH = 4000;
export const WORLD_HEIGHT = 4000;

export const MAP_SIZES = {
  SMALL: 2000,
  MEDIUM: 4000,
  LARGE: 6000
};

export const TANK_SIZE = 44;
export const BULLET_SIZE = 10;
export const WALL_SIZE = 60;
export const BED_SIZE = 150;
export const CAPTURE_RADIUS = 250;
export const ITEM_SIZE = 35;
export const MAX_ITEMS = 20;
export const SPEED_BUFF_DURATION = 15000;  // 速度持续 15 秒
export const DAMAGE_BUFF_DURATION = 15000; // 伤害持续 15 秒
export const DEFENSE_BUFF_DURATION = 25000; // 防御持续 25 秒 (符合 20-30 秒要求)
export const HEAL_BUFF_DURATION = 5000;    // 回血持续 5 秒
export const AUTO_REGEN_INTERVAL = 1000; // 1秒回一次血
export const AUTO_REGEN_AMOUNT = 2; // 每次回2点

// 增强后的物资系数
export const ITEM_BUFF_VALUES = {
  SPEED_MULT: 1.8,    // 1.8倍速 (1-2范围)
  DEFENSE_REDUCTION: 0.3, // 70%减伤 (20-80%范围，保留30%伤害)
  DAMAGE_BOOST: 1.7,   // 70%增伤 (20-80%范围)
  HEAL_REGEN_SEC: 15    // 医疗包额外提供的秒回，增加到15
};

export const ITEM_COLORS = {
  [ItemType.SPEED]: '#fbbf24', // 橙黄色
  [ItemType.DEFENSE]: '#a855f7', // 紫色
  [ItemType.HEAL]: '#ef4444', // 红色 (改为红色，符合玩家直觉)
  [ItemType.DAMAGE]: '#22c55e' // 绿色 (改为绿色)
};

export const SHOP_UPGRADES = {
  BASE_COST: 50,
  COST_INCREMENT: 0, // 价格固定为 50
  BUFF_INCREMENT: 0.2, // 每次提升 20%
};

export const PLAYER_SPEED = 400;
export const AI_SPEED = 250;
export const BULLET_SPEED = 1000;

export const WATER_SLOW_FACTOR = 0.5;
export const BULLET_WATER_SLOW_FACTOR = 0.6;

export const MAX_HEALTH_TANK = 100;
export const SHOOT_COOLDOWN = 500; 
export const CAPTURE_TIME_REQUIRED = 5000; 
export const RESPAWN_DELAY = 4000;

export const BULLET_DAMAGE = 10; 
export const HEALTH_PACK_HEAL = 0; // 改为 0，回血通过持续回复实现
export const HEALTH_PACK_REGEN_PER_SEC = 10; // 增加到 10，5 秒回 50
export const HEALTH_PACK_REGEN_DURATION = 5; // 持续5秒
export const MAX_HEALTH_PACKS = 18; // 增加最大医疗包数量

export const COLORS = {
  PLAYER: '#3b82f6', 
  ALLY: '#10b981',   
  ENEMY: '#ef4444',  
  MUD: '#92400e',    
  GLASS: 'rgba(165, 243, 252, 0.4)', 
  STONE: '#64748b',  
  WATER: 'rgba(30, 64, 175, 0.6)',
  REBOUND: '#bef264', // 浅绿色反弹障碍物
  GROUND: '#166534',
  HEALTH: '#22c55e' // 医疗包颜色
};

export const MINIMAP_SCALE = 0.05;
export const INFLUENCE_GRID_SIZE = 200;
