
import React, { useRef, useEffect, useState } from 'react';
import { GameState, Team, WallType } from '../types';
import { WORLD_WIDTH, WORLD_HEIGHT, MINIMAP_SCALE, COLORS, INFLUENCE_GRID_SIZE, ITEM_COLORS } from '../constants';
import { t } from '../utils/i18n';

interface Props {
  state: GameState;
}

const Minimap: React.FC<Props> = ({ state }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Dynamically calculate scale ratio to keep minimap at a fixed size (approx 180px)
  const minimapScale = 180 / Math.max(state.width, state.height);

  useEffect(() => {
    if (state.isGameOver || isCollapsed) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw walls
    state.walls.forEach(w => {
      ctx.fillStyle = w.type === WallType.STONE ? '#555' : 
                      w.type === WallType.IRON ? '#333' :
                      w.type === WallType.BULLETPROOF ? '#06b6d4' :
                      w.type === WallType.WATER ? COLORS.WATER : 
                      w.type === WallType.REBOUND ? COLORS.REBOUND : '#333';
      ctx.fillRect(w.pos.x * minimapScale, w.pos.y * minimapScale, 2, 2);
    });

    // Draw items (mini dots)
    state.items.forEach(item => {
      ctx.fillStyle = (ITEM_COLORS as any)[item.type] || '#fff';
      ctx.beginPath();
      ctx.arc(item.pos.x * minimapScale, item.pos.y * minimapScale, 2, 0, Math.PI * 2);
      ctx.fill();
    });

    // Draw base (bed)
    state.beds.forEach(b => {
      const color = b.team === Team.ALLY ? COLORS.ALLY : COLORS.ENEMY;
      const bx = b.pos.x * minimapScale;
      const by = b.pos.y * minimapScale;
      
      // Base background glow
      const grad = ctx.createRadialGradient(bx, by, 0, bx, by, 8);
      grad.addColorStop(0, color);
      grad.addColorStop(1, 'transparent');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(bx, by, 8, 0, Math.PI * 2);
      ctx.fill();

      // Base icon (diamond)
      ctx.fillStyle = color;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(bx, by - 5);
      ctx.lineTo(bx + 5, by);
      ctx.lineTo(bx, by + 5);
      ctx.lineTo(bx - 5, by);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    });

    const drawDot = (pos: {x: number, y: number}, color: string, size = 3) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(pos.x * minimapScale, pos.y * minimapScale, size, 0, Math.PI * 2);
      ctx.fill();
    };

    if (state.player.health > 0) drawDot(state.player.pos, COLORS.PLAYER, 4);
    state.allies.forEach(a => a.health > 0 && drawDot(a.pos, COLORS.ALLY));
    state.enemies.forEach(e => e.health > 0 && drawDot(e.pos, COLORS.ENEMY));

  }, [state, isCollapsed, minimapScale]);

  if (state.isGameOver || state.activeMenu) return null;

  return (
    <div 
      className={`fixed top-6 right-6 border-2 border-white/20 rounded-lg overflow-hidden shadow-2xl bg-black/80 backdrop-blur-sm z-[100] transition-all duration-300 pointer-events-none ${
        isCollapsed ? 'w-10 h-10' : ''
      }`}
    >
      <button 
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="absolute top-0 right-0 z-20 w-8 h-8 flex items-center justify-center bg-black/40 hover:bg-black/60 text-white transition-colors pointer-events-auto rounded-bl-lg"
        title={isCollapsed ? t('minimap.expand') : t('minimap.collapse')}
      >
        <span className="text-sm">{isCollapsed ? '🗺️' : '−'}</span>
      </button>

      <div className={`transition-opacity duration-300 ${isCollapsed ? 'opacity-0' : 'opacity-100'}`}>
        <div className="absolute top-0 left-0 p-1 bg-black/60 text-[8px] font-bold text-white/50 uppercase">
          {t('minimap.title')}
        </div>
        <canvas 
          ref={canvasRef} 
          width={state.width * minimapScale} 
          height={state.height * minimapScale} 
          className="block"
        />
      </div>

      {isCollapsed && (
        <div 
          onClick={() => setIsCollapsed(false)}
          className="w-full h-full flex items-center justify-center cursor-pointer hover:bg-white/5 transition-colors pointer-events-auto"
        >
          <span className="text-lg">🗺️</span>
        </div>
      )}
    </div>
  );
};

export default Minimap;
