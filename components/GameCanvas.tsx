
import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Team, Tank, Bullet, Wall, WallType, GameState, Vector2D, Bed, AIState, CommandType, Item, ItemType, ControlMode, TeamUpgrades, EffectType, VisualEffect } from '../types';
import { 
  WORLD_WIDTH, WORLD_HEIGHT, TANK_SIZE, BULLET_SIZE, WALL_SIZE, 
  PLAYER_SPEED, AI_SPEED, BULLET_SPEED, MAX_HEALTH_TANK, 
  SHOOT_COOLDOWN, COLORS, BED_SIZE, CAPTURE_RADIUS, CAPTURE_TIME_REQUIRED, RESPAWN_DELAY,
  WATER_SLOW_FACTOR, BULLET_DAMAGE,
  HEALTH_PACK_HEAL, HEALTH_PACK_REGEN_PER_SEC, HEALTH_PACK_REGEN_DURATION, MAX_HEALTH_PACKS, ITEM_SIZE, MAX_ITEMS, ITEM_COLORS, 
  SPEED_BUFF_DURATION, DAMAGE_BUFF_DURATION, DEFENSE_BUFF_DURATION, HEAL_BUFF_DURATION,
  AUTO_REGEN_INTERVAL, AUTO_REGEN_AMOUNT,
  ITEM_BUFF_VALUES, SHOP_UPGRADES
} from '../constants';
import { checkCollision, getDistance, getAngle, isOutOfBounds } from '../utils/gameLogic';
import { getTacticalAdvice, reflectOnBattle } from '../services/geminiService';
import { memoryService } from '../services/memoryService';

interface Props {
  onStateUpdate: (state: GameState) => void;
  allyCount: number;
  enemyCount: number;
  nickname: string;
  controlMode: ControlMode;
  worldWidth: number;
  worldHeight: number;
}

const GameCanvas: React.FC<Props> = ({ 
  onStateUpdate, 
  allyCount, 
  enemyCount, 
  nickname, 
  controlMode,
  worldWidth: WORLD_WIDTH,
  worldHeight: WORLD_HEIGHT
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Fix: Initialized requestRef with 0 to resolve "Expected 1 arguments, but got 0" TypeScript error
  const requestRef = useRef<number>(0);
  const keys = useRef<Set<string>>(new Set());
  const mousePosRef = useRef<Vector2D>({ x: 0, y: 0 });
  const isMouseDown = useRef(false);
  const mobileInput = useRef({ dx: 0, dy: 0, isFiring: false });
  const lastUpdateRef = useRef<number>(Date.now());
  const lastHPSpawnRef = useRef<number>(0);
  const lastEnemyStrategyRef = useRef<number>(0);
  const isEnemyStrategyLoading = useRef<boolean>(false);
  const lastAllyStrategyRef = useRef<number>(0);
  const isAllyStrategyLoading = useRef<boolean>(false);
  const lastAutopilotCommandRef = useRef<number>(0);
  const lastEnemyAutopilotCommandRef = useRef<number>(0);
  const lastIntelligenceCheckRef = useRef<number>(0);
  const lastEnemyIntelligenceCheckRef = useRef<number>(0);
  const aiMenuCloseTimeRef = useRef<number>(0);
  const enemyAiMenuCloseTimeRef = useRef<number>(0);
  const lastAIBuyTimeRef = useRef<number>(0);
  const lastEnemyBuyTimeRef = useRef<number>(0);
  const lastMouseMoveTimeRef = useRef<number>(0);
  const prevMouseWorldPosRef = useRef<Vector2D>({ x: 0, y: 0 });
  const isReflectingRef = useRef<boolean>(false);

  const isSameSide = (t1: Team, t2: Team) => {
    const side1 = (t1 === Team.PLAYER || t1 === Team.ALLY) ? 'FRIEND' : 'ENEMY';
    const side2 = (t2 === Team.PLAYER || t2 === Team.ALLY) ? 'FRIEND' : 'ENEMY';
    return side1 === side2;
  };

  const [gameState, setGameState] = useState<GameState>(() => {
    const safetyZones = [{ x: 400, y: 400, r: 400 }, { x: WORLD_WIDTH - 400, y: WORLD_HEIGHT - 400, r: 400 }];
    const walls: Wall[] = [];
    
    // 障碍物生成逻辑：根据战场规模动态调整障碍物数量
    const wallCount = Math.floor(90 * (WORLD_WIDTH / 4000));
    for (let i = 0; i < wallCount; i++) {
      let attempts = 0;
      let clusterPlaced = false;
      
      while (attempts < 15 && !clusterPlaced) {
        attempts++;
        const clusterX = Math.random() * (WORLD_WIDTH - 1000) + 500;
        const clusterY = Math.random() * (WORLD_HEIGHT - 1000) + 500;
        
        // 更加严格的安全区检查（500px 范围，确保坦克完全不被干扰）
        const inSafetyZone = safetyZones.some(z => {
          const dist = getDistance({x: clusterX, y: clusterY}, {x: z.x, y: z.y});
          return dist < 600; // 扩大到 600px 确保安全
        });
        if (inSafetyZone) continue;
        
        const typeRand = Math.random();
        const type = typeRand > 0.92 ? WallType.BULLETPROOF :
                     typeRand > 0.85 ? WallType.IRON :
                     typeRand > 0.75 ? WallType.STONE : 
                     typeRand > 0.65 ? WallType.REBOUND : 
                     typeRand > 0.55 ? WallType.WATER : 
                     typeRand > 0.3 ? WallType.MUD : WallType.GLASS;
        
        const cols = 2 + Math.floor(Math.random() * 3);
        const rows = 2;
        const newClusterWalls: Wall[] = [];
        let clusterOverlaps = false;

        for (let j = 0; j < cols * rows; j++) {
          const wallPos = { 
            x: clusterX + (j % cols) * WALL_SIZE, 
            y: clusterY + Math.floor(j/cols) * WALL_SIZE 
          };
          
          const newWall: Wall = { 
            id: `w-${i}-${j}`, 
            pos: wallPos, 
            size: WALL_SIZE, 
            type, 
            health: (type === WallType.BULLETPROOF || type === WallType.WATER || type === WallType.REBOUND) ? 999999 : 
                    type === WallType.IRON ? 8 :
                    type === WallType.STONE ? 5 :
                    type === WallType.MUD ? 3 : 1 
          };

          // 检查与现有墙体的重叠 (增加 10px 间距，让坦克更容易通过)
          if (walls.some(existing => {
            const dx = Math.abs(existing.pos.x - newWall.pos.x);
            const dy = Math.abs(existing.pos.y - newWall.pos.y);
            return dx < WALL_SIZE + 10 && dy < WALL_SIZE + 10;
          })) {
            clusterOverlaps = true;
            break;
          }
          newClusterWalls.push(newWall);
        }

        if (!clusterOverlaps) {
          walls.push(...newClusterWalls);
          clusterPlaced = true;
        }
      }
    }
    const beds: Bed[] = [
      { id: 'bed-ally', team: Team.ALLY, pos: { x: 400, y: 400 }, size: BED_SIZE, captureProgress: 0, capturingTeam: null },
      { id: 'bed-enemy', team: Team.ENEMY, pos: { x: WORLD_WIDTH - 400, y: WORLD_HEIGHT - 400 }, size: BED_SIZE, captureProgress: 0, capturingTeam: null }
    ];
    const createTank = (id: string, team: Team, pos: Vector2D, color: string, isAI: boolean, n?: string, isLeader = false): Tank => ({
      id, nickname: n, pos: { ...pos }, spawnPos: { ...pos }, size: TANK_SIZE, team, rotation: 0, turretRotation: 0, health: MAX_HEALTH_TANK, maxHealth: MAX_HEALTH_TANK, speed: isAI ? AI_SPEED : PLAYER_SPEED,
      currentSpeed: 0, targetSpeed: 0, lastShot: 0, color, isAI, isLeader, score: 0, kills: 0, assists: 0, respawnTimer: 0, aiState: AIState.ATTACK_CORE, activeCommand: CommandType.FREE, lastDialogue: '系统已上线', flankAngle: (Math.random() - 0.5) * 1.5, lastPos: { ...pos }, recentDamagers: [],
      buffs: { speedTimer: 0, defenseTimer: 0, damageTimer: 0, healTimer: 0 }
    });
    return {
      player: createTank('player', Team.PLAYER, { x: 500, y: 500 }, COLORS.PLAYER, false, nickname),
      allies: Array.from({ length: allyCount }).map((_, i) => createTank(`ally-${i}`, Team.ALLY, { x: 200 + (i % 3) * 100, y: 400 + Math.floor(i/3) * 100 }, COLORS.ALLY, true, `队友 ${i+1}`)),
      enemies: Array.from({ length: enemyCount }).map((_, i) => createTank(`enemy-${i}`, Team.ENEMY, { x: WORLD_WIDTH - 200 - (i % 3) * 100, y: WORLD_HEIGHT - 400 - Math.floor(i/3) * 100 }, COLORS.ENEMY, true, i === 0 ? '敌方指挥官' : `敌军 ${i+1}`, i === 0)),
      bullets: [], walls, beds, items: [], effects: [], width: WORLD_WIDTH, height: WORLD_HEIGHT, isGameOver: false, message: '战斗开始', winner: null, activeMenu: false, enemyActiveMenu: false, currentCommand: CommandType.FREE, enemyCommand: CommandType.FREE, commandCount: Math.max(1, allyCount), mousePos: { x: 0, y: 0 }, controlMode,
      isPaused: false, isAIControlled: false, isAutoAimEnabled: false, 
      isAutoFireEnabled: false,
      isMemoryEnabled: true, // 默认开启记忆
      activeTab: 'COMMANDS', enemyActiveTab: 'COMMANDS',
      gold: 0,
      teamUpgrades: {
        damage: 0,
        defense: 0,
        speed: 0,
        regen: 0,
        haste: 0
      },
      enemyGold: 0,
      enemyTeamUpgrades: {
        damage: 0,
        defense: 0,
        speed: 0,
        regen: 0,
        haste: 0
      },
      knowledgeBase: memoryService.loadKnowledgeBase(),
    };
  });

  const stateRef = useRef<GameState>(gameState);
  
  useEffect(() => {
    // 强制触发一次同步，确保 App.tsx 收到初始状态
    console.log("Syncing initial state to App");
    onStateUpdate(stateRef.current);
  }, [onStateUpdate]);

  useEffect(() => {
    // 确保 stateRef 始终同步最新的 gameState
    stateRef.current = gameState;
  }, [gameState]);

  const lerpAngle = (current: number, target: number, speed: number) => {
    let diff = ((target - current + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    return current + Math.max(-speed, Math.min(speed, diff));
  };

  useEffect(() => {
    const handleTacticalCommand = (e: any) => {
      const { type, count } = e.detail;
      setGameState(prev => ({ ...prev, currentCommand: type, commandCount: count }));
    };
    const handleMobileInput = (e: any) => { mobileInput.current = { ...mobileInput.current, ...e.detail }; };
    const handleToggleMenu = () => {
      setGameState(prev => {
        const newState = { ...prev, activeMenu: !prev.activeMenu };
        stateRef.current = newState;
        return newState;
      });
    };
    const handleTogglePause = () => {
      setGameState(prev => {
        const newState = { ...prev, isPaused: !prev.isPaused };
        stateRef.current = newState;
        return newState;
      });
    };
    const handleToggleAI = () => {
      setGameState(prev => {
        const newState = { ...prev, isAIControlled: !prev.isAIControlled };
        stateRef.current = newState;
        return newState;
      });
    };
    const handleToggleAutoAim = () => {
      setGameState(prev => {
        const newState = { ...prev, isAutoAimEnabled: !prev.isAutoAimEnabled };
        stateRef.current = newState;
        return newState;
      });
    };
    const handleToggleAutoFire = () => {
      setGameState(prev => {
        const newState = { ...prev, isAutoFireEnabled: !prev.isAutoFireEnabled };
        stateRef.current = newState;
        return newState;
      });
    };
    const handleToggleMemory = () => {
      setGameState(prev => {
        const newState = { ...prev, isMemoryEnabled: !prev.isMemoryEnabled };
        stateRef.current = newState;
        return newState;
      });
    };
    const handleBuyUpgrade = (e: any) => {
      const { type, cost } = e.detail;
      setGameState(prev => {
        if (prev.gold < cost) return prev;
        const newUpgrades = { ...prev.teamUpgrades, [type]: prev.teamUpgrades[type as keyof typeof prev.teamUpgrades] + SHOP_UPGRADES.BUFF_INCREMENT };
        const newState = { 
          ...prev, 
          gold: prev.gold - cost,
          teamUpgrades: newUpgrades 
        };
        stateRef.current = newState;
        return newState;
      });
    };
    const handleChangeTab = (e: any) => {
      setGameState(prev => ({ ...prev, activeTab: e.detail }));
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        setGameState(prev => ({ ...prev, isPaused: true, activeMenu: true, activeTab: 'SETTINGS' }));
      }
    };
    const handleBlur = () => {
      setGameState(prev => ({ ...prev, isPaused: true, activeMenu: true, activeTab: 'SETTINGS' }));
    };

    window.addEventListener('tactical-command', handleTacticalCommand);
    window.addEventListener('mobile-input', handleMobileInput);
    window.addEventListener('toggle-menu', handleToggleMenu);
    window.addEventListener('toggle-pause', handleTogglePause);
    window.addEventListener('toggle-ai', handleToggleAI);
    window.addEventListener('toggle-auto-aim', handleToggleAutoAim);
    window.addEventListener('toggle-auto-fire', handleToggleAutoFire);
    window.addEventListener('toggle-memory', handleToggleMemory);
    window.addEventListener('buy-upgrade', handleBuyUpgrade);
    window.addEventListener('change-tab', handleChangeTab);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleBlur);

    return () => {
      window.removeEventListener('tactical-command', handleTacticalCommand);
      window.removeEventListener('mobile-input', handleMobileInput);
      window.removeEventListener('toggle-menu', handleToggleMenu);
      window.removeEventListener('toggle-pause', handleTogglePause);
      window.removeEventListener('toggle-ai', handleToggleAI);
      window.removeEventListener('toggle-auto-aim', handleToggleAutoAim);
      window.removeEventListener('toggle-auto-fire', handleToggleAutoFire);
      window.removeEventListener('toggle-memory', handleToggleMemory);
      window.removeEventListener('buy-upgrade', handleBuyUpgrade);
      window.removeEventListener('change-tab', handleChangeTab);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);

  const lastOnStateUpdateRef = useRef<number>(0);

  const gameLoop = useCallback(() => {
    const now = Date.now();
    const dt = (now - lastUpdateRef.current) / 1000;
    lastUpdateRef.current = now;

    const prev = stateRef.current;
    if (prev.isGameOver || prev.isPaused) {
      if (now - lastOnStateUpdateRef.current > 100) {
        onStateUpdate(prev);
        lastOnStateUpdateRef.current = now;
      }
      render();
      requestRef.current = requestAnimationFrame(gameLoop);
      return;
    }

    // AI 视觉效果：自动关闭 AI 开启的菜单
    if (prev.activeMenu && aiMenuCloseTimeRef.current > 0 && now > aiMenuCloseTimeRef.current) {
      prev.activeMenu = false;
      aiMenuCloseTimeRef.current = 0;
    }
    if (prev.enemyActiveMenu && enemyAiMenuCloseTimeRef.current > 0 && now > enemyAiMenuCloseTimeRef.current) {
      prev.enemyActiveMenu = false;
      enemyAiMenuCloseTimeRef.current = 0;
    }

    const next = { ...prev };
    const allTanks = [next.player, ...next.allies, ...next.enemies];

    // 解决坦克重叠导致的卡死问题 (Push-out 逻辑)
    for (let i = 0; i < allTanks.length; i++) {
      for (let j = i + 1; j < allTanks.length; j++) {
        const t1 = allTanks[i];
        const t2 = allTanks[j];
        if (t1.health > 0 && t2.health > 0) {
          const dx = t1.pos.x - t2.pos.x;
          const dy = t1.pos.y - t2.pos.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const minDist = TANK_SIZE * 0.95; // 稍微允许一点点重叠
          if (dist < minDist && dist > 0) {
            const overlap = minDist - dist;
            const pushX = (dx / dist) * overlap * 0.5;
            const pushY = (dy / dist) * overlap * 0.5;
            
            // 尝试推开，但要检查墙体
            const newPos1 = { x: t1.pos.x + pushX, y: t1.pos.y + pushY };
            const newPos2 = { x: t2.pos.x - pushX, y: t2.pos.y - pushY };
            
            if (!next.walls.some(w => w.type !== WallType.WATER && checkCollision({ ...t1, pos: newPos1 }, w)) && !isOutOfBounds(newPos1, TANK_SIZE, WORLD_WIDTH, WORLD_HEIGHT)) {
              t1.pos = newPos1;
            }
            if (!next.walls.some(w => w.type !== WallType.WATER && checkCollision({ ...t2, pos: newPos2 }, w)) && !isOutOfBounds(newPos2, TANK_SIZE, WORLD_WIDTH, WORLD_HEIGHT)) {
              t2.pos = newPos2;
            }
          }
        }
      }
    }

    // 敌方战术决策
    if (now - lastEnemyStrategyRef.current > 12000 && !isEnemyStrategyLoading.current) {
        const enemyLeader = next.enemies.find(e => e.isLeader && e.health > 0);
        if (enemyLeader) {
          isEnemyStrategyLoading.current = true;
          getTacticalAdvice(next, Team.ENEMY).then(result => {
            setGameState(prev => {
              const newEnemies = prev.enemies.map(enemy => {
                const report = result.teammateReports.find(r => r.id === enemy.id);
                if (report) {
                  return {
                    ...enemy,
                    lastDialogue: report.report,
                    aiState: report.strategy || enemy.aiState
                  };
                }
                return enemy;
              });

              let updatedEnemyGold = prev.enemyGold;
              let updatedEnemyUpgrades = { ...prev.enemyTeamUpgrades };

              // 敌方自动购物逻辑
              if (result.purchaseUpgrade && updatedEnemyGold >= 150) {
                const upgradeId = result.purchaseUpgrade as string;
                const typedUpgradeId = upgradeId as keyof typeof updatedEnemyUpgrades;
                if (Object.prototype.hasOwnProperty.call(updatedEnemyUpgrades, typedUpgradeId)) {
                  updatedEnemyGold -= 150;
                  updatedEnemyUpgrades[typedUpgradeId] += SHOP_UPGRADES.BUFF_INCREMENT;
                }
              }

              return { 
                ...prev, 
                enemyCommand: result.command, 
                enemies: newEnemies,
                enemyGold: updatedEnemyGold,
                enemyTeamUpgrades: updatedEnemyUpgrades
              };
            });
            isEnemyStrategyLoading.current = false;
            lastEnemyStrategyRef.current = Date.now();
          }).catch((err) => {
            console.error("Enemy tactical error:", err);
            isEnemyStrategyLoading.current = false;
            lastEnemyStrategyRef.current = Date.now();
          });
        }
    }

    // 友方战术决策 (AI 接入所有坦克)
    if (now - lastAllyStrategyRef.current > 15000 && !isAllyStrategyLoading.current) {
      isAllyStrategyLoading.current = true;
      getTacticalAdvice(next, Team.ALLY).then(result => {
        setGameState(prev => {
          const newAllies = prev.allies.map(ally => {
            // 查找该队友是否有特定的策略报告
            const report = result.teammateReports.find(r => r.id === ally.id);
            if (report) {
              return { 
                ...ally, 
                lastDialogue: report.report,
                aiState: report.strategy || ally.aiState 
              };
            }
            return ally;
          });

          // 如果有全局分析，可以让指挥官（玩家或自动驾驶状态下的玩家）说话，或者在 HUD 显示
          // 这里我们更新一下玩家的对话，如果处于自动驾驶模式
          let newPlayer = { ...prev.player };
          if (prev.isAIControlled && result.globalAnalysis) {
            newPlayer.lastDialogue = result.globalAnalysis;
          }

          let updatedGold = prev.gold;
          let updatedUpgrades = { ...prev.teamUpgrades };

          // 盟军自动购物逻辑 (AI 帮玩家花钱)
          if (result.purchaseUpgrade && updatedGold >= 150) {
            const upgradeId = result.purchaseUpgrade as string;
            const typedUpgradeId = upgradeId as keyof typeof updatedUpgrades;
            if (Object.prototype.hasOwnProperty.call(updatedUpgrades, typedUpgradeId)) {
              updatedGold -= 150;
              updatedUpgrades[typedUpgradeId] += SHOP_UPGRADES.BUFF_INCREMENT;

              const upgradeNames: Record<string, string> = {
                damage: '攻击', defense: '防御', speed: '速度', regen: '回血', haste: '射速'
              };
              const upgradeName = upgradeNames[upgradeId] || upgradeId;

              // 通知全队
              if (newPlayer.health > 0) {
                newPlayer.lastDialogue = `[战术升级:${upgradeName}] ${newPlayer.lastDialogue || ''}`;
              }
            }
          }

          return { 
            ...prev, 
            currentCommand: result.command, 
            allies: newAllies,
            player: newPlayer,
            gold: updatedGold,
            teamUpgrades: updatedUpgrades,
            tacticalAdvice: result.globalAnalysis
          };
        });
        isAllyStrategyLoading.current = false;
        lastAllyStrategyRef.current = Date.now();
      }).catch((err) => {
        console.error("Ally tactical error:", err);
        isAllyStrategyLoading.current = false;
        lastAllyStrategyRef.current = Date.now();
      });
    }

      // 刷新物资逻辑
      const dynamicMaxItems = Math.floor(MAX_ITEMS * (WORLD_WIDTH / 4000));
      if (now - lastHPSpawnRef.current > 1500 && next.items.length < dynamicMaxItems) {
        const spawnX = Math.random() * (WORLD_WIDTH - 1200) + 600;
        const spawnY = Math.random() * (WORLD_HEIGHT - 1200) + 600;
        if (!next.walls.some(w => getDistance(w.pos, {x: spawnX, y: spawnY}) < 150)) {
          const types = [ItemType.SPEED, ItemType.DEFENSE, ItemType.HEAL, ItemType.DAMAGE];
          const type = types[Math.floor(Math.random() * types.length)];
          next.items.push({ id: `item-${now}`, pos: { x: spawnX, y: spawnY }, size: ITEM_SIZE, type, spawnTime: now });
          lastHPSpawnRef.current = now;
        }
      }

      const moveTank = (t: Tank, dx: number, dy: number, forceAngle?: number) => {
        const isIdle = dx === 0 && dy === 0;
        const targetAngle = forceAngle !== undefined ? forceAngle : (isIdle ? t.rotation : Math.atan2(dy, dx));
        const currentSpeed = t.currentSpeed || 0;
        const inWater = next.walls.some(w => w.type === WallType.WATER && checkCollision(t, w));
        
        // 计算速度 Buff
        let speedMult = 1.0;
        if (t.buffs?.speedTimer && t.buffs.speedTimer > now) speedMult = ITEM_BUFF_VALUES.SPEED_MULT;
        
        // 应用永久速度加成
        if (isSameSide(t.team, Team.ALLY)) {
          speedMult += next.teamUpgrades.speed;
        } else {
          speedMult += next.enemyTeamUpgrades.speed;
        }
        
        let limitSpeed = isIdle ? 0 : t.speed * speedMult;
        if (inWater) limitSpeed *= WATER_SLOW_FACTOR;
        const accelRate = inWater ? 2.0 : 8.0;
        const frictionRate = inWater ? 4.0 : 12.0;
        if (isIdle) {
          const diff = 0 - currentSpeed;
          t.currentSpeed = currentSpeed + diff * Math.min(1, frictionRate * dt);
          if (t.currentSpeed < 1) t.currentSpeed = 0;
        }
        else {
          const diff = limitSpeed - currentSpeed;
          t.currentSpeed = currentSpeed + diff * Math.min(1, (diff > 0 ? accelRate : frictionRate) * dt);
        }
        t.rotation = lerpAngle(t.rotation, targetAngle, isIdle ? 0.04 : 0.25);
        if (t.currentSpeed > 0.05) {
          const vx = Math.cos(t.rotation) * t.currentSpeed * dt;
          const vy = Math.sin(t.rotation) * t.currentSpeed * dt;
          const nextPos = { x: t.pos.x + vx, y: t.pos.y + vy };
          
          const isBlocked = (p: Vector2D) => {
            const wallHit = next.walls.some(w => w.type !== WallType.WATER && checkCollision({ ...t, pos: p }, w));
            const tankHit = allTanks.some(other => other.id !== t.id && other.health > 0 && checkCollision({ ...t, pos: p }, other));
            return wallHit || tankHit || isOutOfBounds(p, TANK_SIZE, WORLD_WIDTH, WORLD_HEIGHT);
          };

          if (!isBlocked(nextPos)) {
            t.pos = nextPos;
            t.detourTimer = 0; // 成功移动，重置绕路计时器
            return true;
          } else {
            // --- 丝滑绕路逻辑 ---
            // 如果被堵住，尝试左右 45 度和 90 度方向探测
            const detourAngles = [Math.PI / 4, -Math.PI / 4, Math.PI / 2, -Math.PI / 2];
            
            // 如果已经有绕路方向，优先尝试该方向
            if (t.detourTimer && t.detourTimer > 0 && t.detourSide) {
               const sideAngle = t.rotation + (t.detourSide * Math.PI / 3);
               const detourPos = {
                 x: t.pos.x + Math.cos(sideAngle) * t.currentSpeed * dt,
                 y: t.pos.y + Math.sin(sideAngle) * t.currentSpeed * dt
               };
               if (!isBlocked(detourPos)) {
                 t.pos = detourPos;
                 t.rotation = lerpAngle(t.rotation, sideAngle, 0.1);
                 t.detourTimer -= dt;
                 return true;
               }
            }

            for (const angleOffset of detourAngles) {
              const testAngle = t.rotation + angleOffset;
              const testPos = {
                x: t.pos.x + Math.cos(testAngle) * t.currentSpeed * dt,
                y: t.pos.y + Math.sin(testAngle) * t.currentSpeed * dt
              };
              
              if (!isBlocked(testPos)) {
                t.pos = testPos;
                t.rotation = lerpAngle(t.rotation, testAngle, 0.1);
                // 记录绕路方向，持续一小段时间，防止抖动
                t.detourSide = angleOffset > 0 ? 1 : -1;
                t.detourTimer = 0.5; 
                return true;
              }
            }
            
            // 如果所有绕路尝试都失败，尝试微幅后退以脱困
            const backPos = {
              x: t.pos.x - Math.cos(t.rotation) * t.currentSpeed * 0.5 * dt,
              y: t.pos.y - Math.sin(t.rotation) * t.currentSpeed * 0.5 * dt
            };
            if (!isBlocked(backPos)) {
              t.pos = backPos;
            } else {
              t.currentSpeed *= 0.1; 
            }
          }
        }
        return false;
      };

      // 坦克自动回血和 Buff 维护 (包含医疗包的额外回血)
      allTanks.forEach(t => {
        if (t.health > 0 && t.health < t.maxHealth) {
          let regenAmount = (!t.lastRegenTime || now - t.lastRegenTime > AUTO_REGEN_INTERVAL) ? AUTO_REGEN_AMOUNT : 0;
          
          // 应用永久回血加成
          if (regenAmount > 0) {
            if (isSameSide(t.team, Team.ALLY)) {
              regenAmount *= (1 + next.teamUpgrades.regen);
            } else {
              regenAmount *= (1 + next.enemyTeamUpgrades.regen);
            }
          }
          
          // 如果有医疗包Buff，持续回血
          let buffRegen = 0;
          if (t.buffs?.healTimer && t.buffs.healTimer > now) {
             buffRegen = HEALTH_PACK_REGEN_PER_SEC * dt;
          }
 
          if (regenAmount > 0 || buffRegen > 0) {
            t.health = Math.min(t.maxHealth, t.health + regenAmount + buffRegen);
            if (regenAmount > 0) t.lastRegenTime = now;
          }
        }
      });

      if (next.player.health > 0 && !next.isAIControlled) {
        let pdx = 0, pdy = 0;
        if (next.controlMode === ControlMode.DESKTOP) {
          if (keys.current.has('w')) pdy -= 1; if (keys.current.has('s')) pdy += 1;
          if (keys.current.has('a')) pdx -= 1; if (keys.current.has('d')) pdx += 1;
          const canvas = canvasRef.current;
          if (canvas) {
            const rect = canvas.getBoundingClientRect();
            const worldX = mousePosRef.current.x - rect.left - canvas.width / 2 + next.player.pos.x;
            const worldY = mousePosRef.current.y - rect.top - canvas.height / 2 + next.player.pos.y;
            next.mousePos = { x: worldX, y: worldY };
            
            // 自瞄逻辑实现
             let targetRotation = getAngle(next.player.pos, next.mousePos);
             const mouseMovedRecently = now - lastMouseMoveTimeRef.current < 500;
             let hasAutoTarget = false;
             
             if (next.isAutoAimEnabled && !mouseMovedRecently) {
               // 寻找最近的敌方坦克 (范围扩大到 1200)
               const visibleEnemies = next.enemies.filter(e => e.health > 0 && getDistance(next.player.pos, e.pos) < 1200);
               let bestTarget: Vector2D | null = null;
               let minDist = Infinity;
               
               visibleEnemies.forEach(e => {
                 const dist = getDistance(next.player.pos, e.pos);
                 if (dist < minDist) {
                   minDist = dist;
                   bestTarget = e.pos;
                 }
               });
               
               // 如果没有坦克，且玩家正在移动并被阻挡时，才锁定路径上的可破坏墙体
               if (!bestTarget && (pdx !== 0 || pdy !== 0)) {
                 const moveAngle = Math.atan2(pdy, pdx);
                 const lookAheadPos = {
                   x: next.player.pos.x + Math.cos(moveAngle) * 150,
                   y: next.player.pos.y + Math.sin(moveAngle) * 150
                 };
                 // 检查移动方向是否真的被墙堵住
                 const isPathBlocked = next.walls.some(w => w.type !== WallType.WATER && checkCollision({ ...next.player, pos: lookAheadPos }, w));
                 
                 if (isPathBlocked) {
                   const breakableWalls = next.walls.filter(w => 
                     (w.type === WallType.GLASS || w.type === WallType.MUD) && 
                     getDistance(lookAheadPos, w.pos) < 100
                   );
                   if (breakableWalls.length > 0) {
                     breakableWalls.sort((a, b) => getDistance(next.player.pos, a.pos) - getDistance(next.player.pos, b.pos));
                     bestTarget = breakableWalls[0].pos;
                   }
                 }
               }
               
               if (bestTarget) {
                 targetRotation = getAngle(next.player.pos, bestTarget);
                 hasAutoTarget = true;
               }
             }
             
             next.player.turretRotation = lerpAngle(next.player.turretRotation, targetRotation, 0.25);

             // 自动射击逻辑
             if (next.isAutoFireEnabled && hasAutoTarget && !mouseMovedRecently) {
               const angleDiff = Math.abs(((targetRotation - next.player.turretRotation + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
               if (angleDiff < 0.2 && now - next.player.lastShot > SHOOT_COOLDOWN) {
                 next.bullets.push({ id: `bp-auto-${now}`, ownerId: 'player', team: Team.ALLY, pos: { ...next.player.pos }, rotation: next.player.turretRotation, speed: BULLET_SPEED, size: BULLET_SIZE, damage: BULLET_DAMAGE });
                 next.player.lastShot = now;
               }
             }
          }
        } else {
          pdx = mobileInput.current.dx; pdy = mobileInput.current.dy;
          
          let targetRotation = next.player.turretRotation;
          if (pdx !== 0 || pdy !== 0) {
            targetRotation = Math.atan2(pdy, pdx);
          }
          
          let hasAutoTarget = false;
          if (next.isAutoAimEnabled) {
             const visibleEnemies = next.enemies.filter(e => e.health > 0 && getDistance(next.player.pos, e.pos) < 1200);
             let bestTarget: Vector2D | null = null;
             let minDist = Infinity;
             
             visibleEnemies.forEach(e => {
               const dist = getDistance(next.player.pos, e.pos);
               if (dist < minDist) {
                 minDist = dist;
                 bestTarget = e.pos;
               }
             });
             
             if (bestTarget) {
               targetRotation = getAngle(next.player.pos, bestTarget);
               hasAutoTarget = true;
             }
           }
          
          if (pdx !== 0 || pdy !== 0 || next.isAutoAimEnabled) {
            next.player.turretRotation = lerpAngle(next.player.turretRotation, targetRotation, 0.15);
          }

          // 移动端自动射击逻辑
          if (next.isAutoFireEnabled && hasAutoTarget) {
            const angleDiff = Math.abs(((targetRotation - next.player.turretRotation + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
            
            // 应用急迫加成 (射速)
            const currentShootCooldown = SHOOT_COOLDOWN * (1 - next.teamUpgrades.haste);
            
            if (angleDiff < 0.2 && now - next.player.lastShot > currentShootCooldown) {
              // 应用急迫加成 (子弹速度)
              const currentBulletSpeed = BULLET_SPEED * (1 + next.teamUpgrades.haste);
              
              next.bullets.push({ id: `bp-auto-m-${now}`, ownerId: 'player', team: Team.ALLY, pos: { ...next.player.pos }, rotation: next.player.turretRotation, speed: currentBulletSpeed, size: BULLET_SIZE, damage: BULLET_DAMAGE });
              next.player.lastShot = now;
            }
          }
        }
        moveTank(next.player, pdx, pdy);
        
        // 应用急迫加成 (射速)
        const currentShootCooldown = SHOOT_COOLDOWN * (1 - next.teamUpgrades.haste);
        
        if ((isMouseDown.current || mobileInput.current.isFiring) && now - next.player.lastShot > currentShootCooldown) {
          // 应用急迫加成 (子弹速度)
          const currentBulletSpeed = BULLET_SPEED * (1 + next.teamUpgrades.haste);
          
          next.bullets.push({ id: `bp-${now}`, ownerId: 'player', team: Team.ALLY, pos: { ...next.player.pos }, rotation: next.player.turretRotation, speed: currentBulletSpeed, size: BULLET_SIZE, damage: BULLET_DAMAGE });
          next.player.lastShot = now;
        }
      }

      if (next.isAIControlled && now - lastAutopilotCommandRef.current > 6000) {
        const allyBase = next.beds[0];
        const enemyBase = next.beds[1];
        const player = next.player;
        const visibleEnemies = next.enemies.filter(e => e.health > 0 && getDistance(player.pos, e.pos) < 1200);
        
        let newCmd = next.currentCommand;
        let dialogue = "";

        if (allyBase.captureProgress > 1200) {
          newCmd = CommandType.DEFEND;
          dialogue = "检测到基地受损，全员回防支援！";
        } else if (player.health < 45) {
          newCmd = CommandType.FREE_PLANNING;
          dialogue = "我方机体受损，转入自由规划模式进行抢修！";
        } else if (getDistance(player.pos, enemyBase.pos) < 700) {
          newCmd = CommandType.CAPTURE;
          dialogue = "已抵达敌方核心，全员掩护占领！";
        } else if (visibleEnemies.length >= 3) {
          newCmd = CommandType.SURROUND;
          dialogue = "遭遇敌方主力，执行战术包围协议！";
        } else if (visibleEnemies.length > 0) {
          newCmd = CommandType.ATTACK;
          dialogue = "锁定敌方目标，全军突击！";
        } else {
          newCmd = CommandType.RECON;
          dialogue = "战场态势平稳，展开扇形侦查。";
        }

        if (newCmd !== next.currentCommand) {
          next.currentCommand = newCmd;
          next.player.lastDialogue = dialogue;
          lastAutopilotCommandRef.current = now;
          
          // 模拟 AI 打开菜单下达指令的视觉过程
          if (!next.activeMenu) {
            next.activeMenu = true;
            next.activeTab = 'COMMANDS';
            aiMenuCloseTimeRef.current = now + 1000; // 保持 1 秒后自动关闭
          }
        }
      }

      // 敌方指挥官智能决策 (与 AI 代打同等智能)
      if (now - lastEnemyAutopilotCommandRef.current > 7000) {
        const enemyLeader = next.enemies.find(e => e.isLeader && e.health > 0);
        if (enemyLeader) {
          const myBase = next.beds[1]; // 敌方基地
          const targetBase = next.beds[0]; // 盟军基地
          const foes = [next.player, ...next.allies].filter(f => f.health > 0);
          const visibleFoes = foes.filter(f => getDistance(enemyLeader.pos, f.pos) < 1200);
          
          let newEnemyCmd = next.enemyCommand;
          let enemyDialogue = "";

          if (myBase.captureProgress > 1200) {
            newEnemyCmd = CommandType.DEFEND;
            enemyDialogue = "全员注意！核心正在被渗透，立即回防！";
          } else if (enemyLeader.health < 40) {
            newEnemyCmd = CommandType.FREE_PLANNING;
            enemyDialogue = "指挥官受损，转入自主作战模式，掩护我撤退！";
          } else if (getDistance(enemyLeader.pos, targetBase.pos) < 700) {
            newEnemyCmd = CommandType.CAPTURE;
            enemyDialogue = "已锁定盟军核心，全线压上，准备占领！";
          } else if (visibleFoes.length >= 2) {
            newEnemyCmd = CommandType.SURROUND;
            enemyDialogue = "发现盟军小队，执行合围歼灭战术！";
          } else if (visibleFoes.length > 0) {
            newEnemyCmd = CommandType.ATTACK;
            enemyDialogue = "发现目标，全军突击，不要放跑他们！";
          } else {
            newEnemyCmd = CommandType.RECON;
            enemyDialogue = "继续搜索，扩大侦查范围，寻找盟军踪迹。";
          }

          if (newEnemyCmd !== next.enemyCommand) {
            next.enemyCommand = newEnemyCmd;
            enemyLeader.lastDialogue = enemyDialogue;
            lastEnemyAutopilotCommandRef.current = now;

            // 模拟敌方 AI 打开菜单下达指令的过程 (内部状态)
            if (!next.enemyActiveMenu) {
              next.enemyActiveMenu = true;
              next.enemyActiveTab = 'COMMANDS';
              enemyAiMenuCloseTimeRef.current = now + 1000;
            }
          }
        }
      }

      // AI 视觉效果：AI 偶尔查看战场情报局
      if (next.isAIControlled && now - lastIntelligenceCheckRef.current > 25000) {
        if (!next.activeMenu) {
          next.activeMenu = true;
          next.activeTab = 'SCOREBOARD';
          aiMenuCloseTimeRef.current = now + 2000; // 查看 2 秒
          lastIntelligenceCheckRef.current = now + Math.random() * 5000; // 随机增加偏移
        }
      }

      // 敌方 AI 视觉效果
      if (now - lastEnemyIntelligenceCheckRef.current > 28000) {
        const enemyLeader = next.enemies.find(e => e.isLeader && e.health > 0);
        if (enemyLeader && !next.enemyActiveMenu) {
          next.enemyActiveMenu = true;
          next.enemyActiveTab = 'SCOREBOARD';
          enemyAiMenuCloseTimeRef.current = now + 2000;
          lastEnemyIntelligenceCheckRef.current = now + Math.random() * 5000;
        }
      }

      // AI 团队自动购买逻辑
      const shopItems = [
        { id: 'damage', name: '攻击强化' },
        { id: 'defense', name: '防御强化' },
        { id: 'speed', name: '速度强化' },
        { id: 'regen', name: '回血强化' },
        { id: 'haste', name: '急速强化' }
      ];

      // 我方 AI 购买 (仅当 AI 控制时，或作为队友辅助)
      if (now - lastAIBuyTimeRef.current > 15000) { // 每 15 秒检查一次
        if (next.gold >= SHOP_UPGRADES.BASE_COST) {
          // 找出等级最低的项进行升级
          const sortedUpgrades = [...shopItems].sort((a, b) => 
            next.teamUpgrades[a.id as keyof TeamUpgrades] - next.teamUpgrades[b.id as keyof TeamUpgrades]
          );
          const itemToBuy = sortedUpgrades[0];
          
          next.gold -= SHOP_UPGRADES.BASE_COST;
          next.teamUpgrades = { 
            ...next.teamUpgrades, 
            [itemToBuy.id]: next.teamUpgrades[itemToBuy.id as keyof TeamUpgrades] + SHOP_UPGRADES.BUFF_INCREMENT 
          };
          
          if (next.player.health > 0) {
            next.player.lastDialogue = `军需官，我方已购入 [${itemToBuy.name}] 协议！`;
          }

          // 模拟 AI 打开商城购买的过程
          if (next.isAIControlled && !next.activeMenu) {
            next.activeMenu = true;
            next.activeTab = 'SHOP';
            aiMenuCloseTimeRef.current = now + 1500; // 购买过程模拟持续 1.5 秒
          }

          lastAIBuyTimeRef.current = now;
        }
      }

      // 敌方 AI 购买
      if (now - lastEnemyBuyTimeRef.current > 15000) {
        if (next.enemyGold >= SHOP_UPGRADES.BASE_COST) {
          const sortedUpgrades = [...shopItems].sort((a, b) => 
            next.enemyTeamUpgrades[a.id as keyof TeamUpgrades] - next.enemyTeamUpgrades[b.id as keyof TeamUpgrades]
          );
          const itemToBuy = sortedUpgrades[0];
          
          next.enemyGold -= SHOP_UPGRADES.BASE_COST;
          next.enemyTeamUpgrades = { 
            ...next.enemyTeamUpgrades, 
            [itemToBuy.id]: next.enemyTeamUpgrades[itemToBuy.id as keyof TeamUpgrades] + SHOP_UPGRADES.BUFF_INCREMENT 
          };
          
          const enemyLeader = next.enemies.find(e => e.isLeader && e.health > 0);
          if (enemyLeader) {
            enemyLeader.lastDialogue = `全员注意，敌方已启用 [${itemToBuy.name}] 加强。`;
          }

          // 模拟敌方 AI 打开商城购买的过程 (内部状态)
          if (!next.enemyActiveMenu) {
            next.enemyActiveMenu = true;
            next.enemyActiveTab = 'SHOP';
            enemyAiMenuCloseTimeRef.current = now + 1500;
          }

          lastEnemyBuyTimeRef.current = now;
        }
      }

      const runAI = (t: Tank, idx: number) => {
        if (t.health <= 0) return;
        const isAlly = isSameSide(t.team, Team.ALLY);
        const foes = (isAlly ? next.enemies : [next.player, ...next.allies]).filter(e => e.health > 0);
        const myBase = isAlly ? next.beds[0] : next.beds[1];
        const enemyBase = isAlly ? next.beds[1] : next.beds[0];
        const activeCmd = isAlly ? next.currentCommand : next.enemyCommand;
        const isCommanded = isAlly ? (idx < next.commandCount || t.id === 'player') : true;
        
        let state = t.aiState || AIState.ATTACK_CORE;
        let targetPoint = enemyBase.pos;

        // 优先级 1: 基地防御检测 (回防逻辑)
        const distToMyBase = getDistance(t.pos, myBase.pos);
        const FORBIDDEN_ZONE_RADIUS = 800; // 禁区半径
        const isEnemyInForbiddenZone = foes.some(f => getDistance(f.pos, myBase.pos) < FORBIDDEN_ZONE_RADIUS);
        const isBaseUnderAttack = myBase.captureProgress > 0 || isEnemyInForbiddenZone;
        
        // 优先级 2: 资源获取决策 (根据血量和距离)
        const healItems = next.items.filter(i => i.type === ItemType.HEAL);
        const buffItems = next.items.filter(i => i.type !== ItemType.HEAL);
        const nearestHeal = healItems.sort((a, b) => getDistance(t.pos, a.pos) - getDistance(t.pos, b.pos))[0];
        const nearestBuff = buffItems.sort((a, b) => getDistance(t.pos, a.pos) - getDistance(t.pos, b.pos))[0];

        // 识别附近敌人
        const nearbyFoes = foes.filter(f => getDistance(t.pos, f.pos) < 900);

        // 特殊状态处理 (由战术指挥下达的策略)
        if (state === AIState.AMBUSH) {
          // 伏击逻辑：如果附近有敌人且距离很近，或者基地受攻击，则转入交战
          if (nearbyFoes.length > 0 && getDistance(t.pos, nearbyFoes[0].pos) < 400 || isBaseUnderAttack) {
            state = AIState.ENGAGE_TANK;
          } else {
            // 伏击时保持静默，寻找附近掩体
            const cover = next.walls.find(w => 
              (w.type === WallType.STONE || w.type === WallType.IRON) && 
              getDistance(t.pos, w.pos) < 300
            );
            targetPoint = cover ? cover.pos : t.pos;
            
            // 伏击时如果不移动，减速并旋转炮塔搜索
            if (getDistance(t.pos, targetPoint) < 50) {
              t.currentSpeed *= 0.5;
              t.turretRotation += 0.02; // 慢速扫描
              return; // 跳过后续移动逻辑
            }
          }
        } else if (state === AIState.DEFEND_CORE) {
          // 封锁线/守备逻辑优化：在基地周围分散站位，形成封锁线
          const angleOffset = (idx * (Math.PI * 2)) / 6; 
          const defendRadius = 400 + (idx % 2) * 200; 
          targetPoint = {
            x: myBase.pos.x + Math.cos(angleOffset) * defendRadius,
            y: myBase.pos.y + Math.sin(angleOffset) * defendRadius
          };
          
          // 如果已经在封锁位置，面对敌人方向
          if (getDistance(t.pos, targetPoint) < 100) {
            const nearestFoe = nearbyFoes[0] || foes[0];
            if (nearestFoe) {
              t.turretRotation = lerpAngle(t.turretRotation, getAngle(t.pos, nearestFoe.pos), 0.1);
            }
          }
        } else if (t.health < 60 && nearestHeal) {
          state = AIState.SEEK_HEALTH;
          targetPoint = nearestHeal.pos;
        } else if (isEnemyInForbiddenZone && (distToMyBase < 2000 || t.health > 70)) {
          state = AIState.DEFEND_CORE;
          // 封锁线目标点已经在上面 DEFEND_CORE 逻辑中计算了，这里只需设置状态
          targetPoint = myBase.pos;
        } else if (t.health > 70 && nearestBuff && getDistance(t.pos, nearestBuff.pos) < 800) {
          state = AIState.PATHFINDING;
          targetPoint = nearestBuff.pos;
        } else if (isCommanded && activeCmd === CommandType.RECON) {
          // 侦察模式下的“伏击”倾向
          if (nearbyFoes.length === 0 && !isBaseUnderAttack) {
            // 寻找附近的坚固墙体作为掩体
            const sturdyWalls = next.walls.filter(w => 
              (w.type === WallType.STONE || w.type === WallType.IRON || w.type === WallType.BULLETPROOF) && 
              getDistance(t.pos, w.pos) < 400
            );
            if (sturdyWalls.length > 0) {
              state = AIState.AMBUSH;
              targetPoint = t.pos;
            }
          }
          if (state !== AIState.AMBUSH) {
            state = AIState.RECON;
            if (!t.reconTarget || getDistance(t.pos, t.reconTarget) < 200) {
              t.reconTarget = { x: Math.random() * WORLD_WIDTH, y: Math.random() * WORLD_HEIGHT };
            }
            targetPoint = t.reconTarget;
          }
        }
        else if (isCommanded && activeCmd === CommandType.FREE_PLANNING) {
          const distToMyBase = getDistance(t.pos, myBase.pos);
          const healItem = next.items.find(i => i.type === ItemType.HEAL);
          if (t.health < 75 && healItem) {
             state = AIState.SEEK_HEALTH; targetPoint = healItem.pos;
          } else if (distToMyBase < 1200 && next.beds[0].captureProgress > 500) {
             state = AIState.DEFEND_CORE; targetPoint = myBase.pos;
          } else {
             state = AIState.ATTACK_CORE; targetPoint = enemyBase.pos;
          }
        }
        else if (isCommanded && activeCmd === CommandType.SURROUND && foes.length > 0) {
          state = AIState.SURROUND_MOVE;
          const orbitTarget = isAlly ? (next.enemies.find(e => e.isLeader && e.health > 0) || foes[0]) : next.player;
          const orbitRadius = 600;
          const currentAngle = (now / 2000) + (idx * (Math.PI * 2 / 5));
          targetPoint = { x: orbitTarget.pos.x + Math.cos(currentAngle) * orbitRadius, y: orbitTarget.pos.y + Math.sin(currentAngle) * orbitRadius };
        } else if (isCommanded && activeCmd === CommandType.CAPTURE) {
          state = AIState.PATHFINDING; targetPoint = enemyBase.pos;
        } else if (isCommanded && activeCmd === CommandType.DEFEND) {
          state = AIState.DEFEND_CORE;
          // 守备逻辑优化：在基地周围分散站位
          const angleOffset = (idx * (Math.PI * 2)) / 6; // 每个坦克分配不同角度
          const defendRadius = 350 + (idx % 2) * 150; // 交错半径，形成两层防御圈
          targetPoint = {
            x: myBase.pos.x + Math.cos(angleOffset) * defendRadius,
            y: myBase.pos.y + Math.sin(angleOffset) * defendRadius
          };
        } else if (isCommanded && activeCmd === CommandType.ATTACK) {
          state = AIState.ATTACK_CORE; targetPoint = enemyBase.pos;
        } else {
          state = AIState.RECON;
          if (!t.reconTarget || getDistance(t.pos, t.reconTarget) < 180) {
            t.reconTarget = { x: 400 + Math.random() * (WORLD_WIDTH - 800), y: 400 + Math.random() * (WORLD_HEIGHT - 800) };
          }
          targetPoint = t.reconTarget;
        }

        const dirAngle = getAngle(t.pos, targetPoint);
        // 增加采样密度，覆盖全方位，特别加强前方视野
        const sampleDegs = [0, 5, -5, 10, -10, 15, -15, 20, -20, 25, -25, 30, -30, 40, -40, 50, -50, 60, -60, 75, -75, 90, -90, 120, -120, 150, -150, 180];
        let bx = 0, by = 0, totalW = 0;
        
        // 判定停滞：如果位置几乎没动，累加 stuckTimer
        const distMoved = t.lastPos ? getDistance(t.pos, t.lastPos) : 1;
        if (distMoved < 0.5) { // 稍微放宽停滞判定
          t.stuckTimer = (t.stuckTimer || 0) + 1; 
        } else { 
          t.stuckTimer = 0; 
        }
        t.lastPos = { ...t.pos };

        // 如果触发倒车计时
        if (t.reverseTimer && t.reverseTimer > 0) {
          t.reverseTimer--;
          // 倒车时尝试更大幅度转向以脱困，加入随机扰动使动作更自然
          const reverseTurn = (t.id.length % 2 === 0 ? 0.6 : -0.6) + (Math.random() * 0.4 - 0.2);
          moveTank(t, -0.7, -0.7, t.rotation + reverseTurn); 
          return;
        }

        // 探测周围障碍物和子弹威胁，建立避障向量
        let frontBlocked = false;
        let frontDist = Infinity;

        sampleDegs.forEach(d => {
           const sA = dirAngle + (d * Math.PI / 180);
           // 增加探测深度：近、中、远、超远
           const dists = [TANK_SIZE * 1.1, TANK_SIZE * 2.2, TANK_SIZE * 4.0, TANK_SIZE * 6.0]; 
           
           // 基础权重：越靠近目标方向权重越高，使用余弦平滑
           let weight = Math.pow(Math.cos(d * Math.PI / 180 * 0.5), 2) * 200;

           // 惯性权重：增加对当前旋转方向的偏好，防止频繁抖动
           const angleToCurrentRot = Math.abs(((sA - t.rotation + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
           weight += Math.max(0, 1.0 - angleToCurrentRot / Math.PI) * 50;

           // 动态绕路权重：如果正在绕路，给选定方向增加适度权重
           if (t.detourTimer && t.detourTimer > 0 && t.detourSide) {
             const detourTargetDeg = 40 * t.detourSide; 
             const detourEffect = Math.max(0, Math.cos((d - detourTargetDeg) * Math.PI / 180));
             weight += detourEffect * 150;
           }
           
           for (let i = 0; i < dists.length; i++) {
             const dist = dists[i];
             const lookPos = { x: t.pos.x + Math.cos(sA) * dist, y: t.pos.y + Math.sin(sA) * dist };
             
             // 1. 检查墙体碰撞
             const wallHit = next.walls.find(w => w.type !== WallType.WATER && checkCollision({pos: lookPos, size: TANK_SIZE * 0.9, id: ''}, w));
             
             if (wallHit && Math.abs(d) < 25) {
               frontBlocked = true;
               frontDist = Math.min(frontDist, dist);
             }
             // 2. 检查子弹威胁 (新增：躲避敌方子弹)
             const dangerBullets = next.bullets.filter(b => {
               if (isSameSide(b.team, t.team)) return false; // 不躲队友子弹
               const distToBullet = getDistance(lookPos, b.pos);
               if (distToBullet > TANK_SIZE * 3) return false; // 太远不考虑
               
               // 预测子弹是否会经过这个采样点附近
               const nextBulletPos = {
                 x: b.pos.x + Math.cos(b.rotation) * b.speed * 0.2, 
                 y: b.pos.y + Math.sin(b.rotation) * b.speed * 0.2
               };
               const distToNextBullet = getDistance(lookPos, nextBulletPos);
               return distToBullet < TANK_SIZE * 1.5 || distToNextBullet < TANK_SIZE * 1.2;
             });

             // 3. 检查敌人瞄准威胁 (新增：躲避敌人的瞄准线，增加随机晃动感)
             const isBeingAimedAt = foes.some(f => {
                const distToFoe = getDistance(lookPos, f.pos);
                if (distToFoe > 1000) return false;
                const angleToLookPos = getAngle(f.pos, lookPos);
                const angleDiff = Math.abs(((f.turretRotation - angleToLookPos + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
                return angleDiff < 0.12; // 瞄准线惩罚
              });

              // 4. 检查队友/玩家位置 (新增：保持社交距离，防止堆叠和追尾)
              const teammates = (isAlly ? [next.player, ...next.allies] : next.enemies).filter(tm => tm.id !== t.id && tm.health > 0);
              const tooCloseTeammate = teammates.find(tm => {
                const distToTM = getDistance(lookPos, tm.pos);
                // 采样点离队友太近
                return distToTM < TANK_SIZE * 1.3;
              });
  
              if (wallHit || isOutOfBounds(lookPos, TANK_SIZE * 0.45, WORLD_WIDTH, WORLD_HEIGHT) || dangerBullets.length > 0 || isBeingAimedAt || tooCloseTeammate) {
                // 惩罚系数优化：不再使用巨大的固定减法，而是使用衰减系数
                const multipliers = [0.01, 0.2, 0.5, 0.8];
                let m = multipliers[i];
                
                if (dangerBullets.length > 0) m *= 0.3; 
                if (isBeingAimedAt) m *= 0.7;
                if (tooCloseTeammate) m *= 0.5;

                weight *= m;
                
                // 正前方的极近障碍物保留一定的强制规避
                if (Math.abs(d) < 20 && i === 0) weight -= 500;
             }
           }
           
           if (weight > 1) {
             bx += Math.cos(sA) * weight; 
             by += Math.sin(sA) * weight; 
             totalW += weight; 
           }
        });

        // 处理绕路决策：如果前方被堵且没有在绕路，或者绕路太久需要重新决策
        if (frontBlocked && (!t.detourTimer || t.detourTimer <= 0)) {
          // 减短单次绕路时间，使其反应更灵敏
          t.detourTimer = 30 + Math.random() * 30; 
          
          // 更加细腻的空旷度检查
          const leftCheckA = dirAngle - Math.PI/4;
          const rightCheckA = dirAngle + Math.PI/4;
          
          const getObstacleCount = (angle: number) => {
            let count = 0;
            [1.5, 2.5, 3.5].forEach(distMult => {
              const p = { x: t.pos.x + Math.cos(angle) * TANK_SIZE * distMult, y: t.pos.y + Math.sin(angle) * TANK_SIZE * distMult };
              if (next.walls.some(w => w.type !== WallType.WATER && checkCollision({pos: p, size: TANK_SIZE, id: ''}, w))) count++;
            });
            return count;
          };

          t.detourSide = getObstacleCount(leftCheckA) <= getObstacleCount(rightCheckA) ? -1 : 1;
        }
        if (t.detourTimer && t.detourTimer > 0) t.detourTimer--;

        if (totalW < 40) { // 稍微提高阈值，增强稳定性
          // 真正被困住的情况：周围几乎没有正权重方向
          if (t.stuckTimer > 20) {
            t.reverseTimer = 40;
            t.stuckTimer = 0;
            return;
          }
          // 寻找最空旷的方向，不仅限于前方
          let bestEscapeAngle = t.rotation + Math.PI + (Math.random() * 0.4 - 0.2);
          let maxClearDist = 0;
          
          for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
            let clearDist = 0;
            for (let d = 1; d <= 4; d++) {
              const testP = { x: t.pos.x + Math.cos(a) * TANK_SIZE * d, y: t.pos.y + Math.sin(a) * TANK_SIZE * d };
              if (next.walls.some(w => w.type !== WallType.WATER && checkCollision({ ...t, pos: testP }, w)) || isOutOfBounds(testP, TANK_SIZE)) {
                break;
              }
              clearDist = d;
            }
            if (clearDist > maxClearDist) {
              maxClearDist = clearDist;
              bestEscapeAngle = a;
            }
          }
          moveTank(t, 0.6, 0.6, bestEscapeAngle); 
        } else { 
          // 平滑转向，避免剧烈抖动
          // 只有当向量长度足够大时才更新方向，防止在原地微小抖动导致快速转圈
          let finalAngle = t.rotation;
          if (Math.abs(bx) > 0.1 || Math.abs(by) > 0.1) {
            finalAngle = Math.atan2(by, bx);
          }
          
          // 引入历史角度平滑处理 (增加权重使转向更丝滑)
          if (t.lastFinalAngle !== undefined) {
             const diff = ((finalAngle - t.lastFinalAngle + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
             // 如果角度变化极小，则不更新，防止高频抖动
             if (Math.abs(diff) > 0.01) {
               finalAngle = t.lastFinalAngle + diff * 0.5; // 稍微降低跟随速度
             } else {
               finalAngle = t.lastFinalAngle;
             }
          }
          t.lastFinalAngle = finalAngle;
          
          // 新增：动态限速逻辑，如果前方有队友，自动减速防止追尾
          let speedScale = 1.0;
          
          // 如果前方障碍物非常近，也要减速
          if (frontBlocked && frontDist < TANK_SIZE * 1.5) {
            speedScale = Math.min(speedScale, (frontDist - TANK_SIZE * 0.8) / (TANK_SIZE * 0.7));
          }

          const teammates = (isAlly ? [next.player, ...next.allies] : next.enemies).filter(tm => tm.id !== t.id && tm.health > 0);
          const tmInFront = teammates.find(tm => {
            const dist = getDistance(t.pos, tm.pos);
            if (dist > TANK_SIZE * 3.0) return false;
            const angleToTM = getAngle(t.pos, tm.pos);
            const angleDiff = Math.abs(((t.rotation - angleToTM + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
            return angleDiff < 0.7; 
          });
          
          if (tmInFront) {
            const dist = getDistance(t.pos, tmInFront.pos);
            speedScale = Math.min(speedScale, Math.max(0, (dist - TANK_SIZE * 1.1) / (TANK_SIZE * 1.5)));
          }

          moveTank(t, Math.max(0.2, speedScale), Math.max(0.2, speedScale), finalAngle); 
        }

        const combatTargets = foes.filter(f => getDistance(t.pos, f.pos) < 1100);
        let currentTarget: Vector2D | null = combatTargets.length > 0 ? combatTargets[0].pos : null;
        let isClearingPath = false;

        // 如果没有敌人，且确实被堵死（stuckTimer 较大且周围没有好走的路），才寻找路径上的可破坏障碍物
        if (!currentTarget && (t.stuckTimer > 40 || (t.stuckTimer > 20 && totalW < 500)) && frontBlocked) {
          const lookAheadPos = {
            x: t.pos.x + Math.cos(t.rotation) * 150,
            y: t.pos.y + Math.sin(t.rotation) * 150
          };
          const breakableWall = next.walls.find(w => 
            (w.type === WallType.GLASS || w.type === WallType.MUD || w.type === WallType.STONE || w.type === WallType.IRON) && 
            getDistance(lookAheadPos, w.pos) < 100
          );
          if (breakableWall) {
            currentTarget = breakableWall.pos;
            isClearingPath = true;
          }
        }

        if (currentTarget) {
          t.turretRotation = lerpAngle(t.turretRotation, getAngle(t.pos, currentTarget), 0.25);
          const cooldownMult = t.id === 'player' ? 1.2 : (isClearingPath ? 2.0 : 3.5);
          
          // 应用急迫加成 (射速)
          let currentShootCooldown = SHOOT_COOLDOWN;
          if (isSameSide(t.team, Team.ALLY)) {
            currentShootCooldown *= (1 - next.teamUpgrades.haste);
          } else {
            currentShootCooldown *= (1 - next.enemyTeamUpgrades.haste);
          }
          
          if (now - t.lastShot > currentShootCooldown * cooldownMult) {
            // 应用急迫加成 (子弹速度)
            let currentBulletSpeed = BULLET_SPEED;
            if (isSameSide(t.team, Team.ALLY)) {
              currentBulletSpeed *= (1 + next.teamUpgrades.haste);
            } else {
              currentBulletSpeed *= (1 + next.enemyTeamUpgrades.haste);
            }
            
            next.bullets.push({ id: `ba-${t.id}-${now}`, ownerId: t.id, team: t.team, pos: { ...t.pos }, rotation: t.turretRotation, speed: currentBulletSpeed, size: BULLET_SIZE, damage: BULLET_DAMAGE });
            t.lastShot = now;
          }
        } else { t.turretRotation = lerpAngle(t.turretRotation, t.rotation, 0.1); }
      };

      next.allies.forEach((a, i) => runAI(a, i));
      next.enemies.forEach((e, i) => runAI(e, i));
      if (next.isAIControlled) runAI(next.player, 999);

      // 拾取物资逻辑
      next.items = next.items.filter(item => {
        const collectingTank = allTanks.find(t => t.health > 0 && checkCollision(t, item));
        if (collectingTank) {
          if (!collectingTank.buffs) collectingTank.buffs = {};
          
          switch (item.type) {
            case ItemType.HEAL:
              collectingTank.health = Math.min(collectingTank.maxHealth, collectingTank.health + HEALTH_PACK_HEAL);
              collectingTank.buffs.healTimer = now + HEAL_BUFF_DURATION; 
              collectingTank.buffs.lastHealBuffRegenTime = now;
              break;
            case ItemType.SPEED:
              collectingTank.buffs.speedTimer = now + SPEED_BUFF_DURATION;
              break;
            case ItemType.DEFENSE:
              collectingTank.buffs.defenseTimer = now + DEFENSE_BUFF_DURATION;
              collectingTank.buffs.defenseValue = 0.1 + Math.random() * 0.8; // 0.1 - 0.9
              break;
            case ItemType.DAMAGE:
              collectingTank.buffs.damageTimer = now + DAMAGE_BUFF_DURATION;
              break;
          }
          return false;
        }
        return true;
      });

      next.bullets = next.bullets.filter(b => {
        b.pos.x += Math.cos(b.rotation) * b.speed * dt; b.pos.y += Math.sin(b.rotation) * b.speed * dt;
        if (isOutOfBounds(b.pos, BULLET_SIZE, WORLD_WIDTH, WORLD_HEIGHT)) return false;
        
        for (const w of next.walls) {
          if (w.type !== WallType.WATER && checkCollision(b, w)) {
            // 反弹逻辑
            if (w.type === WallType.REBOUND) {
              const dx = b.pos.x - w.pos.x;
              const dy = b.pos.y - w.pos.y;
              if (Math.abs(dx) > Math.abs(dy)) b.rotation = Math.PI - b.rotation;
              else b.rotation = -b.rotation;
              // 防止子弹嵌入墙体
              b.pos.x += Math.cos(b.rotation) * 10;
              b.pos.y += Math.sin(b.rotation) * 10;
              return true; 
            }
            if (w.type !== WallType.BULLETPROOF) {
              w.health -= 1; 
              if (w.health <= 0) {
                next.effects.push({
                  id: `eff-dest-${w.id}-${now}`,
                  pos: { ...w.pos },
                  size: w.size * 1.5,
                  type: EffectType.DESTRUCTION,
                  startTime: now,
                  duration: 800,
                  color: w.type === WallType.STONE ? '#94a3b8' : 
                         w.type === WallType.IRON ? '#4b5563' : 
                         w.type === WallType.MUD ? '#78350f' : '#bae6fd'
                });
              } else {
                next.effects.push({
                  id: `eff-hit-${w.id}-${now}`,
                  pos: { ...b.pos },
                  size: 20,
                  type: EffectType.HIT,
                  startTime: now,
                  duration: 300,
                  color: '#fff'
                });
              }
            }
            return false; 
          }
        }

        for (const t of allTanks) {
          if (t.health > 0 && t.id !== b.ownerId && !isSameSide(t.team, b.team) && checkCollision(b, t)) {
            // 计算伤害 Buff 和 抗性 Buff
            const owner = allTanks.find(at => at.id === b.ownerId);
            let finalDamage = b.damage;
            
            // 击中坦克的爆炸效果
            next.effects.push({
              id: `eff-exp-${t.id}-${now}`,
              pos: { ...b.pos },
              size: 50,
              type: EffectType.EXPLOSION,
              startTime: now,
              duration: 500
            });
            
            // 攻击者有伤害 Buff
            if (owner?.buffs?.damageTimer && owner.buffs.damageTimer > now) {
              finalDamage *= ITEM_BUFF_VALUES.DAMAGE_BOOST;
            }

            // 应用永久伤害加成
            if (owner) {
              if (isSameSide(owner.team, Team.ALLY)) {
                finalDamage *= (1 + next.teamUpgrades.damage);
              } else {
                finalDamage *= (1 + next.enemyTeamUpgrades.damage);
              }
            }
            
            // 防御者有抗性 Buff
            if (t.buffs?.defenseTimer && t.buffs.defenseTimer > now) {
              const reduction = t.buffs.defenseValue !== undefined ? t.buffs.defenseValue : ITEM_BUFF_VALUES.DEFENSE_REDUCTION;
              finalDamage *= (1 - reduction);
            }

            // 应用永久防御加成
            if (isSameSide(t.team, Team.ALLY)) {
              finalDamage *= (1 - next.teamUpgrades.defense);
            } else {
              finalDamage *= (1 - next.enemyTeamUpgrades.defense);
            }

            t.health -= finalDamage;
            
            // 记录伤害来源
            if (!t.recentDamagers) t.recentDamagers = [];
            const damagerIdx = t.recentDamagers.findIndex(d => d.id === b.ownerId);
            if (damagerIdx !== -1) {
              t.recentDamagers[damagerIdx].time = now;
            } else {
              t.recentDamagers.push({ id: b.ownerId, time: now });
            }
            // 只保留最近 10 秒内的伤害来源
            t.recentDamagers = t.recentDamagers.filter(d => now - d.time < 10000);

            if (t.health <= 0) { 
              const killer = allTanks.find(at => at.id === b.ownerId); 
              if (killer) { 
                killer.kills += 1; 
                killer.score += 100; 
                
                // 击败一个坦克可以得到50个金币
                if (isSameSide(killer.team, Team.ALLY)) {
                  next.gold += 50;
                } else {
                  next.enemyGold += 50;
                }
                
                // 助攻逻辑：所有在 10 秒内伤害过该坦克且不是击杀者的队友
                if (t.recentDamagers) {
                  t.recentDamagers.forEach(rd => {
                    if (rd.id !== b.ownerId) {
                      const assistant = allTanks.find(at => at.id === rd.id);
                      if (assistant && isSameSide(assistant.team, b.team)) {
                        assistant.assists += 1;
                        assistant.score += 50;
                      }
                    }
                  });
                }
              }
              // 击败后清空伤害记录
              t.recentDamagers = [];
            }
            return false;
          }
        }
        return true;
      });

      next.walls = next.walls.filter(w => w.health > 0);
      // 清理过期视觉效果
      next.effects = next.effects.filter(eff => now - eff.startTime < eff.duration);
      next.beds.forEach(bed => {
        const defenders = allTanks.some(t => t.health > 0 && isSameSide(t.team, bed.team) && getDistance(t.pos, bed.pos) < CAPTURE_RADIUS);
        if (defenders) bed.captureProgress = Math.max(0, bed.captureProgress - dt * 2500);
        else {
          const attackers = allTanks.filter(t => t.health > 0 && !isSameSide(t.team, bed.team) && getDistance(t.pos, bed.pos) < CAPTURE_RADIUS);
          if (attackers.length > 0) {
            bed.captureProgress += dt * 1000;
            bed.capturingTeam = isSameSide(attackers[0].team, Team.ALLY) ? Team.ALLY : Team.ENEMY;
            if (bed.captureProgress >= CAPTURE_TIME_REQUIRED) { 
              next.isGameOver = true; 
              next.winner = bed.capturingTeam; 

              // AI 记忆与学习逻辑
              if (next.isMemoryEnabled && !isReflectingRef.current) {
                isReflectingRef.current = true;
                const battleRecord = {
                  id: `battle-${Date.now()}`,
                  timestamp: Date.now(),
                  winner: next.winner,
                  playerStats: {
                    kills: next.player.kills,
                    score: next.player.score,
                    deathCount: 0 // 暂时不记录死亡次数
                  },
                  dominantStrategy: next.winner === Team.ALLY ? next.currentCommand : next.enemyCommand
                };

                // 异步进行战后反思
                reflectOnBattle(battleRecord, next.knowledgeBase!).then(reflection => {
                  setGameState(prev => {
                    if (!prev.knowledgeBase) return prev;
                    let updatedKb = memoryService.addBattleRecord(prev.knowledgeBase, battleRecord);
                    
                    if (reflection.learnedTactic) {
                      updatedKb = memoryService.addLearnedTactic(updatedKb, reflection.learnedTactic);
                    }
                    if (reflection.playerPattern) {
                      updatedKb = memoryService.addPlayerPattern(updatedKb, reflection.playerPattern);
                    }
                    if (reflection.innovation) {
                      updatedKb = memoryService.addInnovation(updatedKb, reflection.innovation);
                    }
                    
                    return { ...prev, knowledgeBase: updatedKb };
                  });
                });
              }
              
              setGameState(next);
              onStateUpdate(next);
            }
          } else { bed.captureProgress = Math.max(0, bed.captureProgress - dt * 3500); }
        }
      });
      const handleRespawn = (t: Tank) => {
        if (t.health <= 0) {
          if (t.respawnTimer === 0) {
            t.respawnTimer = RESPAWN_DELAY;
          } else {
            t.respawnTimer -= dt * 1000;
            if (t.respawnTimer <= 0) {
              // 查找安全的重生点，避免刷新在其他坦克上
              let safePos = { ...t.spawnPos };
              let foundSafe = false;
              // 尝试在出生点周围逐渐扩大的圆圈中寻找空位
              for (let radius = 0; radius <= 300; radius += 40) {
                for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 6) {
                  const testPos = {
                    x: t.spawnPos.x + Math.cos(angle) * radius,
                    y: t.spawnPos.y + Math.sin(angle) * radius
                  };
                  const isBlocked = next.walls.some(w => w.type !== WallType.WATER && checkCollision({ ...t, pos: testPos }, w)) ||
                                  allTanks.some(other => other.id !== t.id && other.health > 0 && checkCollision({ ...t, pos: testPos }, other)) ||
                                  isOutOfBounds(testPos, TANK_SIZE, WORLD_WIDTH, WORLD_HEIGHT);
                  if (!isBlocked) {
                    safePos = testPos;
                    foundSafe = true;
                    break;
                  }
                }
                if (foundSafe) break;
              }
              t.health = MAX_HEALTH_TANK;
              t.pos = safePos;
              t.respawnTimer = 0;
            }
          }
        }
      };
      handleRespawn(next.player); next.allies.forEach(handleRespawn); next.enemies.forEach(handleRespawn);
      
      stateRef.current = next;
      if (now - lastOnStateUpdateRef.current > 100) {
        setGameState(next);
        onStateUpdate(next);
        lastOnStateUpdateRef.current = now;
      }

      render();
      requestRef.current = requestAnimationFrame(gameLoop);
    }, [onStateUpdate]);

  useEffect(() => {
    requestRef.current = requestAnimationFrame(gameLoop);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [gameLoop]);

  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      if (canvas) {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
      }
    };
    window.addEventListener('resize', handleResize);
    handleResize(); // Initial set
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const kd = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (key === 'e' && !e.repeat) {
        setGameState(prev => ({ ...prev, activeMenu: !prev.activeMenu, activeTab: 'COMMANDS' }));
      }
      if (key === 'z' && !e.repeat) {
        setGameState(prev => {
          // 如果菜单已经打开且当前是商城，则关闭菜单；否则打开商城
          const shouldClose = prev.activeMenu && prev.activeTab === 'SHOP';
          return { 
            ...prev, 
            activeMenu: !shouldClose, 
            activeTab: 'SHOP' 
          };
        });
      }
      keys.current.add(key);
    };
    const ku = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase());
    const mm = (e: MouseEvent) => { 
      mousePosRef.current = { x: e.clientX, y: e.clientY }; 
      lastMouseMoveTimeRef.current = Date.now();
    };
    window.addEventListener('keydown', kd); window.addEventListener('keyup', ku);
    window.addEventListener('mousemove', mm); window.addEventListener('mousedown', () => isMouseDown.current = true); window.addEventListener('mouseup', () => isMouseDown.current = false);
    
    return () => {
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
      window.removeEventListener('mousemove', mm);
    };
  }, []);

  const render = () => {
    const gameState = stateRef.current;
    if (!gameState) return;
    const { player, allies, enemies, walls, bullets, beds, items } = gameState;
    const now = Date.now();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const vw = canvas.width, vh = canvas.height;
    ctx.clearRect(0, 0, vw, vh);
    ctx.save(); ctx.translate(-player.pos.x + vw/2, -player.pos.y + vh/2);
    
    // 优化后的草坪渲染
    // 1. 绘制基础底色
    ctx.fillStyle = COLORS.GROUND; 
    ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

    // 2. 绘制深浅交替的草坪方块 (棋盘格纹理)
    const gridSize = 200;
    for (let x = 0; x < WORLD_WIDTH; x += gridSize) {
      for (let y = 0; y < WORLD_HEIGHT; y += gridSize) {
        if ((Math.floor(x / gridSize) + Math.floor(y / gridSize)) % 2 === 0) {
          ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
          ctx.fillRect(x, y, gridSize, gridSize);
        }
      }
    }

    // 3. 绘制随机草丛细节 (使用固定步长和伪随机偏移)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 2;
    const detailDensity = 150;
    for (let x = detailDensity / 2; x < WORLD_WIDTH; x += detailDensity) {
      for (let y = detailDensity / 2; y < WORLD_HEIGHT; y += detailDensity) {
        // 使用坐标产生的伪随机数，保证草丛位置固定
        const seed = (x * 12345 + y * 67890) % 100;
        if (seed > 40) { // 60% 的概率绘制草簇
          const offsetX = (seed % 30) - 15;
          const offsetY = ((seed * 7) % 30) - 15;
          const px = x + offsetX;
          const py = y + offsetY;
          
          ctx.beginPath();
          // 绘制三根小草
          ctx.moveTo(px - 4, py + 4); ctx.lineTo(px - 2, py - 4);
          ctx.moveTo(px, py + 5); ctx.lineTo(px, py - 6);
          ctx.moveTo(px + 4, py + 4); ctx.lineTo(px + 2, py - 4);
          ctx.stroke();
        }
      }
    }

    // 4. 绘制边界阴影与蓝色边界
    ctx.strokeStyle = '#3b82f6'; // 蓝色边界
    ctx.lineWidth = 20;
    ctx.strokeRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    
    // 5. 绘制基地小路 (棕色)
    ctx.fillStyle = '#78350f'; // 棕色
    // 玩家基地左上角小路
    ctx.fillRect(0, 380, 400, 40);
    ctx.fillRect(380, 0, 40, 400);
    // 敌方基地右下角小路
    ctx.fillRect(WORLD_WIDTH - 400, WORLD_HEIGHT - 420, 400, 40);
    ctx.fillRect(WORLD_WIDTH - 420, WORLD_HEIGHT - 400, 40, 400);

    beds.forEach(bed => {
      const isAlly = isSameSide(bed.team, Team.ALLY); const color = isAlly ? COLORS.ALLY : COLORS.ENEMY;
      ctx.beginPath(); ctx.arc(bed.pos.x, bed.pos.y, CAPTURE_RADIUS, 0, Math.PI * 2); ctx.strokeStyle = color + '22'; ctx.lineWidth = 2; ctx.stroke();
      ctx.beginPath(); ctx.arc(bed.pos.x, bed.pos.y, bed.size/2, 0, Math.PI * 2); ctx.fillStyle = color + '66'; ctx.fill(); ctx.strokeStyle = color; ctx.stroke();
      if (bed.captureProgress > 0) { ctx.beginPath(); ctx.arc(bed.pos.x, bed.pos.y, bed.size/2 + 30, -Math.PI/2, -Math.PI/2 + (Math.PI*2 * (bed.captureProgress/5000))); ctx.strokeStyle = bed.capturingTeam === Team.ALLY ? COLORS.ALLY : COLORS.ENEMY; ctx.lineWidth = 15; ctx.stroke(); }
    });
    const drawTank = (t: Tank) => {
      if (t.health <= 0) return;
      const isEnemy = !isSameSide(t.team, Team.ALLY); const isLeader = t.isLeader;
      ctx.save(); ctx.translate(t.pos.x, t.pos.y);
      ctx.save(); ctx.rotate(t.rotation);
      if (isLeader && isEnemy) { ctx.fillStyle = '#4c1d95'; ctx.fillRect(-45, -45, 90, 90); ctx.strokeStyle = '#f472b6'; ctx.lineWidth = 4; ctx.strokeRect(-45, -45, 90, 90); }
      else { ctx.fillStyle = isEnemy ? '#312e81' : '#0f172a'; ctx.fillRect(-35, -35, 70, 70); ctx.strokeStyle = t.color; ctx.lineWidth = 3; ctx.strokeRect(-35, -35, 70, 70); }
      ctx.restore();
      ctx.save(); ctx.rotate(t.turretRotation);
      if (isLeader && isEnemy) { ctx.fillStyle = '#6d28d9'; ctx.beginPath(); ctx.arc(0, 0, 42, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#475569'; ctx.fillRect(30, -10, 60, 20); } 
      else { ctx.fillStyle = '#475569'; ctx.fillRect(20, -10, 50, 20); ctx.beginPath(); ctx.arc(0, 0, 32, 0, Math.PI * 2); ctx.fillStyle = isEnemy ? '#312e81' : '#0f172a'; ctx.fill(); ctx.strokeStyle = t.color; ctx.stroke(); }
      ctx.restore();
      ctx.fillStyle = '#fff'; ctx.font = 'bold 16px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(t.nickname || '', 0, -100);
      
      // 显示防御百分比
      if (t.buffs?.defenseTimer && t.buffs.defenseTimer > now && t.buffs.defenseValue !== undefined) {
        ctx.fillStyle = '#a855f7'; // 紫色显示防御
        ctx.font = 'bold 12px sans-serif';
        const defPercent = Math.round(t.buffs.defenseValue * 100);
        ctx.fillText(`🛡️ ${defPercent}%`, 0, -85);
      }

      // 显示回血状态反馈
      if (t.buffs?.healTimer && t.buffs.healTimer > now) {
        ctx.fillStyle = '#ef4444'; // 红色显示回血
        ctx.font = 'bold 14px sans-serif';
        ctx.fillText('❤️', 25, -85);
      }

      ctx.fillStyle = '#000'; ctx.fillRect(-35, -75, 70, 10); 
      // 玩家血条始终显示为红色，其他单位保持原有逻辑
      if (t.id === 'player') {
        ctx.fillStyle = '#ef4444';
      } else {
        ctx.fillStyle = t.health > 40 ? '#22c55e' : '#ef4444';
      }
      ctx.fillRect(-35, -75, 70 * (t.health/100), 10);
      ctx.restore();
    };
    allies.forEach(drawTank); enemies.forEach(drawTank); drawTank(player);
    walls.forEach(w => { 
      const x = w.pos.x - w.size / 2;
      const y = w.pos.y - w.size / 2;
      const size = w.size;

      ctx.save();
      
      switch (w.type) {
        case WallType.STONE:
          // 石头：增加渐变、倒角和更真实的裂纹
          const stoneGrad = ctx.createLinearGradient(x, y, x + size, y + size);
          stoneGrad.addColorStop(0, '#94a3b8');
          stoneGrad.addColorStop(1, '#475569');
          ctx.fillStyle = stoneGrad;
          ctx.fillRect(x, y, size, size);
          
          // 阴影边框
          ctx.strokeStyle = 'rgba(0,0,0,0.3)';
          ctx.lineWidth = 4;
          ctx.strokeRect(x, y, size, size);
          ctx.strokeStyle = 'rgba(255,255,255,0.1)';
          ctx.lineWidth = 2;
          ctx.strokeRect(x + 2, y + 2, size - 4, size - 4);

          // 细节纹路：随机小坑洼
          ctx.fillStyle = 'rgba(0,0,0,0.15)';
          [ {ox:10, oy:12}, {ox:40, oy:8}, {ox:25, oy:35}, {ox:45, oy:48}, {ox:8, oy:42} ].forEach(p => {
            ctx.beginPath();
            ctx.arc(x + p.ox, y + p.oy, 2, 0, Math.PI * 2);
            ctx.fill();
          });

          // 随机裂纹
          ctx.beginPath();
          ctx.moveTo(x + 5, y + 15); ctx.lineTo(x + 15, y + 20); ctx.lineTo(x + 10, y + 30);
          ctx.moveTo(x + size - 5, y + size - 20); ctx.lineTo(x + size - 20, y + size - 10);
          ctx.strokeStyle = 'rgba(0,0,0,0.4)';
          ctx.lineWidth = 1;
          ctx.stroke();
          break;

        case WallType.WATER:
          // 水域：多层波动、深浅渐变
          const waterGrad = ctx.createRadialGradient(w.pos.x, w.pos.y, 5, w.pos.x, w.pos.y, size/1.2);
          waterGrad.addColorStop(0, '#2563eb');
          waterGrad.addColorStop(1, '#1e3a8a');
          ctx.fillStyle = waterGrad;
          ctx.globalAlpha = 0.7;
          ctx.fillRect(x, y, size, size);
          
          // 动态波纹层 1
          const wave1 = (now / 800) % 1;
          ctx.beginPath();
          ctx.moveTo(x, y + size * 0.3 + Math.sin(now / 400) * 4);
          ctx.bezierCurveTo(x + size * 0.3, y + size * 0.2, x + size * 0.7, y + size * 0.5, x + size, y + size * 0.3 + Math.cos(now / 400) * 4);
          ctx.strokeStyle = 'rgba(255,255,255,0.2)';
          ctx.lineWidth = 2;
          ctx.stroke();

          // 动态波纹层 2
          ctx.beginPath();
          ctx.moveTo(x, y + size * 0.7 + Math.cos(now / 500) * 3);
          ctx.bezierCurveTo(x + size * 0.4, y + size * 0.8, x + size * 0.6, y + size * 0.6, x + size, y + size * 0.7 + Math.sin(now / 500) * 3);
          ctx.strokeStyle = 'rgba(255,255,255,0.15)';
          ctx.stroke();
          break;

        case WallType.MUD:
          // 泥地：不规则深色斑块、干裂纹理
          ctx.fillStyle = '#78350f';
          ctx.fillRect(x, y, size, size);
          
          // 泥浆斑块
          ctx.fillStyle = 'rgba(69, 26, 3, 0.4)';
          for (let k = 0; k < 4; k++) {
            ctx.beginPath();
            const rx = (k * 17 + 10) % (size - 10);
            const ry = (k * 23 + 15) % (size - 10);
            ctx.ellipse(x + rx, y + ry, 8, 5, k * 45 * Math.PI / 180, 0, Math.PI * 2);
            ctx.fill();
          }

          // 干裂纹理
          ctx.beginPath();
          ctx.moveTo(x + 5, y + 5); ctx.lineTo(x + size - 5, y + size - 5);
          ctx.moveTo(x + size - 5, y + 5); ctx.lineTo(x + 5, y + size - 5);
          ctx.strokeStyle = 'rgba(0,0,0,0.1)';
          ctx.lineWidth = 1;
          ctx.stroke();
          break;

        case WallType.GLASS:
          // 玻璃：多重反光斜杠、边缘高亮
          ctx.globalAlpha = 0.3;
          ctx.fillStyle = '#bae6fd';
          ctx.fillRect(x, y, size, size);
          
          // 边缘描边
          ctx.strokeStyle = 'rgba(255,255,255,0.6)';
          ctx.lineWidth = 1;
          ctx.strokeRect(x, y, size, size);

          // 多重闪亮反光
          ctx.beginPath();
          [ {x1:10, y1:size-10, x2:size-10, y2:10}, {x1:25, y1:size-5, x2:size-5, y2:25}, {x1:5, y1:size-25, x2:size-25, y2:5} ].forEach(l => {
            ctx.moveTo(x + l.x1, y + l.y1);
            ctx.lineTo(x + l.x2, y + l.y2);
          });
          ctx.strokeStyle = 'rgba(255,255,255,0.4)';
          ctx.lineWidth = 2;
          ctx.stroke();
          
          // 角部高光
          ctx.fillStyle = 'rgba(255,255,255,0.2)';
          ctx.beginPath();
          ctx.moveTo(x, y); ctx.lineTo(x + 15, y); ctx.lineTo(x, y + 15); ctx.closePath();
          ctx.fill();
          break;

        case WallType.REBOUND:
          // 弹跳墙：蜂窝核心、能量环、动态扫描线
          const reboundPulse = Math.sin(now / 150) * 0.15 + 0.85;
          
          // 底座
          ctx.fillStyle = '#1e1b4b';
          ctx.fillRect(x, y, size, size);
          
          // 能量核心 (蜂窝感)
          ctx.strokeStyle = COLORS.REBOUND;
          ctx.lineWidth = 1;
          ctx.globalAlpha = reboundPulse * 0.5;
          for(let i=0; i<3; i++) {
            ctx.beginPath();
            ctx.moveTo(x, y + i * size/3); ctx.lineTo(x + size, y + i * size/3);
            ctx.moveTo(x + i * size/3, y); ctx.lineTo(x + i * size/3, y + size);
            ctx.stroke();
          }

          // 外部霓虹框
          ctx.globalAlpha = reboundPulse;
          ctx.strokeStyle = COLORS.REBOUND;
          ctx.lineWidth = 3;
          ctx.strokeRect(x + 2, y + 2, size - 4, size - 4);
          
          // 动态扫描线
          const scanY = (now / 10) % size;
          ctx.beginPath();
          ctx.moveTo(x, y + scanY); ctx.lineTo(x + size, y + scanY);
          ctx.strokeStyle = 'rgba(190, 242, 100, 0.4)';
          ctx.lineWidth = 2;
          ctx.stroke();

          // 中心图标 (带旋转效果)
          ctx.save();
          ctx.translate(w.pos.x, w.pos.y);
          ctx.rotate(now / 1000);
          ctx.beginPath();
          for(let i=0; i<4; i++) {
            ctx.moveTo(size/6, 0); ctx.lineTo(size/3, 0);
            ctx.rotate(Math.PI/2);
          }
          ctx.stroke();
          ctx.restore();
          break;

        case WallType.IRON:
          // 铁墙：深灰色金属质感、铆钉、磨损痕迹
          const ironGrad = ctx.createLinearGradient(x, y, x + size, y + size);
          ironGrad.addColorStop(0, '#4b5563');
          ironGrad.addColorStop(1, '#1f2937');
          ctx.fillStyle = ironGrad;
          ctx.fillRect(x, y, size, size);
          
          // 金属边框
          ctx.strokeStyle = '#9ca3af';
          ctx.lineWidth = 2;
          ctx.strokeRect(x + 2, y + 2, size - 4, size - 4);
          
          // 铆钉
          ctx.fillStyle = '#9ca3af';
          const rivetPoints = [
            {rx: 6, ry: 6}, {rx: size-6, ry: 6},
            {rx: 6, ry: size-6}, {rx: size-6, ry: size-6},
            {rx: size/2, ry: 6}, {rx: size/2, ry: size-6},
            {rx: 6, ry: size/2}, {rx: size-6, ry: size/2}
          ];
          rivetPoints.forEach(rp => {
            ctx.beginPath();
            ctx.arc(x + rp.rx, y + rp.ry, 2, 0, Math.PI * 2);
            ctx.fill();
          });
          
          // 磨损划痕
          ctx.beginPath();
          ctx.moveTo(x + 10, y + 20); ctx.lineTo(x + 30, y + 25);
          ctx.moveTo(x + size - 15, y + 15); ctx.lineTo(x + size - 35, y + 40);
          ctx.strokeStyle = 'rgba(255,255,255,0.05)';
          ctx.lineWidth = 1;
          ctx.stroke();
          break;

        case WallType.BULLETPROOF:
          // 防弹墙：高科技护盾感、青色发光、能量脉冲
          const bpPulse = Math.sin(now / 200) * 0.1 + 0.9;
          
          // 核心
          ctx.fillStyle = '#083344';
          ctx.fillRect(x, y, size, size);
          
          // 能量格栅
          ctx.strokeStyle = '#22d3ee';
          ctx.lineWidth = 1;
          ctx.globalAlpha = 0.3 * bpPulse;
          for(let k=1; k<4; k++) {
            ctx.beginPath();
            ctx.moveTo(x + k * size/4, y); ctx.lineTo(x + k * size/4, y + size);
            ctx.moveTo(x, y + k * size/4); ctx.lineTo(x + size, y + k * size/4);
            ctx.stroke();
          }
          
          // 外围强光
          ctx.globalAlpha = 0.8 * bpPulse;
          ctx.strokeStyle = '#06b6d4';
          ctx.lineWidth = 4;
          ctx.strokeRect(x, y, size, size);
          
          // 内层高亮
          ctx.strokeStyle = '#ecfeff';
          ctx.lineWidth = 1;
          ctx.strokeRect(x + 4, y + 4, size - 8, size - 8);
          
          // 护盾图标
          ctx.beginPath();
          ctx.moveTo(w.pos.x, w.pos.y - 15);
          ctx.lineTo(w.pos.x + 12, w.pos.y - 5);
          ctx.lineTo(w.pos.x + 12, w.pos.y + 10);
          ctx.lineTo(w.pos.x, w.pos.y + 18);
          ctx.lineTo(w.pos.x - 12, w.pos.y + 10);
          ctx.lineTo(w.pos.x - 12, w.pos.y - 5);
          ctx.closePath();
          ctx.fillStyle = '#22d3ee';
          ctx.globalAlpha = 0.4 * bpPulse;
          ctx.fill();
          break;
      }
      
      ctx.restore();
    });
    // 强制重置全局透明度和合成模式，防止障碍物渲染污染后续绘制
    ctx.globalAlpha = 1.0;
    ctx.globalCompositeOperation = 'source-over';
    
    // 绘制视觉效果
    gameState.effects.forEach(eff => {
      ctx.save();
      ctx.translate(eff.pos.x, eff.pos.y);
      const progress = (now - eff.startTime) / eff.duration;
      const alpha = 1 - progress;
      ctx.globalAlpha = alpha;

      if (eff.type === EffectType.EXPLOSION) {
        const radius = (eff.size / 2) * (0.5 + progress * 0.5);
        const grad = ctx.createRadialGradient(0, 0, radius * 0.2, 0, 0, radius);
        grad.addColorStop(0, '#fff');
        grad.addColorStop(0.3, '#fbbf24');
        grad.addColorStop(1, 'transparent');
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.arc(0, 0, radius, 0, Math.PI * 2); ctx.fill();
      } else if (eff.type === EffectType.HIT) {
        ctx.fillStyle = eff.color || '#fff';
        const s = eff.size * (1 - progress);
        ctx.fillRect(-s/2, -s/2, s, s);
      } else if (eff.type === EffectType.DESTRUCTION) {
        ctx.fillStyle = eff.color || '#fff';
        for (let i = 0; i < 8; i++) {
          const angle = (i / 8) * Math.PI * 2 + progress * 2;
          const dist = progress * eff.size;
          const s = (eff.size / 5) * (1 - progress);
          ctx.fillRect(Math.cos(angle) * dist - s/2, Math.sin(angle) * dist - s/2, s, s);
        }
      }
      ctx.restore();
    });
    ctx.globalAlpha = 1.0;

    bullets.forEach(b => { ctx.save(); ctx.translate(b.pos.x, b.pos.y); ctx.rotate(b.rotation); ctx.fillStyle = b.team === Team.ENEMY ? '#ef4444' : '#60a5fa'; ctx.fillRect(-b.size * 2, -b.size / 2, b.size * 4, b.size); ctx.restore(); });
    items.forEach(item => { 
      ctx.save(); ctx.translate(item.pos.x, item.pos.y); 
      const color = ITEM_COLORS[item.type];
      const gradient = ctx.createRadialGradient(0, 0, 5, 0, 0, item.size * 0.8);
      gradient.addColorStop(0, color);
      gradient.addColorStop(1, 'transparent');
      ctx.fillStyle = gradient;
      ctx.globalAlpha = 0.5 + Math.sin(now / 200) * 0.2;
      ctx.beginPath(); ctx.arc(0, 0, item.size * 0.8, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(0, 0, item.size / 2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.beginPath(); ctx.arc(-item.size/6, -item.size/6, item.size/8, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.font = `bold ${item.size * 0.5}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const icon = item.type === ItemType.SPEED ? 'S' : item.type === ItemType.DEFENSE ? 'D' : item.type === ItemType.DAMAGE ? 'A' : '+';
      ctx.fillText(icon, 0, 0);
      ctx.restore(); 
    });
    ctx.restore();
  };

  return <canvas ref={canvasRef} width={window.innerWidth} height={window.innerHeight} className="block cursor-crosshair" />;
};

export default GameCanvas;
