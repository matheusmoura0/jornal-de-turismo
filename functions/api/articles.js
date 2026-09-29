const SITE_DOMAIN = "jornaldeturismo.rio.br";
const HUB_URL = "https://hub.cm.com.br/api/v1/sites/by-domain/articles";
const FRESH_TTL_SECONDS = 60;
const STALE_TTL_SECONDS = 24 * 60 * 60;

function json(body, status = 200, source = "hub", cacheControl = "no-store") {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": cacheControl,
      "X-Content-Type-Options": "nosniff",
      "X-CM-Hub-Source": source
    }
  });
}

function withSource(response, source) {
  const headers = new Headers(response.headers);
  headers.set("X-CM-Hub-Source", source);
  headers.set("Cache-Control", "no-store");
  return new Response(response.body, { status: response.status, headers });
}

export async function onRequestGet({ request }) {
  const origin = new URL(request.url).origin;
  const freshKey = new Request(`${origin}/_cm-cache/hub-articles`);
  const staleKey = new Request(`${origin}/_cm-cache/hub-articles-stale`);
  const edgeCache = globalThis.caches?.default;

  if (edgeCache) {
    try {
      const cached = await edgeCache.match(freshKey);
      if (cached) return withSource(cached, "edge-cache");
    } catch (error) {
      console.warn("CM Hub fresh-cache read failed:", error);
    }
  }

  const upstreamUrl = new URL(HUB_URL);
  upstreamUrl.searchParams.set("domain", SITE_DOMAIN);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);

  try {
    const upstream = await fetch(upstreamUrl, {
      headers: { Accept: "application/json" },
      signal: controller.signal
    });
    if (!upstream.ok) throw new Error(`CM Hub respondeu ${upstream.status}`);
    const payload = await upstream.json();
    const response = json(payload, 200, "hub", `public, max-age=${FRESH_TTL_SECONDS}`);

    if (edgeCache) {
      try {
        await edgeCache.put(freshKey, response.clone());
        await edgeCache.put(
          staleKey,
          json(payload, 200, "stale-cache", `public, max-age=${STALE_TTL_SECONDS}`)
        );
      } catch (error) {
        console.warn("CM Hub cache write failed:", error);
      }
    }
    return response;
  } catch (error) {
    console.error("CM Hub request failed:", error);
    if (edgeCache) {
      try {
        const stale = await edgeCache.match(staleKey);
        if (stale) return withSource(stale, "stale-cache");
      } catch (cacheError) {
        console.warn("CM Hub stale-cache read failed:", cacheError);
      }
    }
    return json({ articles: [], error: "hub_unavailable" }, 502, "unavailable");
  } finally {
    clearTimeout(timeout);
  }
}
