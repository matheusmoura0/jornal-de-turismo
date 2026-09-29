import { siteConfig } from "./config.js";
import { readCachedHubArticles, requestHubArticles, saveHubArticles } from "./hub-client.js";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const year = $("#year");
if (year) year.textContent = new Date().getFullYear();

const editionDate = $("#edition-date");
if (editionDate) {
  editionDate.textContent = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long", day: "2-digit", month: "long", year: "numeric"
  }).format(new Date());
}

const menuButton = $(".menu-button");
const mainNav = $("#main-nav");
menuButton?.addEventListener("click", () => {
  const open = mainNav?.classList.toggle("open") ?? false;
  menuButton.setAttribute("aria-expanded", String(open));
});

$$("#main-nav a").forEach((link) => {
  link.addEventListener("click", () => {
    mainNav?.classList.remove("open");
    menuButton?.setAttribute("aria-expanded", "false");
  });
});

const newsletterForm = $("#newsletter-form");
newsletterForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  const feedback = $("#newsletter-feedback");
  if (feedback) feedback.textContent = "Obrigado. A lista de leitura será ativada em breve.";
  newsletterForm.reset();
});

const grid = $("#news-grid");
const latest = $(".latest");
const sectionHeading = $(".latest .section-heading");
const hubLabel = $("[data-hub-label]");
const hubStatus = $("[data-hub-state]");

const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
}[character]));

const safeUrl = (value) => {
  try {
    const url = new URL(value, window.location.origin);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "#";
  } catch {
    return "#";
  }
};

const articleList = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.articles)) return payload.articles;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
};

const titleOf = (article) => article.title || article.headline || article.name || "Matéria da redação";
const descriptionOf = (article) => article.description || article.excerpt || article.summary || "Leia a matéria completa no Correio da Manhã.";
const categoryOf = (article) => article.category || article.section || siteConfig.defaultCategory || "Atualidades";
const dateOf = (article) => article.published_at || article.publishedAt || article.created_at || article.updated_at;
const hrefOf = (article) => safeUrl(article.canonical_url || article.article_url || article.source_url || article.url || "#");
const imageOf = (article) => article.image_url || article.image || "";

const formattedDate = (date) => {
  if (!date) return "Atualizado agora";
  const parsed = new Date(date);
  return Number.isNaN(parsed.getTime())
    ? "Atualizado agora"
    : new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(parsed);
};

const articleCard = (article, index = 0) => {
  const image = imageOf(article);
  const imageMarkup = image
    ? `<img src="${escapeHtml(safeUrl(image))}" alt="" loading="lazy" />`
    : "";
  return `<article class="news-card hub-card ${index === 0 ? "featured-card" : ""}">
    ${imageMarkup}
    <p class="eyebrow">${escapeHtml(categoryOf(article))}</p>
    <h3><a href="${escapeHtml(hrefOf(article))}" target="_blank" rel="noopener">${escapeHtml(titleOf(article))}</a></h3>
    <p>${escapeHtml(descriptionOf(article))}</p>
    <span class="card-meta">${escapeHtml(formattedDate(dateOf(article)))}</span>
    <span class="article-source">Correio da Manhã</span>
  </article>`;
};

const sectionCard = (article) => {
  const image = imageOf(article);
  const imageMarkup = image
    ? `<img src="${escapeHtml(safeUrl(image))}" alt="" loading="lazy" />`
    : "";
  return `<article class="section-card">
    ${imageMarkup}
    <div>
      <p class="eyebrow">${escapeHtml(categoryOf(article))}</p>
      <h3><a href="${escapeHtml(hrefOf(article))}" target="_blank" rel="noopener">${escapeHtml(titleOf(article))}</a></h3>
      <p>${escapeHtml(formattedDate(dateOf(article)))}</p>
    </div>
  </article>`;
};

let hubArticles = [];
let activeCategory = "all";
let refreshTimer;

const updateStatus = (label, loading = false) => {
  if (hubLabel) hubLabel.textContent = label;
  hubStatus?.classList.toggle("is-loading", loading);
};

const ensureHubControls = () => {
  if (!grid || !latest) return;

  const status = $("[data-hub-state]");
  if (status && !$("#hub-refresh")) {
    const tools = document.createElement("div");
    tools.className = "latest-tools";
    status.replaceWith(tools);
    tools.append(status);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "refresh-button";
    button.id = "hub-refresh";
    button.textContent = "Atualizar";
    tools.append(button);
  }

  if (!$("#category-filter")) {
    const filter = document.createElement("div");
    filter.className = "category-filter";
    filter.id = "category-filter";
    filter.setAttribute("role", "tablist");
    filter.setAttribute("aria-label", "Filtrar notícias");
    grid.before(filter);
  }

  if (!$("#hub-empty")) {
    const empty = document.createElement("div");
    empty.className = "hub-empty";
    empty.id = "hub-empty";
    empty.hidden = true;
    empty.innerHTML = '<p>Nenhuma matéria do Hub apareceu ainda.</p><button type="button" id="hub-retry" class="outline-button">Tentar novamente</button>';
    grid.after(empty);
  }

  if (!$("#category-sections")) {
    const sections = document.createElement("section");
    sections.className = "hub-sections wrap";
    sections.id = "editorias";
    sections.innerHTML = '<div class="section-heading editorial-heading"><div><p class="kicker">LEITURA POR EDITORIA</p><h2>Os assuntos em movimento</h2></div><p class="section-heading-note">Conteúdo atualizado pelo Correio da Manhã.</p></div><div id="category-sections" class="category-sections"></div>';
    latest.after(sections);
  }

  $("#hub-refresh")?.addEventListener("click", () => loadHubNews());
  $("#hub-retry")?.addEventListener("click", () => loadHubNews());
};

const renderFilters = () => {
  const filter = $("#category-filter");
  if (!filter) return;
  const categories = [...new Set(hubArticles.map(categoryOf).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "pt-BR"));
  filter.innerHTML = [
    { label: "Todas", value: "all" },
    ...categories.map((category) => ({ label: category, value: category.toLowerCase() }))
  ].map(({ label, value }) => `<button type="button" class="filter-chip ${value === activeCategory ? "active" : ""}" data-category="${escapeHtml(value)}" role="tab" aria-selected="${value === activeCategory}">${escapeHtml(label)}</button>`).join("");
  $$("[data-category]", filter).forEach((button) => {
    button.addEventListener("click", () => {
      activeCategory = button.dataset.category || "all";
      renderFilters();
      renderGrid();
    });
  });
};

const renderGrid = () => {
  if (!grid) return;
  const articles = (activeCategory === "all"
    ? hubArticles
    : hubArticles.filter((article) => categoryOf(article).toLowerCase() === activeCategory)
  ).slice(0, siteConfig.maxArticles || 12);
  grid.innerHTML = articles.map(articleCard).join("");
  const empty = $("#hub-empty");
  if (empty) empty.hidden = articles.length > 0;
};

const renderSections = () => {
  const container = $("#category-sections");
  if (!container) return;
  const categories = [...new Set(hubArticles.map(categoryOf).filter(Boolean))].slice(0, 4);
  container.innerHTML = categories.map((category) => {
    const articles = hubArticles.filter((article) => categoryOf(article) === category).slice(0, 4);
    return `<section class="category-section">
      <div class="category-section-heading"><span class="eyebrow">${escapeHtml(category)}</span><span class="category-count">${articles.length} matérias</span></div>
      <div class="category-section-grid">${articles.map(sectionCard).join("")}</div>
    </section>`;
  }).join("");
};

const updateHero = () => {
  const [lead, ...briefArticles] = hubArticles;
  if (!lead) return;
  const heroImage = $(".hero-photo img, .stage-photo img");
  const heroLabel = $(".hero-photo span, .stage-tag");
  const heroTitle = $(".hero-copy h2, .stage-copy h2");
  const heroSummary = $(".hero-copy > p:not(.eyebrow), .stage-copy > p:not(.eyebrow)");
  const heroLink = $(".hero-copy .text-link, .stage-copy .text-link");

  if (heroImage && imageOf(lead)) {
    heroImage.src = safeUrl(imageOf(lead));
    heroImage.alt = titleOf(lead);
  }
  if (heroLabel) heroLabel.textContent = categoryOf(lead);
  if (heroTitle) heroTitle.textContent = titleOf(lead);
  if (heroSummary) heroSummary.textContent = descriptionOf(lead);
  if (heroLink) {
    heroLink.href = hrefOf(lead);
    heroLink.target = "_blank";
    heroLink.rel = "noopener";
    heroLink.innerHTML = 'Ler no Correio da Manhã <span aria-hidden="true">↗</span>';
  }

  $$(".latest ~ .hub-sections").length;
  briefArticles.slice(0, 3).forEach((article, index) => {
    const card = $$(".news-card:not(.hub-card)")[index];
    if (!card) return;
    const heading = $("h3", card);
    const eyebrow = $(".eyebrow", card);
    const meta = $(".card-meta", card);
    if (heading) heading.innerHTML = `<a href="${escapeHtml(hrefOf(article))}" target="_blank" rel="noopener">${escapeHtml(titleOf(article))}</a>`;
    if (eyebrow) eyebrow.textContent = categoryOf(article);
    if (meta) meta.textContent = `Correio da Manhã · ${formattedDate(dateOf(article))}`;
  });
};

function restoreHubCache() {
  const cached = readCachedHubArticles(siteConfig.domain);
  if (!cached?.articles.length) return;
  hubArticles = cached.articles;
  activeCategory = "all";
  renderFilters();
  renderGrid();
  renderSections();
  updateHero();
  updateStatus("Última edição salva · atualizando");
}

let hubRequest = null;

function loadHubNews({ quiet = false } = {}) {
  if (!siteConfig.hubEnabled || !grid) return Promise.resolve();
  if (hubRequest) return hubRequest;
  if (!quiet) updateStatus("Buscando atualização", true);

  hubRequest = (async () => {
    try {
      const result = await requestHubArticles({ retries: 1, timeoutMs: 10000 });
      const articles = result.articles;
      if (!articles.length) {
        updateStatus(hubArticles.length
          ? "Sem matérias novas · mantendo última edição"
          : "Hub conectado, aguardando matérias");
        return;
      }

      hubArticles = articles;
      activeCategory = "all";
      if (result.source !== "stale-cache") saveHubArticles(siteConfig.domain, articles);
      renderFilters();
      renderGrid();
      renderSections();
      updateHero();

      const status = result.source === "stale-cache"
        ? "Último cache · Hub instável"
        : result.source === "edge-cache"
          ? `Atualizado recentemente pelo Hub · ${articles.length} matérias`
          : `Atualizado pelo Hub · ${articles.length} matérias`;
      updateStatus(status);
    } catch (error) {
      console.warn("Não foi possível atualizar pelo CM Hub:", error);
      updateStatus(hubArticles.length
        ? "Última edição salva · Hub indisponível"
        : "Edição local · Hub indisponível");
    } finally {
      hubStatus?.classList.remove("is-loading");
      hubRequest = null;
    }
  })();

  return hubRequest;
}

ensureHubControls();
restoreHubCache();
loadHubNews();
refreshTimer = window.setInterval(() => loadHubNews({ quiet: true }), siteConfig.refreshIntervalMs || 300000);
window.addEventListener("focus", () => loadHubNews({ quiet: true }));
