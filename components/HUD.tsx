
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GameState, Team, CommandType, ControlMode } from '../types';
import { SHOP_UPGRADES } from '../constants';
import { t } from '../utils/i18n';

interface Props {
  state: GameState;
  onRestart: () => void;
}

const HUD: React.FC<Props> = ({ state, onRestart }) => {
  const [isCommCollapsed, setIsCommCollapsed] = useState(false);
  const activeTab = state.activeTab || 'COMMANDS';
  const setActiveTab = (tab: 'COMMANDS' | 'SCOREBOARD' | 'SETTINGS' | 'SHOP') => {
    window.dispatchEvent(new CustomEvent('change-tab', { detail: tab }));
  };

  // 用于菜单面板切换动画（不引入额外依赖）
  const [tabAnimKey, setTabAnimKey] = useState(0);
  const [userApiKey, setUserApiKey] = useState(localStorage.getItem('VITE_GEMINI_API_KEY') || '');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  useEffect(() => {
    setTabAnimKey(k => k + 1);
  }, [activeTab, state.activeMenu]);

  const saveApiKey = () => {
    setSaveStatus('saving');
    localStorage.setItem('VITE_GEMINI_API_KEY', userApiKey);
    // 触发一个自定义事件，通知 geminiService 更新 Key
    window.dispatchEvent(new CustomEvent('api-key-updated', { detail: userApiKey }));
    setTimeout(() => {
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    }, 500);
  };

  // 摇杆逻辑
  const joystickContainerRef = useRef<HTMLDivElement>(null);
  const [joystickActive, setJoystickActive] = useState(false);
  const [joystickPos, setJoystickPos] = useState({ x: 0, y: 0 });

  const handleJoystickStart = (e: React.TouchEvent) => {
    setJoystickActive(true);
    handleJoystickMove(e);
  };

  const handleJoystickMove = (e: React.TouchEvent) => {
    if (!joystickContainerRef.current) return;
    const rect = joystickContainerRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const touch = e.touches[0];
    let dx = touch.clientX - centerX;
    let dy = touch.clientY - centerY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const maxDist = 60;
    if (dist > maxDist) { dx *= maxDist / dist; dy *= maxDist / dist; }
    setJoystickPos({ x: dx, y: dy });
    window.dispatchEvent(new CustomEvent('mobile-input', { detail: { dx: dx / maxDist, dy: dy / maxDist } }));
  };

  const handleJoystickEnd = () => {
    setJoystickActive(false);
    setJoystickPos({ x: 0, y: 0 });
    window.dispatchEvent(new CustomEvent('mobile-input', { detail: { dx: 0, dy: 0 } }));
  };

  const setFiring = (isFiring: boolean) => {
    window.dispatchEvent(new CustomEvent('mobile-input', { detail: { isFiring } }));
  };

  const dispatchCommand = useCallback((type: CommandType, count: number) => {
    window.dispatchEvent(new CustomEvent('tactical-command', { detail: { type, count } }));
  }, []);

  const toggleMenu = () => { window.dispatchEvent(new CustomEvent('toggle-menu')); };

  const enemyBed = state.beds.find(b => b.team === Team.ENEMY);
  const allyBed = state.beds.find(b => b.team === Team.ALLY);
  const landmineCount = state.landmineCount || 0;
  const capturePercentEnemy = enemyBed ? Math.round((enemyBed.captureProgress / 5000) * 100) : 0;
  const capturePercentAlly = allyBed ? Math.round((allyBed.captureProgress / 5000) * 100) : 0;

  const commands = [
    { k: '1', n: t('command.attack.name'), type: CommandType.ATTACK, color: 'text-red-400', desc: t('command.attack.desc') },
    { k: '2', n: t('command.capture.name'), type: CommandType.CAPTURE, color: 'text-emerald-400', desc: t('command.capture.desc') },
    { k: '3', n: t('command.surround.name'), type: CommandType.SURROUND, color: 'text-purple-400', desc: t('command.surround.desc') },
    { k: '4', n: t('command.defend.name'), type: CommandType.DEFEND, color: 'text-blue-400', desc: t('command.defend.desc') },
    { k: '5', n: t('command.recon.name'), type: CommandType.RECON, color: 'text-yellow-400', desc: t('command.recon.desc') },
    { k: '6', n: t('command.free.name'), type: CommandType.FREE_PLANNING, color: 'text-cyan-400', desc: t('command.free.desc') },
  ];

  const allParticipants = [state.player, ...state.allies, ...state.enemies].sort((a, b) => b.score - a.score);

  const enemyLeader = state.enemies.find(e => e.isLeader);
  const isMobile = state.controlMode === ControlMode.MOBILE;

  const getEnemyIntentDesc = (cmd: CommandType | null) => {
     switch(cmd) {
        case CommandType.ATTACK: return t('enemy.intent.attack');
        case CommandType.DEFEND: return t('enemy.intent.defend');
        case CommandType.SURROUND: return t('enemy.intent.surround');
        case CommandType.CAPTURE: return t('enemy.intent.capture');
        case CommandType.RECON: return t('enemy.intent.recon');
        case CommandType.FREE_PLANNING: return t('enemy.intent.free');
        default: return t('enemy.intent.default');
     }
  };

  return (
    <div className="fixed inset-0 pointer-events-none flex flex-col justify-between p-4 pt-[calc(env(safe-area-inset-top)+1rem)] pb-[calc(env(safe-area-inset-bottom)+1rem)] md:p-6 font-sans overflow-hidden text-white">
      {!state.isGameOver && (
        <div className="flex justify-between items-start">
          <div className="space-y-2">
            <div className="bg-slate-900/90 border border-white/10 p-3 rounded-xl w-48 md:w-64 shadow-2xl backdrop-blur-md">
              <h2 className="text-[8px] md:text-[10px] font-black uppercase tracking-widest text-emerald-400 mb-2">{t('hud.target.enemy')}</h2>
              <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 transition-all duration-300" style={{ width: `${capturePercentEnemy}%` }} />
              </div>
            </div>
            <div className="bg-slate-900/90 border border-white/10 p-3 rounded-xl w-48 md:w-64 shadow-2xl backdrop-blur-md">
              <h2 className="text-[8px] md:text-[10px] font-black uppercase tracking-widest text-red-400 mb-2">{t('hud.target.ally')}</h2>
              <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                <div className="h-full bg-red-500 transition-all duration-300" style={{ width: `${100-capturePercentAlly}%` }} />
              </div>
            </div>
            <div className="bg-purple-950/80 border border-purple-500/40 p-3 rounded-xl w-48 md:w-64 shadow-2xl backdrop-blur-md">
              <h2 className="text-[8px] md:text-[10px] font-black uppercase tracking-widest text-purple-400 mb-1 flex items-center gap-2">
                 <span className="w-2 h-2 rounded-full bg-purple-500 animate-pulse" />
                 {t('hud.enemyIntel')}
              </h2>
              <p className="text-[10px] md:text-xs font-mono text-purple-200">
                 {t('hud.enemyCommand')}: {getEnemyIntentDesc(state.enemyCommand)}
              </p>
              {enemyLeader && enemyLeader.health > 0 && (
                 <div className="mt-2 text-[9px] italic text-purple-300/80 border-t border-purple-500/20 pt-1">
                    "{enemyLeader.lastDialogue}"
                 </div>
              )}
            </div>
          </div>

          {!isMobile && (
            <div className={`bg-black/60 border border-white/5 p-4 rounded-xl shadow-2xl backdrop-blur-md pointer-events-auto transition-all duration-300 ${isCommCollapsed ? 'w-12 h-12 overflow-hidden' : 'w-80'}`}
                 onClick={() => isCommCollapsed && setIsCommCollapsed(false)}>
              <h2 className="text-[10px] font-black uppercase tracking-widest text-blue-300 mb-3 flex justify-between items-center whitespace-nowrap">
                {!isCommCollapsed && <span>{t('hud.commLink')}</span>}
                <button onClick={(e) => { e.stopPropagation(); setIsCommCollapsed(!isCommCollapsed); }} className="p-1 text-[8px]">{isCommCollapsed ? t('hud.expand') : t('hud.collapse')}</button>
              </h2>
              {!isCommCollapsed && (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {state.allies.map((a, i) => (
                    <div key={a.id} className="text-[11px] flex items-start gap-2 border-l-2 border-white/10 pl-2">
                      <span className="font-bold text-gray-400 whitespace-nowrap">{a.nickname}:</span>
                      <span className={a.health > 0 ? "text-blue-100 italic" : "text-red-600 font-bold"}>
                        {a.health > 0 ? `"${a.lastDialogue || t('hud.defaultDialogue')}"` : t('hud.rebuilding')}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="p-3 md:p-4 rounded-xl max-w-[150px] md:max-w-sm shadow-2xl backdrop-blur-md border bg-slate-900/90 border-blue-500/20">
            <h2 className="text-[8px] md:text-[10px] font-black uppercase tracking-widest text-blue-400 mb-1 flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${state.isAIConnected ? 'bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-blue-500'}`} /> 
              {t('hud.tacticalAnalysis')} {state.isAIConnected && <span className="text-[7px] md:text-[9px] text-emerald-500 ml-1 font-bold tracking-normal opacity-80">● {t('hud.aiOnline')}</span>}
            </h2>
            <p className="text-[10px] md:text-sm font-medium leading-relaxed text-blue-50 whitespace-pre-wrap">{state.tacticalAdvice || t('hud.waitingSignal')}</p>
            {state.currentAIModel && (
              <div className="mt-2 pt-2 border-t border-white/10 flex items-center justify-between text-[8px] md:text-[9px]">
                <span className="text-white/40 uppercase tracking-wider">{t('hud.model')}:</span>
                <span className={`font-bold uppercase ${
                  state.currentAIModel === 'ollama' ? 'text-purple-400' : 
                  state.currentAIModel === 'gemini' ? 'text-blue-400' : 
                  'text-yellow-400'
                }`}>
                  {state.currentAIModel === 'ollama' ? 'Ollama' : 
                   state.currentAIModel === 'gemini' ? 'Gemini' : 
                   t('hud.ruleEngine')}
                </span>
                {state.lastAIResponseTime && (
                  <span className="text-white/30 ml-2">{state.lastAIResponseTime.toFixed(0)}ms</span>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 金币和基本信息展示 */}
      {!state.isGameOver && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 flex gap-4 pointer-events-none">
          <div className="bg-slate-900/90 backdrop-blur-md px-6 py-2 rounded-full border border-blue-500/20 flex items-center gap-6 shadow-2xl">
            <div className="flex items-center gap-2">
              <span className="text-blue-400/60 text-[10px] font-black uppercase tracking-wider">{t('hud.gold')}</span>
              <span className="text-yellow-400 font-black text-xl tabular-nums drop-shadow-[0_0_8px_rgba(250,204,21,0.4)]">{state.gold}</span>
            </div>
            <div className="w-px h-4 bg-white/10" />
            <div className="flex items-center gap-2">
              <span className="text-blue-400/60 text-[10px] font-black uppercase tracking-wider">{t('hud.score')}</span>
              <span className="text-white font-black text-xl tabular-nums">{state.player.score}</span>
            </div>
            {landmineCount > 0 && (
              <>
                <div className="w-px h-4 bg-white/10" />
                <div className="flex items-center gap-2">
                  <span className="text-red-400/80 text-[10px] font-black uppercase tracking-wider">{t('hud.mine')}</span>
                  <span className="text-red-400 font-black text-xl tabular-nums animate-pulse">x{landmineCount}</span>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {state.activeMenu && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm pointer-events-auto p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
          <div className="bg-slate-950/98 border-2 border-blue-500/30 p-5 md:p-8 rounded-[2rem] md:rounded-[3rem] shadow-[0_0_100px_rgba(0,0,0,1)] w-full max-w-2xl text-center max-h-[85vh] flex flex-col">
            <div className="hidden sm:flex gap-3 justify-center mb-5 border-b border-white/10 pb-4">
              <button onClick={() => setActiveTab('COMMANDS')} className={`text-sm sm:text-lg font-black tracking-tighter uppercase italic px-3 sm:px-4 py-2 rounded-xl transition-all ${activeTab === 'COMMANDS' ? 'bg-blue-600 text-white' : 'text-blue-400 hover:bg-white/5'}`}>{t('hud.tab.commands')}</button>
              <button onClick={() => setActiveTab('SHOP')} className={`text-sm sm:text-lg font-black tracking-tighter uppercase italic px-3 sm:px-4 py-2 rounded-xl transition-all ${activeTab === 'SHOP' ? 'bg-yellow-600 text-white shadow-[0_0_20px_rgba(202,138,4,0.3)]' : 'text-yellow-400 hover:bg-white/5'}`}>{t('hud.tab.shop')}</button>
              <button onClick={() => setActiveTab('SCOREBOARD')} className={`text-sm sm:text-lg font-black tracking-tighter uppercase italic px-3 sm:px-4 py-2 rounded-xl transition-all ${activeTab === 'SCOREBOARD' ? 'bg-blue-600 text-white' : 'text-blue-400 hover:bg-white/5'}`}>{t('hud.tab.intel')}</button>
              <button onClick={() => setActiveTab('SETTINGS')} className={`text-sm sm:text-lg font-black tracking-tighter uppercase italic px-3 sm:px-4 py-2 rounded-xl transition-all ${activeTab === 'SETTINGS' ? 'bg-blue-600 text-white' : 'text-blue-400 hover:bg-white/5'}`}>{t('hud.tab.settings')}</button>
            </div>

            <div key={tabAnimKey} className="flex-1 overflow-y-auto pr-1 animate-[panel-in_180ms_ease-out]">

            {activeTab === 'SETTINGS' && (
              <div className="space-y-6 py-4">
                <div className="flex flex-col items-center gap-4">
                  <h3 className="text-sm font-black text-white/40 uppercase tracking-widest">{t('settings.controlPanel')}</h3>
                  
                  <button 
                    onClick={() => window.dispatchEvent(new CustomEvent('toggle-pause'))}
                    className={`w-full max-w-xs py-4 rounded-2xl font-black text-lg transition-all ${state.isPaused ? 'bg-amber-500 text-white shadow-[0_0_20px_rgba(245,158,11,0.3)]' : 'bg-white/5 text-white/60 border border-white/10 hover:bg-white/10'}`}
                  >
                    {state.isPaused ? t('settings.resume') : t('settings.pause')}
                  </button>

                  <button 
                    onClick={() => window.dispatchEvent(new CustomEvent('toggle-ai'))}
                    className={`w-full max-w-xs py-4 rounded-2xl font-black text-lg transition-all ${state.isAIControlled ? 'bg-emerald-600 text-white shadow-[0_0_20px_rgba(16,185,129,0.3)]' : 'bg-white/5 text-white/60 border border-white/10 hover:bg-white/10'}`}
                  >
                    {state.isAIControlled ? t('settings.aiOn') : t('settings.aiOff')}
                  </button>

                  <button 
                    onClick={() => window.dispatchEvent(new CustomEvent('toggle-auto-aim'))}
                    className={`w-full max-w-xs py-4 rounded-2xl font-black text-lg transition-all ${state.isAutoAimEnabled ? 'bg-blue-600 text-white shadow-[0_0_20px_rgba(59,130,246,0.3)]' : 'bg-white/5 text-white/60 border border-white/10 hover:bg-white/10'}`}
                  >
                    {state.isAutoAimEnabled ? t('settings.autoAimOn') : t('settings.autoAimOff')}
                  </button>

                  <button 
                    onClick={() => window.dispatchEvent(new CustomEvent('toggle-auto-fire'))}
                    className={`w-full max-w-xs py-4 rounded-2xl font-black text-lg transition-all ${state.isAutoFireEnabled ? 'bg-red-600 text-white shadow-[0_0_20px_rgba(220,38,38,0.3)]' : 'bg-white/5 text-white/60 border border-white/10 hover:bg-white/10'}`}
                  >
                    {state.isAutoFireEnabled ? t('settings.autoFireOn') : t('settings.autoFireOff')}
                  </button>

                  <button 
                    onClick={() => window.dispatchEvent(new CustomEvent('toggle-memory'))}
                    className={`w-full max-w-xs py-4 rounded-2xl font-black text-lg transition-all ${state.isMemoryEnabled ? 'bg-purple-600 text-white shadow-[0_0_20px_rgba(147,51,234,0.3)]' : 'bg-white/5 text-white/60 border border-white/10 hover:bg-white/10'}`}
                  >
                    {state.isMemoryEnabled ? t('settings.memoryOn') : t('settings.memoryOff')}
                  </button>

                  <div className="w-full max-w-xs mt-2 pt-4 border-t border-white/10 text-left">
                    <p className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-3">{t('settings.apiKeyTitle')}</p>
                    <div className="space-y-3">
                      <div className="relative">
                        <input
                          type="password"
                          value={userApiKey}
                          onChange={(e) => setUserApiKey(e.target.value)}
                          placeholder={t('settings.apiKeyPlaceholder')}
                          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-blue-500/50 transition-all pointer-events-auto"
                        />
                        {userApiKey && (
                          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                            <span className="text-[8px] font-black text-emerald-500 uppercase">{t('settings.apiKeyStatusActive')}</span>
                          </div>
                        )}
                      </div>
                      
                      <button
                        onClick={saveApiKey}
                        disabled={saveStatus === 'saving'}
                        className={`w-full py-3 rounded-xl font-black text-sm transition-all flex items-center justify-center gap-2 ${
                          saveStatus === 'saved' 
                            ? 'bg-emerald-600 text-white' 
                            : 'bg-blue-600 hover:bg-blue-500 text-white shadow-[0_0_20px_rgba(59,130,246,0.3)]'
                        }`}
                      >
                        {saveStatus === 'saving' ? (
                          <span className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                        ) : saveStatus === 'saved' ? (
                          <>
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                            {t('settings.saveKey')}
                          </>
                        ) : (
                          t('settings.saveKey')
                        )}
                      </button>
                      
                      <p className="text-[9px] text-white/20 italic leading-tight">
                        {t('settings.apiKeyNote')}
                      </p>
                    </div>
                  </div>

                  <div className="w-full max-w-xs mt-2 pt-4 border-t border-white/10">
                    <p className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-3">{t('settings.privacyTitle')}</p>
                    <button
                      onClick={() => window.dispatchEvent(new CustomEvent('toggle-privacy-mode'))}
                      className={`w-full py-3 rounded-2xl font-black text-sm transition-all ${state.isPrivacyModeEnabled ? 'bg-slate-200 text-slate-950' : 'bg-white/5 text-white/60 border border-white/10 hover:bg-white/10'}`}
                    >
                      {state.isPrivacyModeEnabled ? t('settings.privacyModeOn') : t('settings.privacyModeOff')}
                    </button>
                    <button
                      onClick={() => window.dispatchEvent(new CustomEvent('clear-local-data'))}
                      className="w-full mt-3 py-3 rounded-2xl font-black text-sm transition-all bg-white/5 text-white/60 border border-white/10 hover:bg-white/10"
                    >
                      {t('settings.clearLocalIntel')}
                    </button>
                  </div>

                  <div className="w-full max-w-xs mt-4 pt-4 border-t border-white/10">
                    <p className="text-[10px] font-black text-white/40 uppercase tracking-widest mb-3">{t('settings.perfTitle')}</p>
                    <button
                      onClick={() => window.dispatchEvent(new CustomEvent('toggle-perf-overlay'))}
                      className={`w-full py-3 rounded-2xl font-black text-sm transition-all ${state.isPerfOverlayEnabled ? 'bg-emerald-600 text-white shadow-[0_0_20px_rgba(16,185,129,0.25)]' : 'bg-white/5 text-white/60 border border-white/10 hover:bg-white/10'}`}
                    >
                      {state.isPerfOverlayEnabled ? t('settings.perfOn') : t('settings.perfOff')}
                    </button>

                    {state.isPerfOverlayEnabled && (
                      <div className="mt-3 grid grid-cols-2 gap-3 text-left">
                        <div className="bg-white/5 border border-white/10 rounded-xl p-3">
                          <p className="text-[9px] text-white/30 font-black uppercase">{t('settings.fps')}</p>
                          <p className="text-lg font-black tabular-nums text-emerald-400">{state.fps ? Math.round(state.fps) : '--'}</p>
                        </div>
                        <div className="bg-white/5 border border-white/10 rounded-xl p-3">
                          <p className="text-[9px] text-white/30 font-black uppercase">{t('settings.longTasks')}</p>
                          <p className="text-lg font-black tabular-nums text-yellow-400">{state.longTaskCount ?? 0}</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="text-[10px] text-white/20 italic mt-8 space-y-1">
                  <p>{t('settings.note.ai')}</p>
                  <p>{t('settings.note.autoAim')}</p>
                  <p>{t('settings.note.autoFire')}</p>
                  <p>{t('settings.note.memory')}</p>
                </div>
              </div>
            )}

            {activeTab === 'SHOP' && (
              <div className="py-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[400px] overflow-y-auto px-2">
                  {[
                    { id: 'damage', name: t('shop.upgrade.damage.name'), desc: t('shop.upgrade.damage.desc'), icon: '💥', value: state.teamUpgrades.damage },
                    { id: 'defense', name: t('shop.upgrade.defense.name'), desc: t('shop.upgrade.defense.desc'), icon: '🛡️', value: state.teamUpgrades.defense },
                    { id: 'speed', name: t('shop.upgrade.speed.name'), desc: t('shop.upgrade.speed.desc'), icon: '⚡', value: state.teamUpgrades.speed },
                    { id: 'regen', name: t('shop.upgrade.regen.name'), desc: t('shop.upgrade.regen.desc'), icon: '❤️', value: state.teamUpgrades.regen },
                    { id: 'haste', name: t('shop.upgrade.haste.name'), desc: t('shop.upgrade.haste.desc'), icon: '🔥', value: state.teamUpgrades.haste },
                    { id: 'landmine', name: t('shop.upgrade.landmine.name'), desc: t('shop.upgrade.landmine.desc'), icon: '💣', value: 0 },
                  ].map(item => {
                      const count = Math.round(item.value / SHOP_UPGRADES.BUFF_INCREMENT);
                       const cost = SHOP_UPGRADES.BASE_COST;
                       const canAfford = state.gold >= cost;
                       
                       return (
                         <div key={item.id} className="bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col gap-3 transition-all hover:bg-white/10">
                           <div className="flex justify-between items-start">
                             <div className="flex gap-3">
                              <span className="text-2xl">{item.icon}</span>
                              <div className="text-left">
                                <h4 className="text-sm font-black text-white uppercase tracking-tight">{item.name}</h4>
                                <p className="text-[10px] text-white/40 leading-tight">{item.desc}</p>
                              </div>
                            </div>
                            {item.id !== 'landmine' && (
                              <div className="bg-blue-600/20 px-2 py-1 rounded text-[10px] font-black text-blue-400 border border-blue-500/30">
                                LV.{count}
                              </div>
                            )}
                          </div>
                          
                          <div className="flex items-center justify-between mt-auto pt-2 border-t border-white/5">
                            <div className="flex items-center gap-1">
                              <span className="text-xs text-yellow-400 font-black">{t('shop.cost')}:</span>
                              <span className="text-sm text-yellow-400 font-black tabular-nums">{cost}</span>
                              <span className="text-[10px] text-yellow-400/60 ml-1">{t('hud.gold')}</span>
                            </div>
                            
                            <button
                              disabled={!canAfford}
                              onClick={() => window.dispatchEvent(new CustomEvent('buy-upgrade', { detail: { type: item.id, cost } }))}
                              className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${
                                canAfford 
                                  ? 'bg-yellow-600 text-white shadow-[0_0_15px_rgba(202,138,4,0.3)] hover:scale-105 active:scale-95' 
                                  : 'bg-white/5 text-white/20 cursor-not-allowed'
                              }`}
                            >
                              {canAfford ? t('shop.purchase') : t('shop.needGold')}
                            </button>
                          </div>
                       
                       {item.id !== 'landmine' && (
                         <div className="flex items-center gap-2 mt-1">
                           <div className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden">
                             <div className="h-full bg-emerald-500/50 transition-all" style={{ width: `${(item.value % 1) * 100}%` }} />
                           </div>
                           <span className="text-[9px] font-mono text-emerald-400">+{Math.round(item.value * 100)}%</span>
                         </div>
                       )}
                      </div>
                    );
                  })}
                </div>
                <p className="mt-6 text-[10px] text-white/20 italic">
                  {t('shop.note')}
                </p>
              </div>
            )}

            {activeTab === 'COMMANDS' && (
              <>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 md:gap-4 mb-6">
                  {commands.map(cmd => {
                    const isActive = state.currentCommand === cmd.type;
                    return (
                      <button key={cmd.k} onClick={() => dispatchCommand(cmd.type, state.commandCount)}
                        className={`p-3 md:p-5 border rounded-2xl md:rounded-3xl flex flex-col items-center transition-all ${isActive ? 'bg-blue-600/40 border-blue-400 shadow-[0_0_20px_rgba(59,130,246,0.3)]' : 'border-white/5 bg-white/5'}`}
                      >
                        <span className="text-[8px] md:text-[11px] font-black text-white/40 mb-1">{cmd.n}</span>
                        <span className={`text-[10px] md:text-base font-black ${cmd.color}`}>{cmd.desc}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="mb-6">
                  <p className="text-[8px] md:text-[10px] uppercase font-black text-white/30 mb-3 tracking-widest">{t('command.scale')}</p>
                  <div className="flex justify-center gap-2 flex-wrap">
                    {Array.from({length: state.allies.length}, (_, i) => i + 1).map(size => (
                      <button key={size} onClick={() => dispatchCommand(state.currentCommand || CommandType.FREE, size)}
                        className={`w-10 h-10 md:w-12 md:h-12 border rounded-lg flex items-center justify-center font-mono font-black transition-all ${state.commandCount === size ? 'bg-blue-600 border-blue-400 text-white' : 'bg-white/5 text-white/30 border-white/10 hover:border-blue-400/50'}`}
                      >
                        {size}
                      </button>
                    ))}
                    <button onClick={() => dispatchCommand(state.currentCommand || CommandType.FREE, state.allies.length)}
                      className={`px-4 h-10 md:h-12 border rounded-lg flex items-center justify-center font-mono font-black transition-all ${state.commandCount === state.allies.length ? 'bg-emerald-600 border-emerald-400 text-white' : 'bg-white/5 text-emerald-400/50 border-white/10 hover:border-emerald-400/50'}`}
                    >
                      ALL
                    </button>
                  </div>
                </div>

              </>
            )}

            {activeTab === 'SCOREBOARD' && (
              <div className="max-h-[400px] overflow-y-auto mb-6 px-2">
                <table className="w-full text-left border-collapse">
                  <thead className="sticky top-0 bg-slate-950 text-[10px] md:text-xs font-black uppercase text-white/40 border-b border-white/10">
                    <tr>
                      <th className="py-2 pl-2">{t('scoreboard.name')}</th>
                      <th className="py-2 text-center">{t('scoreboard.kills')}</th>
                      <th className="py-2 text-center">{t('scoreboard.assists')}</th>
                      <th className="py-2 text-right pr-2">{t('scoreboard.score')}</th>
                    </tr>
                  </thead>
                  <tbody className="text-[11px] md:text-sm font-mono">
                    {allParticipants.map(t => (
                      <tr key={t.id} className={`border-b border-white/5 ${t.id === 'player' ? 'bg-blue-600/10' : ''}`}>
                        <td className="py-3 pl-2 flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${t.team === Team.ENEMY ? 'bg-red-500' : 'bg-emerald-500'}`} />
                          <span className={t.id === 'player' ? 'text-blue-400 font-black' : 'text-white'}>{t.nickname}</span>
                          {t.isLeader && <span className="text-[8px] bg-purple-600 text-white px-1 rounded">CMD</span>}
                        </td>
                        <td className="py-3 text-center text-red-400 font-bold">{t.kills || 0}</td>
                        <td className="py-3 text-center text-blue-300">{t.assists || 0}</td>
                        <td className="py-3 text-right pr-2 font-black text-emerald-400">{Math.floor(t.score || 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="mt-6 border-t border-white/10 pt-6 text-left">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-xs font-black text-emerald-400 uppercase tracking-widest flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      {t('scoreboard.aiIntel')}
                    </h3>
                    <span className="text-[9px] text-white/20 font-mono">KNOWLEDGE_BASE_V1.0</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-4">
                      <p className="text-[9px] font-black text-emerald-500/60 uppercase mb-2 tracking-tighter">{t('scoreboard.learnedTactics')}</p>
                      <div className="space-y-2">
                        {state.knowledgeBase?.learnedTactics.length ? (
                          state.knowledgeBase.learnedTactics.slice(-3).reverse().map((tactic, i) => (
                            <p key={i} className="text-[11px] text-emerald-100 leading-tight border-l-2 border-emerald-500/30 pl-2">{tactic}</p>
                          ))
                        ) : (
                          <p className="text-[11px] text-white/20 italic">{t('scoreboard.noTactics')}</p>
                        )}
                      </div>
                    </div>

                    <div className="bg-blue-500/5 border border-blue-500/20 rounded-2xl p-4">
                      <p className="text-[9px] font-black text-blue-500/60 uppercase mb-2 tracking-tighter">{t('scoreboard.playerPatterns')}</p>
                      <div className="space-y-2">
                        {state.knowledgeBase?.playerPatterns.length ? (
                          state.knowledgeBase.playerPatterns.slice(-3).reverse().map((pattern, i) => (
                            <p key={i} className="text-[11px] text-blue-100 leading-tight border-l-2 border-blue-500/30 pl-2">{pattern}</p>
                          ))
                        ) : (
                          <p className="text-[11px] text-white/20 italic">{t('scoreboard.noPatterns')}</p>
                        )}
                      </div>
                    </div>

                    <div className="bg-purple-500/5 border border-purple-500/20 rounded-2xl p-4">
                      <p className="text-[9px] font-black text-purple-500/60 uppercase mb-2 tracking-tighter">{t('scoreboard.innovation')}</p>
                      <div className="space-y-2">
                        {state.knowledgeBase?.innovationNotes.length ? (
                          state.knowledgeBase.innovationNotes.slice(-3).reverse().map((note, i) => (
                            <p key={i} className="text-[11px] text-purple-100 leading-tight border-l-2 border-purple-500/30 pl-2">{note}</p>
                          ))
                        ) : (
                          <p className="text-[11px] text-white/20 italic">{t('scoreboard.noInnovation')}</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            </div>

            <div className="sm:hidden mt-4 pt-4 border-t border-white/10 grid grid-cols-4 gap-2">
              <button onClick={() => setActiveTab('COMMANDS')} className={`py-3 rounded-xl font-black text-[10px] tracking-wider transition-all ${activeTab === 'COMMANDS' ? 'bg-blue-600 text-white' : 'bg-white/5 text-white/60 border border-white/10'}`}>{t('hud.tab.commands')}</button>
              <button onClick={() => setActiveTab('SHOP')} className={`py-3 rounded-xl font-black text-[10px] tracking-wider transition-all ${activeTab === 'SHOP' ? 'bg-yellow-600 text-white' : 'bg-white/5 text-white/60 border border-white/10'}`}>{t('hud.tab.shop')}</button>
              <button onClick={() => setActiveTab('SCOREBOARD')} className={`py-3 rounded-xl font-black text-[10px] tracking-wider transition-all ${activeTab === 'SCOREBOARD' ? 'bg-blue-600 text-white' : 'bg-white/5 text-white/60 border border-white/10'}`}>{t('hud.tab.intel')}</button>
              <button onClick={() => setActiveTab('SETTINGS')} className={`py-3 rounded-xl font-black text-[10px] tracking-wider transition-all ${activeTab === 'SETTINGS' ? 'bg-blue-600 text-white' : 'bg-white/5 text-white/60 border border-white/10'}`}>{t('hud.tab.settings')}</button>
            </div>

            <button onClick={toggleMenu} className="text-[8px] md:text-[10px] text-blue-400/50 font-black tracking-[0.2em] uppercase mt-4">{t('hud.exit')}</button>
          </div>
        </div>
      )}

      {state.isGameOver && (
        <div className="fixed inset-0 pointer-events-auto bg-black/95 flex items-center justify-center z-[100] p-4">
          <div className="bg-slate-950 border border-white/10 p-10 rounded-[3rem] text-center shadow-2xl max-w-2xl w-full">
            <h1 className={`text-4xl md:text-8xl font-black mb-8 italic ${(state.winner === Team.ALLY || state.winner === Team.PLAYER) ? 'text-emerald-400' : 'text-red-500'}`}>
              {(state.winner === Team.ALLY || state.winner === Team.PLAYER) ? t('gameover.victory') : t('gameover.defeat')}
            </h1>
            
            <div className="bg-white/5 rounded-3xl p-6 mb-8 text-left max-h-[400px] overflow-y-auto pointer-events-auto">
               <h3 className="text-xs font-black uppercase text-blue-400 mb-4 border-b border-white/10 pb-2">{t('gameover.report')}</h3>
               <table className="w-full text-sm font-mono">
                 <thead className="text-[10px] text-white/40 uppercase">
                   <tr>
                     <th className="pb-2 text-left">{t('gameover.member')}</th>
                     <th className="pb-2 text-center">{t('scoreboard.kills')}</th>
                     <th className="pb-2 text-center">{t('scoreboard.assists')}</th>
                     <th className="pb-2 text-right">{t('gameover.score')}</th>
                   </tr>
                 </thead>
                 <tbody className="divide-y divide-white/5">
                   {allParticipants.map(t => (
                     <tr key={t.id} className={t.id === 'player' ? 'bg-blue-500/10' : ''}>
                       <td className="py-3 flex items-center gap-2">
                         <span className={`w-2 h-2 rounded-full ${t.team === Team.ENEMY ? 'bg-red-500' : 'bg-emerald-500'}`} />
                         <span className={t.id === 'player' ? 'text-blue-400 font-black' : 'text-white/80'}>{t.nickname}</span>
                         {t.isLeader && <span className="text-[8px] bg-purple-600 text-white px-1 rounded">CMD</span>}
                       </td>
                       <td className="py-3 text-center text-red-400 font-bold">{t.kills || 0}</td>
                       <td className="py-3 text-center text-blue-300">{t.assists || 0}</td>
                       <td className="py-3 text-right font-black text-emerald-400">{Math.floor(t.score || 0)}</td>
                     </tr>
                   ))}
                 </tbody>
               </table>
            </div>

            <button onClick={onRestart} className="w-full bg-blue-600 hover:bg-blue-500 py-5 rounded-[2rem] text-xl font-black transition-all transform active:scale-95 shadow-xl shadow-blue-600/20">{t('gameover.restart')}</button>
          </div>
        </div>
      )}

      {!state.isGameOver && (
        <div className="flex flex-col md:flex-row justify-between items-end gap-4">
          <div className="pointer-events-auto">
            {isMobile ? (
              <div ref={joystickContainerRef} className="joystick-base" onTouchStart={handleJoystickStart} onTouchMove={handleJoystickMove} onTouchEnd={handleJoystickEnd}>
                <div className="joystick-stick" style={{ transform: `translate(${joystickPos.x}px, ${joystickPos.y}px)` }} />
              </div>
            ) : (
              <div className="bg-black/90 backdrop-blur-xl px-8 py-4 rounded-[2.5rem] border border-white/10 shadow-2xl flex items-center gap-8">
                <div className="text-center min-w-[150px]">
                  <p className="text-[8px] uppercase text-gray-500 font-black tracking-widest mb-1">{t('hud.armor')}</p>
                  <div className="flex items-center gap-3">
                    <div className="w-32 h-2 bg-white/5 rounded-full overflow-hidden border border-white/5">
                      <div className={`h-full transition-all duration-700 bg-red-500`} style={{ width: `${state.player.health}%` }} />
                    </div>
                    <span className="font-mono text-sm font-bold">{Math.round(state.player.health)}%</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="pointer-events-auto flex gap-4 items-center">
            {isMobile ? (
              <>
                <button className="w-16 h-16 bg-white/5 border border-white/10 rounded-full flex items-center justify-center text-blue-400 font-black" onClick={toggleMenu}>{t('hud.mobile.tactics')}</button>
                <button className="w-24 h-24 bg-red-600/20 border-2 border-red-500 rounded-full flex items-center justify-center text-red-500 font-black text-xl shadow-[0_0_20px_rgba(239,68,68,0.3)] active:scale-95 transition-transform" onTouchStart={() => setFiring(true)} onTouchEnd={() => setFiring(false)}>{t('hud.mobile.fire')}</button>
              </>
            ) : (
              <div className="bg-black/90 backdrop-blur-xl px-8 py-4 rounded-[2rem] border border-white/10 flex items-center gap-6">
                 <div className="text-[9px] text-gray-400 uppercase font-black tracking-tighter">
                  <div className="flex items-center gap-2">{t('hud.move')}: <span className="text-blue-400 border border-blue-400/30 px-1 rounded uppercase">Wasd</span></div>
                  <div className="flex items-center gap-2 mt-1">{t('hud.menuKey')}: <span className="text-white bg-blue-600 px-1 rounded shadow-lg">Z</span></div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default HUD;
