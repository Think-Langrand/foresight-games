import { describe, expect, it, vi } from "vitest";
import {
  KEEPALIVE_CONTENT_TYPE,
  TRUNCATED_MESSAGE,
  encodeFrame,
  keepaliveJsonResponse,
  parseFrame,
  readKeepaliveJson,
  type JobResult,
} from "./keepalive-stream";

const quiet = { log: () => {}, intervalMs: 5 };

// A response whose body is the given chunks, framed as a keepalive stream. Chunk
// boundaries are under the test's control, because a frame split across a TCP read is a
// real case and the reader has to survive it.
function streamed(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(encoder.encode(c));
      controller.close();
    },
  });
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": `${KEEPALIVE_CONTENT_TYPE}; charset=utf-8` },
  });
}

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe("frames", () => {
  it("round-trips every frame kind", () => {
    expect(parseFrame(encodeFrame({ t: "ping" }))).toEqual({ t: "ping" });
    expect(parseFrame(encodeFrame({ t: "ok", data: { a: 1 } }))).toEqual({
      t: "ok",
      data: { a: 1 },
    });
    expect(parseFrame(encodeFrame({ t: "err", status: 400, error: "nope" }))).toEqual({
      t: "err",
      status: 400,
      error: "nope",
    });
  });

  it("ends every frame with a newline, so frames stay separable", () => {
    expect(encodeFrame({ t: "ping" }).endsWith("\n")).toBe(true);
  });

  it("ignores blank lines and junk rather than inventing a frame", () => {
    expect(parseFrame("")).toBeNull();
    expect(parseFrame("   ")).toBeNull();
    expect(parseFrame("not json")).toBeNull();
    expect(parseFrame('{"t":"unknown"}')).toBeNull();
    expect(parseFrame("[1,2]")).toBeNull();
  });

  it("defaults a malformed err frame rather than throwing", () => {
    expect(parseFrame('{"t":"err"}')).toEqual({ t: "err", status: 500, error: "The run failed." });
  });
});

describe("readKeepaliveJson", () => {
  it("resolves the payload, ignoring the pings before it", async () => {
    const res = streamed([
      encodeFrame({ t: "ping" }),
      encodeFrame({ t: "ping" }),
      encodeFrame({ t: "ok", data: { themes: 3 } }),
    ]);
    await expect(readKeepaliveJson(res, "Analysis failed")).resolves.toEqual({ themes: 3 });
  });

  it("throws the message from an err frame, not the fallback", async () => {
    const res = streamed([
      encodeFrame({ t: "ping" }),
      encodeFrame({ t: "err", status: 400, error: "The cohort has fewer than two risks." }),
    ]);
    await expect(readKeepaliveJson(res, "Analysis failed")).rejects.toThrow(
      "The cohort has fewer than two risks."
    );
  });

  // THE ORIGINAL BUG, from the reader's side. A dropped connection used to be
  // indistinguishable from a result; now it is a sentence.
  it("throws when the stream ends with no terminal frame", async () => {
    const res = streamed([encodeFrame({ t: "ping" }), encodeFrame({ t: "ping" })]);
    await expect(readKeepaliveJson(res, "Analysis failed")).rejects.toThrow(TRUNCATED_MESSAGE);
  });

  it("reassembles a frame split across chunk boundaries", async () => {
    const whole = encodeFrame({ t: "ok", data: { text: "a long result" } });
    const res = streamed([whole.slice(0, 7), whole.slice(7, 20), whole.slice(20)]);
    await expect(readKeepaliveJson(res, "Analysis failed")).resolves.toEqual({
      text: "a long result",
    });
  });

  it("accepts a terminal frame with no trailing newline", async () => {
    const res = streamed([JSON.stringify({ t: "ok", data: 42 })]);
    await expect(readKeepaliveJson(res, "Analysis failed")).resolves.toBe(42);
  });

  it("passes a non-2xx guard straight through, keeping its status and message", async () => {
    const res = new Response(JSON.stringify({ error: "Unauthorized." }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
    await expect(readKeepaliveJson(res, "Analysis failed")).rejects.toThrow("Unauthorized.");
  });

  it("falls back to status wording when a failed guard carries no message", async () => {
    const res = new Response("<html>gateway</html>", { status: 502 });
    await expect(readKeepaliveJson(res, "Analysis failed")).rejects.toThrow(
      "Analysis failed (502)."
    );
  });

  it("passes an ordinary JSON 200 through unchanged, so short routes need no migration", async () => {
    const res = new Response(JSON.stringify({ itemCount: 48 }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
    await expect(readKeepaliveJson(res, "Could not read the cohort")).resolves.toEqual({
      itemCount: 48,
    });
  });
});

describe("keepaliveJsonResponse", () => {
  it("writes its first byte before the job has finished", async () => {
    const gate = deferred<JobResult<string>>();
    const res = keepaliveJsonResponse(() => gate.promise, quiet);

    // Read one chunk while the job is still pending. If this resolves, the socket is no
    // longer idle — which is the entire fix.
    const reader = res.body!.getReader();
    const first = await reader.read();
    expect(new TextDecoder().decode(first.value)).toBe(encodeFrame({ t: "ping" }));

    gate.resolve({ ok: true, data: "done" });
    reader.releaseLock();
  });

  it("keeps pinging while a slow job runs", async () => {
    const gate = deferred<JobResult<string>>();
    const res = keepaliveJsonResponse(() => gate.promise, quiet);
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();

    // Three reads with the job still pending: all three must be pings.
    for (let i = 0; i < 3; i++) {
      const { value } = await reader.read();
      expect(decoder.decode(value)).toBe(encodeFrame({ t: "ping" }));
    }

    gate.resolve({ ok: true, data: "done" });
    reader.releaseLock();
  });

  it("round-trips a successful job through the reader", async () => {
    const res = keepaliveJsonResponse(
      async () => ({ ok: true, data: { themes: ["a", "b"] } }),
      quiet
    );
    await expect(readKeepaliveJson(res, "Analysis failed")).resolves.toEqual({
      themes: ["a", "b"],
    });
  });

  it("carries a job's own status and message rather than a generic failure", async () => {
    const res = keepaliveJsonResponse(
      async () => ({ ok: false, status: 400, error: "method must be 'llm' or 'embedding'." }),
      quiet
    );
    await expect(readKeepaliveJson(res, "Analysis failed")).rejects.toThrow(
      "method must be 'llm' or 'embedding'."
    );
  });

  it("reports a thrown job as the fallback and logs the cause", async () => {
    const log = vi.fn();
    const boom = new Error("openai exploded");
    const res = keepaliveJsonResponse<string>(
      async () => {
        throw boom;
      },
      { ...quiet, log, fallback: "Failed to analyse the cohort.", label: "POST cohort analysis" }
    );

    await expect(readKeepaliveJson(res, "Analysis failed")).rejects.toThrow(
      "Failed to analyse the cohort."
    );
    expect(log).toHaveBeenCalledWith("[POST cohort analysis]", boom);
  });

  it("sets the headers that stop nginx buffering the pings away", () => {
    const res = keepaliveJsonResponse(async () => ({ ok: true, data: 1 }), quiet);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain(KEEPALIVE_CONTENT_TYPE);
    expect(res.headers.get("x-accel-buffering")).toBe("no");
    expect(res.headers.get("cache-control")).toContain("no-transform");
  });

  it("stops cleanly when the client goes away mid-job", async () => {
    const gate = deferred<JobResult<string>>();
    const res = keepaliveJsonResponse(() => gate.promise, quiet);
    const reader = res.body!.getReader();
    await reader.read();
    await reader.cancel();

    // The job still settles; writing its result onto a cancelled stream must not throw.
    gate.resolve({ ok: true, data: "done" });
    await expect(gate.promise).resolves.toBeTruthy();
  });
});
