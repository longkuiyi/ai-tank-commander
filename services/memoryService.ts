import { KnowledgeBase, BattleRecord, Team } from "../types";

const KNOWLEDGE_BASE_KEY = "ai_tank_commander_kb";

const DEFAULT_KB: KnowledgeBase = {
  battleHistory: [],
  learnedTactics: [],
  playerPatterns: [],
  innovationNotes: [],
};

export const memoryService = {
  loadKnowledgeBase(): KnowledgeBase {
    const stored = localStorage.getItem(KNOWLEDGE_BASE_KEY);
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch (e) {
        console.error("Failed to parse KnowledgeBase:", e);
      }
    }
    return { ...DEFAULT_KB };
  },

  saveKnowledgeBase(kb: KnowledgeBase) {
    localStorage.setItem(KNOWLEDGE_BASE_KEY, JSON.stringify(kb));
  },

  addBattleRecord(kb: KnowledgeBase, record: BattleRecord): KnowledgeBase {
    const newHistory = [record, ...kb.battleHistory].slice(0, 50); // Keep last 50 battles
    const updatedKb = { ...kb, battleHistory: newHistory };
    this.saveKnowledgeBase(updatedKb);
    return updatedKb;
  },

  addLearnedTactic(kb: KnowledgeBase, tactic: string): KnowledgeBase {
    if (!kb.learnedTactics.includes(tactic)) {
      const updatedKb = { ...kb, learnedTactics: [...kb.learnedTactics, tactic] };
      this.saveKnowledgeBase(updatedKb);
      return updatedKb;
    }
    return kb;
  },

  addPlayerPattern(kb: KnowledgeBase, pattern: string): KnowledgeBase {
    if (!kb.playerPatterns.includes(pattern)) {
      const updatedKb = { ...kb, playerPatterns: [...kb.playerPatterns, pattern] };
      this.saveKnowledgeBase(updatedKb);
      return updatedKb;
    }
    return kb;
  },

  addInnovation(kb: KnowledgeBase, innovation: string): KnowledgeBase {
    const updatedKb = { ...kb, innovationNotes: [innovation, ...kb.innovationNotes].slice(0, 20) };
    this.saveKnowledgeBase(updatedKb);
    return updatedKb;
  }
};
