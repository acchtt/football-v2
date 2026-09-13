import app from "./stable-entry.js";

const LINEUPS_TTL_MS = 30000;
const LINEUPS_STALE_MS = 10 * 60 * 1000;
const cache = new Map();
const inFlight = new Map();

function allowedOrigin(env, request) {
  const allowed = String(env.ALLOWED_ORIGIN || "https://acchtt.github.io")
    .split(",").map((x) => x.trim()).filter(Boolean);
  const origin = request.headers.get("Origin");
  if (!origin) return allowed[0] || "*";
  return allowed.includes(origin) ? origin : null;
}

function cors(env, request) {
  const accepted = allowedOrigin(env, request);
  return {
    ...(accepted ? { "Access-Control-Allow-Origin": accepted } : {}),
    "Access-Control-Allow-Methods": "GET,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Cache-Control": "no-store, max-age=0",
    Vary: "Origin",
  };
}

function json(data, status, env, request) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...cors(env, request) },
  });
}

function eventId(url) {
  const value = String(url.searchParams.get("event_id") || "").trim();
  return /^[A-Za-z0-9_-]+$/.test(value) ? value : null;
}

function isObj(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function key(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function first(obj, names) {
  if (!isObj(obj)) return undefined;
  const wanted = new Set(names.map(key));
  for (const [k, value] of Object.entries(obj)) if (wanted.has(key(k))) return value;
  return undefined;
}

function stringValue(value) {
  if (value === undefined || value === null) return "";
  if (typeof value === "string" || typeof value === "number") return String(value).trim();
  if (isObj(value)) return stringValue(value.name ?? value.short_name ?? value.label ?? value.value);
  return "";
}

function boolValue(value) {
  if (typeof value === "boolean") return value;
  if (value === 1 || value === "1") return true;
  if (value === 0 || value === "0") return false;
  const text = String(value ?? "").toLowerCase();
  if (["true", "yes", "confirmed", "official"].includes(text)) return true;
  if (["false", "no"].includes(text)) return false;
  return undefined;
}

function playerName(item) {
  if (typeof item === "string") return item.trim();
  if (!isObj(item)) return "";
  const p = isObj(item.player) ? item.player : item;
  return stringValue(p.name ?? p.full_name ?? p.short_name ?? p.player_name ?? item.player_name ?? item.name);
}

function playerStarter(item) {
  if (!isObj(item)) return undefined;
  for (const name of ["starter", "is_starter", "starting", "is_starting", "first_team"]) {
    const value = first(item, [name]);
    if (value !== undefined) return boolValue(value);
  }
  for (const name of ["substitute", "is_substitute", "bench"]) {
    const value = first(item, [name]);
    if (value !== undefined) {
      const b = boolValue(value);
      if (b !== undefined) return !b;
    }
  }
  const role = stringValue(first(item, ["role", "type", "lineup_type"])).toLowerCase();
  if (role.includes("start")) return true;
  if (role.includes("sub") || role.includes("bench")) return false;
  return undefined;
}

function normalizePlayer(item) {
  const name = playerName(item);
  if (!name) return null;
  const p = isObj(item?.player) ? item.player : (isObj(item) ? item : {});
  const rawId = p.id ?? p.player_id ?? item?.player_id;
  const id = rawId === undefined || rawId === null ? null : String(rawId);
  const number = stringValue(item?.shirt_number ?? item?.jersey_number ?? item?.number ?? p.shirt_number ?? p.jersey_number ?? p.number);
  const position = stringValue(item?.position ?? item?.pos ?? p.position ?? p.position_short ?? p.position_name);
  return { id, name, number, position, starter: playerStarter(item) };
}

function playerList(value) {
  if (!Array.isArray(value)) return [];
  return value.map(normalizePlayer).filter(Boolean);
}

function findArray(root, aliases, depth = 0, seen = new Set()) {
  if (!root || depth > 5 || seen.has(root)) return null;
  if (typeof root === "object") seen.add(root);
  if (isObj(root)) {
    const direct = first(root, aliases);
    if (Array.isArray(direct)) return direct;
    for (const wrapper of ["lineups", "lineup", "data", "result", "results", "squads", "teams"]) {
      if (root[wrapper]) {
        const found = findArray(root[wrapper], aliases, depth + 1, seen);
        if (found) return found;
      }
    }
  }
  return null;
}

function sideMarker(item) {
  if (!isObj(item)) return "";
  if (boolValue(item.is_home ?? item.home) === true) return "home";
  if (boolValue(item.is_away ?? item.away) === true) return "away";
  const raw = stringValue(item.side ?? item.team_side ?? item.home_away ?? item.location ?? item.designation ?? item.type).toLowerCase();
  if (/\b(home|local)\b/.test(raw)) return "home";
  if (/\b(away|visitor)\b/.test(raw)) return "away";
  return "";
}

function looksLikeSide(value) {
  if (Array.isArray(value)) return value.some((x) => playerName(x));
  if (!isObj(value)) return false;
  return Boolean(
    stringValue(first(value, ["formation", "formation_name", "shape"])) ||
    findArray(value, ["starting_xi", "starters", "starting", "players", "lineup", "substitutes", "bench"], 0)
  );
}

function sideContainer(root, side) {
  if (!root) return null;
  const aliases = [side, `${side}_team`, `${side}_lineup`, `${side}_players`, `${side}_xi`, `${side}_squad`];
  if (isObj(root)) {
    const direct = first(root, aliases);
    if (looksLikeSide(direct)) return direct;
    for (const wrapper of ["lineups", "lineup", "data", "result", "results", "teams", "squads"]) {
      const bucket = root[wrapper];
      if (!bucket) continue;
      if (isObj(bucket)) {
        const candidate = first(bucket, aliases);
        if (looksLikeSide(candidate)) return candidate;
      }
      if (Array.isArray(bucket)) {
        const marked = bucket.find((item) => sideMarker(item) === side && looksLikeSide(item));
        if (marked) return marked;
        const sideLike = bucket.filter(looksLikeSide);
        if (sideLike.length === 2) return side === "home" ? sideLike[0] : sideLike[1];
      }
    }
  }
  if (Array.isArray(root)) {
    const marked = root.find((item) => sideMarker(item) === side && looksLikeSide(item));
    if (marked) return marked;
    const sideLike = root.filter(looksLikeSide);
    if (sideLike.length === 2) return side === "home" ? sideLike[0] : sideLike[1];
  }
  return null;
}

function formationFor(root, container, side) {
  return stringValue(
    first(container, ["formation", "formation_name", "shape", "system"]) ??
    first(root, [`${side}_formation`, `${side}Formation`, `${side}_shape`, `${side}_system`])
  );
}

function sidePlayers(root, container, side) {
  const starterAliases = ["starting_xi", "startingXI", "starters", "starting", "first_eleven", "lineup"];
  const benchAliases = ["substitutes", "subs", "bench", "substitute_players", "reserves"];

  let startersRaw = null;
  let benchRaw = null;
  let allRaw = null;

  if (Array.isArray(container)) allRaw = container;
  else if (isObj(container)) {
    startersRaw = findArray(container, starterAliases);
    benchRaw = findArray(container, benchAliases);
    allRaw = findArray(container, ["players", "squad", "members"]);
  }

  if (!startersRaw) startersRaw = findArray(root, starterAliases.flatMap((name) => [`${side}_${name}`, `${side}${name}`]));
  if (!benchRaw) benchRaw = findArray(root, benchAliases.flatMap((name) => [`${side}_${name}`, `${side}${name}`]));
  if (!allRaw) allRaw = findArray(root, [`${side}_players`, `${side}Players`, `${side}_squad`, `${side}Squad`]);

  let starters = playerList(startersRaw);
  let substitutes = playerList(benchRaw);
  const all = playerList(allRaw);

  if (!starters.length && all.length) {
    const marked = all.some((p) => p.starter !== undefined);
    starters = marked ? all.filter((p) => p.starter !== false) : all.slice(0, 11);
    if (!substitutes.length) substitutes = marked ? all.filter((p) => p.starter === false) : all.slice(11);
  }

  if (!starters.length && !substitutes.length) {
    const global = findArray(root, ["players", "lineups", "lineup"]);
    if (global) {
      const sideRows = global.filter((item) => sideMarker(item) === side);
      const normalized = playerList(sideRows);
      if (normalized.length) {
        const marked = normalized.some((p) => p.starter !== undefined);
        starters = marked ? normalized.filter((p) => p.starter !== false) : normalized.slice(0, 11);
        substitutes = marked ? normalized.filter((p) => p.starter === false) : normalized.slice(11);
      }
    }
  }

  return { starters: starters.slice(0, 11), substitutes: substitutes.slice(0, 18) };
}

function lineupStatus(root) {
  const source = stringValue(first(root, ["lineup_type", "source", "type", "status"])).toLowerCase();
  const confirmed = boolValue(first(root, ["confirmed", "is_confirmed", "lineup_confirmed", "official"]));
  const predicted = boolValue(first(root, ["predicted", "is_predicted", "ai_predicted"]));
  if (confirmed === true || source.includes("confirm") || source.includes("official")) return "confirmed";
  if (predicted === true || source.includes("pred")) return "predicted";
  return "unknown";
}

function normalizeLineups(raw) {
  const homeContainer = sideContainer(raw, "home");
  const awayContainer = sideContainer(raw, "away");
  const homePlayers = sidePlayers(raw, homeContainer, "home");
  const awayPlayers = sidePlayers(raw, awayContainer, "away");
  const status = lineupStatus(raw);
  const home = { formation: formationFor(raw, homeContainer, "home"), ...homePlayers };
  const away = { formation: formationFor(raw, awayContainer, "away"), ...awayPlayers };
  return {
    status,
    available: Boolean(home.starters.length || away.starters.length || home.substitutes.length || away.substitutes.length),
    home,
    away,
  };
}

async function bsdLineups(env, id) {
  if (!env.BSD_API_TOKEN) throw new Error("BSD_API_TOKEN missing");
  const base = String(env.BSD_API_BASE_URL || "https://sports.bzzoiro.com/api/v2").replace(/\/$/, "");
  const response = await fetch(`${base}/events/${encodeURIComponent(id)}/lineups/`, {
    headers: { Authorization: `Token ${env.BSD_API_TOKEN}`, Accept: "application/json" },
  });
  const body = await response.text();
  let payload = null;
  try { payload = body ? JSON.parse(body) : null; } catch {}
  if (!response.ok) throw new Error(`BSD HTTP ${response.status}: ${body.slice(0, 240)}`);
  return payload;
}

async function lineups(env, id) {
  const now = Date.now();
  const cached = cache.get(id);
  if (cached && now - cached.at < LINEUPS_TTL_MS) return { ...cached.value, cached: true };
  if (inFlight.has(id)) return inFlight.get(id);

  const task = bsdLineups(env, id).then((lineups) => {
    const normalized = normalizeLineups(lineups);
    const value = { ok: true, eventId: id, lineups, normalized, cached: false, generatedAt: new Date().toISOString() };
    cache.set(id, { at: Date.now(), value });
    if (cache.size > 80) {
      const oldest = [...cache.entries()].sort((a, b) => a[1].at - b[1].at).slice(0, cache.size - 80);
      for (const [cacheKey] of oldest) cache.delete(cacheKey);
    }
    return value;
  }).finally(() => inFlight.delete(id));

  inFlight.set(id, task);
  return task;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS" && url.pathname === "/api/match-lineups") {
      return new Response(null, { status: 204, headers: cors(env, request) });
    }

    if (request.method === "GET" && url.pathname === "/api/match-lineups") {
      const id = eventId(url);
      if (!id) return json({ ok: false, error: "valid event_id is required" }, 400, env, request);
      try {
        return json(await lineups(env, id), 200, env, request);
      } catch (error) {
        const cached = cache.get(id);
        if (cached && Date.now() - cached.at < LINEUPS_STALE_MS) {
          return json({ ...cached.value, cached: true, degraded: true, error: error instanceof Error ? error.message : String(error) }, 200, env, request);
        }
        return json({ ok: false, eventId: id, error: error instanceof Error ? error.message : String(error) }, 502, env, request);
      }
    }

    return app.fetch(request, env, ctx);
  },
};
