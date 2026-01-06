
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
  const distance = Math.sqrt(dx * dx + dy * dy);
  return distance < (obj1.size / 2 + obj2.size / 2);
};

export const isOutOfBounds = (pos: Vector2D, size: number): boolean => {
  return (
    pos.x < size / 2 ||
    pos.x > WORLD_WIDTH - size / 2 ||
    pos.y < size / 2 ||
    pos.y > WORLD_HEIGHT - size / 2
  );
};

export const getRandomPos = (size: number): Vector2D => ({
  x: Math.random() * (WORLD_WIDTH - size * 2) + size,
  y: Math.random() * (WORLD_HEIGHT - size * 2) + size
});

export const spawnSafe = (size: number, existing: GameObject[]): Vector2D => {
  let pos = getRandomPos(size);
  let attempts = 0;
  while (attempts < 50) {
    const colliding = existing.some(obj => checkCollision({ id: 'temp', pos, size }, obj));
    if (!colliding) return pos;
    pos = getRandomPos(size);
    attempts++;
  }
  return pos;
};
