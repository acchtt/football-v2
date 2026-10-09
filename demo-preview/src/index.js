/* Branch-isolated ARC XI Liquid Glass preview.
   Public GET APIs are relayed server-side through the existing Worker binding.
   Never forward mutations or authenticated requests to production. */
const API_ORIGIN = "https://football-v2.acchtt.workers.dev";
const SOURCE_REPO = "https://raw.githubusercontent.com/acchtt/football-v2";
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json",
};
const json = (payload, status = 200) => new Response(JSON.stringify(payload), {
  status,
  headers: {"Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff"},
});
const staticPath = (pathname) => {
  let value;
  try { value = decodeURIComponent(pathname); } catch { return null; }
  if (value === "/") return "index.html";
  if (!value.startsWith("/") || value.includes("\\") || value.includes("\0")) return null;
  const components = value.slice(1).split("/");
  if (components.some(x => !x || x === "." || x === ".." || x.startsWith("."))) return null;
  if (!/^[\w\-/ .@()+]+$/.test(value.slice(1))) return null;
  return components.join("/");
};
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/__preview/status") {
      return json({ok:true, preview:true, branch:"demo/liquid-glass", commit:env.SOURCE_COMMIT || null,
        api:"same-origin read-only service binding"});
    }
    if (url.pathname.startsWith("/api/")) {
      if (request.method !== "GET") {
        return json({ok:false, error:"This demo is read-only. Production scores were not changed."}, 405);
      }
      if (!env.FOOTBALL_API) return json({ok:false,error:"Demo API service binding is unavailable."},503);
      try {
        const upstream = await env.FOOTBALL_API.fetch(new Request(API_ORIGIN + url.pathname + url.search, {
          method:"GET",headers:{"Accept":"application/json"}
        }));
        const headers = new Headers(upstream.headers);
        headers.delete("Access-Control-Allow-Origin");
        headers.delete("Access-Control-Allow-Credentials");
        headers.set("Cache-Control","no-store, max-age=0");
        headers.set("X-Content-Type-Options","nosniff");
        return new Response(upstream.body, {status:upstream.status,headers});
      } catch {
        return json({ok:false,error:"Demo API connection failed. Retry shortly."},502);
      }
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed", {status:405,headers:{"Allow":"GET, HEAD"}});
    }
    const file = staticPath(url.pathname);
    const sha = String(env.SOURCE_COMMIT || "");
    if (!file || !/^[a-f0-9]{40}$/.test(sha)) {
      return new Response("Preview asset unavailable", {status:404});
    }
    const raw = SOURCE_REPO + "/" + sha + "/pages/" + file.split("/").map(encodeURIComponent).join("/");
    try {
      const upstream = await fetch(raw, {cf:{cacheEverything:true,cacheTtl:180}});
      if (!upstream.ok) return new Response("Preview asset not found", {status:upstream.status === 404 ? 404 : 502});
      const ext = file.match(/\.[a-zA-Z0-9]+$/)?.[0].toLowerCase() || "";
      const headers = new Headers({
        "Content-Type": MIME[ext] || "application/octet-stream",
        "Cache-Control": file.endsWith(".html") ? "public, max-age=30" : "public, max-age=180",
        "X-Content-Type-Options":"nosniff",
        "X-ARCXI-Demo-Only":"1"
      });
      return new Response(request.method === "HEAD" ? null : upstream.body, {status:200,headers});
    } catch {
      return new Response("Demo asset host unavailable", {status:502});
    }
  }
};
