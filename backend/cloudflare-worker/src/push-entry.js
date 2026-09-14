import webpush from "web-push";
import app from "./app-v2-entry.js";

const SITE_URL = "https://acchtt.github.io/football-v2/";
const BSD_BASE = "https://sports.bzzoiro.com/api/v2";
const encoder = new TextEncoder();

function configuredOrigins(env) {
  return String(env.ALLOWED_ORIGIN || "https://acchtt.github.io").split(",").map(v => v.trim()).filter(Boolean);
}
function allowedOrigin(env, request) {
  const origins = configuredOrigins(env);
  const origin = request.headers.get("Origin");
  if (!origin) return origins[0] || "*";
  return origins.includes(origin) ? origin : null;
}
function cors(env, request) {
  const origin = allowedOrigin(env, request);
  return {
    ...(origin ? { "Access-Control-Allow-Origin": origin } : {}),
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Cache-Control": "no-store",
    Vary: "Origin",
  };
}
function json(data, status, env, request) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...cors(env, request) },
  });
}
function internalJson(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json; charset=utf-8" } });
}
function cleanMatches(values) {
  return [...new Set((Array.isArray(values) ? values : []).map(v => String(v)).filter(v => /^\d+$/.test(v)))].slice(0, 100);
}
function cleanSettings(value = {}) {
  return {
    kickoff: value.kickoff !== false,
    goal: value.goal !== false,
    ht: value.ht !== false,
    ft: value.ft !== false,
  };
}
function cleanSubscription(value) {
  const endpoint = String(value?.endpoint || "").trim();
  const p256dh = String(value?.keys?.p256dh || "").trim();
  const auth = String(value?.keys?.auth || "").trim();
  if (!/^https:\/\//i.test(endpoint) || !p256dh || !auth) return null;
  return {
    endpoint,
    expirationTime: value?.expirationTime ?? null,
    keys: { p256dh, auth },
  };
}
async function endpointKey(endpoint) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(String(endpoint)));
  const hex = [...new Uint8Array(digest)].map(v => v.toString(16).padStart(2, "0")).join("");
  return `sub:${hex}`;
}

export class PushRegistry {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const body = request.method === "POST" ? await request.json().catch(() => ({})) : {};

    if (request.method === "POST" && url.pathname === "/upsert") {
      const subscription = cleanSubscription(body.subscription);
      if (!subscription) return internalJson({ ok: false, error: "Invalid subscription" }, 400);
      const key = await endpointKey(subscription.endpoint);
      const previous = await this.state.storage.get(key);
      const record = {
        subscription,
        matches: cleanMatches(body.matches),
        settings: cleanSettings(body.settings || previous?.settings),
        client: {
          platform: String(body.client?.platform || previous?.client?.platform || "").slice(0, 120),
          userAgent: String(body.client?.userAgent || previous?.client?.userAgent || "").slice(0, 260),
        },
        createdAt: previous?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await this.state.storage.put(key, record);
      return internalJson({ ok: true, record });
    }

    if (request.method === "POST" && url.pathname === "/sync") {
      const subscription = cleanSubscription(body.subscription);
      if (!subscription) return internalJson({ ok: false, error: "Invalid subscription" }, 400);
      const key = await endpointKey(subscription.endpoint);
      const previous = await this.state.storage.get(key);
      const record = {
        subscription,
        matches: cleanMatches(body.matches),
        settings: cleanSettings(body.settings || previous?.settings),
        client: previous?.client || {},
        createdAt: previous?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await this.state.storage.put(key, record);
      return internalJson({ ok: true, record });
    }

    if (request.method === "POST" && url.pathname === "/remove") {
      const endpoint = String(body.endpoint || body.subscription?.endpoint || "").trim();
      if (!endpoint) return internalJson({ ok: false, error: "endpoint required" }, 400);
      await this.state.storage.delete(await endpointKey(endpoint));
      return internalJson({ ok: true });
    }

    if (request.method === "POST" && url.pathname === "/get") {
      const endpoint = String(body.endpoint || "").trim();
      if (!endpoint) return internalJson({ ok: false, error: "endpoint required" }, 400);
      const record = await this.state.storage.get(await endpointKey(endpoint));
      return internalJson({ ok: true, record: record || null });
    }

    if (request.method === "POST" && url.pathname === "/followed-ids") {
      const records = await this.state.storage.list({ prefix: "sub:" });
      const ids = new Set();
      for (const record of records.values()) for (const id of cleanMatches(record?.matches)) ids.add(id);
      return internalJson({ ok: true, ids: [...ids] });
    }

    if (request.method === "POST" && url.pathname === "/subscribers") {
      const matchId = String(body.matchId || "");
      const kind = String(body.kind || "");
      const records = await this.state.storage.list({ prefix: "sub:" });
      const subscribers = [];
      for (const record of records.values()) {
        if (!cleanMatches(record?.matches).includes(matchId)) continue;
        if (kind && record?.settings?.[kind] === false) continue;
        if (cleanSubscription(record?.subscription)) subscribers.push(record);
      }
      return internalJson({ ok: true, subscribers });
    }

    if (request.method === "POST" && url.pathname === "/snapshot/get") {
      const id = String(body.id || "");
      const snapshot = id ? await this.state.storage.get(`event:${id}`) : null;
      return internalJson({ ok: true, snapshot: snapshot || null });
    }

    if (request.method === "POST" && url.pathname === "/snapshot/put") {
      const id = String(body.id || "");
      if (!/^\d+$/.test(id) || !body.snapshot) return internalJson({ ok: false, error: "Invalid snapshot" }, 400);
      await this.state.storage.put(`event:${id}`, body.snapshot);
      return internalJson({ ok: true });
    }

    return internalJson({ ok: false, error: "Not found" }, 404);
  }
}

function registryStub(env) {
  if (!env.PUSH_REGISTRY) throw new Error("PUSH_REGISTRY binding missing");
  return env.PUSH_REGISTRY.get(env.PUSH_REGISTRY.idFromName("global"));
}
async function registryCall(env, path, body = {}) {
  const response = await registryStub(env).fetch(`https://push-registry.internal${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || data?.ok === false) throw new Error(data?.error || `Push registry HTTP ${response.status}`);
  return data;
}
function configureWebPush(env) {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) throw new Error("VAPID keys are not configured");
  webpush.setVapidDetails(env.VAPID_SUBJECT || SITE_URL, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
}
async function sendPush(env, record, payload) {
  configureWebPush(env);
  try {
    await webpush.sendNotification(record.subscription, JSON.stringify(payload), {
      TTL: 1800,
      urgency: "high",
      contentEncoding: "aes128gcm",
      topic: String(payload.tag || "sliptrace").replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 32),
    });
    return { ok: true };
  } catch (error) {
    const status = Number(error?.statusCode || error?.status || 0);
    if (status === 404 || status === 410) {
      await registryCall(env, "/remove", { endpoint: record.subscription.endpoint }).catch(() => {});
      return { ok: false, expired: true, status };
    }
    throw error;
  }
}

async function handlePushConfig(request, env) {
  const enabled = !!(env.PUSH_REGISTRY && env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);
  return json({
    ok: true,
    enabled,
    vapidPublicKey: enabled ? env.VAPID_PUBLIC_KEY : null,
    features: { kickoff: true, goal: true, halfTime: true, fullTime: true, test: true },
  }, 200, env, request);
}
async function readBody(request) {
  const size = Number(request.headers.get("Content-Length") || 0);
  if (size > 32_000) throw new Error("Request too large");
  return request.json().catch(() => ({}));
}
async function handleSubscribe(request, env, mode = "upsert") {
  const body = await readBody(request);
  const subscription = cleanSubscription(body.subscription);
  if (!subscription) return json({ ok: false, error: "Invalid PushSubscription" }, 400, env, request);
  const result = await registryCall(env, mode === "sync" ? "/sync" : "/upsert", {
    subscription,
    matches: cleanMatches(body.matches),
    settings: cleanSettings(body.settings),
    client: body.client || {},
  });
  return json({ ok: true, matches: result.record?.matches || [] }, 200, env, request);
}
async function handleUnsubscribe(request, env) {
  const body = await readBody(request);
  const endpoint = String(body.endpoint || body.subscription?.endpoint || "").trim();
  if (!endpoint) return json({ ok: false, error: "endpoint required" }, 400, env, request);
  await registryCall(env, "/remove", { endpoint });
  return json({ ok: true }, 200, env, request);
}
async function handleTest(request, env) {
  const body = await readBody(request);
  const endpoint = String(body.endpoint || "").trim();
  if (!endpoint) return json({ ok: false, error: "endpoint required" }, 400, env, request);
  const { record } = await registryCall(env, "/get", { endpoint });
  if (!record) return json({ ok: false, error: "Push subscription is not registered" }, 404, env, request);
  await sendPush(env, record, {
    title: "SlipTrace push test",
    body: "Background notifications are connected on this device.",
    type: "test",
    tag: "sliptrace-test",
    url: `${SITE_URL}#today`,
    timestamp: Date.now(),
  });
  return json({ ok: true, delivered: true }, 200, env, request);
}

function listRows(payload) {
  const value = payload?.data ?? payload;
  if (Array.isArray(value)) return value;
  for (const key of ["results", "events", "matches"]) if (Array.isArray(value?.[key])) return value[key];
  return [];
}
function pick(...values) { return values.find(v => v !== undefined && v !== null && v !== "") ?? null; }
function number(value) { const n = Number(value); return Number.isFinite(n) ? n : null; }
function eventId(event) { const id = pick(event?.id, event?.event_id); return /^\d+$/.test(String(id || "")) ? String(id) : null; }
function teamName(event, side) {
  const team = event?.[`${side}_team`] || event?.[side] || {};
  return String(pick(team?.name, team?.short_name, event?.[`${side}_team_name`], event?.[`${side}_name`], typeof event?.[side] === "string" ? event[side] : null, side === "home" ? "Home" : "Away"));
}
function score(event) {
  const value = event?.score || {};
  return { home: number(pick(event?.home_score, value?.home, value?.home_score)), away: number(pick(event?.away_score, value?.away, value?.away_score)) };
}
function status(event) { return String(pick(event?.status, event?.time?.status, "")).toLowerCase().replace(/[\s-]+/g, "_"); }
function period(event) { return String(pick(event?.time?.period, event?.period, event?.state, "")).toLowerCase().replace(/[\s-]+/g, "_"); }
function isFinishedSnapshot(value) { return ["ft", "finished", "ended", "complete", "completed", "full_time"].includes(value?.status) || ["ft", "full_time"].includes(value?.period); }
function isHalfSnapshot(value) { return ["ht", "half_time", "halftime"].includes(value?.status) || ["ht", "half_time", "halftime"].includes(value?.period); }
function isLiveSnapshot(value) {
  return ["live", "in_progress", "inprogress", "playing", "1h", "2h", "first_half", "second_half"].includes(value?.status) || ["1h", "2h", "first_half", "second_half"].includes(value?.period);
}
function snapshot(event) {
  const sc = score(event);
  return {
    id: eventId(event),
    home: teamName(event, "home"),
    away: teamName(event, "away"),
    homeScore: sc.home,
    awayScore: sc.away,
    status: status(event),
    period: period(event),
    kickoff: String(pick(event?.event_date, event?.kickoff, event?.kickoff_at, event?.date, "")),
    minute: number(pick(event?.time?.minute, event?.minute, event?.current_minute)),
    seenAt: Date.now(),
  };
}
function transition(previous, current) {
  if (!previous || !current) return null;
  const id = current.id;
  const scoreText = current.homeScore !== null && current.awayScore !== null ? `${current.homeScore}–${current.awayScore}` : "";
  const body = `${current.home}${scoreText ? ` ${scoreText} ` : " vs "}${current.away}`;
  if (!isFinishedSnapshot(previous) && isFinishedSnapshot(current)) return { kind: "ft", title: `FT · ${body}`, body: "Full time", tag: `m${id}-ft` };
  const oldTotal = previous.homeScore !== null && previous.awayScore !== null ? previous.homeScore + previous.awayScore : null;
  const newTotal = current.homeScore !== null && current.awayScore !== null ? current.homeScore + current.awayScore : null;
  if (oldTotal !== null && newTotal !== null && newTotal > oldTotal) return { kind: "goal", title: `GOAL · ${scoreText}`, body: `${current.home} vs ${current.away}`, tag: `m${id}-goal` };
  if (!isHalfSnapshot(previous) && isHalfSnapshot(current)) return { kind: "ht", title: `HT · ${scoreText || "Half time"}`, body: `${current.home} vs ${current.away}`, tag: `m${id}-ht` };
  if (!isLiveSnapshot(previous) && isLiveSnapshot(current)) return { kind: "kickoff", title: "Kickoff", body: `${current.home} vs ${current.away}`, tag: `m${id}-ko` };
  return null;
}
function ictDate(offset = 0) {
  const date = new Date(Date.now() + offset * 86400000);
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const get = type => parts.find(v => v.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}
async function bsd(env, path, query = new URLSearchParams()) {
  if (!env.BSD_API_TOKEN) throw new Error("BSD_API_TOKEN missing");
  const base = String(env.BSD_API_BASE_URL || BSD_BASE).replace(/\/$/, "");
  const url = new URL(`${base}${path}`);
  for (const [key, value] of query) url.searchParams.append(key, value);
  const response = await fetch(url, { headers: { Authorization: `Token ${env.BSD_API_TOKEN}`, Accept: "application/json" } });
  if (!response.ok) throw new Error(`BSD HTTP ${response.status}`);
  return response.json();
}
async function handleScheduledPush(env) {
  if (!env.PUSH_REGISTRY || !env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY || !env.BSD_API_TOKEN) return;
  const { ids } = await registryCall(env, "/followed-ids");
  const followed = new Set(cleanMatches(ids));
  if (!followed.size) return;

  const dateFrom = ictDate(0), dateTo = ictDate(1);
  const [livePayload, eventsPayload] = await Promise.all([
    bsd(env, "/events/live/").catch(() => []),
    bsd(env, "/events/", new URLSearchParams({ date_from: dateFrom, date_to: dateTo, limit: "300" })).catch(() => []),
  ]);
  const map = new Map();
  for (const event of listRows(eventsPayload)) { const id = eventId(event); if (id && followed.has(id)) map.set(id, event); }
  for (const event of listRows(livePayload)) { const id = eventId(event); if (id && followed.has(id)) map.set(id, event); }

  for (const [id, event] of map) {
    const current = snapshot(event);
    const { snapshot: previous } = await registryCall(env, "/snapshot/get", { id });
    await registryCall(env, "/snapshot/put", { id, snapshot: current });
    const change = transition(previous, current);
    if (!change) continue;
    const { subscribers } = await registryCall(env, "/subscribers", { matchId: id, kind: change.kind });
    const payload = {
      title: change.title,
      body: change.body,
      type: change.kind,
      tag: change.tag,
      matchId: id,
      url: `${SITE_URL}#match/${id}`,
      timestamp: Date.now(),
    };
    await Promise.allSettled((subscribers || []).map(record => sendPush(env, record, payload)));
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/push/")) {
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(env, request) });
      if (!allowedOrigin(env, request)) return json({ ok: false, error: "Origin not allowed" }, 403, env, request);
      try {
        if (request.method === "GET" && url.pathname === "/api/push/config") return handlePushConfig(request, env);
        if (request.method === "POST" && url.pathname === "/api/push/subscribe") return handleSubscribe(request, env, "upsert");
        if (request.method === "POST" && url.pathname === "/api/push/sync") return handleSubscribe(request, env, "sync");
        if (request.method === "POST" && url.pathname === "/api/push/unsubscribe") return handleUnsubscribe(request, env);
        if (request.method === "POST" && url.pathname === "/api/push/test") return handleTest(request, env);
        return json({ ok: false, error: "Push endpoint not found" }, 404, env, request);
      } catch (error) {
        console.error("Push API error", error);
        return json({ ok: false, error: error?.message || String(error) }, 500, env, request);
      }
    }
    return app.fetch(request, env, ctx);
  },

  async scheduled(controller, env, ctx) {
    ctx.waitUntil(handleScheduledPush(env).catch(error => console.error("Scheduled push failed", error)));
  },
};
