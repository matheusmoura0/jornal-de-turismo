const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function articleArray(payload) {
  const candidates = [
    payload,
    payload?.articles,
    payload?.data,
    payload?.data?.articles,
    payload?.data?.data,
    payload?.data?.items,
    payload?.items,
    payload?.results
  ];
  const list = candidates.find(Array.isArray);
  return list ? list.filter((item) => item && typeof item === "object" && !Array.isArray(item)) : [];
}

export function readCachedHubArticles(domain) {
  try {
    const raw = localStorage.getItem(`cm-hub-articles:v1:${domain}`);
    if (!raw) return null;
    const cached = JSON.parse(raw);
    const age = Date.now() - Number(cached.savedAt);
    const articles = articleArray(cached.articles);
    if (!Number.isFinite(age) || age < 0 || age > CACHE_TTL_MS || !articles.length) return null;
    return { articles, savedAt: Number(cached.savedAt) };
  } catch {
    return null;
  }
}

export function saveHubArticles(domain, articles) {
  try {
    localStorage.setItem(`cm-hub-articles:v1:${domain}`, JSON.stringify({
      savedAt: Date.now(),
      articles: articleArray(articles).slice(0, 100)
    }));
  } catch {
    // Storage can be disabled or full; the live response still renders normally.
  }
}

export async function requestHubArticles({ retries = 1, timeoutMs = 10000 } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch("/api/articles", {
        method: "GET",
        headers: { Accept: "application/json" },
        cache: "no-store",
        signal: controller.signal
      });
      if (!response.ok) {
        const error = new Error(`CM Hub proxy respondeu ${response.status}`);
        error.status = response.status;
        throw error;
      }
      const articles = articleArray(await response.json());
      return {
        articles,
        source: response.headers.get("X-CM-Hub-Source") || "hub"
      };
    } catch (error) {
      lastError = error;
      const retryable = !error.status || error.status === 429 || error.status >= 500;
      if (attempt >= retries || !retryable) break;
      await new Promise((resolve) => setTimeout(resolve, 400 * (2 ** attempt)));
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError || new Error("Não foi possível consultar o CM Hub");
}
