import { KnowledgeBase, BattleRecord } from "../types";

const KNOWLEDGE_BASE_KEY = "ai_tank_commander_kb";
const MAX_STORAGE_SIZE = 5 * 1024 * 1024; // 5MB 限制
const MAX_BATTLE_HISTORY = 50;
const MAX_TACTICS = 30;
const MAX_PATTERNS = 30;
const MAX_INNOVATIONS = 20;

const DEFAULT_KB: KnowledgeBase = {
  battleHistory: [],
  learnedTactics: [],
  playerPatterns: [],
  innovationNotes: [],
};

/**
 * 内存服务 - 管理 AI 知识库的持久化存储
 * 包含容量检查和自动清理机制
 */
export const memoryService = {
  /**
   * 清空知识库
   */
  clearKnowledgeBase() {
    try {
      localStorage.removeItem(KNOWLEDGE_BASE_KEY);
    } catch (e) {
      console.error('[MemoryService] 清空知识库失败:', e);
    }
  },

  /**
   * 加载知识库
   * @returns 知识库对象，如果加载失败返回默认值
   */
  loadKnowledgeBase(): KnowledgeBase {
    try {
      const stored = localStorage.getItem(KNOWLEDGE_BASE_KEY);
      if (stored) {
        const kb = JSON.parse(stored);
        // 验证数据结构
        if (this.validateKnowledgeBase(kb)) {
          return kb;
        } else {
          console.warn('[MemoryService] 知识库数据结构无效，使用默认值');
        }
      }
    } catch (e) {
      console.error('[MemoryService] 加载知识库失败:', e);
    }
    return { ...DEFAULT_KB };
  },

  /**
   * 验证知识库数据结构
   */
  validateKnowledgeBase(kb: any): kb is KnowledgeBase {
    return (
      kb &&
      Array.isArray(kb.battleHistory) &&
      Array.isArray(kb.learnedTactics) &&
      Array.isArray(kb.playerPatterns) &&
      Array.isArray(kb.innovationNotes)
    );
  },

  /**
   * 保存知识库（带容量检查和自动清理）
   */
  saveKnowledgeBase(kb: KnowledgeBase): boolean {
    try {
      // 先尝试清理过大的数据
      const cleanedKb = this.cleanupIfNeeded(kb);
      const data = JSON.stringify(cleanedKb);
      
      // 检查大小
      if (data.length > MAX_STORAGE_SIZE) {
        console.warn('[MemoryService] 数据超出限制，执行深度清理');
        const deepCleanedKb = this.deepCleanup(cleanedKb);
        const newData = JSON.stringify(deepCleanedKb);
        localStorage.setItem(KNOWLEDGE_BASE_KEY, newData);
        return true;
      }
      
      localStorage.setItem(KNOWLEDGE_BASE_KEY, data);
      return true;
    } catch (e: any) {
      if (e.name === 'QuotaExceededError') {
        console.error('[MemoryService] localStorage 配额已满，清空知识库');
        this.clearKnowledgeBase();
        // 尝试保存最小数据集
        try {
          const minimalKb = this.deepCleanup(kb);
          localStorage.setItem(KNOWLEDGE_BASE_KEY, JSON.stringify(minimalKb));
          return true;
        } catch {
          return false;
        }
      }
      console.error('[MemoryService] 保存知识库失败:', e);
      return false;
    }
  },

  /**
   * 常规清理：限制各数组长度
   */
  cleanupIfNeeded(kb: KnowledgeBase): KnowledgeBase {
    return {
      battleHistory: kb.battleHistory.slice(0, MAX_BATTLE_HISTORY),
      learnedTactics: kb.learnedTactics.slice(0, MAX_TACTICS),
      playerPatterns: kb.playerPatterns.slice(0, MAX_PATTERNS),
      innovationNotes: kb.innovationNotes.slice(0, MAX_INNOVATIONS),
    };
  },

  /**
   * 深度清理：大幅减少数据量
   */
  deepCleanup(kb: KnowledgeBase): KnowledgeBase {
    return {
      battleHistory: kb.battleHistory.slice(0, 20), // 只保留最近 20 场
      learnedTactics: kb.learnedTactics.slice(0, 15),
      playerPatterns: kb.playerPatterns.slice(0, 15),
      innovationNotes: kb.innovationNotes.slice(0, 10),
    };
  },

  /**
   * 添加战斗记录
   */
  addBattleRecord(kb: KnowledgeBase, record: BattleRecord): KnowledgeBase {
    const newHistory = [record, ...kb.battleHistory].slice(0, MAX_BATTLE_HISTORY);
    const updatedKb = { ...kb, battleHistory: newHistory };
    this.saveKnowledgeBase(updatedKb);
    return updatedKb;
  },

  /**
   * 添加学习到的战术（去重）
   */
  addLearnedTactic(kb: KnowledgeBase, tactic: string): KnowledgeBase {
    if (!tactic || tactic.trim().length === 0) return kb;
    
    if (!kb.learnedTactics.includes(tactic)) {
      const updatedKb = { 
        ...kb, 
        learnedTactics: [...kb.learnedTactics, tactic].slice(0, MAX_TACTICS)
      };
      this.saveKnowledgeBase(updatedKb);
      return updatedKb;
    }
    return kb;
  },

  /**
   * 添加玩家行为模式（去重）
   */
  addPlayerPattern(kb: KnowledgeBase, pattern: string): KnowledgeBase {
    if (!pattern || pattern.trim().length === 0) return kb;
    
    if (!kb.playerPatterns.includes(pattern)) {
      const updatedKb = { 
        ...kb, 
        playerPatterns: [...kb.playerPatterns, pattern].slice(0, MAX_PATTERNS)
      };
      this.saveKnowledgeBase(updatedKb);
      return updatedKb;
    }
    return kb;
  },

  /**
   * 添加创新想法
   */
  addInnovation(kb: KnowledgeBase, innovation: string): KnowledgeBase {
    if (!innovation || innovation.trim().length === 0) return kb;
    
    const updatedKb = { 
      ...kb, 
      innovationNotes: [innovation, ...kb.innovationNotes].slice(0, MAX_INNOVATIONS)
    };
    this.saveKnowledgeBase(updatedKb);
    return updatedKb;
  },

  /**
   * 获取存储使用情况
   */
  getStorageInfo(): { used: number; max: number; percentage: number } {
    try {
      const stored = localStorage.getItem(KNOWLEDGE_BASE_KEY);
      const used = stored ? stored.length : 0;
      return {
        used,
        max: MAX_STORAGE_SIZE,
        percentage: Math.round((used / MAX_STORAGE_SIZE) * 100)
      };
    } catch {
      return { used: 0, max: MAX_STORAGE_SIZE, percentage: 0 };
    }
  }
};
