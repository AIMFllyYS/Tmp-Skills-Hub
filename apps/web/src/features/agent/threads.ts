import { useCallback, useEffect, useState } from "react";

const INDEX_KEY = "skills-hub.agent.threads";
export const firstThread = "default";
export const messagesKey = (id: string) => id === firstThread ? "skills-hub.agent.v2" : "skills-hub.agent.v2." + id;
export interface Thread { id: string; title: string }
interface Index { current: string; threads: Thread[] }

function load(): Index {
  try {
    const index = JSON.parse(localStorage.getItem(INDEX_KEY) ?? "null") as Index | null;
    if (index?.threads?.length && index.threads.every(t => typeof t.id === "string" && typeof t.title === "string") && index.threads.some(t => t.id === index.current)) return index;
  } catch { /* Initialize a new index over the original conversation. */ }
  return { current: firstThread, threads: [{ id: firstThread, title: "新对话" }] };
}

export function useThreads() {
  const [index, setIndex] = useState(load);
  useEffect(() => { try { localStorage.setItem(INDEX_KEY, JSON.stringify(index)); } catch { /* In-memory index remains usable. */ } }, [index]);
  const create = () => {
    const id = crypto.randomUUID();
    setIndex(old => ({ current: id, threads: [{ id, title: "新对话" }, ...old.threads] }));
  };
  const select = (id: string) => setIndex(old => ({ ...old, current: id }));
  const title = useCallback((id: string, value: string) => {
    const next = value.trim().split("\n")[0]?.slice(0, 40);
    if (next) setIndex(old => old.threads.some(t => t.id === id && t.title !== next)
      ? { ...old, threads: old.threads.map(t => t.id === id ? { id, title: next } : t) } : old);
  }, []);
  return { ...index, create, select, title };
}
