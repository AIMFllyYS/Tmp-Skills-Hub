import { afterEach, describe, expect, it, vi } from "vitest";
import { parseSseJson, postSse } from "./sse.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

function sseStream(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(enc.encode(c));
      controller.close();
    },
  });
}

describe("parseSseJson", () => {
  it("有效 JSON 返回解析对象，坏 JSON 返回 null", () => {
    expect(parseSseJson<{ text: string }>('{"text":"你好"}')).toEqual({ text: "你好" });
    expect(parseSseJson("{bad")).toBeNull();
  });
});

describe("postSse", () => {
  it("按双换行分帧并合并跨 chunk 切片与尾部残余帧", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          sseStream([
            'event: delta\ndata: {"text":"你"}\n\nevent: del',
            'ta\ndata: {"text":"好"}\n\nevent: done\ndata: {}',
          ]),
          { status: 200, headers: { "content-type": "text/event-stream" } },
        ),
      ),
    );
    const deltas: string[] = [];
    let doneCount = 0;
    await postSse("/api/translate", { text: "hi" }, {
      delta: (d) => deltas.push(d),
      done: () => {
        doneCount += 1;
      },
    });
    expect(deltas).toEqual(['{"text":"你"}', '{"text":"好"}']);
    expect(doneCount).toBe(1);
  });

  it("非 2xx 响应读取信封 message 并抛出可读 Error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ ok: false, message: "参数错误" }), {
          status: 400,
          headers: { "content-type": "application/json" },
        }),
      ),
    );
    await expect(postSse("/api/translate", {}, {})).rejects.toThrow("参数错误");
  });

  it("主动 abort 时静默返回而不抛错", async () => {
    const ac = new AbortController();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        });
      }),
    );
    const pending = postSse("/api/translate", { text: "hi" }, {}, ac.signal);
    ac.abort();
    await expect(pending).resolves.toBeUndefined();
  });
});
