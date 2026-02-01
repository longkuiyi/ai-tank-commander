
import React, { useState, useCallback, useEffect } from 'react';
import GameCanvas from './components/GameCanvas';
import HUD from './components/HUD';
import Minimap from './components/Minimap';
import { GameState, ControlMode, GameMode } from './types';
import { MAP_SIZES } from './constants';
import { getLanguage, setLanguage, t } from './utils/i18n';

const App: React.FC = () => {
  const [gameId, setGameId] = useState(0);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [config, setConfig] = useState({
    nickname: t('home.nickname'),
    allies: 4,
    enemies: 5,
    isStarted: false,
    controlMode: ControlMode.DESKTOP,
    gameMode: GameMode.NORMAL,
    mapSize: MAP_SIZES.MEDIUM,
    isMemoryEnabled: true
  });

  // Language switching (entry point in system settings on home page)
  const [, setLangTick] = useState(0);
  useEffect(() => {
    const onLangChange = () => setLangTick(v => v + 1);
    window.addEventListener('languageChange', onLangChange);
    document.documentElement.lang = getLanguage();
    return () => window.removeEventListener('languageChange', onLangChange);
  }, []);

  // Auto-detect device
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
            <h1 className="text-3xl md:text-4xl font-black text-white tracking-tighter uppercase mb-2 italic">{t('home.title')}</h1>
            <p className="text-blue-400/60 text-[10px] font-black tracking-[0.5em] uppercase">{t('home.subtitle')}</p>
          </div>

          <div className="space-y-6">
            <div>
              <label className="block text-[11px] font-black text-white/40 uppercase mb-2 tracking-widest">{t('home.nickname')}</label>
              <input 
                type="text" 
                value={config.nickname}
                onChange={(e) => setConfig(prev => ({ ...prev, nickname: e.target.value.slice(0, 10) }))}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500 transition-colors font-bold text-base"
              />
            </div>

            <div>
              <label className="block text-[11px] font-black text-white/40 uppercase mb-3 tracking-widest">{t('home.controlMode')}</label>
              <div className="grid grid-cols-2 gap-3">
                <button 
                  onClick={() => setConfig(prev => ({ ...prev, controlMode: ControlMode.DESKTOP }))}
                  className={`py-3 rounded-xl border font-black text-xs uppercase tracking-widest transition-all ${config.controlMode === ControlMode.DESKTOP ? 'bg-blue-600 border-blue-400 text-white shadow-lg shadow-blue-600/30' : 'bg-white/5 border-white/10 text-white/40'}`}
                >
                  {t('home.control.desktop')}
                </button>
                <button 
                  onClick={() => setConfig(prev => ({ ...prev, controlMode: ControlMode.MOBILE }))}
                  className={`py-3 rounded-xl border font-black text-xs uppercase tracking-widest transition-all ${config.controlMode === ControlMode.MOBILE ? 'bg-blue-600 border-blue-400 text-white shadow-lg shadow-blue-600/30' : 'bg-white/5 border-white/10 text-white/40'}`}
                >
                  {t('home.control.mobile')}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-black text-white/40 uppercase mb-3 tracking-widest">{t('home.gameMode')}</label>
              <div className="grid grid-cols-1 gap-3">
                <button 
                  className="py-3 rounded-xl border font-black text-xs uppercase tracking-widest transition-all bg-blue-600 border-blue-400 text-white shadow-lg shadow-blue-600/30 cursor-default"
                >
                  {t('home.gameMode.classic')}
                </button>
              </div>
            </div>

            <>
              <div>
                <label className="block text-[11px] font-black text-white/40 uppercase mb-2 tracking-widest">{t('home.mapSize')}: {config.mapSize / 1000}K</label>
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
                  <label className="block text-[11px] font-black text-white/40 uppercase mb-2 tracking-widest">{t('home.allies')}: {config.allies}</label>
                  <input 
                    type="range" min="0" max="10" 
                    value={config.allies}
                    onChange={(e) => setConfig(prev => ({ ...prev, allies: parseInt(e.target.value) }))}
                    className="w-full accent-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-black text-white/40 uppercase mb-2 tracking-widest">{t('home.enemies')}: {config.enemies}</label>
                  <input 
                    type="range" min="0" max="10" 
                    value={config.enemies}
                    onChange={(e) => setConfig(prev => ({ ...prev, enemies: parseInt(e.target.value) }))}
                    className="w-full accent-red-500"
                  />
                </div>
              </div>
            </>

            <div className="mt-2 pt-6 border-t border-white/10">
              <h3 className="text-[11px] font-black text-white/40 uppercase mb-3 tracking-widest text-center">{t('home.systemSettings')}</h3>
              <div className="flex items-center justify-between gap-4 bg-white/5 border border-white/10 rounded-xl px-4 py-3">
                <span className="text-xs font-bold text-white/70">{t('home.language')}</span>
                <select
                  value={getLanguage()}
                  onChange={(e) => setLanguage(e.target.value as any)}
                  className="bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs font-black text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="zh-CN">{t('home.language.zh')}</option>
                  <option value="en-US">{t('home.language.en')}</option>
                  <option value="ja-JP">{t('home.language.ja')}</option>
                  <option value="ko-KR">{t('home.language.ko')}</option>
                  <option value="fr-FR">{t('home.language.fr')}</option>
                  <option value="de-DE">{t('home.language.de')}</option>
                  <option value="es-ES">{t('home.language.es')}</option>
                  <option value="pt-PT">{t('home.language.pt')}</option>
                  <option value="ru-RU">{t('home.language.ru')}</option>
                  <option value="it-IT">{t('home.language.it')}</option>
                </select>
              </div>
            </div>

            <button 
              onClick={handleStart}
              className="w-full bg-blue-600 hover:bg-blue-500 text-white font-black text-lg py-5 rounded-2xl shadow-xl shadow-blue-600/20 transition-all active:scale-[0.98]"
            >
              {t('home.start')}
            </button>

            {/* Game rules and supplies description */}
            <div className="mt-8 pt-6 border-t border-white/10">
              <h3 className="text-[11px] font-black text-white/40 uppercase mb-4 tracking-widest text-center">{t('home.supplyIntel')}</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-center gap-3 bg-white/5 p-3 rounded-xl border border-white/5">
                  <div className="w-8 h-8 rounded-full bg-red-500 flex items-center justify-center border-2 border-white shadow-[0_0_10px_rgba(239,68,68,0.5)]">
                    <span className="text-white font-bold text-sm">+</span>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-white">{t('item.heal.name')}</p>
                    <p className="text-[9px] text-white/40">{t('item.heal.desc')}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 bg-white/5 p-3 rounded-xl border border-white/5">
                  <div className="w-8 h-8 rounded-full bg-amber-400 flex items-center justify-center border-2 border-white shadow-[0_0_10px_rgba(251,191,36,0.5)]">
                    <span className="text-white font-bold text-sm">S</span>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-white">{t('item.speed.name')}</p>
                    <p className="text-[9px] text-white/40">{t('item.speed.desc')}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 bg-white/5 p-3 rounded-xl border border-white/5">
                  <div className="w-8 h-8 rounded-full bg-purple-500 flex items-center justify-center border-2 border-white shadow-[0_0_10px_rgba(168,85,247,0.5)]">
                    <span className="text-white font-bold text-sm">D</span>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-white">{t('item.defense.name')}</p>
                    <p className="text-[9px] text-white/40">{t('item.defense.desc')}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 bg-white/5 p-3 rounded-xl border border-white/5">
                  <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center border-2 border-white shadow-[0_0_10px_rgba(16,185,129,0.5)]">
                    <span className="text-white font-bold text-sm">A</span>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-white">{t('item.damage.name')}</p>
                    <p className="text-[9px] text-white/40">{t('item.damage.desc')}</p>
                  </div>
                </div>
              </div>
              <p className="mt-4 text-[9px] text-white/30 text-center italic">
                {t('home.supplyNote')}
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
        gameMode={config.gameMode}
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
          <h1 className="text-xl font-black tracking-widest uppercase mb-2">{t('loading.title')}</h1>
          <p className="text-gray-500 text-xs animate-pulse tracking-[0.3em]">{t('loading.subtitle')}</p>
        </div>
      )}
    </div>
  );
};

export default App;
