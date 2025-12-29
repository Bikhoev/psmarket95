import express from "express";
import fetch from "node-fetch";
import * as cheerio from "cheerio";

const app = express();
const PORT = process.env.PORT || 3000;

// Кеш на 30 минут
const cache = new Map();
const CACHE_TTL_MS = 1000 * 60 * 30;

const MIN_GAME_PRICE_RUB = 390;
function getRate(regionKey, basePrice) {
  const isTR = regionKey === "tr";

  if (basePrice >= 2000) return isTR ? 2.65 : 2.7;
  if (basePrice >= 1500) return isTR ? 2.8 : 2.9;
  if (basePrice >= 1000) return isTR ? 2.95 : 3.05;
  if (basePrice >= 500) return isTR ? 3.2 : 3.25;
  if (basePrice >= 250) return isTR ? 3.65 : 3.7;
  if (basePrice >= 100) return isTR ? 4.9 : 5.0;
  return isTR ? 6.4 : 6.5;
}

function normalizeNumber(str) {
  const s = (str || "")
    .replace(/\u00A0/g, " ")
    .replace(/[^\d.,\s]/g, "")
    .trim();

  if (!s) return NaN;

  if (s.includes(".") && s.includes(",")) {
    return parseFloat(s.replace(/\./g, "").replace(",", "."));
  }
  if (s.includes(",")) {
    return parseFloat(s.replace(/\s/g, "").replace(",", "."));
  }
  return parseFloat(s.replace(/\s/g, ""));
}

async function fetchHtml(url) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 20000); // 20 сек

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
        "Accept-Language": "ru,en;q=0.9",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });

    if (!res.ok) throw new Error(`Fetch failed ${res.status} for ${url}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

function extractCategoryBaseFromDealsPage($) {
  const candidates = [];
  $("a[href]").each((_, a) => {
    const href = $(a).attr("href");
    if (!href) return;
    if (href.includes("/category/")) candidates.push(href);
  });

  const pick = candidates.find((h) => h.includes("/category/")) || null;
  if (!pick) return null;

  const abs = pick.startsWith("http")
    ? pick
    : `https://store.playstation.com${pick.startsWith("/") ? "" : "/"}${pick}`;

  return abs.replace(/\/\d+\/?$/, "");
}

function parseDealsGrid($) {
  // 1) пробуем старый способ (DOM)
  const items = [];
  const imgNodes = $("img").toArray().slice(0, 250);

  for (const img of imgNodes) {
    const $img = $(img);
    const src = $img.attr("src") || $img.attr("data-src");
    if (!src) continue;

    const card = $img.closest("a[href], div");
    if (!card || card.length === 0) continue;

    let href = card.is("a")
      ? card.attr("href")
      : card.find("a[href]").first().attr("href");
    if (!href) continue;
    if (!href.startsWith("http")) href = "https://store.playstation.com" + href;

    const title =
      card.find("span, h3, h2").first().text().trim() ||
      card
        .text()
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean)[0] ||
      "";

    const text = card.text().replace(/\s+/g, " ").trim();

    const priceMatch = text.match(
      /(UAH\s?[\d\s.,]+|₴\s?[\d\s.,]+|TRY\s?[\d\s.,]+|[\d\s.,]+\s?TL|₺\s?[\d\s.,]+)/i
    );
    const priceStr = priceMatch ? priceMatch[0] : "";

    if (!title || title.length < 2) continue;
    if (!priceStr) continue;

    items.push({ title, img: src, priceStr, url: href });
    if (items.length >= 80) break;
  }

  if (items.length >= 10) {
    const seen = new Set();
    return items.filter((it) =>
      seen.has(it.url) ? false : (seen.add(it.url), true)
    );
  }

  // 2) fallback: __NEXT_DATA__
  const next = $("#__NEXT_DATA__").text();
  if (!next) return [];

  let json;
  try {
    json = JSON.parse(next);
  } catch {
    return [];
  }

  const out = [];
  const seenUrl = new Set();

  const asString = (v) =>
    typeof v === "string" ? v : v == null ? "" : String(v);

  function pickImage(obj) {
    const img =
      obj?.image ||
      obj?.images?.[0]?.url ||
      obj?.images?.[0]?.src ||
      obj?.thumbnailUrl ||
      obj?.defaultSku?.image;
    return typeof img === "string" ? img : "";
  }

  function pickUrl(obj) {
    const u =
      obj?.url || obj?.webUrl || obj?.href || obj?.pdpUrl || obj?.productUrl;
    if (!u) return "";
    if (typeof u !== "string") return "";
    return u.startsWith("http") ? u : "https://store.playstation.com" + u;
  }

  function pickTitle(obj) {
    return obj?.name || obj?.title || obj?.productName || "";
  }

  function pickPriceStr(obj) {
    const candidates = [
      obj?.price?.displayPrice,
      obj?.price?.discountedPrice,
      obj?.price?.basePrice,
      obj?.prices?.displayPrice,
      obj?.prices?.discountedPrice,
      obj?.prices?.basePrice,
      obj?.defaultSku?.price?.displayPrice,
      obj?.defaultSku?.price?.discountedPrice,
      obj?.defaultSku?.price?.basePrice,
      obj?.skus?.[0]?.price?.displayPrice,
      obj?.skus?.[0]?.price?.discountedPrice,
      obj?.skus?.[0]?.price?.basePrice,
      obj?.offer?.price,
      obj?.displayPrice,
    ]
      .map(asString)
      .filter(Boolean);

    return candidates.find((s) => /\d/.test(s)) || "";
  }

  function walk(node) {
    if (!node || typeof node !== "object") return;

    const title = pickTitle(node);
    const url = pickUrl(node);
    const priceStr = pickPriceStr(node);
    const img = pickImage(node);

    if (title && url && priceStr && !seenUrl.has(url)) {
      const base = normalizeNumber(priceStr);
      if (!isNaN(base) && base > 0) {
        seenUrl.add(url);
        out.push({ title, img: img || "", priceStr, url });
      }
    }

    if (Array.isArray(node)) {
      for (const v of node) walk(v);
    } else {
      for (const k of Object.keys(node)) walk(node[k]);
    }
  }

  walk(json);
  return out.slice(0, 120);
}

async function getDeals(regionKey, pages = 5) {
  const locale = regionKey === "ua" ? "ru-ua" : "en-tr";
  const dealsUrl = `https://store.playstation.com/${locale}/pages/deals`;

  const firstHtml = await fetchHtml(dealsUrl);
  const $first = cheerio.load(firstHtml);

  const categoryBase = extractCategoryBaseFromDealsPage($first);

  const all = [];
  all.push(...parseDealsGrid($first));

  if (categoryBase) {
    for (let p = 1; p <= pages; p++) {
      const pageUrl = `${categoryBase}/${p}`;
      const html = await fetchHtml(pageUrl);
      const $ = cheerio.load(html);
      all.push(...parseDealsGrid($));
    }
  }

  const seen = new Set();
  const uniq = [];
  for (const it of all) {
    if (seen.has(it.url)) continue;
    seen.add(it.url);
    uniq.push(it);
  }

  const trimmed = uniq.slice(0, 120);

  const mapped = trimmed
    .map((it) => {
      const base = normalizeNumber(it.priceStr);
      if (isNaN(base) || base <= 0) return null;

      const rate = getRate(regionKey === "ua" ? "ua" : "tr", base);
      let rub = base * rate;
      if (rub < MIN_GAME_PRICE_RUB) rub = MIN_GAME_PRICE_RUB;

      return {
        title: it.title,
        img: it.img,
        psPrice: it.priceStr,
        basePrice: base,
        rubPrice: Number(rub.toFixed(2)),
        url: it.url,
      };
    })
    .filter(Boolean);

  return mapped;
}

// ✅ CORS для Live Server
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  next();
});

app.get("/api/deals", async (req, res) => {
  const region = (req.query.region || "ua").toString();
  const pages = Math.min(parseInt(req.query.pages || "5", 10) || 5, 5);

  if (!["ua", "tr"].includes(region)) {
    return res.status(400).json({ error: "region must be ua|tr" });
  }

  const key = `${region}:${pages}`;
  const cached = cache.get(key);

  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return res.json({ region, pages, cached: true, items: cached.data });
  }

  try {
    const items = await getDeals(region, pages);

    if (items.length > 0) {
      cache.set(key, { ts: Date.now(), data: items });
    }

    return res.json({ region, pages, cached: false, items });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`Deals proxy running: http://localhost:${PORT}`);
});
