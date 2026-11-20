import { afterEach, expect, it, vi } from "vitest";
import { fetchConflictDiff, fetchConflicts, submitConflictDecision } from "./api.js";

afterEach(() => vi.unstubAllGlobals());

it("loads conflicts and uses the UI's active-versus-variant diff query with encoded paths", async () => {
  const mock = vi.fn()
    .mockResolvedValueOnce(Response.json({ ok: true, conflicts: [{ skillName: "开发 指南" }] }))
    .mockResolvedValueOnce(Response.json({ ok: true, files: [] }));
  vi.stubGlobal("fetch", mock);
  const signal = new AbortController().signal;
  expect(await fetchConflicts(signal)).toEqual([{ skillName: "开发 指南" }]);
  expect(await fetchConflictDiff("开发 指南", "aabbccdd0012", signal)).toMatchObject({ files: [] });
  expect(mock.mock.calls).toEqual([
    ["/api/conflicts", { signal }],
    ["/api/conflicts/" + encodeURIComponent("开发 指南") + "/diff?a=active&b=aabbccdd0012", { signal }],
  ]);
});

it("posts only the selected decision and preserves backend conflict errors", async () => {
  const mock = vi.fn().mockResolvedValue(Response.json({
    ok: false, code: "conflict", message: "名称已存在",
  }, { status: 409 }));
  vi.stubGlobal("fetch", mock);
  await expect(submitConflictDecision("sample", { mode: "split", variantId: "aabbccdd0012", newName: "sample-split" }))
    .rejects.toMatchObject({ status: 409, code: "conflict", message: "名称已存在" });
  expect(mock).toHaveBeenCalledExactlyOnceWith("/api/conflicts/sample/resolve", {
    method: "POST", headers: { "content-type": "application/json" },
    body: '{"mode":"split","variantId":"aabbccdd0012","newName":"sample-split"}',
  });
});
