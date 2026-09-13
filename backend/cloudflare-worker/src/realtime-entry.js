import app from "./lineups-entry.js";

function allowedOrigin(env, request) {
  const allowed = String(env.ALLOWED_ORIGIN || "https://acchtt.github.io")
    .split(",").map((x) => x.trim()).filter(Boolean);
  const origin = request.headers.get("Origin");
  if (!origin) return true;
  return allowed.includes(origin);
}

function safeClose(socket, code = 1000, reason = "closed") {
  try { socket.close(code, reason); } catch {}
}

async function liveCentre(request, env) {
  if (!env.BSD_API_TOKEN) return new Response("BSD_API_TOKEN missing", { status: 503 });
  if (!allowedOrigin(env, request)) return new Response("Origin not allowed", { status: 403 });
  if (String(request.headers.get("Upgrade") || "").toLowerCase() !== "websocket") {
    return new Response("WebSocket upgrade required", { status: 426, headers: { Upgrade: "websocket" } });
  }

  const token = encodeURIComponent(env.BSD_API_TOKEN);
  let upstreamResponse;
  try {
    upstreamResponse = await fetch(`https://sports.bzzoiro.com/live/football/?token=${token}`, {
      headers: { Upgrade: "websocket" },
    });
  } catch (error) {
    return new Response(`BSD WebSocket connect failed: ${error instanceof Error ? error.message : String(error)}`, { status: 502 });
  }

  const upstream = upstreamResponse.webSocket;
  if (upstreamResponse.status !== 101 || !upstream) {
    return new Response(`BSD WebSocket unavailable (${upstreamResponse.status})`, { status: 502 });
  }

  const pair = new WebSocketPair();
  const client = pair[0];
  const server = pair[1];
  server.accept();
  try { upstream.accept(); } catch {}

  let closed = false;
  const shutdown = (code = 1000, reason = "closed") => {
    if (closed) return;
    closed = true;
    safeClose(server, code, reason);
    safeClose(upstream, code, reason);
  };

  server.addEventListener("message", (event) => {
    try { upstream.send(event.data); }
    catch { shutdown(1011, "upstream send failed"); }
  });
  upstream.addEventListener("message", (event) => {
    try { server.send(event.data); }
    catch { shutdown(1011, "client send failed"); }
  });

  server.addEventListener("close", (event) => shutdown(event.code || 1000, event.reason || "client closed"));
  upstream.addEventListener("close", (event) => shutdown(event.code || 1000, event.reason || "BSD closed"));
  server.addEventListener("error", () => shutdown(1011, "client socket error"));
  upstream.addEventListener("error", () => shutdown(1011, "BSD socket error"));

  return new Response(null, { status: 101, webSocket: client });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/api/live-centre") return liveCentre(request, env);
    return app.fetch(request, env, ctx);
  },
};
