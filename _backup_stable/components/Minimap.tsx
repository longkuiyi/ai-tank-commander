
import React, { useRef, useEffect } from 'react';
import { GameState, Team, WallType } from '../types';
import { WORLD_WIDTH, WORLD_HEIGHT, MINIMAP_SCALE, COLORS, INFLUENCE_GRID_SIZE, ITEM_COLORS } from '../constants';

interface Props {
  state: GameState;
}

const Minimap: React.FC<Props> = ({ state }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 绘制墙体
    state.walls.forEach(w => {
      ctx.fillStyle = w.type === WallType.STONE ? '#555' : 
                      w.type === WallType.WATER ? COLORS.WATER : 
                      w.type === WallType.REBOUND ? COLORS.REBOUND : '#333';
      ctx.fillRect(w.pos.x * MINIMAP_SCALE, w.pos.y * MINIMAP_SCALE, 2, 2);
    });

    // 绘制物资 (微小点)
    state.items.forEach(item => {
      ctx.fillStyle = (ITEM_COLORS as any)[item.type] || '#fff';
      ctx.beginPath();
      ctx.arc(item.pos.x * MINIMAP_SCALE, item.pos.y * MINIMAP_SCALE, 2, 0, Math.PI * 2);
      ctx.fill();
    });

    // 绘制据点
    state.beds.forEach(b => {
      ctx.fillStyle = b.team === Team.ALLY ? COLORS.ALLY : COLORS.ENEMY;
      ctx.fillRect(b.pos.x * MINIMAP_SCALE - 4, b.pos.y * MINIMAP_SCALE - 4, 8, 8);
    });

    const drawDot = (pos: {x: number, y: number}, color: string, size = 3) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(pos.x * MINIMAP_SCALE, pos.y * MINIMAP_SCALE, size, 0, Math.PI * 2);
      ctx.fill();
    };

    if (state.player.health > 0) drawDot(state.player.pos, COLORS.PLAYER, 4);
    state.allies.forEach(a => a.health > 0 && drawDot(a.pos, COLORS.ALLY));
    state.enemies.forEach(e => e.health > 0 && drawDot(e.pos, COLORS.ENEMY));

  }, [state]);

  return (
    <div className="fixed top-6 right-6 border-2 border-white/20 rounded-lg overflow-hidden shadow-2xl bg-black/80 backdrop-blur-sm pointer-events-none z-50">
      <div className="absolute top-0 left-0 p-1 bg-black/60 text-[8px] font-bold text-white/50 uppercase">雷达扫描 / 补给品标识</div>
      <canvas 
        ref={canvasRef} 
        width={WORLD_WIDTH * MINIMAP_SCALE} 
        height={WORLD_HEIGHT * MINIMAP_SCALE} 
      />
    </div>
  );
};

export default Minimap;
