
import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Team, Tank, Bullet, Wall, WallType, GameState, Vector2D, Bed, AIState, CommandType, Item, ItemType, ControlMode } from '../types';
import { 
  WORLD_WIDTH, WORLD_HEIGHT, TANK_SIZE, BULLET_SIZE, WALL_SIZE, 
  PLAYER_SPEED, AI_SPEED, BULLET_SPEED, MAX_HEALTH_TANK, 
  SHOOT_COOLDOWN, COLORS, BED_SIZE, CAPTURE_RADIUS, CAPTURE_TIME_REQUIRED, RESPAWN_DELAY,
  WATER_SLOW_FACTOR, BULLET_DAMAGE,
  HEALTH_PACK_HEAL, MAX_HEALTH_PACKS, ITEM_SIZE, MAX_ITEMS, ITEM_COLORS, BUFF_DURATION, AUTO_REGEN_INTERVAL, AUTO_REGEN_AMOUNT,
  ITEM_BUFF_VALUES
} from '../constants';
import { 
  checkCollision, getDistance, getAngle, isOutOfBounds 
} from '../utils/gameLogic';

interface Props {
  onStateUpdate: (state: GameState) => void;
  allyCount: number;
  enemyCount: number;
  nickname: string;
  controlMode: ControlMode;
}

const GameCanvas: React.FC<Props> = ({ onStateUpdate, allyCount, enemyCount, nickname, controlMode }) => {
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

  const isSameSide = (t1: Team, t2: Team) => {
    const side1 = (t1 === Team.PLAYER || t1 === Team.ALLY) ? 'FRIEND' : 'ENEMY';
    const side2 = (t2 === Team.PLAYER || t2 === Team.ALLY) ? 'FRIEND' : 'ENEMY';
    return side1 === side2;
  };

  const [gameState, setGameState] = useState<GameState>(() => {
    const safetyZones = [{ x: 400, y: 400, r: 400 }, { x: WORLD_WIDTH - 400, y: WORLD_HEIGHT - 400, r: 400 }];
    const walls: Wall[] = [];
    for (let i = 0; i < 90; i++) {
      const clusterX = Math.random() * (WORLD_WIDTH - 800) + 400;
      const clusterY = Math.random() * (WORLD_HEIGHT - 800) + 400;
      if (safetyZones.some(z => getDistance({x: clusterX, y: clusterY}, {x: z.x, y: z.y}) < z.r)) continue;
      const typeRand = Math.random();
      const type = typeRand > 0.9 ? WallType.STONE : 
                   typeRand > 0.8 ? WallType.REBOUND : 
                   typeRand > 0.65 ? WallType.WATER : 
                   typeRand > 0.35 ? WallType.MUD : WallType.GLASS;
      
      const cols = 2 + Math.floor(Math.random() * 3);
      for (let j = 0; j < cols * 2; j++) {
        walls.push({ 
          id: `w-${i}-${j}`, 
          pos: { x: clusterX + (j % cols) * WALL_SIZE, y: clusterY + Math.floor(j/cols) * WALL_SIZE }, 
          size: WALL_SIZE, 
          type, 
          health: (type === WallType.STONE || type === WallType.WATER || type === WallType.REBOUND) ? 999999 : type === WallType.MUD ? 50 : 20 
        });
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
      bullets: [], walls, beds, items: [], width: WORLD_WIDTH, height: WORLD_HEIGHT, isGameOver: false, message: '战斗开始', winner: null, activeMenu: false, currentCommand: CommandType.FREE, enemyCommand: CommandType.FREE, commandCount: Math.max(1, allyCount), mousePos: { x: 0, y: 0 }, controlMode
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
      setGameState(prev => ({ ...prev, activeMenu: !prev.activeMenu }));
    };
    window.addEventListener('tactical-command', handleTacticalCommand);
    window.addEventListener('mobile-input', handleMobileInput);
    window.addEventListener('toggle-menu', handleToggleMenu);
    return () => {
      window.removeEventListener('tactical-command', handleTacticalCommand);
      window.removeEventListener('mobile-input', handleMobileInput);
      window.removeEventListener('toggle-menu', handleToggleMenu);
    };
  }, []);

  const lastOnStateUpdateRef = useRef<number>(0);

  const gameLoop = useCallback(() => {
    const now = Date.now();
    const dt = (now - lastUpdateRef.current) / 1000;
    lastUpdateRef.current = now;

    const prev = stateRef.current;
    if (prev.isGameOver) {
      render();
      requestRef.current = requestAnimationFrame(gameLoop);
      return;
    }

    const next = { ...prev };
    const allTanks = [next.player, ...next.allies, ...next.enemies];

    if (now - lastEnemyStrategyRef.current > 2000) {
        const enemyLeader = next.enemies.find(e => e.isLeader && e.health > 0);
        if (enemyLeader) {
          const healthyEnemies = next.enemies.filter(e => e.health > 0).length;
          const healthyAllies = next.allies.filter(a => a.health > 0).length + (next.player.health > 0 ? 1 : 0);
          const enemyBaseStatus = next.beds.find(b => b.team === Team.ENEMY)!;
          const playerDistToEnemyBase = getDistance(next.player.pos, enemyBaseStatus.pos);
          const isBaseUnderAttack = enemyBaseStatus.captureProgress > 500 || playerDistToEnemyBase < 900;
          
          let counterCommand = CommandType.FREE;
          let counterDialogue = "自主规划作战。";

          if (isBaseUnderAttack) {
            counterCommand = CommandType.DEFEND;
            counterDialogue = "核心受攻击！所有人立即回防，拦截玩家！";
          } else {
            switch (next.currentCommand) {
              case CommandType.ATTACK:
                if (healthyEnemies >= healthyAllies) {
                  counterCommand = CommandType.SURROUND;
                  counterDialogue = "检测到玩家发起冲锋，执行环形包围反击！";
                } else {
                  counterCommand = CommandType.DEFEND;
                  counterDialogue = "敌方火力过猛，全体进入防御姿态，稳住阵线！";
                }
                break;
              case CommandType.CAPTURE:
                counterCommand = CommandType.ATTACK;
                counterDialogue = "他们想偷据点？全军突击，打断他们的占领进度！";
                break;
              case CommandType.DEFEND:
                counterCommand = CommandType.CAPTURE;
                counterDialogue = "敌方采取守势，分兵占领地图核心，扩大优势！";
                break;
              case CommandType.SURROUND:
                counterCommand = CommandType.ATTACK;
                counterDialogue = "试图合围？集中火力，重点突破对方旗舰！";
                break;
              case CommandType.RECON:
                counterCommand = CommandType.FREE_PLANNING;
                counterDialogue = "敌方在侦查，分散兵力，自主搜寻接敌。";
                break;
              default:
                if (next.player.health < 40) {
                  counterCommand = CommandType.SURROUND;
                  counterDialogue = "对方旗舰结构严重受损，执行合围斩首行动！";
                } else {
                  counterCommand = CommandType.FREE;
                  counterDialogue = "战场态势平衡，维持自主作战序列。";
                }
            }
          }

          next.enemyCommand = counterCommand;
          enemyLeader.lastDialogue = counterDialogue;
        }
        lastEnemyStrategyRef.current = now;
      }

      // 刷新物资逻辑
      if (now - lastHPSpawnRef.current > 3000 && next.items.length < MAX_ITEMS) {
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
        
        let limitSpeed = isIdle ? 0 : t.speed * speedMult;
        if (inWater) limitSpeed *= WATER_SLOW_FACTOR;
        const accelRate = inWater ? 1.0 : 3.0;
        const frictionRate = inWater ? 2.0 : 5.0;
        if (isIdle) t.currentSpeed = Math.max(0, currentSpeed - frictionRate * dt * 5);
        else {
          const diff = limitSpeed - currentSpeed;
          t.currentSpeed = currentSpeed + diff * Math.min(1, (diff > 0 ? accelRate : frictionRate) * dt);
        }
        t.rotation = lerpAngle(t.rotation, targetAngle, isIdle ? 0.04 : 0.25);
        if (t.currentSpeed > 0.05) {
          const vx = Math.cos(t.rotation) * t.currentSpeed;
          const vy = Math.sin(t.rotation) * t.currentSpeed;
          const nextPos = { x: t.pos.x + vx, y: t.pos.y + vy };
          
          const isBlocked = (p: Vector2D) => {
            const wallHit = next.walls.some(w => w.type !== WallType.WATER && checkCollision({ ...t, pos: p }, w));
            const tankHit = allTanks.some(other => other.id !== t.id && other.health > 0 && checkCollision({ ...t, pos: p }, other));
            return wallHit || tankHit || isOutOfBounds(p, TANK_SIZE);
          };

          if (!isBlocked(nextPos)) {
            t.pos = nextPos; return true;
          } else {
            t.currentSpeed *= 0.1; 
          }
        }
        return false;
      };

      // 坦克自动回血和 Buff 维护 (包含医疗包的额外回血)
      allTanks.forEach(t => {
        if (t.health > 0 && t.health < t.maxHealth) {
          const regenAmount = (!t.lastRegenTime || now - t.lastRegenTime > AUTO_REGEN_INTERVAL) ? AUTO_REGEN_AMOUNT : 0;
          
          // 如果有医疗包Buff，额外每秒回血
          let extraRegen = 0;
          if (t.buffs?.healTimer && t.buffs.healTimer > now) {
             extraRegen = ITEM_BUFF_VALUES.HEAL_REGEN_SEC * dt;
          }
 
          if (regenAmount > 0 || extraRegen > 0) {
            t.health = Math.min(t.maxHealth, t.health + regenAmount + extraRegen);
            if (regenAmount > 0) t.lastRegenTime = now;
          }
        }
      });

      if (next.player.health > 0) {
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
            next.player.turretRotation = lerpAngle(next.player.turretRotation, getAngle(next.player.pos, next.mousePos), 0.3);
          }
        } else {
          pdx = mobileInput.current.dx; pdy = mobileInput.current.dy;
          if (pdx !== 0 || pdy !== 0) next.player.turretRotation = lerpAngle(next.player.turretRotation, Math.atan2(pdy, pdx), 0.15);
        }
        moveTank(next.player, pdx, pdy);
        if ((isMouseDown.current || mobileInput.current.isFiring) && now - next.player.lastShot > SHOOT_COOLDOWN) {
          next.bullets.push({ id: `bp-${now}`, ownerId: 'player', team: Team.ALLY, pos: { ...next.player.pos }, rotation: next.player.turretRotation, speed: BULLET_SPEED, size: BULLET_SIZE, damage: BULLET_DAMAGE });
          next.player.lastShot = now;
        }
      }

      const runAI = (t: Tank, idx: number) => {
        if (t.health <= 0) return;
        const isAlly = isSameSide(t.team, Team.ALLY);
        const foes = (isAlly ? next.enemies : [next.player, ...next.allies]).filter(e => e.health > 0);
        const myBase = isAlly ? next.beds[0] : next.beds[1];
        const enemyBase = isAlly ? next.beds[1] : next.beds[0];
        const activeCmd = isAlly ? next.currentCommand : next.enemyCommand;
        const isCommanded = isAlly ? (idx < next.commandCount) : true;
        
        let state = t.aiState || AIState.ATTACK_CORE;
        let targetPoint = enemyBase.pos;

        if (t.health < 50 && next.items.some(i => i.type === ItemType.HEAL)) {
          state = AIState.SEEK_HEALTH;
          const healItems = next.items.filter(i => i.type === ItemType.HEAL);
          const scoredHPs = healItems.map(hp => {
            const dist = getDistance(t.pos, hp.pos);
            const threatLevel = foes.reduce((acc, f) => {
              const dToHP = getDistance(f.pos, hp.pos);
              return acc + (dToHP < 800 ? (800 - dToHP) : 0);
            }, 0);
            return { hp, cost: dist + threatLevel };
          });
          const bestHP = scoredHPs.sort((a,b) => a.cost - b.cost)[0].hp;
          targetPoint = bestHP.pos;
          t.currentTargetId = bestHP.id;
        } 
        else if (isCommanded && activeCmd === CommandType.RECON) {
          state = AIState.RECON;
          if (!t.reconTarget || getDistance(t.pos, t.reconTarget) < 200) {
            t.reconTarget = { x: Math.random() * WORLD_WIDTH, y: Math.random() * WORLD_HEIGHT };
          }
          targetPoint = t.reconTarget;
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
          state = AIState.DEFEND_CORE; targetPoint = myBase.pos;
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
        const sampleDegs = [0, 15, -15, 30, -30, 45, -45, 60, -60, 90, -90, 135, -135, 180];
        let bx = 0, by = 0, totalW = 0;
        
        // 判定停滞：如果位置几乎没动，累加 stuckTimer
        if (t.lastPos && getDistance(t.pos, t.lastPos) < 0.2) { 
          t.stuckTimer = (t.stuckTimer || 0) + 1; 
        } else { 
          t.stuckTimer = 0; 
        }
        t.lastPos = { ...t.pos };

        // 如果触发倒车计时
        if (t.reverseTimer && t.reverseTimer > 0) {
          t.reverseTimer--;
          moveTank(t, -1, -1, dirAngle); // 往反方向倒车
          return;
        }

        // 如果停滞过久，启动倒车
        if (t.stuckTimer > 40) {
          t.reverseTimer = 30; // 倒车 30 帧
          t.stuckTimer = 0;
          return;
        }

        sampleDegs.forEach(d => {
           const sA = dirAngle + (d * Math.PI / 180);
           const dists = [TANK_SIZE * 1.5, TANK_SIZE * 3, TANK_SIZE * 5]; // 多重探测距离
           let weight = Math.pow(Math.cos(d * Math.PI / 180 * 0.6), 2) * 100;
           
           for (const dist of dists) {
             const lookPos = { x: t.pos.x + Math.cos(sA) * dist, y: t.pos.y + Math.sin(sA) * dist };
             const wallHit = next.walls.find(w => w.type !== WallType.WATER && checkCollision({pos: lookPos, size: TANK_SIZE * 0.8, id: ''}, w));
             
             if (wallHit || isOutOfBounds(lookPos, TANK_SIZE * 0.5)) {
               weight -= (dist === dists[0] ? 20000 : dist === dists[1] ? 5000 : 1000);
             }
             
             // 狭窄路段探测：如果正前方较近处有墙，尝试探测极小角度的偏移
             if (d === 0 && wallHit && dist === dists[0]) {
               const gapOffsets = [35, -35]; 
               gapOffsets.forEach(go => {
                 const gapA = sA + (go * Math.PI / 180);
                 const gapP = { x: t.pos.x + Math.cos(gapA) * TANK_SIZE * 1.2, y: t.pos.y + Math.sin(gapA) * TANK_SIZE * 1.2 };
                 const isGapClear = !next.walls.some(w => w.type !== WallType.WATER && checkCollision({pos: gapP, size: TANK_SIZE * 0.4, id: ''}, w));
                 if (isGapClear) weight += 5000;
               });
             }
             
             bx += Math.cos(sA) * weight; 
             by += Math.sin(sA) * weight; 
             totalW += weight; 
           }
        });

        if (totalW < 1) { 
          // 彻底没路走时，尝试随机微调旋转
          moveTank(t, 1, 1, t.rotation + (idx % 2 === 0 ? 0.1 : -0.1)); 
        } else { 
          moveTank(t, 1, 1, Math.atan2(by, bx)); 
        }

        const combatTargets = foes.filter(f => getDistance(t.pos, f.pos) < 1100);
        if (combatTargets.length > 0) {
          const targetFoe = combatTargets[0];
          t.turretRotation = lerpAngle(t.turretRotation, getAngle(t.pos, targetFoe.pos), 0.25);
          if (now - t.lastShot > SHOOT_COOLDOWN * 3.5) {
            next.bullets.push({ id: `ba-${t.id}-${now}`, ownerId: t.id, team: t.team, pos: { ...t.pos }, rotation: t.turretRotation, speed: BULLET_SPEED, size: BULLET_SIZE, damage: BULLET_DAMAGE });
            t.lastShot = now;
          }
        } else { t.turretRotation = lerpAngle(t.turretRotation, t.rotation, 0.1); }
      };

      next.allies.forEach((a, i) => runAI(a, i));
      next.enemies.forEach((e, i) => runAI(e, i));

      // 拾取物资逻辑
      next.items = next.items.filter(item => {
        const collectingTank = allTanks.find(t => t.health > 0 && checkCollision(t, item));
        if (collectingTank) {
          if (!collectingTank.buffs) collectingTank.buffs = {};
          
          switch (item.type) {
            case ItemType.HEAL:
              collectingTank.health = Math.min(collectingTank.maxHealth, collectingTank.health + HEALTH_PACK_HEAL);
              collectingTank.buffs.healTimer = now + 5000; // 5秒持续回血
              break;
            case ItemType.SPEED:
              collectingTank.buffs.speedTimer = now + BUFF_DURATION;
              break;
            case ItemType.DEFENSE:
              collectingTank.buffs.defenseTimer = now + BUFF_DURATION;
              break;
            case ItemType.DAMAGE:
              collectingTank.buffs.damageTimer = now + BUFF_DURATION;
              break;
          }
          return false;
        }
        return true;
      });

      next.bullets = next.bullets.filter(b => {
        b.pos.x += Math.cos(b.rotation) * b.speed; b.pos.y += Math.sin(b.rotation) * b.speed;
        if (isOutOfBounds(b.pos, BULLET_SIZE)) return false;
        
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
            if (w.type !== WallType.STONE) w.health -= b.damage; 
            return false; 
          }
        }

        for (const t of allTanks) {
          if (t.health > 0 && t.id !== b.ownerId && !isSameSide(t.team, b.team) && checkCollision(b, t)) {
            // 计算伤害 Buff 和 抗性 Buff
            const owner = allTanks.find(at => at.id === b.ownerId);
            let finalDamage = b.damage;
            
            // 攻击者有伤害 Buff
            if (owner?.buffs?.damageTimer && owner.buffs.damageTimer > now) {
              finalDamage *= ITEM_BUFF_VALUES.DAMAGE_BOOST;
            }
            
            // 防御者有抗性 Buff
            if (t.buffs?.defenseTimer && t.buffs.defenseTimer > now) {
              finalDamage *= ITEM_BUFF_VALUES.DEFENSE_REDUCTION;
            }

            t.health -= finalDamage;
            if (t.health <= 0) { const killer = allTanks.find(at => at.id === b.ownerId); if (killer) { killer.kills += 1; killer.score += 100; } }
            return false;
          }
        }
        return true;
      });

      next.walls = next.walls.filter(w => w.health > 0);
      next.beds.forEach(bed => {
        const defenders = allTanks.some(t => t.health > 0 && isSameSide(t.team, bed.team) && getDistance(t.pos, bed.pos) < bed.size / 2);
        if (defenders) bed.captureProgress = Math.max(0, bed.captureProgress - dt * 2500);
        else {
          const attackers = allTanks.filter(t => t.health > 0 && !isSameSide(t.team, bed.team) && getDistance(t.pos, bed.pos) < CAPTURE_RADIUS);
          if (attackers.length > 0) {
            bed.captureProgress += dt * 1000;
            bed.capturingTeam = isSameSide(attackers[0].team, Team.ALLY) ? Team.ALLY : Team.ENEMY;
            if (bed.captureProgress >= CAPTURE_TIME_REQUIRED) { next.isGameOver = true; next.winner = bed.capturingTeam; }
          } else { bed.captureProgress = Math.max(0, bed.captureProgress - dt * 3500); }
        }
      });
      const handleRespawn = (t: Tank) => { if (t.health <= 0) { if (t.respawnTimer === 0) t.respawnTimer = RESPAWN_DELAY; else { t.respawnTimer -= dt * 1000; if (t.respawnTimer <= 0) { t.health = MAX_HEALTH_TANK; t.pos = { ...t.spawnPos }; t.respawnTimer = 0; } } } };
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
      keys.current.add(key);
    };
    const ku = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase());
    const mm = (e: MouseEvent) => { mousePosRef.current = { x: e.clientX, y: e.clientY }; };
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
    const vw = window.innerWidth, vh = window.innerHeight;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, vw, vh);
    ctx.save(); ctx.translate(-player.pos.x + vw/2, -player.pos.y + vh/2);
    ctx.fillStyle = COLORS.GROUND; ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
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
      ctx.fillStyle = '#fff'; ctx.font = 'bold 16px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(t.nickname || '', 0, -85);
      ctx.fillStyle = '#000'; ctx.fillRect(-35, -75, 70, 10); ctx.fillStyle = t.health > 40 ? '#22c55e' : '#ef4444'; ctx.fillRect(-35, -75, 70 * (t.health/100), 10);
      ctx.restore();
    };
    allies.forEach(drawTank); enemies.forEach(drawTank); drawTank(player);
    walls.forEach(w => { 
      ctx.globalAlpha = w.type === WallType.GLASS ? 0.4 : 1; 
      ctx.fillStyle = w.type === WallType.MUD ? COLORS.MUD : 
                      w.type === WallType.STONE ? COLORS.STONE : 
                      w.type === WallType.WATER ? COLORS.WATER : 
                      w.type === WallType.REBOUND ? COLORS.REBOUND : COLORS.GLASS; 
      ctx.fillRect(w.pos.x - w.size/2, w.pos.y - w.size/2, w.size, w.size); 
      ctx.globalAlpha = 1; 
    });
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
