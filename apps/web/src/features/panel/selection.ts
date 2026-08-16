export interface SelectionState {
  hashes: ReadonlySet<string>;
}

export type SelectionAction =
  | { type: "toggle"; hash: string; next: boolean }
  | { type: "toggle-visible"; hashes: readonly string[]; next: boolean }
  | { type: "select-store"; hashes: readonly string[] }
  | { type: "clear" }
  | { type: "replace-hash"; from: string; to: string };

export const emptySelection: SelectionState = { hashes: new Set() };

export type MasterCheck = "none" | "some" | "all";

/** 选择按 hash 保存。过滤/排序/作用域变化不派发 clear,因此不会被静默清空。 */
export function selectionReducer(state: SelectionState, action: SelectionAction): SelectionState {
  switch (action.type) {
    case "toggle": {
      const next = new Set(state.hashes);
      if (action.next) next.add(action.hash);
      else next.delete(action.hash);
      return { hashes: next };
    }
    case "toggle-visible": {
      const next = new Set(state.hashes);
      for (const h of action.hashes) {
        if (action.next) next.add(h);
        else next.delete(h);
      }
      return { hashes: next };
    }
    case "select-store":
      return { hashes: new Set(action.hashes) };
    case "clear":
      return emptySelection;
    case "replace-hash": {
      if (!state.hashes.has(action.from)) return state;
      const next = new Set(state.hashes);
      next.delete(action.from);
      next.add(action.to);
      return { hashes: next };
    }
  }
}

export function masterCheckState(visible: readonly string[], selectedHashes: ReadonlySet<string>): MasterCheck {
  if (visible.length === 0) return "none";
  let n = 0;
  for (const h of visible) {
    if (selectedHashes.has(h)) n += 1;
  }
  if (n === 0) return "none";
  if (n === visible.length) return "all";
  return "some";
}

export function selectionSummary(visible: readonly string[], selectedHashes: ReadonlySet<string>): {
  selected: number;
  selectedVisible: number;
  hidden: number;
} {
  let selectedVisible = 0;
  for (const h of visible) {
    if (selectedHashes.has(h)) selectedVisible += 1;
  }
  const selected = selectedHashes.size;
  return { selected, selectedVisible, hidden: selected - selectedVisible };
}
