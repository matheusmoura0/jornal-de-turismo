import { siteConfig } from "./config.js";

const year = document.querySelector("#year");
if (year) year.textContent = new Date().getFullYear();
const editionDate = document.querySelector("#edition-date");
if (editionDate) {
  editionDate.textContent = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long", day: "2-digit", month: "long", year: "numeric"
  }).format(new Date());
}

const menuButton = document.querySelector(".menu-button");
const mainNav = document.querySelector("#main-nav");
menuButton?.addEventListener("click", () => {
  const open = mainNav.classList.toggle("open");
  menuButton.setAttribute("aria-expanded", String(open));
});

document.querySelectorAll("#main-nav a").forEach((link) => {
  link.addEventListener("click", () => {
    mainNav.classList.remove("open");
    menuButton?.setAttribute("aria-expanded", "false");
  });
});

const newsletterForm = document.querySelector("#newsletter-form");
newsletterForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  const feedback = document.querySelector("#newsletter-feedback");
  if (feedback) feedback.textContent = "Obrigado. A lista de leitura será ativada em breve.";
  newsletterForm.reset();
});

const grid = document.querySelector("#news-grid");
const emptyState = document.querySelector("#hub-empty");
const hubLabel = document.querySelector("[data-hub-label]");
const hubStatus = document.querySelector("[data-hub-state]");
const retryButton = document.querySelector("#hub-retry");

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

const articleCard = (article, index) => {
  const title = article.title || article.headline || article.name || "Matéria da redação";
  const description = article.description || article.excerpt || article.summary || "Leia a matéria completa no site de origem.";
  const category = article.category || article.section || "Barra";
  const date = article.published_at || article.publishedAt || article.created_at;
  const formattedDate = date ? new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(new Date(date)) : "Atualizado agora";
  const href = safeUrl(article.canonical_url || article.article_url || article.source_url || article.url || "#");
  const image = article.image_url || article.image || "";
  const imageMarkup = image ? `<img src="${escapeHtml(safeUrl(image))}" alt="" loading="lazy" />` : "";
  return `<article class="news-card hub-card ${index === 0 ? "featured-card" : ""}">
    ${imageMarkup}<p class="eyebrow">${escapeHtml(category)}</p>
    <h3><a href="${escapeHtml(href)}" target="_blank" rel="noopener">${escapeHtml(title)}</a></h3>
    <p>${escapeHtml(description)}</p><span class="card-meta">${escapeHtml(formattedDate)}</span>
  </article>`;
};

async function loadHubNews() {
  if (!siteConfig.hubEnabled || !grid) return;
  hubLabel.textContent = "Buscando atualização";
  hubStatus?.classList.add("is-loading");
  const url = new URL(siteConfig.hubEndpoint, siteConfig.hubOrigin);
  url.searchParams.set("domain", siteConfig.domain);
  url.searchParams.set("refresh", String(Date.now()));
  try {
    const response = await fetch(url, { cache: "no-store", headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(`Hub respondeu ${response.status}`);
    const articles = articleList(await response.json()).filter(Boolean).slice(0, 6);
    if (!articles.length) throw new Error("Nenhuma matéria disponível");
    grid.innerHTML = articles.map(articleCard).join("");
    emptyState.hidden = true;
    hubLabel.textContent = "Atualizado pelo Hub";
  } catch (error) {
    console.warn("Não foi possível atualizar pelo Content Hub:", error);
    hubLabel.textContent = "Edição de estreia";
  } finally {
    hubStatus?.classList.remove("is-loading");
  }
}

retryButton?.addEventListener("click", loadHubNews);
loadHubNews();
