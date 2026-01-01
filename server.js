import express from "express";
import fetch from "node-fetch";
import * as cheerio from "cheerio";

const app = express();
app.use(express.static("public"));

const PORT = process.env.PORT || 3000;

// ===== CORS (чтобы фронт мог fetch) =====
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*"); // для дев-режима
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  next();
});

// ===== Кеш =====
const cache = new Map(); // key -> { ts, data }
const CACHE_TTL_MS = 1000 * 60 * 20; // 20 минут

// ===== ТВОИ ПРАВИЛА =====
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

// ✅ ОДИН РАЗ на весь файл: округление "вверх до сотни минус 10" => xx90
function niceRubPrice(rub) {
  let v = Number(rub || 0);

  if (v < MIN_GAME_PRICE_RUB) v = MIN_GAME_PRICE_RUB;

  v = Math.ceil(v / 100) * 100 - 10;

  if (v < MIN_GAME_PRICE_RUB) v = MIN_GAME_PRICE_RUB;

  return v; // integer
}

function normalizeNumber(str) {
  const s = (str || "")
    .replace(/\u00A0/g, " ")
    .replace(/[^\d.,\s]/g, "")
    .trim();

  if (s.includes(".") && s.includes(",")) {
    return parseFloat(
      s.replace(/\./g, "").replace(",", ".").replace(/\s/g, "")
    );
  }
  if (s.includes(",")) {
    return parseFloat(s.replace(/\s/g, "").replace(",", "."));
  }
  return parseFloat(s.replace(/\s/g, ""));
}

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome Safari",
      "Accept-Language": "ru,en;q=0.9,tr;q=0.8",
    },
  });
  if (!res.ok) throw new Error(`Fetch failed ${res.status} for ${url}`);
  return await res.text();
}

function absUrl(href) {
  if (!href) return null;
  if (href.startsWith("http")) return href;
  return (
    "https://store.playstation.com" + (href.startsWith("/") ? href : "/" + href)
  );
}

function upgradeImg(url) {
  if (!url) return "";
  let u = url;

  // поднимаем ширину (обычно там w=54)
  u = u.replace(/([?&])w=\d+/i, "$1w=400");

  // убираем thumb=true (иногда режет качество)
  u = u.replace(/([?&])thumb=true(&?)/i, (m, p1, p2) => (p2 ? p1 : ""));

  // если вдруг w= не было — добавим
  if (!/[?&]w=\d+/i.test(u)) {
    u += (u.includes("?") ? "&" : "?") + "w=400";
  }

  return u;
}

// ===== НОВЫЙ ПАРСЕР: берём товары из <li> по ссылкам concept/product =====
function parseDealsList($, regionKey) {
  const items = [];

  const selector = 'a[href*="/concept/"], a[href*="/product/"]';
  $(selector).each((_, a) => {
    const $a = $(a);
    const title = $a.text().trim();
    if (!title || title.length < 2) return;

    const li = $a.closest("li");
    if (!li || li.length === 0) return;

    const liText = li.text().replace(/\s+/g, " ").trim();

    // скидка
    const discMatch = liText.match(/-?\s?(\d{1,2})%/);
    const discountPercent = discMatch ? Number(discMatch[1]) : null;

    // цены
    let offerStr = "";
    let originalStr = "";

    if (regionKey === "ua") {
      const matches = liText.match(/UAH\s?[\d\s.,]+/g);
      if (matches && matches.length >= 1) offerStr = matches[0];
      if (matches && matches.length >= 2) originalStr = matches[1];
    } else {
      // TR
      const matches = liText.match(/[\d\s.,]+?\s?TL/g);
      if (matches && matches.length >= 1) offerStr = matches[0];
      if (matches && matches.length >= 2) originalStr = matches[1];
    }

    if (!offerStr) return;

    const base = normalizeNumber(offerStr);
    if (!Number.isFinite(base)) return;

    // картинка
    const img = li.find("img").first();
    const rawImg = img.attr("src") || img.attr("data-src") || "";
    const imgSrc = upgradeImg(rawImg);

    const url = absUrl($a.attr("href"));

    // RUB (✅ теперь "красивое" округление)
    const rate = getRate(regionKey, base);
    const rubPrice = niceRubPrice(base * rate);

    items.push({
      title,
      img: imgSrc,
      url,
      psOffer: offerStr,
      psOriginal: originalStr || null,
      discountPercent,
      basePrice: base,
      rubPrice, // integer, без копеек
    });
  });

  // uniq by url + title
  const seen = new Set();
  const uniq = [];
  for (const it of items) {
    const key = (it.url || "") + "|" + it.title;
    if (seen.has(key)) continue;
    seen.add(key);
    uniq.push(it);
  }
  return uniq;
}

async function getDealsFull(regionKey, pages = 5) {
  const locale = regionKey === "ua" ? "ru-ua" : "en-tr";
  const dealsUrl = `https://store.playstation.com/${locale}/pages/deals`;

  // 1) берём сам deals (там есть список)
  const firstHtml = await fetchHtml(dealsUrl);
  const $first = cheerio.load(firstHtml);
  let all = parseDealsList($first, regionKey);

  // 2) дополнительно берём категорию "All deals" (обычно даёт пагинацию)
  let categoryUrl = null;
  $first('a[href*="/category/"][href$="/1"]').each((_, a) => {
    const href = $first(a).attr("href");
    if (href && !categoryUrl) categoryUrl = absUrl(href);
  });

  if (categoryUrl) {
    const base = categoryUrl.replace(/\/1$/, "");
    for (let p = 1; p <= pages; p++) {
      const html = await fetchHtml(`${base}/${p}`);
      const $ = cheerio.load(html);
      all = all.concat(parseDealsList($, regionKey));
    }
  }

  // uniq
  const seen = new Set();
  const uniq = [];
  for (const it of all) {
    const key = (it.url || "") + "|" + it.title;
    if (seen.has(key)) continue;
    seen.add(key);
    uniq.push(it);
  }

  return uniq;
}

// sort: "popular" | "discount"
function sortItems(items, sortKey) {
  if (sortKey === "discount") {
    return [...items].sort(
      (a, b) => (b.discountPercent ?? -1) - (a.discountPercent ?? -1)
    );
  }
  return items;
}

// ===== API =====
// /api/deals?region=ua&pages=5&sort=discount&offset=0&limit=24
app.get("/api/deals", async (req, res) => {
  const region = (req.query.region || "ua").toString();
  const pages = Math.min(parseInt(req.query.pages || "5", 10) || 5, 5);
  const sort = (req.query.sort || "popular").toString(); // popular|discount
  const offset = Math.max(parseInt(req.query.offset || "0", 10) || 0, 0);
  const limit = Math.min(
    Math.max(parseInt(req.query.limit || "24", 10) || 24, 1),
    60
  );

  if (!["ua", "tr"].includes(region))
    return res.status(400).json({ error: "region must be ua|tr" });

  const key = `${region}:${pages}`;
  const cached = cache.get(key);

  try {
    let full;
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
      full = cached.data;
    } else {
      full = await getDealsFull(region, pages);
      if (full.length > 0) cache.set(key, { ts: Date.now(), data: full });
    }

    const sorted = sortItems(full, sort);
    const slice = sorted.slice(offset, offset + limit);

    res.json({
      region,
      pages,
      sort,
      cached: !!(cached && Date.now() - cached.ts < CACHE_TTL_MS),
      total: sorted.length,
      offset,
      limit,
      items: slice,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ===== DETAILS CACHE =====
const detailsCache = new Map(); // url -> { ts, data }
const DETAILS_TTL_MS = 1000 * 60 * 60 * 6; // 6 часов

function safeJsonParse(str) {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

function extractNextData($) {
  const raw = $("script#__NEXT_DATA__").first().text();
  if (!raw) return null;
  return safeJsonParse(raw);
}

// собираем ВСЕ строки вместе с “путём” (где нашли)
function deepCollectStringsWithPath(obj, path = "", out = []) {
  if (obj == null) return out;

  if (typeof obj === "string") {
    out.push({ path, value: obj });
    return out;
  }

  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      deepCollectStringsWithPath(obj[i], `${path}[${i}]`, out);
    }
    return out;
  }

  if (typeof obj === "object") {
    for (const k of Object.keys(obj)) {
      deepCollectStringsWithPath(obj[k], path ? `${path}.${k}` : k, out);
    }
  }
  return out;
}

function parseIsoToDate(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatDDMMYYYY(dateObj) {
  const dd = String(dateObj.getDate()).padStart(2, "0");
  const mm = String(dateObj.getMonth() + 1).padStart(2, "0");
  const yyyy = dateObj.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
}

/**
 * Дата окончания скидки из __NEXT_DATA__:
 * 1) Ищем ISO datetime рядом с путями offer/end/until/expiry
 * 2) Если не нашли — берём ближайшую будущую ISO дату в пределах 90 дней
 */
function extractDiscountUntilFromNextData(nextData) {
  if (!nextData) return null;

  const rows = deepCollectStringsWithPath(nextData);

  const ISO_DT = /\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z\b/;

  const now = new Date();
  const in90 = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 90);

  const priority = [];
  for (const r of rows) {
    if (!ISO_DT.test(r.value)) continue;

    const p = (r.path || "").toLowerCase();
    if (
      p.includes("offer") ||
      p.includes("discount") ||
      p.includes("end") ||
      p.includes("until") ||
      p.includes("expiry") ||
      p.includes("expires")
    ) {
      const m = r.value.match(ISO_DT);
      const d = parseIsoToDate(m?.[0]);
      if (d && d > now && d < in90) priority.push(d);
    }
  }

  if (priority.length) {
    priority.sort((a, b) => a - b);
    return formatDDMMYYYY(priority[0]);
  }

  const any = [];
  for (const r of rows) {
    const m = r.value.match(ISO_DT);
    if (!m) continue;
    const d = parseIsoToDate(m[0]);
    if (d && d > now && d < in90) any.push(d);
  }

  if (any.length) {
    any.sort((a, b) => a - b);
    return formatDDMMYYYY(any[0]);
  }

  return null;
}

function deepFindAllStrings(obj, out = []) {
  if (!obj) return out;
  if (typeof obj === "string") {
    out.push(obj);
    return out;
  }
  if (Array.isArray(obj)) {
    for (const x of obj) deepFindAllStrings(x, out);
    return out;
  }
  if (typeof obj === "object") {
    for (const k of Object.keys(obj)) deepFindAllStrings(obj[k], out);
  }
  return out;
}

function detectRuFromNextData(nextData) {
  if (!nextData) return "Нет данных";

  const strings = deepFindAllStrings(nextData).map((s) => s.toLowerCase());

  const hasRuWord =
    strings.some((s) => s.includes("russian") || s.includes("русск")) ||
    strings.some((s) => /\bru\b/.test(s));

  if (!hasRuWord) return "Нет данных";

  const hasVoice =
    strings.some(
      (s) =>
        s.includes("voice") &&
        (s.includes("ru") || s.includes("russian") || s.includes("русск"))
    ) || strings.some((s) => s.includes("озвуч"));

  const hasSubs =
    strings.some(
      (s) =>
        s.includes("subtitle") &&
        (s.includes("ru") || s.includes("russian") || s.includes("русск"))
    ) || strings.some((s) => s.includes("субтит"));

  if (hasVoice && hasSubs) return "Озвучка и субтитры";
  if (hasVoice) return "Озвучка";
  if (hasSubs) return "Субтитры";
  return "Русский язык (уточнить)";
}

// fallback (если nextData не помог)
function detectRuSupport($) {
  const t = $("body").text().replace(/\s+/g, " ").toLowerCase();

  const hasRussianWord = t.includes("русск");
  const hasVoice = t.includes("озвуч") || t.includes("voice");
  const hasSubs = t.includes("субтит") || t.includes("subtitles");

  if (!hasRussianWord) return "Нет данных";
  if (hasVoice && hasSubs) return "Озвучка и субтитры";
  if (hasVoice) return "Озвучка";
  if (hasSubs) return "Субтитры";
  return "Русский язык (уточнить)";
}

// helper: если region=ua и ссылка en-tr — меняем на ru-ua (и наоборот)
function normalizeStoreUrlByRegion(url, region) {
  if (!url) return url;

  if (region === "ua") {
    if (url.includes("/ru-ua/")) return url;
    return url.replace(
      "store.playstation.com/en-tr/",
      "store.playstation.com/ru-ua/"
    );
  }

  if (region === "tr") {
    if (url.includes("/en-tr/")) return url;
    return url.replace(
      "store.playstation.com/ru-ua/",
      "store.playstation.com/en-tr/"
    );
  }

  return url;
}

app.get("/api/game-details", async (req, res) => {
  const region = (req.query.region || "ua").toString();
  let url = (req.query.url || "").toString();

  if (!url.startsWith("https://store.playstation.com/")) {
    return res.status(400).json({ error: "Bad url" });
  }

  // нормализуем ссылку под регион
  if (region === "ua" || region === "tr") {
    url = normalizeStoreUrlByRegion(url, region);
  }

  const cached = detailsCache.get(url);
  if (cached && Date.now() - cached.ts < DETAILS_TTL_MS) {
    return res.json(cached.data);
  }

  try {
    const html = await fetchHtml(url);
    const $ = cheerio.load(html);

    const nextData = extractNextData($);

    // Платформа
    const platformText = $("body").text();
    const hasPS5 = /PS5/i.test(platformText);
    const hasPS4 = /PS4/i.test(platformText);
    const platform =
      hasPS4 && hasPS5 ? "PS4, PS5" : hasPS5 ? "PS5" : hasPS4 ? "PS4" : "—";

    const discountUntil = extractDiscountUntilFromNextData(nextData) || "—";
    const ruSupport = detectRuFromNextData(nextData) || detectRuSupport($);

    const data = { platform, discountUntil, ruSupport };
    detailsCache.set(url, { ts: Date.now(), data });
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// очистка кеша (удобно для отладки)
// /api/clear-cache
app.get("/api/clear-cache", (req, res) => {
  cache.clear();
  detailsCache.clear();
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`Deals proxy running: http://localhost:${PORT}`);
});
