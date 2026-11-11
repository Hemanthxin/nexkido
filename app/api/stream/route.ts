import { currentUser } from "@/lib/auth";
import { subscribe } from "@/lib/live";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Server-Sent Events: one open connection per signed-in screen. Bus positions, alerts, route changes and notices are
 * pushed the moment they happen. A ping every 10 s lets the browser notice a dead connection and reconnect.
 */
export async function GET(req: Request) {
  const u = await currentUser();
  if (!u) return Response.json({ error: "Forbidden" }, { status: 403 });
  const enc = new TextEncoder();
  let stop = () => {};
  const stream = new ReadableStream({
    start(ctrl) {
      const send = (event: string, data: unknown) => { try { ctrl.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)); } catch { stop(); } };
      ctrl.enqueue(enc.encode("retry: 2000\n\n"));
      send("hello", { role: u.role });
      const unsub = subscribe(u.id, send);
      const timer = setInterval(() => send("ping", { t: Date.now() }), 10_000);
      let done = false;
      stop = () => { if (done) return; done = true; clearInterval(timer); unsub(); try { ctrl.close(); } catch { /* already closed */ } };
      req.signal.addEventListener("abort", stop);
    },
    cancel() { stop(); },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" } });
}
