import { create } from 'zustand';
import type { ScenarioDefinition } from '../drawing/model';

/**
 * The scenario being authored. The first piece of designer state to live
 * outside MimicDesignerV2.tsx: the editor panel reads and changes it here, and
 * every change goes through the pure functions in scenarioDraft.ts.
 */
interface AuthoringState {
  draft: ScenarioDefinition | null;
  /** Id of the saved package this draft edits, if any. */
  sourcePackageId?: string;
  dirty: boolean;
  history: ScenarioDefinition[];
  /** Editor tab, kept here so it survives the editor unmounting while the author tries the scenario. */
  tab: AuthoringTab;
  setTab: (tab: AuthoringTab) => void;
  open: (draft: ScenarioDefinition, sourcePackageId?: string) => void;
  close: () => void;
  /** Apply one of the scenarioDraft.ts operations. */
  apply: (change: (draft: ScenarioDefinition) => ScenarioDefinition) => void;
  undo: () => void;
  markSaved: (sourcePackageId: string) => void;
}

export type AuthoringTab = 'overview' | 'objectives' | 'steps' | 'sheets' | 'rules';

const HISTORY_LIMIT = 50;

export const useScenarioAuthoring = create<AuthoringState>((set) => ({
  draft: null,
  sourcePackageId: undefined,
  dirty: false,
  history: [],
  tab: 'overview',
  setTab: (tab) => set({ tab }),
  open: (draft, sourcePackageId) => set({ draft, sourcePackageId, dirty: false, history: [], tab: 'overview' }),
  close: () => set({ draft: null, sourcePackageId: undefined, dirty: false, history: [] }),
  apply: (change) => set((state) => {
    if (!state.draft) return state;
    const next = change(state.draft);
    if (next === state.draft) return state;
    return { draft: next, dirty: true, history: [...state.history, state.draft].slice(-HISTORY_LIMIT) };
  }),
  undo: () => set((state) => {
    const previous = state.history[state.history.length - 1];
    if (!previous) return state;
    return { draft: previous, history: state.history.slice(0, -1), dirty: true };
  }),
  markSaved: (sourcePackageId) => set({ sourcePackageId, dirty: false })
}));
