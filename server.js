import "dotenv/config";
import express from "express";
import fetch from "node-fetch";
import * as cheerio from "cheerio";
import {
  applyOverridesToItems,
  deleteOverride,
  extractGameId,
  getOverrideForUrl,
  listOverrides,
  setOverride,
} from "./server/overridesStore.js";
import {
  clearSessionCookie,
  createSessionCookie,
  requireAdminSession,
  validateAdminPassword,
} from "./server/adminAuth.js";
import {
  loadHistory,
  saveHistory,
  recordBasePrice,
  getDiscountPercent,
} from "./server/priceHistory.js";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: "128kb" }));

// ===== Security headers =====
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader(
    "Content-Security-Policy",
    "frame-ancestors 'self' https://web.telegram.org https://t.me"
  );
  next();
});

// ===== CORS =====
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,HEAD,POST,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.post("/api/admin/login", (req, res) => {
  if (!validateAdminPassword(req.body?.password)) {
    return res.status(401).json({ error: "Неверный пароль" });
  }
  res.setHeader("Set-Cookie", createSessionCookie());
  return res.json({ ok: true });
});

app.post("/api/admin/logout", (_req, res) => {
  res.setHeader("Set-Cookie", clearSessionCookie());
  return res.json({ ok: true });
});

app.use("/admin", (req, res, next) => {
  if (req.path === "/login.html" || req.path === "/admin.css") return next();
  return requireAdminSession(req, res, next);
});

app.use("/api/admin", requireAdminSession);

// ===== Static files =====
app.use(express.static("public"));

// ===== Кеш =====
const cache = new Map(); // key -> { ts, data }
const CACHE_TTL_MS = 1000 * 60 * 20; // 20 минут
const DEALS_DISPLAY_PAGE_SIZE = 24;
const DEALS_MAX_DISPLAY_PAGES = 10;
const DEALS_MAX_SOURCE_PAGES = 30;

// ===== PS PLUS CATALOG CACHE =====
const psplusCache = new Map(); // key -> { ts, data }
const PSPLUS_TTL_MS = 1000 * 60 * 60 * 6; // 6 часов

// ===== PAGE-LEVEL CACHE (ускорение: кэшируем разбор каждой страницы отдельно) =====
const psplusPageCache = new Map(); // key -> { ts, data } where data = items[]
const dealsPageCache = new Map(); // key -> { ts, data } where data = items[]

// ===== TOP GAMES & NEW RELEASES CACHE =====
const topGamesCache = new Map(); // key -> { ts, data }
const newReleasesCache = new Map(); // key -> { ts, data }
const STORE_PAGE_TTL_MS = 1000 * 60 * 30; // 30 минут

async function mapWithConcurrency(list, concurrency, fn) {
  const arr = Array.from(list);
  const results = new Array(arr.length);
  let idx = 0;

  const workers = new Array(Math.max(1, concurrency)).fill(0).map(async () => {
    while (idx < arr.length) {
      const my = idx++;
      results[my] = await fn(arr[my], my);
    }
  });

  await Promise.all(workers);
  return results;
}

// ===== ТВОИ ПРАВИЛА =====
const MIN_GAME_PRICE_RUB = 390;

const RATE_VERSION = "r105";

function getRate(regionKey, basePrice) {
  const isTR = regionKey === "tr";
  if (basePrice >= 2000) return isTR ? 2.47 : 2.78;
  if (basePrice >= 1500) return isTR ? 2.94 : 3.05;
  if (basePrice >= 1000) return isTR ? 3.1 : 3.2;
  if (basePrice >= 500) return isTR ? 3.36 : 3.41;
  if (basePrice >= 250) return isTR ? 3.83 : 3.89;
  if (basePrice >= 100) return isTR ? 5.15 : 5.25;
  return isTR ? 6.72 : 6.83;
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

function isLikelyAddonProduct({ title, text, url }) {
  const haystack = `${title || ""} ${text || ""} ${url || ""}`
    .toLowerCase()
    .replace(/\u00A0/g, " ");

  const addonPatterns = [
    /\badd[-\s]?on\b/i,
    /\bdlc\b/i,
    /\bexpansion\b/i,
    /\bexpansions?\s+pack\b/i,
    /\bseason\s+pass\b/i,
    /\bbattle\s+pass\b/i,
    /\byear\s+\d+\s+pass\b/i,
    /\bwar\s+thunder\b/i,
    /\bstarter\s+pack\b/i,
    /\bfounder'?s?\s+pack\b/i,
    /\bbooster\s+pack\b/i,
    /\bbonus\s+pack\b/i,
    /\bcontent\s+pack\b/i,
    /\bcharacter\s+pack\b/i,
    /\bweapon\s+pack\b/i,
    /\bvehicle\s+pack\b/i,
    /\bmap\s+pack\b/i,
    /\blevel\s+pack\b/i,
    /\bpack\b/i,
    /\bepisode\b/i,
    /\bchapter\b/i,
    /\bvirtual\s+currency\b/i,
    /\bcurrency\b/i,
    /\bwallet\b/i,
    /\bcoins?\b/i,
    /\bcredits?\b/i,
    /\bpoints?\b/i,
    /\btokens?\b/i,
    /\bzen\b/i,
    /\bgems?\b/i,
    /\bcrystals?\b/i,
    /\bshards?\b/i,
    /\bv[-\s]?bucks?\b/i,
    /\bvc\b/i,
    /\bfc\s+points?\b/i,
    /\bcod\s+points?\b/i,
    /\bshark\s+cards?\b/i,
    /\bskins?\b/i,
    /\bcostumes?\b/i,
    /\boutfits?\b/i,
    /\bavatars?\b/i,
    /\bcosmetics?\b/i,
    /\bbonus\s+content\b/i,
    /\bin[-\s]?game\s+(?:item|currency|content|purchase)/i,
    /дополнени[ея]/i,
    /расширени[ея]/i,
    /сезонн(?:ый|ого)\s+пропуск/i,
    /боев(?:ой|ого)\s+пропуск/i,
    /пропуск\s+\d+\s+года/i,
    /war\s+thunder/i,
    /neverwinter\s+zen/i,
    /\bzen\b/i,
    /набор\s+(?:персонаж|оружи|транспорт|карт|уровн|монет|кредит|очк|жетон|облик|костюм|скин)/i,
    /набор\s+(?:поставщ|зен|техник|танк|самол[её]т|истреб|вертол[её]т|корабл|пополн)/i,
    /пакет\s+(?:персонаж|оружи|транспорт|карт|уровн|монет|кредит|очк|жетон|облик|костюм|скин)/i,
    /пакет\s+(?:поставщ|зен|техник|танк|самол[её]т|истреб|вертол[её]т|корабл|пополн)/i,
    /эпизод/i,
    /глава/i,
    /внутриигров(?:ая|ой)\s+валют/i,
    /монет[а-я]*/i,
    /кредит[а-я]*/i,
    /очк[аиов]*/i,
    /жетон[а-я]*/i,
    /самоцвет[а-я]*/i,
    /кристалл[а-я]*/i,
    /скин[а-я]*/i,
    /костюм[а-я]*/i,
    /облик[а-я]*/i,
    /аватар[а-я]*/i,
    /бонусн(?:ый|ого)\s+контент/i,
  ];

  return addonPatterns.some((pattern) => pattern.test(haystack));
}

// ===== PS PLUS CATALOG PARSER =====
function parsePsPlusCatalogList($) {
  const items = [];
  const selector = 'a[href*="/product/"], a[href*="/concept/"]';

  $(selector).each((_, a) => {
    const $a = $(a);
    const href = $a.attr("href");
    const url = absUrl(href);
    if (!url) return;

    const li = $a.closest("li");
    const scope = li && li.length ? li : $a.closest("article");
    if (!scope || scope.length === 0) return;

    const img = scope.find("img").first();
    const rawImg = img.attr("src") || img.attr("data-src") || "";
    const imgSrc = upgradeImg(rawImg);

    const title =
      ($a.attr("aria-label") || "").trim() ||
      (img.attr("alt") || "").trim() ||
      $a.text().replace(/\s+/g, " ").trim();

    if (!title) return;

    items.push({ title, url, img: imgSrc });
  });

  // uniq by url + title
  const seen = new Set();
  const uniq = [];
  for (const it of items) {
    const key = `${it.url}|${it.title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    uniq.push(it);
  }
  return uniq;
}

async function getCategoryCatalogCached({ region, pages, categoryId, ttlMs }) {
  const locale = region === "ua" ? "ru-ua" : "en-tr";
  const baseUrl = `https://store.playstation.com/${locale}/category/${categoryId}`;

  const key = `${region}:${categoryId}:${pages}`;
  const cachedRow = psplusCache.get(key);

  let full;
  let cached = false;

  if (cachedRow && Date.now() - cachedRow.ts < ttlMs) {
    full = cachedRow.data;
    cached = true;
  } else {
    const pageNums = Array.from({ length: pages }, (_, i) => i + 1);
    const pageItems = await mapWithConcurrency(pageNums, 4, async (p) => {
      const pageKey = `${region}:${categoryId}:${p}`;
      const cachedPage = psplusPageCache.get(pageKey);
      if (cachedPage && Date.now() - cachedPage.ts < ttlMs) return cachedPage.data;

      const html = await fetchHtml(`${baseUrl}/${p}`);
      const $ = cheerio.load(html);
      const items = parsePsPlusCatalogList($);
      psplusPageCache.set(pageKey, { ts: Date.now(), data: items });
      return items;
    });
    const all = pageItems.flat();

    // uniq
    const seen = new Set();
    const uniq = [];
    for (const it of all) {
      const k = `${it.url}|${it.title}`;
      if (seen.has(k)) continue;
      seen.add(k);
      uniq.push(it);
    }

    full = uniq;
    if (full.length > 0) psplusCache.set(key, { ts: Date.now(), data: full });
  }

  return { baseUrl, full, cached };
}

// ===== ГРАФQL API (PlayStation Store) =====
const GQL_URL = "https://web.np.playstation.com/api/graphql/v1/op";
// Persisted-query hash. Если Sony обновит бандл — можно взять новый hash
// из браузерного DevTools → Network → op?operationName=categoryGridRetrieve
const GQL_HASH =
  "9845afc0dbaab4965f6563fffc703f588c8e76792000e8610843b8d3ee9c4c09";

// Известные UUID категорий PS Store
const PS_CATS = {
  SALES: "3f772501-f6f8-49b7-abac-874a88ca4897", // Скидки — правильная категория Deals
  PS5:   "4cbf39e2-5749-4970-ba81-93a489e4570c", // PS5 игры
  PS4:   "44d8bb20-653e-431e-8ad0-c0a365f68d2f", // PS4 игры
  ALL:   "28c9c2b2-cecc-415c-9a08-482a605cb104", // Все игры
};

// Локали PS Store для каждого региона
// UA: ru-ua (русский язык, Украина) — именно этот используется на PS Store UA
const GQL_LOCALE = { ua: "ru-ua", tr: "en-tr" };

async function gqlCategoryPage(catId, locale, size, offset, sortBy) {
  const vars = {
    id: catId,
    pageArgs: { size, offset },
    sortBy: sortBy || null,
    filterBy: [],
    facetOptions: [],
  };
  const url =
    `${GQL_URL}?operationName=categoryGridRetrieve` +
    `&variables=${encodeURIComponent(JSON.stringify(vars))}` +
    `&extensions=${encodeURIComponent(JSON.stringify({ persistedQuery: { version: 1, sha256Hash: GQL_HASH } }))}`;
  const r = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      Accept: "application/json",
      "X-Apollo-Operation-Name": "categoryGridRetrieve",
      "x-psn-store-locale-override": locale,
    },
  });
  if (!r.ok) throw new Error(`GQL HTTP ${r.status}`);
  const d = await r.json();
  if (d.errors?.length) throw new Error(d.errors[0].message);
  return d.data?.categoryGridRetrieve || null;
}

const PREFERRED_IMG_ROLES = [
  "PORTRAIT_BANNER",        // портретный box art — именно его PS Store показывает в сетке
  "MASTER",                 // основной арт (часто квадратный)
  "FOUR_BY_THREE_BANNER",   // 4:3 — умеренная обрезка в квадрате
  "GAMEHUB_COVER_ART",      // 16:9 широкий баннер
  "EDITION_KEY_ART",
  "BACKGROUND",
];

function pickBestImage(media) {
  for (const role of PREFERRED_IMG_ROLES) {
    const m = media?.find((x) => x.role === role && x.type === "IMAGE");
    if (m) return m.url;
  }
  return media?.find((x) => x.type === "IMAGE")?.url || "";
}

function gqlProductToItem(product, regionKey) {
  const price = product.price || {};
  const basePriceStr = price.basePrice || "";
  const discountedPriceStr = price.discountedPrice || "";

  const basePrice = normalizeNumber(basePriceStr);
  const discountedPrice = normalizeNumber(discountedPriceStr);
  const effectiveBase =
    Number.isFinite(discountedPrice) && discountedPrice > 0
      ? discountedPrice
      : basePrice;

  let discountPercent = null;
  if (price.discountText) {
    const m = price.discountText.match(/\d+/);
    if (m) discountPercent = parseInt(m[0], 10);
  } else if (
    Number.isFinite(basePrice) &&
    Number.isFinite(discountedPrice) &&
    basePrice > 0 &&
    discountedPrice > 0 &&
    discountedPrice < basePrice
  ) {
    discountPercent = Math.round((1 - discountedPrice / basePrice) * 100);
  }

  const img = pickBestImage(product.media);
  const storeLocale = regionKey === "ua" ? "en-ua" : "en-tr";
  const productUrl = `https://store.playstation.com/${storeLocale}/product/${product.id}`;

  const isFree = price.isFree === true || effectiveBase === 0;
  const rate = getRate(regionKey, effectiveBase);
  const rubPrice = isFree ? 0 : niceRubPrice(effectiveBase * rate);

  return {
    title: product.name,
    npTitleId: product.npTitleId || null,
    img,
    url: productUrl,
    psOffer: discountedPriceStr || basePriceStr || "",
    psOriginal:
      Number.isFinite(basePrice) &&
      Number.isFinite(discountedPrice) &&
      basePrice > 0 &&
      discountedPrice > 0 &&
      discountedPrice < basePrice
        ? basePriceStr
        : null,
    discountPercent,
    basePrice: effectiveBase,
    rubPrice,
    isPreOrder: Array.isArray(product.skus) && product.skus.some(s => s.type === "PREORDER"),
    isFree,
    region: regionKey,
  };
}

// Скачивает все страницы категории GraphQL и возвращает массив items.
// recordBasePrices=true → сохраняем в историю как "базовые" (полные) цены.
async function fetchAllGqlItems(catId, regionKey, maxItems, sortBy, recordBasePrices = false) {
  const locale = GQL_LOCALE[regionKey];
  const PAGE_SIZE = 100;
  const items = [];
  let offset = 0;
  let totalCount = null;

  while (items.length < maxItems) {
    const size = Math.min(PAGE_SIZE, maxItems - items.length);
    const cat = await gqlCategoryPage(catId, locale, size, offset, sortBy);
    if (!cat) break;

    if (totalCount === null) totalCount = cat.pageInfo?.totalCount ?? 0;

    const products = cat.products || [];
    if (products.length === 0) break;

    for (const p of products) {
      if (!p.name) continue;
      if (p.price?.isFree && !p.price?.basePrice) continue;
      const item = gqlProductToItem(p, regionKey);
      if (item.rubPrice < MIN_GAME_PRICE_RUB && !item.isFree) continue;
      if (isLikelyAddonProduct({ title: item.title, text: "", url: item.url })) continue;

      // Записываем базовую цену в историю для последующего вычисления скидок
      if (recordBasePrices && item.npTitleId && item.basePrice > 0) {
        recordBasePrice(item.npTitleId, regionKey, item.basePrice);
      }

      items.push(item);
    }

    offset += products.length;
    if (offset >= (totalCount || 0)) break;
  }

  const seen = new Set();
  return items.filter((item) => {
    if (seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  });
}

// ===== ПАРСЕР ДЛЯ СТАРОГО ФОРМАТА =====
// Оставлен только для getCategoryCatalogCached (PS Plus / EA Play)
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
    const img = li.find("img").first();
    const labelText = [
      $a.attr("aria-label"),
      $a.attr("title"),
      img.attr("alt"),
      li.attr("aria-label"),
      li.attr("data-qa"),
    ]
      .filter(Boolean)
      .join(" ");
    const url = absUrl($a.attr("href"));
    if (isLikelyAddonProduct({ title, text: `${liText} ${labelText}`, url })) return;

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
    const rawImg = img.attr("src") || img.attr("data-src") || "";
    const imgSrc = upgradeImg(rawImg);

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

// ===== GraphQL-based getters (заменяют HTML-скрапинг) =====

async function getTopGamesFull(regionKey) {
  const key = `top:${regionKey}:${RATE_VERSION}`;
  const cached = topGamesCache.get(key);
  if (cached && Date.now() - cached.ts < STORE_PAGE_TTL_MS) {
    return applyOverridesToItems(cached.data, regionKey);
  }
  // PS5-игры с дефолтной (featured) сортировкой + пишем базовые цены в историю
  const items = await fetchAllGqlItems(PS_CATS.PS5, regionKey, 200, null, true);
  if (items.length > 0) topGamesCache.set(key, { ts: Date.now(), data: items });
  return applyOverridesToItems(items, regionKey);
}

async function getNewReleasesFull(regionKey) {
  const key = `latest:${regionKey}:${RATE_VERSION}`;
  const cached = newReleasesCache.get(key);
  if (cached && Date.now() - cached.ts < STORE_PAGE_TTL_MS) {
    return applyOverridesToItems(cached.data, regionKey);
  }
  // PS5 игры, сортировка по дате выпуска + пишем базовые цены в историю
  const items = await fetchAllGqlItems(
    PS_CATS.PS5,
    regionKey,
    200,
    { name: "productReleaseDate", isAscending: false },
    true
  );
  if (items.length > 0) newReleasesCache.set(key, { ts: Date.now(), data: items });
  return applyOverridesToItems(items, regionKey);
}

async function getDealsFull(regionKey, pages = 10) {
  const maxItems = Math.min(pages, DEALS_MAX_DISPLAY_PAGES) * DEALS_DISPLAY_PAGE_SIZE;
  // Новый UUID возвращает basePrice (оригинал) + discountedPrice (скидка) + discountText
  const raw = await fetchAllGqlItems(PS_CATS.SALES, regionKey, maxItems, null, false);
  // Если discountText не дал процент — пробуем из истории цен
  // Игры без реального процента скидки отфильтровываем полностью
  const items = raw
    .map(it => {
      const histDisc = (it.discountPercent == null && it.npTitleId)
        ? getDiscountPercent(it.npTitleId, regionKey, it.basePrice)
        : null;
      return {
        ...it,
        discountPercent: it.discountPercent ?? histDisc,
      };
    })
    .filter(it => it.discountPercent != null && it.discountPercent > 0);
  return applyOverridesToItems(items, regionKey);
}

// Возвращает кешированные данные мгновенно, а в фоне запускает обновление
// кеша, чтобы следующий запрос уже получил свежие данные.
async function getDealsWithStaleCache(regionKey, pages) {
  const key = `${regionKey}:${pages}:filtered-deals-${RATE_VERSION}`;
  const cached = cache.get(key);
  const now = Date.now();

  if (cached && now - cached.ts < CACHE_TTL_MS) {
    // Кеш свежий — возвращаем мгновенно
    return { items: cached.data, fromCache: true };
  }

  if (cached && now - cached.ts < CACHE_TTL_MS * 3) {
    // Кеш устарел, но данные есть — отдаём их сразу (stale-while-revalidate),
    // а обновление запускаем в фоне асинхронно
    getDealsFull(regionKey, pages)
      .then((full) => {
        if (full.length > 0) cache.set(key, { ts: Date.now(), data: full });
      })
      .catch((e) => console.warn(`[bg refresh] deals/${regionKey}:`, e.message));
    return { items: cached.data, fromCache: true, stale: true };
  }

  // Кеша нет совсем — ждём
  const full = await getDealsFull(regionKey, pages);
  if (full.length > 0) cache.set(key, { ts: Date.now(), data: full });
  return { items: full, fromCache: false };
}

// popular — порядок как в ленте PS Store; discount — по % скидки; price — по рублевой цене сайта.
function sortItems(items, sortKey) {
  const indexed = items.map((it, i) => ({ it, i }));
  if (sortKey === "discount") {
    return [...indexed]
      .sort((a, b) => {
        const da = a.it.discountPercent ?? -1;
        const db = b.it.discountPercent ?? -1;
        if (db !== da) return db - da;
        return a.i - b.i;
      })
      .map(({ it }) => it);
  }
  if (sortKey === "price") {
    return [...indexed]
      .sort((a, b) => {
        const pa = Number(a.it.rubPrice);
        const pb = Number(b.it.rubPrice);
        const na = Number.isFinite(pa) ? pa : Infinity;
        const nb = Number.isFinite(pb) ? pb : Infinity;
        if (na !== nb) return na - nb;
        return a.i - b.i;
      })
      .map(({ it }) => it);
  }
  return [...items];
}

// ===== API =====
// /api/deals?region=ua&pages=10&sort=discount&offset=0&limit=24
app.get("/api/deals", async (req, res) => {
  const region = (req.query.region || "ua").toString();
  const pages = Math.min(
    parseInt(req.query.pages || String(DEALS_MAX_DISPLAY_PAGES), 10) ||
      DEALS_MAX_DISPLAY_PAGES,
    DEALS_MAX_DISPLAY_PAGES
  );
  const sortRaw = (req.query.sort || "popular").toString();
  const sort = ["popular", "discount", "price"].includes(sortRaw)
    ? sortRaw
    : "popular";
  const offset = Math.max(parseInt(req.query.offset || "0", 10) || 0, 0);
  const limit = Math.min(
    Math.max(parseInt(req.query.limit || "24", 10) || 24, 1),
    60
  );

  if (!["ua", "tr"].includes(region))
    return res.status(400).json({ error: "region must be ua|tr" });

  try {
    const { items: full, fromCache, stale } = await getDealsWithStaleCache(region, pages);

    const maxDisplayItems = pages * DEALS_DISPLAY_PAGE_SIZE;
    const sorted = sortItems(full, sort).slice(0, maxDisplayItems);
    const slice = sorted.slice(offset, offset + limit);

    res.json({
      region,
      pages,
      sort,
      cached: fromCache,
      stale: stale || false,
      total: sorted.length,
      offset,
      limit,
      items: slice,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ===== TOP GAMES (популярные) =====
// /api/top-games?region=ua|tr&offset=0&limit=24
app.get("/api/top-games", async (req, res) => {
  const region = (req.query.region || "ua").toString();
  const offset = Math.max(parseInt(req.query.offset || "0", 10) || 0, 0);
  const limit = Math.min(
    Math.max(parseInt(req.query.limit || "24", 10) || 24, 1),
    60
  );

  if (!["ua", "tr"].includes(region))
    return res.status(400).json({ error: "region must be ua|tr" });

  try {
    const full = await getTopGamesFull(region);
    const slice = full.slice(offset, offset + limit);
    res.json({
      region,
      total: full.length,
      offset,
      limit,
      items: slice,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Идентификатор товара в URL PS Store (полные ссылки часто отличаются query/регистром).
function storeProductKey(url) {
  const raw = String(url || "").trim();
  if (!raw) return "";
  try {
    const u = new URL(raw);
    const path = u.pathname.replace(/\/+$/, "");
    const m = path.match(/\/(?:product|concept)\/([^/]+)$/i);
    if (m) return decodeURIComponent(m[1]).toLowerCase();
    return path.toLowerCase();
  } catch {
    const m = raw.match(/\/(?:product|concept)\/([^/?#]+)/i);
    return m ? decodeURIComponent(m[1]).toLowerCase() : raw.toLowerCase();
  }
}

// Новинки: сначала то, чего нет в топе; затем то, что в топе, но не в «голове» списка; в конец — то же, что в первых позициях топа (чтобы первая страница новинок не дублировала топ).
function reorderNewReleasesAfterTop(latestItems, topItems) {
  const topList = topItems || [];
  const topOrder = new Map();
  topList.forEach((it, i) => {
    const k = storeProductKey(it.url);
    if (k && !topOrder.has(k)) topOrder.set(k, i);
  });

  const topHeadCount = 48;
  const topHeadKeys = new Set();
  for (let i = 0; i < Math.min(topHeadCount, topList.length); i++) {
    const k = storeProductKey(topList[i]?.url);
    if (k) topHeadKeys.add(k);
  }

  const notInTop = [];
  const inTopNotHead = [];
  const inTopHead = [];

  for (const it of latestItems || []) {
    const k = storeProductKey(it.url);
    if (!k || !topOrder.has(k)) {
      notInTop.push(it);
      continue;
    }
    if (topHeadKeys.has(k)) inTopHead.push(it);
    else inTopNotHead.push(it);
  }

  return notInTop.concat(inTopNotHead, inTopHead);
}

// ===== NEW RELEASES (новинки, предзаказы) =====
// /api/new-releases?region=ua|tr&offset=0&limit=24
app.get("/api/new-releases", async (req, res) => {
  const region = (req.query.region || "ua").toString();
  const offset = Math.max(parseInt(req.query.offset || "0", 10) || 0, 0);
  const limit = Math.min(
    Math.max(parseInt(req.query.limit || "24", 10) || 24, 1),
    60
  );

  if (!["ua", "tr"].includes(region))
    return res.status(400).json({ error: "region must be ua|tr" });

  try {
    const [latest, top] = await Promise.all([
      getNewReleasesFull(region),
      getTopGamesFull(region),
    ]);
    const full = reorderNewReleasesAfterTop(latest, top);
    const slice = full.slice(offset, offset + limit);
    res.json({
      region,
      total: full.length,
      offset,
      limit,
      items: slice,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

function normalizeAdminGame(item, source, overridesById) {
  const gameId = extractGameId(item?.url);
  return {
    gameId,
    source,
    title: item.title,
    img: item.img,
    url: item.url,
    rubPrice: item.rubPrice,
    discountPercent: item.discountPercent ?? null,
    description: item.description || "",
    isOverridden: Boolean(overridesById.get(gameId)),
    override: overridesById.get(gameId) || null,
  };
}

app.get("/api/admin/find-games", async (req, res) => {
  const region = (req.query.region || "ua").toString();
  const q = (req.query.q || "").toString().trim().toLowerCase();
  if (!["ua", "tr"].includes(region)) {
    return res.status(400).json({ error: "region must be ua|tr" });
  }
  if (q.length < 2) return res.json({ items: [] });

  try {
    const overridesById = new Map(
      (await listOverrides()).map((override) => [override.gameId, override])
    );
    const [deals, topGames, newReleases] = await Promise.all([
      getDealsFull(region, DEALS_MAX_DISPLAY_PAGES),
      getTopGamesFull(region),
      getNewReleasesFull(region),
    ]);
    const sources = [
      ["Скидки", deals],
      ["Топ игр", topGames],
      ["Новинки", newReleases],
    ];
    const seen = new Set();
    const items = [];

    for (const [source, sourceItems] of sources) {
      for (const item of sourceItems) {
        const gameId = extractGameId(item?.url);
        if (!gameId || seen.has(gameId)) continue;
        if (!String(item.title || "").toLowerCase().includes(q)) continue;
        seen.add(gameId);
        items.push(normalizeAdminGame(item, source, overridesById));
        if (items.length >= 60) break;
      }
      if (items.length >= 60) break;
    }

    return res.json({ items });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

app.get("/api/admin/overrides", async (_req, res) => {
  try {
    const items = await listOverrides();
    return res.json({ items });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

app.put("/api/admin/overrides/:gameId", async (req, res) => {
  try {
    const override = await setOverride(req.params.gameId, req.body || {});
    return res.json({ ok: true, override });
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
});

app.delete("/api/admin/overrides/:gameId", async (req, res) => {
  try {
    const deleted = await deleteOverride(req.params.gameId);
    return res.json({ ok: true, deleted });
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
});

// Каталоги PS Plus / EA: порядок как на странице категории в PS Store (без искусственного reverse).
// ===== КАТАЛОГ ПОДПИСОК ЧЕРЕЗ GRAPHQL =====
// Заменяет старый HTML-скрапер getCategoryCatalogCached
async function getSubsCatalogGql(categoryId, regionKey, maxItems = 500) {
  const cacheKey = `subs-gql:${regionKey}:${categoryId}`;
  const cached = psplusCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < PSPLUS_TTL_MS) return cached;

  const locale = GQL_LOCALE[regionKey];
  const baseUrl = `https://store.playstation.com/${regionKey === "ua" ? "ru-ua" : "en-tr"}/category/${categoryId}`;

  // fetchAllGqlItems может отфильтровать бесплатные позиции — используем прямой вызов
  const PAGE_SIZE = 100;
  const items = [];
  let offset = 0;
  let totalCount = null;

  while (items.length < maxItems) {
    const size = Math.min(PAGE_SIZE, maxItems - items.length);
    const cat = await gqlCategoryPage(categoryId, locale, size, offset, null);
    if (!cat) break;
    if (totalCount === null) totalCount = cat.pageInfo?.totalCount ?? 0;
    const products = cat.products || [];
    if (products.length === 0) break;

    for (const p of products) {
      if (!p.name) continue;
      const img = pickBestImage(p.media);
      const storeLocale = regionKey === "ua" ? "en-ua" : "en-tr";
      items.push({
        title: p.name,
        img,
        url: `https://store.playstation.com/${storeLocale}/product/${p.id}`,
      });
    }

    offset += products.length;
    if (offset >= (totalCount || 0)) break;
  }

  const seen = new Set();
  const uniq = items.filter(it => {
    if (seen.has(it.url)) return false;
    seen.add(it.url);
    return true;
  });

  const result = { baseUrl, full: uniq, cached: false, ts: Date.now() };
  if (uniq.length > 0) psplusCache.set(cacheKey, result);
  return result;
}

function sortCatalogItems(items, _sortKey) {
  void _sortKey;
  return [...items];
}

function makeCatalogApiHandler(categoryId) {
  return async (req, res) => {
    const region = (req.query.region || "ua").toString();
    const offset = Math.max(parseInt(req.query.offset || "0", 10) || 0, 0);
    const limit = Math.min(Math.max(parseInt(req.query.limit || "24", 10) || 24, 1), 60);

    if (!["ua", "tr"].includes(region))
      return res.status(400).json({ error: "region must be ua|tr" });

    try {
      const { baseUrl, full, ts } = await getSubsCatalogGql(categoryId, region);
      const isCached = Boolean(ts && Date.now() - ts < PSPLUS_TTL_MS - 1000);
      const slice = full.slice(offset, offset + limit);
      res.json({ region, baseUrl, cached: isCached, total: full.length, offset, limit, items: slice });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  };
}

// ===== PS PLUS CATALOG API =====
// /api/psplus-catalog?region=ua&offset=0&limit=24
app.get("/api/psplus-catalog", makeCatalogApiHandler("3a7006fe-e26f-49fe-87e5-4473d7ed0fb2"));

// /api/psplus-classics?region=ua&offset=0&limit=24
app.get("/api/psplus-classics", makeCatalogApiHandler("8056ad23-7f30-485c-a628-b99f9d5aec5d"));

// /api/eaplay-catalog?region=ua&offset=0&limit=24
app.get("/api/eaplay-catalog", async (req, res) => {
  const region = (req.query.region || "ua").toString();
  const offset = Math.max(parseInt(req.query.offset || "0", 10) || 0, 0);
  const limit = Math.min(Math.max(parseInt(req.query.limit || "24", 10) || 24, 1), 60);

  if (!["ua", "tr"].includes(region))
    return res.status(400).json({ error: "region must be ua|tr" });

  const CATEGORY_ID = "74d4e266-5c64-4c61-a7e3-1b6e78f643e6";

  try {
    const { baseUrl, full, ts } = await getSubsCatalogGql(CATEGORY_ID, region);
    const isCached = Boolean(ts && Date.now() - ts < PSPLUS_TTL_MS - 1000);
    const slice = full.slice(offset, offset + limit);
    res.json({ region, baseUrl, cached: isCached, total: full.length, offset, limit, items: slice });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ===== UBISOFT+ CLASSICS =====
app.get("/api/psplus-ubisoft", makeCatalogApiHandler("db65f8d8-e606-49af-9a9a-23a05f55bd9a"));

// ===== PS PLUS MONTHLY (Игры месяца) =====
app.get("/api/psplus-essential", makeCatalogApiHandler("4c73be1e-f2f4-4aa4-b1dc-8a6d776e19fa"));
app.get("/api/psplus-monthly",   makeCatalogApiHandler("4c73be1e-f2f4-4aa4-b1dc-8a6d776e19fa"));

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
  if (!nextData) return "Нет русского";

  const strings = deepFindAllStrings(nextData).map((s) => s.toLowerCase());

  const hasRuWord =
    strings.some((s) => s.includes("russian") || s.includes("русск")) ||
    strings.some((s) => /\bru\b/.test(s));

  if (!hasRuWord) return "Нет русского";

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

  if (!hasRussianWord) return "Нет русского";
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

// === HELPERS: нормализация языка ===
function normLangToken(x) {
  const s = String(x || "")
    .toLowerCase()
    .trim();
  if (!s) return "";
  // ru, ru-ru, russian, русский
  if (s === "ru" || s.startsWith("ru-")) return "ru";
  if (s.includes("russian")) return "ru";
  if (s.includes("рус")) return "ru";
  return s;
}

function isRu(x) {
  return normLangToken(x) === "ru";
}

// вытаскиваем из массива/объекта все "языковые" токены
function collectLangTokens(value, out = []) {
  if (!value) return out;

  if (typeof value === "string") {
    out.push(value);
    return out;
  }

  if (Array.isArray(value)) {
    for (const v of value) collectLangTokens(v, out);
    return out;
  }

  if (typeof value === "object") {
    // Частые варианты ключей
    const keys = [
      "code",
      "locale",
      "languageCode",
      "id",
      "name",
      "displayName",
      "label",
      "value",
    ];
    for (const k of keys) {
      if (value[k]) collectLangTokens(value[k], out);
    }
    return out;
  }

  return out;
}

// === GENERIC: пройтись по объекту и собрать кандидаты по ключам ===
function deepCollectByKeyHints(obj, hints, out = []) {
  if (!obj) return out;

  if (Array.isArray(obj)) {
    for (const x of obj) deepCollectByKeyHints(x, hints, out);
    return out;
  }

  if (typeof obj === "object") {
    for (const [k, v] of Object.entries(obj)) {
      const key = String(k).toLowerCase();

      // Если ключ похож на нужный — добавим значение как кандидат
      if (hints.some((h) => key.includes(h))) {
        out.push({ key, value: v });
      }

      deepCollectByKeyHints(v, hints, out);
    }
  }

  return out;
}

// === ПЛАТФОРМЫ: достаём из nextData структурно ===
function extractPlatformFromNextData(nextData) {
  if (!nextData) return null;

  // ключи, где обычно лежат платформы
  const candidates = deepCollectByKeyHints(nextData, [
    "platform",
    "platforms",
    "playableplatform",
    "device",
    "devices",
    "console",
  ]);

  const found = new Set();

  // собираем строковые токены и ищем PS4/PS5
  for (const c of candidates) {
    const tokens = collectLangTokens(c.value, []);
    for (const t of tokens) {
      const s = String(t).toUpperCase();
      if (s.includes("PS5")) found.add("PS5");
      if (s.includes("PS4")) found.add("PS4");
    }
  }

  // если не нашли — пробуем мягкий поиск по строкам nextData (но не по body)
  if (found.size === 0) {
    const rows = deepFindAllStrings(nextData);
    for (const r of rows) {
      const s = String(r).toUpperCase();
      if (s.includes("PS5")) found.add("PS5");
      if (s.includes("PS4")) found.add("PS4");
    }
  }

  if (found.size === 0) return null;
  return Array.from(found).sort().join(", "); // PS4, PS5
}

// === ЯЗЫКИ: отдельный поиск audio и subtitles ===
function extractRuSupportAccurate(nextData) {
  if (!nextData) return null;

  // IMPORTANT: тут мы не ищем "voice" как слово где-то рядом,
  // а ищем реальные поля аудио/субтитров.
  const audioCandidates = deepCollectByKeyHints(nextData, [
    "audiolanguage",
    "voice",
    "spokenlanguage",
    "dub",
    "audio",
  ]);

  const subCandidates = deepCollectByKeyHints(nextData, [
    "subtitle",
    "subtitles",
    "textlanguage",
    "uilanguage",
    "screenlanguage",
    "menu",
  ]);

  // Собираем множества языков
  const audioLangs = new Set();
  const subLangs = new Set();

  for (const c of audioCandidates) {
    const tokens = collectLangTokens(c.value, []);
    for (const t of tokens) audioLangs.add(normLangToken(t));
  }

  for (const c of subCandidates) {
    const tokens = collectLangTokens(c.value, []);
    for (const t of tokens) subLangs.add(normLangToken(t));
  }

  const hasRuAudio = audioLangs.has("ru");
  const hasRuSubs = subLangs.has("ru");

  if (hasRuAudio && hasRuSubs) return "Озвучка и субтитры";
  if (hasRuAudio) return "Озвучка";
  if (hasRuSubs) return "Русские субтитры";

  // если вообще ничего не нашли (а не "нет русского")
  const nothingFound = audioLangs.size === 0 && subLangs.size === 0;
  if (nothingFound) return null;

  return "Нет русского";
}

// ======================================================================
// ✅ НОВОЕ: Точный парсинг из инфо-блока (Platform / Voice / Screen Languages)
// (не ищем по всему body "PS4/PS5/ru", а берём значения только из секции)
// ======================================================================

function normalizeSpaces(s) {
  return (s || "")
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizePlatformStr(raw) {
  const s = (raw || "").toUpperCase();
  const hasPS5 = s.includes("PS5");
  const hasPS4 = s.includes("PS4");
  if (hasPS4 && hasPS5) return "PS4, PS5";
  if (hasPS5) return "PS5";
  if (hasPS4) return "PS4";
  return null;
}

// ✅ Достаём "Platform: ... Release:" (и локализованные варианты)
function extractPlatformFromInfoBlock($) {
  const t = normalizeSpaces($("body").text());

  const patterns = [
    /Platform:\s*([^]*?)\s*Release:/i,
    /Платформа:\s*([^]*?)\s*(?:Дата выпуска|Выпуск|Релиз):/i,
    /Платформа:\s*([^]*?)\s*Выпуск:/i,
  ];

  for (const re of patterns) {
    const m = t.match(re);
    if (m && m[1]) {
      const p = normalizePlatformStr(m[1]);
      if (p) return p;
    }
  }
  return null;
}

// ✅ Достаём списки Voice и Screen Languages (и локализованные)
function extractRuSupportFromInfoBlock($) {
  const t = normalizeSpaces($("body").text());

  const variants = [
    {
      voice: /Voice:\s*([^]*?)\s*Screen Languages:/i,
      screen:
        /Screen Languages:\s*([^]*?)\s*(?:Download of this product|Platform:|Release:|Publisher:|Genres:|$)/i,
    },
    {
      voice: /Озвучивание:\s*([^]*?)\s*Языки экрана:/i,
      screen:
        /Языки экрана:\s*([^]*?)\s*(?:Загрузка этого продукта|Платформа:|Дата выпуска|Издатель|Жанры|$)/i,
    },
    {
      voice: /Озвучка:\s*([^]*?)\s*Языки экрана:/i,
      screen:
        /Языки экрана:\s*([^]*?)\s*(?:Загрузка этого продукта|Платформа:|Дата выпуска|Издатель|Жанры|$)/i,
    },
  ];

  let voiceList = "";
  let screenList = "";

  for (const v of variants) {
    const mv = t.match(v.voice);
    const ms = t.match(v.screen);
    if (mv?.[1] || ms?.[1]) {
      voiceList = normalizeSpaces(mv?.[1] || "");
      screenList = normalizeSpaces(ms?.[1] || "");
      break;
    }
  }

  // Если вообще не нашли блок — вернём null (пусть дальше решают nextData/fallback)
  if (!voiceList && !screenList) return null;

  const hasRu = (s) =>
    /\bRussian\b/i.test(s) || /русск/i.test(s) || /російськ/i.test(s);

  const voiceRu = hasRu(voiceList);
  const screenRu = hasRu(screenList);

  if (voiceRu && screenRu) return "Озвучка и субтитры";
  if (voiceRu) return "Озвучка";
  if (screenRu) return "Русские субтитры";
  return "Нет русского";
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
    const override = await getOverrideForUrl(url);
    return res.json({
      ...cached.data,
      description: override?.description || "",
    });
  }

  try {
    const html = await fetchHtml(url);
    const $ = cheerio.load(html);

    const nextData = extractNextData($);

    // ==================================================================
    // ✅ ПЛАТФОРМА:
    // 1) СНАЧАЛА пробуем точный инфо-блок (не ловит PS4 из меню/футера)
    // 2) Потом nextData
    // 3) Потом самый последний простой fallback по "Platform:" (не по всему body)
    // ==================================================================
    let platform = extractPlatformFromInfoBlock($);

    if (!platform) {
      const platformFromNext = extractPlatformFromNextData(nextData);
      if (platformFromNext) platform = platformFromNext;
    }

    if (!platform) {
      const txt = $("body").text();
      const hasPS5 = /Platform:\s*PS5/i.test(txt);
      const hasPS4 = /Platform:\s*PS4/i.test(txt);
      platform =
        hasPS4 && hasPS5 ? "PS4, PS5" : hasPS5 ? "PS5" : hasPS4 ? "PS4" : "—";
    }

    // ==================================================================
    // ✅ РУССКИЙ:
    // 1) СНАЧАЛА точный инфо-блок Voice/Screen Languages
    // 2) Если блок не найден — пробуем nextData (твой accurate)
    // 3) Если и это не помогло — старый fallback
    // ==================================================================
    let ruSupport = extractRuSupportFromInfoBlock($);

    if (!ruSupport) {
      const ruAccurate = extractRuSupportAccurate(nextData);
      // если accurate вернул осмысленный результат — берём его
      if (ruAccurate) {
        ruSupport = ruAccurate;
      }
    }

    if (!ruSupport) {
      ruSupport = detectRuSupport($);
    }

    const discountUntil = extractDiscountUntilFromNextData(nextData) || "—";
    const override = await getOverrideForUrl(url);

    const data = {
      platform,
      discountUntil,
      ruSupport,
      description: override?.description || "",
    };
    detailsCache.set(url, { ts: Date.now(), data });
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Очистка кеша. В production задайте CLEAR_CACHE_SECRET и вызывайте ?token=...
app.get("/api/clear-cache", (req, res) => {
  const secret = process.env.CLEAR_CACHE_SECRET;
  if (secret && req.query.token !== secret) {
    return res.status(403).json({ ok: false, error: "Forbidden" });
  }
  cache.clear();
  detailsCache.clear();
  psplusCache.clear();
  psplusPageCache.clear();
  dealsPageCache.clear();
  topGamesCache.clear();
  newReleasesCache.clear();
  res.json({ ok: true });
});

// ===== Фоновый прогрев кеша скидок =====
// Запускается при старте и затем каждые 18 минут (TTL = 20 мин),
// чтобы пользователь никогда не ждал холодного скрапинга.
async function warmDealsCache() {
  for (const region of ["ua", "tr"]) {
    try {
      const full = await getDealsFull(region, DEALS_MAX_DISPLAY_PAGES);
      if (full.length > 0) {
        const key = `${region}:${DEALS_MAX_DISPLAY_PAGES}:filtered-deals-${RATE_VERSION}`;
        cache.set(key, { ts: Date.now(), data: full });
        console.log(`[warm] deals/${region}: ${full.length} items`);
      }
    } catch (e) {
      console.warn(`[warm] deals/${region} failed:`, e.message);
    }
  }
}

// Фоновое построение базы цен для вычисления скидок (однократно при старте)
async function warmPriceHistory() {
  await loadHistory();
  for (const region of ["ua", "tr"]) {
    try {
      // Скачиваем топ-200 PS5 игр — они же и записываются в историю через recordBasePrices=true
      await fetchAllGqlItems(PS_CATS.PS5, region, 200, null, true);
      await saveHistory();
      console.log(`[prices] baseline/${region} updated`);
    } catch (e) {
      console.warn(`[prices] baseline/${region} failed:`, e.message);
    }
  }
}

app.listen(PORT, () => {
  console.log(`Deals proxy running: http://localhost:${PORT}`);
  // Загружаем историю цен, затем прогреваем кэш скидок
  warmPriceHistory().then(() => warmDealsCache());
  // Обновляем за 2 минуты до истечения TTL (каждые 18 мин)
  setInterval(warmDealsCache, CACHE_TTL_MS - 2 * 60 * 1000);
});
