/* Branch-only preview data adapter.
 * Dedicated Cloudflare demo host: real-time same-origin, read-only GET API.
 * Third-party githack preview: authentic public GitHub Actions snapshot only,
 * distinctly marked NOT LIVE. Production GitHub Pages is never modified. */
(() => {
  "use strict";
  const host = location.hostname.toLowerCase();
  const isWorker = /^football-v2-liquid-glass-demo\.[a-z0-9-]+\.workers\.dev$/.test(host);
  const isStatic = (host === "rawcdn.githack.com" || host === "raw.githack.com")
    && location.pathname.includes("/acchtt/football-v2/")
    && location.pathname.includes("/pages/");
  if (!isWorker && !isStatic) return;

  const sourceOrigin = "https://football-v2.acchtt.workers.dev";
  const snapshotRoot = "https://raw.githubusercontent.com/acchtt/football-v2/refs/heads/demo/liquid-glass/pages/demo-preview-data/";
  const nativeFetch = window.fetch.bind(window);
  const today = (offset = 0) => {
    const date = new Date(Date.now() + 7 * 3600000);
    date.setUTCDate(date.getUTCDate() + offset);
    return date.toISOString().slice(0, 10);
  };
  const readOnly = () => Promise.resolve(new Response(JSON.stringify({
    ok:false, error:"This preview is read-only; production scores were not changed."
  }), {status:405,headers:{"Content-Type":"application/json"}}));
  function snapshotAsset(url) {
    if (url.pathname === "/api/dashboard-data") return "dashboard.json";
    if (url.pathname === "/api/bsd/live") return "live.json";
    if (url.pathname === "/api/bsd/events") {
      const date = url.searchParams.get("date_from");
      return /^\d{4}-\d{2}-\d{2}$/.test(date || "") ? "events/" + date + ".json" : null;
    }
    if (url.pathname === "/api/soccerway/board") {
      const offset = Number(url.searchParams.get("day") || 0);
      return Number.isInteger(offset) && Math.abs(offset) <= 5
        ? "soccerway/" + today(offset) + ".json" : null;
    }
    return null; // No invented data for match details or other endpoints.
  }
  function makeNotice() {
    if (!isStatic || document.getElementById("arcxiSnapshotLabel")) return;
    const n = document.createElement("div");
    n.id = "arcxiSnapshotLabel";
    n.setAttribute("role","status");
    n.style.cssText = [
      "position:fixed","bottom:14px","left:14px","z-index:15",
      "max-width:min(85vw,360px)","padding:8px 11px",
      "border:1px solid rgba(255,255,255,.32)","border-radius:10px",
      "background:rgba(10,10,18,.83)","backdrop-filter:blur(8px)",
      "color:#f3edf5","font:600 11px/1.4 system-ui,sans-serif",
      "pointer-events:none","box-shadow:0 6px 18px rgba(0,0,0,.28)"
    ].join(";");
    n.textContent = "ARC XI demo · real-data snapshot · NOT LIVE";
    document.body.appendChild(n);
    nativeFetch(snapshotRoot + "manifest.json?ts=" + Date.now(), {cache:"no-store",credentials:"omit"})
      .then(r => {if (!r.ok) throw Error("No snapshot");return r.json();})
      .then(m => {
        const captured = new Date(m.capturedAt);
        if (Number.isFinite(captured.getTime())) {
          const time = new Intl.DateTimeFormat("en-GB", {
            timeZone:"Asia/Ho_Chi_Minh",day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"
          }).format(captured);
          n.textContent = "ARC XI demo · snapshot " + time + " ICT · NOT LIVE";
        }
      }).catch(() => {n.textContent="ARC XI demo · snapshot unavailable · NOT LIVE";});
  }
  if (isStatic) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", makeNotice, {once:true});
    else makeNotice();
    window.__ARCXI_DEMO_SNAPSHOT__ = true;
  } else window.__ARCXI_DEMO_READ_ONLY__ = true;

  window.fetch = function demoPreviewFetch(input, init) {
    let url;
    try { url = new URL(typeof input === "string" ? input : input.url, location.href); }
    catch { return nativeFetch(input,init); }
    if (url.origin !== sourceOrigin) return nativeFetch(input,init);
    const method = String(init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
    if (method !== "GET") return readOnly();
    if (isWorker) {
      const target = location.origin + url.pathname + url.search;
      return input instanceof Request ? nativeFetch(new Request(target, input),init) : nativeFetch(target,init);
    }
    const file = snapshotAsset(url);
    if (!file) return Promise.resolve(new Response(JSON.stringify({
      ok:false,error:"This endpoint is unavailable in the read-only snapshot. Use the live demo host."
    }),{status:503,headers:{"Content-Type":"application/json"}}));
    // GitHub raw public files send ACAO: * for credential-free GET; no OPTIONS preflight.
    return nativeFetch(snapshotRoot + file + "?ts=" + Math.floor(Date.now()/60000),
      {cache:"no-store",credentials:"omit",signal:init?.signal});
  };
})();
