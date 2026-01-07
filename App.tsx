
import React, { useState, useCallback, useEffect } from 'react';
import GameCanvas from './components/GameCanvas';
import HUD from './components/HUD';
import Minimap from './components/Minimap';
import { GameState, ControlMode } from './types';
import { MAP_SIZES } from './constants';

const App: React.FC = () => {
  const [gameId, setGameId] = useState(0);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [config, setConfig] = useState({
    nickname: '指挥官',
    allies: 4,
    enemies: 5,
    isStarted: false,
    controlMode: ControlMode.DESKTOP,
    mapSize: MAP_SIZES.MEDIUM,
    isMemoryEnabled: true
  });

  // 自动检测设备
  useEffect(() => {
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    if (isMobile) {
      setConfig(prev => ({ ...prev, controlMode: ControlMode.MOBILE }));
    }
  }, []);

  const handleStart = () => {
    setConfig(prev => ({ ...prev, isStarted: true }));
    setGameState(null);
    setGameId(prev => prev + 1);
  };

  const handleRestart = useCallback(() => {
    setConfig(prev => ({ ...prev, isStarted: false }));
    setGameState(null);
  }, []);

  if (!config.isStarted) {
    return (
      <div className="fixed inset-0 bg-[#0a0a0a] flex items-center justify-center p-4 font-sans overflow-y-auto">
        <div className="bg-slate-900 border border-white/10 p-8 md:p-12 rounded-[2rem] md:rounded-[3rem] w-full max-w-xl shadow-2xl backdrop-blur-xl my-auto">
          <div className="text-center mb-8">
            <h1 className="text-3xl md:text-4xl font-black text-white tracking-tighter uppercase mb-2 italic">AI 坦克指挥官</h1>
            <p className="text-blue-400/60 text-[10px] font-black tracking-[0.5em] uppercase">Tactical Arena System v3.1</p>
          </div>

          <div className="space-y-6">
            <div>
              <label className="block text-[11px] font-black text-white/40 uppercase mb-2 tracking-widest">战术呼号 (Nickname)</label>
              <input 
                type="text" 
                value={config.nickname}
                onChange={(e) => setConfig(prev => ({ ...prev, nickname: e.target.value.slice(0, 10) }))}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500 transition-colors font-bold text-base"
              />
            </div>

            <div>
              <label className="block text-[11px] font-black text-white/40 uppercase mb-3 tracking-widest">操控终端选择</label>
              <div className="grid grid-cols-2 gap-3">
                <button 
                  onClick={() => setConfig(prev => ({ ...prev, controlMode: ControlMode.DESKTOP }))}
                  className={`py-3 rounded-xl border font-black text-xs uppercase tracking-widest transition-all ${config.controlMode === ControlMode.DESKTOP ? 'bg-blue-600 border-blue-400 text-white shadow-lg shadow-blue-600/30' : 'bg-white/5 border-white/10 text-white/40'}`}
                >
                  电脑端 (WASD)
                </button>
                <button 
                  onClick={() => setConfig(prev => ({ ...prev, controlMode: ControlMode.MOBILE }))}
                  className={`py-3 rounded-xl border font-black text-xs uppercase tracking-widest transition-all ${config.controlMode === ControlMode.MOBILE ? 'bg-blue-600 border-blue-400 text-white shadow-lg shadow-blue-600/30' : 'bg-white/5 border-white/10 text-white/40'}`}
                >
                  移动端 (摇杆)
                </button>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-black text-white/40 uppercase mb-2 tracking-widest">战场规模 (Map Size): {config.mapSize / 1000}K</label>
              <div className="flex items-center gap-4">
                <input 
                  type="range" min="2000" max="10000" step="500"
                  value={config.mapSize}
                  onChange={(e) => setConfig(prev => ({ ...prev, mapSize: parseInt(e.target.value) }))}
                  className="flex-1 accent-blue-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className="block text-[11px] font-black text-white/40 uppercase mb-2 tracking-widest">我方队友: {config.allies}</label>
                <input 
                  type="range" min="0" max="10" 
                  value={config.allies}
                  onChange={(e) => setConfig(prev => ({ ...prev, allies: parseInt(e.target.value) }))}
                  className="w-full accent-emerald-500"
                />
              </div>
              <div>
                <label className="block text-[11px] font-black text-white/40 uppercase mb-2 tracking-widest">敌方单位: {config.enemies}</label>
                <input 
                  type="range" min="0" max="10" 
                  value={config.enemies}
                  onChange={(e) => setConfig(prev => ({ ...prev, enemies: parseInt(e.target.value) }))}
                  className="w-full accent-red-500"
                />
              </div>
            </div>

            <button 
              onClick={handleStart}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-black text-lg py-5 rounded-2xl shadow-xl shadow-blue-600/20 transition-all active:scale-[0.98]"
            >
              部署作战系统
            </button>

            {/* 游戏规则与物资说明 */}
            <div className="mt-8 pt-6 border-t border-white/10">
              <h3 className="text-[11px] font-black text-white/40 uppercase mb-4 tracking-widest text-center">战场物资情报 (Supply Intel)</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center gap-3 bg-white/5 p-3 rounded-xl border border-white/5">
                  <div className="w-8 h-8 rounded-full bg-red-500 flex items-center justify-center border-2 border-white shadow-[0_0_10px_rgba(239,68,68,0.5)]">
                    <span className="text-white font-bold text-sm">+</span>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-white">医疗包 (Heal)</p>
                    <p className="text-[9px] text-white/40">修复装甲，并持续恢复生命</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 bg-white/5 p-3 rounded-xl border border-white/5">
                  <div className="w-8 h-8 rounded-full bg-amber-400 flex items-center justify-center border-2 border-white shadow-[0_0_10px_rgba(251,191,36,0.5)]">
                    <span className="text-white font-bold text-sm">S</span>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-white">动力核心 (Speed)</p>
                    <p className="text-[9px] text-white/40">1.8倍移动速度加成</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 bg-white/5 p-3 rounded-xl border border-white/5">
                  <div className="w-8 h-8 rounded-full bg-purple-500 flex items-center justify-center border-2 border-white shadow-[0_0_10px_rgba(168,85,247,0.5)]">
                    <span className="text-white font-bold text-sm">D</span>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-white">强化装甲 (Defense)</p>
                    <p className="text-[9px] text-white/40">获得 70% 伤害减免</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 bg-white/5 p-3 rounded-xl border border-white/5">
                  <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center border-2 border-white shadow-[0_0_10px_rgba(16,185,129,0.5)]">
                    <span className="text-white font-bold text-sm">A</span>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-white">超导弹头 (Damage)</p>
                    <p className="text-[9px] text-white/40">主炮伤害提升 70%</p>
                  </div>
                </div>
              </div>
              <p className="mt-4 text-[9px] text-white/30 text-center italic">
                * 物资效果持续 10 秒，所有坦克均可拾取
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-screen h-screen bg-[#0a0a0a] overflow-hidden select-none">
      <GameCanvas 
        key={gameId} 
        allyCount={config.allies} 
        enemyCount={config.enemies} 
        nickname={config.nickname}
        controlMode={config.controlMode}
        worldWidth={config.mapSize}
        worldHeight={config.mapSize}
        onStateUpdate={setGameState} 
      />
      
      {gameState && (
        <>
          <HUD state={gameState} onRestart={handleRestart} />
          <Minimap state={gameState} />
        </>
      )}

      {!gameState && (
        <div className="fixed inset-0 bg-[#0a0a0a] flex flex-col items-center justify-center text-white p-6">
          <div className="relative w-16 h-16 mb-6">
            <div className="absolute inset-0 border-4 border-blue-500/20 rounded-full" />
            <div className="absolute inset-0 border-4 border-t-blue-500 rounded-full animate-spin" />
          </div>
          <h1 className="text-xl font-black tracking-widest uppercase mb-2">系统连接中</h1>
          <p className="text-gray-500 text-xs animate-pulse tracking-[0.3em]">正在校准神经网络同步率...</p>
        </div>
      )}
    </div>
  );
};

export default App;
