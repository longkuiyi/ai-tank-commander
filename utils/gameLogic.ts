
import { Vector2D, GameObject, Tank, Wall, WallType, Team } from '../types';
import { WORLD_WIDTH, WORLD_HEIGHT, TANK_SIZE, WALL_SIZE } from '../constants';

export const getDistance = (v1: Vector2D, v2: Vector2D): number => {
  return Math.sqrt(Math.pow(v2.x - v1.x, 2) + Math.pow(v2.y - v1.y, 2));
};

export const getAngle = (v1: Vector2D, v2: Vector2D): number => {
  return Math.atan2(v2.y - v1.y, v2.x - v1.x);
};

export const checkCollision = (obj1: GameObject, obj2: GameObject): boolean => {
  const dx = obj1.pos.x - obj2.pos.x;
  const dy = obj1.pos.y - obj2.pos.y;
  const distSq = dx * dx + dy * dy;
  
  // 判定是否是子弹
  const isBullet = (obj: GameObject) => 'damage' in obj;
  // 判定是否是墙体
  const isWall = (obj: GameObject) => 'type' in obj;

  let size1 = obj1.size;
  let size2 = obj2.size;

  // 如果涉及子弹，显著增加碰撞判定，让子弹更容易击中目标 (1.6倍)
  if (isBullet(obj1) || isBullet(obj2)) {
    size1 *= 1.6;
    size2 *= 1.6;
  } else if (isWall(obj1) || isWall(obj2)) {
    // 障碍物碰撞判定稍微调小 (从 1.4 倍降至 1.25 倍)
    size1 *= 1.25;
    size2 *= 1.25;
  } else {
    // 坦克之间或其他物体的碰撞增加到 1.3 倍
    size1 *= 1.3;
    size2 *= 1.3;
  }
  
  const radiusSum = (size1 / 2 + size2 / 2);
  return distSq < radiusSum * radiusSum;
};

export const isOutOfBounds = (pos: Vector2D, size: number, width: number = WORLD_WIDTH, height: number = WORLD_HEIGHT): boolean => {
  return (
    pos.x < size / 2 ||
    pos.x > width - size / 2 ||
    pos.y < size / 2 ||
    pos.y > height - size / 2
  );
};

export const getRandomPos = (size: number, width: number = WORLD_WIDTH, height: number = WORLD_HEIGHT): Vector2D => ({
  x: Math.random() * (width - size * 2) + size,
  y: Math.random() * (height - size * 2) + size
});

export const spawnSafe = (size: number, existing: GameObject[], width: number = WORLD_WIDTH, height: number = WORLD_HEIGHT): Vector2D => {
  let pos = getRandomPos(size, width, height);
  let attempts = 0;
  while (attempts < 50) {
    const colliding = existing.some(obj => checkCollision({ id: 'temp', pos, size }, obj));
    if (!colliding) return pos;
    pos = getRandomPos(size, width, height);
    attempts++;
  }
  return pos;
};
