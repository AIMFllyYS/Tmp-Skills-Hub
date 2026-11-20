// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { AgentPage } from "./AgentPage.js";

it("focuses a prefilled conflict handoff in ask mode without sending until the user acts", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const mock = vi.fn().mockResolvedValue(Response.json({ ok: true, models: [], defaultModel: "" }));
  vi.stubGlobal("fetch", mock);
  localStorage.setItem("skills-hub.agent.writePolicy", "allow");
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const prompt = "请分析 example 冲突并申请 apply_conflict_resolution 审批";
  try {
    await act(async () => root.render(createElement(AgentPage, { initialPrompt: prompt })));
    const input = host.querySelector<HTMLTextAreaElement>('[data-testid="agent-input"]');
    expect(input?.value).toBe(prompt);
    expect(document.activeElement).toBe(input);
    expect(host.querySelector<HTMLSelectElement>('select[aria-label="写策略"]')?.value).toBe("ask");
    expect(localStorage.getItem("skills-hub.agent.writePolicy")).toBe("allow");
    expect(mock.mock.calls.every(([url]) => url !== "/api/agent/chat")).toBe(true);
  } finally {
    await act(async () => root.unmount());
    host.remove();
    localStorage.clear();
    vi.unstubAllGlobals();
  }
});
