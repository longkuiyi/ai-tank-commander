
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GameState, Team, CommandType, ControlMode, Tank } from '../types';
import { getTacticalAdvice } from '../services/geminiService';

interface Props {
  state: GameState;
  onRestart: () => void;
}

const HUD: React.FC<Props> = ({ state, onRestart }) => {
  const [advice, setAdvice] = useState("正在接入战术指挥链路...");
  const [lastAdviceTime, setLastAdviceTime] = useState(0);
  const [retryDelay, setRetryDelay] = useState(15000);
  const [isCommCollapsed, setIsCommCollapsed] = useState(false);
  const activeTab = state.activeTab || 'COMMANDS';
  const setActiveTab = (tab: 'COMMANDS' | 'SCOREBOARD' | 'SETTINGS') => {
    window.dispatchEvent(new CustomEvent('change-tab', { detail: tab }));
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

  const fetchAdvice = useCallback(async () => {
    const result = await getTacticalAdvice(state);
    setAdvice(result.text);
    setLastAdviceTime(Date.now());
  }, [state]);

  useEffect(() => {
    const now = Date.now();
    if (now - lastAdviceTime > retryDelay && !state.isGameOver) { fetchAdvice(); }
  }, [state, lastAdviceTime, retryDelay, fetchAdvice]);

  const dispatchCommand = useCallback((type: CommandType, count: number) => {
    window.dispatchEvent(new CustomEvent('tactical-command', { detail: { type, count } }));
  }, []);

  const toggleMenu = () => { window.dispatchEvent(new CustomEvent('toggle-menu')); };

  const enemyBed = state.beds.find(b => b.team === Team.ENEMY);
  const allyBed = state.beds.find(b => b.team === Team.ALLY);
  const capturePercentEnemy = enemyBed ? Math.round((enemyBed.captureProgress / 5000) * 100) : 0;
  const capturePercentAlly = allyBed ? Math.round((allyBed.captureProgress / 5000) * 100) : 0;

  const commands = [
    { k: '1', n: '全军突击', type: CommandType.ATTACK, color: 'text-red-400', desc: '集火歼敌' },
    { k: '2', n: '占领据点', type: CommandType.CAPTURE, color: 'text-emerald-400', desc: '目标夺取' },
    { k: '3', n: '战术包围', type: CommandType.SURROUND, color: 'text-purple-400', desc: '环形合围' },
    { k: '4', n: '核心阵地', type: CommandType.DEFEND, color: 'text-blue-400', desc: '全员守备' },
    { k: '5', n: '侦查模式', type: CommandType.RECON, color: 'text-yellow-400', desc: '全场测绘' },
    { k: '6', n: '自由规划', type: CommandType.FREE_PLANNING, color: 'text-cyan-400', desc: '战术自主' },
  ];

  const allParticipants = [state.player, ...state.allies, ...state.enemies].sort((a, b) => b.score - a.score);

  const enemyLeader = state.enemies.find(e => e.isLeader);
  const isMobile = state.controlMode === ControlMode.MOBILE;

  const getEnemyIntentDesc = (cmd: CommandType | null) => {
     switch(cmd) {
        case CommandType.ATTACK: return "发起强力突围";
        case CommandType.DEFEND: return "战术性收缩防御";
        case CommandType.SURROUND: return "正在执行口袋阵";
        case CommandType.CAPTURE: return "分兵渗透占领中";
        default: return "维持现有态势";
     }
  };

  return (
    <div className="fixed inset-0 pointer-events-none flex flex-col justify-between p-4 md:p-6 font-sans overflow-hidden text-white">
      {!state.isGameOver && (
        <div className="flex justify-between items-start">
          <div className="space-y-2">
            <div className="bg-slate-900/90 border border-white/10 p-3 rounded-xl w-48 md:w-64 shadow-2xl backdrop-blur-md">
              <h2 className="text-[8px] md:text-[10px] font-black uppercase tracking-widest text-emerald-400 mb-2">战略目标: 核心占领</h2>
              <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 transition-all duration-300" style={{ width: `${capturePercentEnemy}%` }} />
              </div>
            </div>
            <div className="bg-slate-900/90 border border-white/10 p-3 rounded-xl w-48 md:w-64 shadow-2xl backdrop-blur-md">
              <h2 className="text-[8px] md:text-[10px] font-black uppercase tracking-widest text-red-400 mb-2">安全警报: 基地完整度</h2>
              <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                <div className="h-full bg-red-500 transition-all duration-300" style={{ width: `${100-capturePercentAlly}%` }} />
              </div>
            </div>
            <div className="bg-purple-950/80 border border-purple-500/40 p-3 rounded-xl w-48 md:w-64 shadow-2xl backdrop-blur-md">
              <h2 className="text-[8px] md:text-[10px] font-black uppercase tracking-widest text-purple-400 mb-1 flex items-center gap-2">
                 <span className="w-2 h-2 rounded-full bg-purple-500 animate-pulse" />
                 敌方智能监测
              </h2>
              <p className="text-[10px] md:text-xs font-mono text-purple-200">
                 敌方指令: {getEnemyIntentDesc(state.enemyCommand)}
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
                {!isCommCollapsed && <span>战术指挥链路</span>}
                <button onClick={(e) => { e.stopPropagation(); setIsCommCollapsed(!isCommCollapsed); }} className="p-1 text-[8px]">{isCommCollapsed ? '展开' : '收起'}</button>
              </h2>
              {!isCommCollapsed && (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {state.allies.map((a, i) => (
                    <div key={a.id} className="text-[11px] flex items-start gap-2 border-l-2 border-white/10 pl-2">
                      <span className="font-bold text-gray-400 whitespace-nowrap">{a.nickname}:</span>
                      <span className={a.health > 0 ? "text-blue-100 italic" : "text-red-600 font-bold"}>
                        {a.health > 0 ? `"${a.lastDialogue || '确认战术位置'}"` : `[ 装甲重构中 ]`}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="p-3 md:p-4 rounded-xl max-w-[150px] md:max-w-sm shadow-2xl backdrop-blur-md border bg-slate-900/90 border-blue-500/20">
            <h2 className="text-[8px] md:text-[10px] font-black uppercase tracking-widest text-blue-400 mb-1 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-500" /> 战术分析
            </h2>
            <p className="text-[10px] md:text-sm font-medium leading-relaxed text-blue-50">"{advice}"</p>
          </div>
        </div>
      )}

      {state.activeMenu && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm pointer-events-auto p-4">
          <div className="bg-slate-950/98 border-2 border-blue-500/30 p-6 md:p-8 rounded-[2rem] md:rounded-[3rem] shadow-[0_0_100px_rgba(0,0,0,1)] w-full max-w-2xl text-center">
            <div className="flex gap-4 justify-center mb-6 border-b border-white/10 pb-4">
              <button onClick={() => setActiveTab('COMMANDS')} className={`text-lg font-black tracking-tighter uppercase italic px-4 py-2 rounded-xl transition-all ${activeTab === 'COMMANDS' ? 'bg-blue-600 text-white' : 'text-blue-400 hover:bg-white/5'}`}>战术指令集</button>
              <button onClick={() => setActiveTab('SCOREBOARD')} className={`text-lg font-black tracking-tighter uppercase italic px-4 py-2 rounded-xl transition-all ${activeTab === 'SCOREBOARD' ? 'bg-blue-600 text-white' : 'text-blue-400 hover:bg-white/5'}`}>战场情报局</button>
              <button onClick={() => setActiveTab('SETTINGS')} className={`text-lg font-black tracking-tighter uppercase italic px-4 py-2 rounded-xl transition-all ${activeTab === 'SETTINGS' ? 'bg-blue-600 text-white' : 'text-blue-400 hover:bg-white/5'}`}>系统设置</button>
            </div>

            {activeTab === 'SETTINGS' && (
              <div className="space-y-6 py-4">
                <div className="flex flex-col items-center gap-4">
                  <h3 className="text-sm font-black text-white/40 uppercase tracking-widest">战术控制面板</h3>
                  
                  <button 
                    onClick={() => window.dispatchEvent(new CustomEvent('toggle-pause'))}
                    className={`w-full max-w-xs py-4 rounded-2xl font-black text-lg transition-all ${state.isPaused ? 'bg-amber-500 text-white shadow-[0_0_20px_rgba(245,158,11,0.3)]' : 'bg-white/5 text-white/60 border border-white/10 hover:bg-white/10'}`}
                  >
                    {state.isPaused ? '继续游戏 (Resume)' : '暂停游戏 (Pause)'}
                  </button>

                  <button 
                    onClick={() => window.dispatchEvent(new CustomEvent('toggle-ai'))}
                    className={`w-full max-w-xs py-4 rounded-2xl font-black text-lg transition-all ${state.isAIControlled ? 'bg-emerald-600 text-white shadow-[0_0_20px_rgba(16,185,129,0.3)]' : 'bg-white/5 text-white/60 border border-white/10 hover:bg-white/10'}`}
                  >
                    {state.isAIControlled ? 'AI 掌控中 (AI Active)' : '开启 AI 代打 (Enable AI)'}
                  </button>

                  <button 
                    onClick={() => window.dispatchEvent(new CustomEvent('toggle-auto-aim'))}
                    className={`w-full max-w-xs py-4 rounded-2xl font-black text-lg transition-all ${state.isAutoAimEnabled ? 'bg-blue-600 text-white shadow-[0_0_20px_rgba(59,130,246,0.3)]' : 'bg-white/5 text-white/60 border border-white/10 hover:bg-white/10'}`}
                  >
                    {state.isAutoAimEnabled ? '自瞄已开启 (Auto-Aim ON)' : '开启自动瞄准 (Enable Auto-Aim)'}
                  </button>

                  <button 
                    onClick={() => window.dispatchEvent(new CustomEvent('toggle-auto-fire'))}
                    className={`w-full max-w-xs py-4 rounded-2xl font-black text-lg transition-all ${state.isAutoFireEnabled ? 'bg-red-600 text-white shadow-[0_0_20px_rgba(220,38,38,0.3)]' : 'bg-white/5 text-white/60 border border-white/10 hover:bg-white/10'}`}
                  >
                    {state.isAutoFireEnabled ? '自动射击已开启 (Auto-Fire ON)' : '开启自动射击 (Enable Auto-Fire)'}
                  </button>
                </div>
                
                <div className="text-[10px] text-white/20 italic mt-8 space-y-1">
                  <p>* 开启 AI 代打后，指挥系统将自动接管玩家坦克，进行战术规划与作战</p>
                  <p>* 开启自动瞄准后，系统将协助锁定敌方目标。移动鼠标可随时接管控制权</p>
                  <p>* 开启自动射击后，系统将在锁定目标且角度合适时自动开火</p>
                </div>
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
                  <p className="text-[8px] md:text-[10px] uppercase font-black text-white/30 mb-3 tracking-widest">指挥规模 / 覆盖范围</p>
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
                      <th className="py-2 pl-2">呼号 (Name)</th>
                      <th className="py-2 text-center">击杀 (K)</th>
                      <th className="py-2 text-center">助攻 (A)</th>
                      <th className="py-2 text-right pr-2">积分 (S)</th>
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
              </div>
            )}

            <button onClick={toggleMenu} className="text-[8px] md:text-[10px] text-blue-400/50 font-black tracking-[0.2em] uppercase mt-4">退出战术中枢</button>
          </div>
        </div>
      )}

      {state.isGameOver && (
        <div className="fixed inset-0 pointer-events-auto bg-black/95 flex items-center justify-center z-[100] p-4">
          <div className="bg-slate-950 border border-white/10 p-10 rounded-[3rem] text-center shadow-2xl max-w-2xl w-full">
            <h1 className={`text-4xl md:text-8xl font-black mb-8 italic ${(state.winner === Team.ALLY || state.winner === Team.PLAYER) ? 'text-emerald-400' : 'text-red-500'}`}>
              {(state.winner === Team.ALLY || state.winner === Team.PLAYER) ? '战役胜利' : '战役失利'}
            </h1>
            
            <div className="bg-white/5 rounded-3xl p-6 mb-8 text-left max-h-[400px] overflow-y-auto pointer-events-auto">
               <h3 className="text-xs font-black uppercase text-blue-400 mb-4 border-b border-white/10 pb-2">战后统计报告</h3>
               <table className="w-full text-sm font-mono">
                 <thead className="text-[10px] text-white/40 uppercase">
                   <tr>
                     <th className="pb-2 text-left">成员 (Member)</th>
                     <th className="pb-2 text-center">击杀 (K)</th>
                     <th className="pb-2 text-center">助攻 (A)</th>
                     <th className="pb-2 text-right">得分 (S)</th>
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

            <button onClick={onRestart} className="w-full bg-blue-600 hover:bg-blue-500 py-5 rounded-[2rem] text-xl font-black transition-all transform active:scale-95 shadow-xl shadow-blue-600/20">重新部署指挥系统</button>
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
                  <p className="text-[8px] uppercase text-gray-500 font-black tracking-widest mb-1">主战坦克 装甲结构</p>
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
                <button className="w-16 h-16 bg-white/5 border border-white/10 rounded-full flex items-center justify-center text-blue-400 font-black" onClick={toggleMenu}>战术</button>
                <button className="w-24 h-24 bg-red-600/20 border-2 border-red-500 rounded-full flex items-center justify-center text-red-500 font-black text-xl shadow-[0_0_20px_rgba(239,68,68,0.3)] active:scale-95 transition-transform" onTouchStart={() => setFiring(true)} onTouchEnd={() => setFiring(false)}>开火</button>
              </>
            ) : (
              <div className="bg-black/90 backdrop-blur-xl px-8 py-4 rounded-[2rem] border border-white/10 flex items-center gap-6">
                 <div className="text-[9px] text-gray-400 uppercase font-black tracking-tighter">
                  <div className="flex items-center gap-2">移动: <span className="text-blue-400 border border-blue-400/30 px-1 rounded uppercase">Wasd</span></div>
                  <div className="flex items-center gap-2 mt-1">指令集/战报: <span className="text-white bg-blue-600 px-1 rounded shadow-lg">Z</span></div>
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
