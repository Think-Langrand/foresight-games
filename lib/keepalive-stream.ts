// Keeping a long request's connection ALIVE while the server thinks.
//
// THE BUG THIS EXISTS FOR. Render's router closes a connection that has been IDLE for 60
// seconds, and a route that computes for two minutes before writing its first byte is idle
// for that whole time. The access log records it as a 499 (client closed request) at
// responseTimeMS≈60000, and the browser sees `TypeError: Failed to fetch` — no status, no
// body, nothing for the UI to report beyond "it broke". Six cohort runs died this way at
// 59963, 60115, 60106, 60105, 59970 and 60191 ms; the one that returned took 42211 ms.
//
// So the limit was never on how LONG a run may take. It was on how long a run may be
// SILENT. `export const maxDuration` does not help: that is a Vercel directive and this
// app runs on Render as a long-lived Node server, where it is inert.
//
// THE PROTOCOL. Newline-delimited JSON. The server writes a `ping` frame immediately and
// every `KEEPALIVE_INTERVAL_MS` after that, so the socket is never idle, and finishes with
// exactly one terminal frame — `ok` carrying the payload, or `err` carrying the status and
// message the route would have sent. The client ignores pings and resolves or throws on the
// terminal frame.
//
// WHY THE STATUS MOVES INTO THE BODY. Headers go out with the first byte, which is now
// seconds into the run and long before the work can fail, so a failure after that cannot be
// an HTTP status any more. Everything that can be decided UP FRONT — auth, a missing
// project, a bad method, no API key — stays an ordinary JSON response with a real status
// code, because those happen before the work starts. Only the long part is streamed. That
// keeps the fast failures honest and the slow ones reportable.
//
// A TRUNCATED STREAM IS AN ERROR, NOT AN EMPTY RESULT. If the connection drops anyway, the
// reader sees the stream end with no terminal frame and throws a sentence saying so. That
// is the one case the old code could not distinguish from success, and it is why this is
// worth a module rather than an inline ReadableStream.
//
// NO `server-only`: this is plain Web Streams, isomorphic on purpose, so the response
// builder and the reader can be tested side by side and cannot drift apart.

export const KEEPALIVE_CONTENT_TYPE = "application/x-ndjson";

// Comfortably inside the 60s idle window, and far enough from it that a slow write or a
// paused event loop cannot push two pings into one 60-second gap.
export const KEEPALIVE_INTERVAL_MS = 10_000;

// What the reader says when the stream ends with no terminal frame. Named because it is the
// symptom of the original bug, so a test can assert on it rather than on prose.
export const TRUNCATED_MESSAGE =
  "The connection closed before the result arrived. The run may still have finished on the server.";

export type KeepaliveFrame<T> = { t: "ping" } | TerminalFrame<T>;

// The two frames that END a stream. Kept as its own type so the reader's "what did I end
// up with" variable cannot be a ping: that distinction is the whole contract.
export type TerminalFrame<T> = { t: "ok"; data: T } | { t: "err"; status: number; error: string };

/** The outcome of a streamed job: the payload, or the status and message a route would send. */
export type JobResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string };

export function encodeFrame<T>(frame: KeepaliveFrame<T>): string {
  return `${JSON.stringify(frame)}\n`;
}

/** One line to a frame, or null for a blank line or anything unrecognised. */
export function parseFrame<T>(line: string): KeepaliveFrame<T> | null {
  const text = line.trim();
  if (!text) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object") return null;
  const frame = raw as Record<string, unknown>;
  if (frame.t === "ping") return { t: "ping" };
  if (frame.t === "ok") return { t: "ok", data: frame.data as T };
  if (frame.t === "err") {
    const status = typeof frame.status === "number" ? frame.status : 500;
    const error = typeof frame.error === "string" && frame.error ? frame.error : "The run failed.";
    return { t: "err", status, error };
  }
  return null;
}

export interface KeepaliveOptions {
  /** How often to ping. Only tests should set this. */
  intervalMs?: number;
  /** What to say if the job throws. The thrown error itself is logged, never sent. */
  fallback?: string;
  /** Where to log a thrown job. Defaults to console.error; tests pass a no-op. */
  log?: (message: string, err: unknown) => void;
  /** Prefix for the log line, e.g. "POST cohort analysis". */
  label?: string;
}

/**
 * Run `job` while holding the connection open with pings, then stream its outcome.
 *
 * The response is a 200 the moment the first ping is written, so `job` must report its own
 * failures as `{ ok: false, status, error }` rather than by throwing — a throw is caught and
 * sent as `fallback` with a 500, exactly as the routes' own try/catch used to do.
 */
export function keepaliveJsonResponse<T>(
  job: () => Promise<JobResult<T>>,
  opts: KeepaliveOptions = {}
): Response {
  const interval = opts.intervalMs ?? KEEPALIVE_INTERVAL_MS;
  const fallback = opts.fallback ?? "The run failed.";
  const log = opts.log ?? ((message, err) => console.error(message, err));
  const label = opts.label ?? "keepaliveJsonResponse";

  const encoder = new TextEncoder();
  let timer: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      // Enqueueing onto a cancelled or closed stream throws. A client that navigated away
      // is the ordinary case, not an exception worth surfacing, so every write is guarded
      // and a failed write stops the pinging rather than crashing the request.
      let live = true;
      const send = (frame: KeepaliveFrame<T>): boolean => {
        if (!live) return false;
        try {
          controller.enqueue(encoder.encode(encodeFrame(frame)));
          return true;
        } catch {
          live = false;
          clearInterval(timer);
          return false;
        }
      };

      // THE FIRST BYTE GOES NOW, before any work. This is the whole point: the idle clock
      // never gets a chance to start.
      send({ t: "ping" });
      timer = setInterval(() => send({ t: "ping" }), interval);

      // NOT awaited inside `start`. A promise returned from `start` is not what flushes
      // queued chunks, and awaiting here reads as though the pings wait for the job.
      void (async () => {
        try {
          const result = await job();
          send(
            result.ok
              ? { t: "ok", data: result.data }
              : { t: "err", status: result.status, error: result.error }
          );
        } catch (err) {
          log(`[${label}]`, err);
          send({ t: "err", status: 500, error: fallback });
        } finally {
          clearInterval(timer);
          if (live) {
            try {
              controller.close();
            } catch {
              // Already closed by a cancel; nothing to do.
            }
          }
        }
      })();
    },
    cancel() {
      clearInterval(timer);
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": `${KEEPALIVE_CONTENT_TYPE}; charset=utf-8`,
      // `no-transform` matters as much as `no-store`: an intermediary that re-compresses
      // the body would buffer it, and a buffered ping is not a ping.
      "Cache-Control": "no-store, no-transform",
      // Render fronts the app with nginx, which buffers proxied responses by default. With
      // buffering on, every ping sits in the buffer and the connection looks idle anyway —
      // the fix would do nothing. This header is what makes the pings actually leave.
      "X-Accel-Buffering": "no",
    },
  });
}

/**
 * Read a response produced by `keepaliveJsonResponse`.
 *
 * Passes through the two shapes that are not streams: a non-2xx (an up-front guard, which
 * still carries a real status and a JSON body) and a plain JSON 200 (every short route,
 * unchanged). So this is safe to use for any admin call, not only the slow ones.
 */
export async function readKeepaliveJson<T>(res: Response, fallback: string): Promise<T> {
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || `${fallback} (${res.status}).`);
  }

  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes(KEEPALIVE_CONTENT_TYPE)) {
    return (await res.json()) as T;
  }
  if (!res.body) throw new Error(`${fallback} (no response body).`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let terminal: TerminalFrame<T> | null = null;

  // Pure, and assigned in the enclosing scope rather than from inside a closure: a closure
  // that writes `terminal` is invisible to TypeScript's control-flow analysis, which then
  // narrows it to `never` below and rejects reading `.data` off it.
  const terminalOf = (line: string): TerminalFrame<T> | null => {
    const frame = parseFrame<T>(line);
    // Pings and unparseable lines are not outcomes. Keep reading.
    return frame && frame.t !== "ping" ? frame : null;
  };

  // Read to the END even once a terminal frame has arrived, so the body is drained and the
  // connection can be reused rather than left half-read.
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    // A frame can be split across chunks, so only whole lines are parsed and the remainder
    // stays in the buffer.
    let newline = buffer.indexOf("\n");
    while (newline !== -1) {
      terminal = terminalOf(buffer.slice(0, newline)) ?? terminal;
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf("\n");
    }
  }
  buffer += decoder.decode();
  // A final frame with no trailing newline still counts.
  if (buffer.trim()) terminal = terminalOf(buffer) ?? terminal;

  if (!terminal) throw new Error(TRUNCATED_MESSAGE);
  if (terminal.t === "err") throw new Error(terminal.error);
  return terminal.data;
}
