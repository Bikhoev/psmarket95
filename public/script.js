// ====== НАСТРОЙКИ ======
const SETTINGS = {
  ua: { inputCurrency: "UAH" }, // Европа (UA)
  tr: { inputCurrency: "TRY" }, // Турция (лиры)
};

const OUTPUT_CURRENCY = "RUB";
const MIN_GAME_PRICE_RUB = 390;

function niceRubPrice(rub) {
  let v = Number(rub || 0);

  // минимум
  if (v < MIN_GAME_PRICE_RUB) v = MIN_GAME_PRICE_RUB;

  // "красивое" округление: вверх до сотни и -10 => xx90
  v = Math.ceil(v / 100) * 100 - 10;

  // защита от ухода ниже минимума (на всякий)
  if (v < MIN_GAME_PRICE_RUB) v = MIN_GAME_PRICE_RUB;

  return v; // целое число
}

// ====== КУРС ПО ДИАПАЗОНАМ (ТОЛЬКО ТВОИ ПРАВИЛА) ======
function getRate(regionKey, basePrice) {
  const isTR = regionKey === "tr"; // true = TRY, false = UAH

  if (basePrice >= 2000) return isTR ? 2.65 : 2.7;
  if (basePrice >= 1500) return isTR ? 2.8 : 2.9;
  if (basePrice >= 1000) return isTR ? 2.95 : 3.05;
  if (basePrice >= 500) return isTR ? 3.2 : 3.25;
  if (basePrice >= 250) return isTR ? 3.65 : 3.7;
  if (basePrice >= 100) return isTR ? 4.9 : 5.0;
  return isTR ? 6.4 : 6.5; // до 100
}

document.addEventListener("DOMContentLoaded", () => {
  // ====== БУРГЕР-МЕНЮ (инициализируем как можно раньше) ======
  const burger = document.getElementById("burgerToggle");
  const nav = document.querySelector(".nav");

  function closeMenu() {
    if (!burger || !nav) return;
    nav.classList.remove("nav--open");
    burger.classList.remove("burger--open");
    document.body.classList.remove("menu-open");
    burger.setAttribute("aria-expanded", "false");
  }

  if (burger && nav) {
    burger.addEventListener("click", () => {
      const isOpen = nav.classList.toggle("nav--open");
      burger.classList.toggle("burger--open", isOpen);
      document.body.classList.toggle("menu-open", isOpen);
      burger.setAttribute("aria-expanded", isOpen ? "true" : "false");
    });

    nav.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => closeMenu());
    });

    document.addEventListener(
      "click",
      (e) => {
        const isMenuOpen = nav.classList.contains("nav--open");
        if (!isMenuOpen) return;

        const clickedInsideBurger = burger.contains(e.target);
        const clickedInsideNav = nav.contains(e.target);

        if (!clickedInsideBurger && !clickedInsideNav) closeMenu();
      },
      true
    );
  }

  // ====== КАЛЬКУЛЯТОР (ИГРЫ) ======
  const regionSelect = document.getElementById("region");
  const productTypeSelect = document.getElementById("productType"); // "game" | "sub"
  const basePriceInput = document.getElementById("basePrice");
  const orderBtn = document.getElementById("orderBtn");

  const form = document.getElementById("priceCalculator");
  const resultCard = document.getElementById("resultCard");
  const gameFields = document.getElementById("gameCalculatorFields");

  const finalPriceSpan = document.getElementById("finalPrice");
  const finalCurrencySpan = document.getElementById("finalCurrency");
  const resultBasePriceSpan = document.getElementById("resultBasePrice");
  const resultCurrencySpan = document.getElementById("resultCurrency");
  const gameRegionGroup = document.getElementById("gameRegionGroup");
  const gameTypeGroup = document.getElementById("gameTypeGroup");
  const productTypeSubs = document.getElementById("productTypeSubs");

  // ====== ПРАЙС ПОДПИСОК ======
  const subsPricing = document.getElementById("subsPricing");
  const subsUA = document.getElementById("subsUA");
  const subsTR = document.getElementById("subsTR");
  const subsTabUA = document.getElementById("subsTabUA");
  const subsTabTR = document.getElementById("subsTabTR");

  // ====== ВЫБОР ПОДПИСКИ + ОФОРМЛЕНИЕ В WHATSAPP ======
  const subsOrder = document.getElementById("subsOrder");
  const subsPickedText = document.getElementById("subsPickedText");
  const subsOrderBtn = document.getElementById("subsOrderBtn");

  // ✅ ОДИН РАЗ НА ВЕСЬ ФАЙЛ
  const WHATSAPP_PHONE = "79639982998";

  // ====== HELPERS: IMG HI-RES ======
  function makeHiResImg(url, w = 720) {
    if (!url || typeof url !== "string") return "";
    if (/[?&]w=\d+/i.test(url)) return url.replace(/w=\d+/i, `w=${w}`);
    return url + (url.includes("?") ? "&" : "?") + `w=${w}`;
  }

  function buildSrcset(url) {
    const u = makeHiResImg(url, 720);
    if (!u) return "";
    return `${makeHiResImg(url, 360)} 360w,
            ${makeHiResImg(url, 720)} 720w,
            ${makeHiResImg(url, 1080)} 1080w`;
  }

  // ====== HELPERS: SCROLL + LOADER ======
  function scrollToElement(el, offsetPx = 16) {
    if (!el) return;
    const y = el.getBoundingClientRect().top + window.scrollY - offsetPx;
    window.scrollTo({ top: Math.max(0, y), behavior: "smooth" });
  }

  function psLoaderHtml(label = "Загрузка…") {
    const safe = String(label || "Загрузка…").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const svg = {
      tri: `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M12 5 L20 19 H4 Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>`,
      cir: `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" stroke-width="2"/></svg>`,
      x: `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M7 7 L17 17 M17 7 L7 17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
      sq: `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><rect x="6.5" y="6.5" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2"/></svg>`,
    };
    return `<div class="ps-loader-wrap" role="status" aria-live="polite" aria-label="${safe}">
  <div class="ps-loader">
  <div class="ps-loader__symbols" aria-hidden="true">
    <span class="ps-loader__sym ps-loader__sym--1">${svg.tri}</span>
    <span class="ps-loader__sym ps-loader__sym--2">${svg.cir}</span>
    <span class="ps-loader__sym ps-loader__sym--3">${svg.x}</span>
    <span class="ps-loader__sym ps-loader__sym--4">${svg.sq}</span>
  </div>
  <div class="ps-loader__text">${safe}</div>
  </div>
</div>`;
  }

  // ====== TOAST (уведомления) ======
  function showToast(
    message = "Игра добавлена в корзину",
    type = "success",
    ms = 1800
  ) {
    let el = document.getElementById("toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "toast";
      el.className = "toast";
      el.setAttribute("role", "status");
      el.setAttribute("aria-live", "polite");
      document.body.appendChild(el);
    }

    el.textContent = message;

    el.classList.remove("toast--success", "toast--error");
    el.classList.add(type === "error" ? "toast--error" : "toast--success");

    // перезапуск анимации
    el.classList.remove("toast--show");
    void el.offsetWidth;
    el.classList.add("toast--show");

    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove("toast--show"), ms);
  }

  // ====== CART (DEALS) ======
  const cartOpenBtn = document.getElementById("cartOpenBtn");
  const cartFloatBtn = document.getElementById("cartFloatBtn");
  const cartModal = document.getElementById("cartModal");
  const cartOverlay = document.getElementById("cartOverlay");
  const cartCloseBtn = document.getElementById("cartCloseBtn");
  const cartWhatsappBtn = document.getElementById("cartWhatsappBtn");
  const cartClearBtn = document.getElementById("cartClearBtn");
  const cartCount = document.getElementById("cartCount");
  const cartFloatCount = document.getElementById("cartFloatCount");
  const cartList = document.getElementById("cartList");
  const cartTotal = document.getElementById("cartTotal");
  const cartEmpty = document.getElementById("cartEmpty");

  const CART_KEY = "psm_cart_v1";

  // ✅ ВАЖНО: loadCart() должен быть ДО cart = loadCart()
  function loadCart() {
    try {
      const raw = localStorage.getItem(CART_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  let cart = loadCart();

  function isInCart(region, url) {
    const r = String(region || "");
    const u = String(url || "");
    if (!r || !u) return false;
    return cart.some((x) => x.region === r && x.url === u);
  }

  function setBuyButtonState(btn, inCart) {
    if (!btn) return;
    const yes = !!inCart;
    btn.classList.toggle("deal-buy--in-cart", yes);
    btn.setAttribute("aria-pressed", yes ? "true" : "false");
    btn.textContent = yes ? "В корзине" : "Купить";
  }

  function updateDealBuyButtonsState() {
    document
      .querySelectorAll('button[data-action="add-to-cart"][data-url]')
      .forEach((btn) => {
        const region = btn.dataset.region || "";
        const url = btn.dataset.url || "";
        setBuyButtonState(btn, isInCart(region, url));
      });
  }

  // ====== FAVORITES STORAGE ======
  const FAV_KEY = "psm_favs_v1";
  let favs = loadFavs(); // Set(url)

  function loadFavs() {
    try {
      const raw = localStorage.getItem(FAV_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return new Set(Array.isArray(arr) ? arr : []);
    } catch {
      return new Set();
    }
  }
  function saveFavs() {
    localStorage.setItem(FAV_KEY, JSON.stringify(Array.from(favs)));
  }
  function isFavorite(url) {
    return favs.has(String(url || ""));
  }

  // ✅ единая функция обновления счётчиков избранного
  function updateFavHeaderCount() {
    const el = document.getElementById("favCount");
    if (!el) return;
    const n = favs.size;
    el.textContent = n ? String(n) : "";
  }

  function toggleFavorite(url) {
    const u = String(url || "");
    if (!u) return false;
    if (favs.has(u)) favs.delete(u);
    else favs.add(u);
    saveFavs();
    updateFavHeaderCount();
    return favs.has(u); // true если теперь в избранном
  }

  // ====== MINI CART BAR (нижняя панель) ======
  function ensureMiniCartBar() {
    let bar = document.getElementById("miniCartBar");
    if (bar) return bar;

    bar = document.createElement("div");
    bar.id = "miniCartBar";
    bar.className = "mini-cart hidden";
    bar.style.display = "none"; // ✅ железно скрываем до первой покупки
    bar.setAttribute("role", "region");
    bar.setAttribute("aria-label", "Корзина");

    bar.innerHTML = `
      <div class="mini-cart__inner">
        <div class="mini-cart__text">
          <span class="mini-cart__label">В корзине:</span>
          <span class="mini-cart__count" id="miniCartCount">0</span>
          <span class="mini-cart__dot">·</span>
          <span class="mini-cart__sum" id="miniCartSum">0</span><span class="mini-cart__rub">₽</span>
        </div>

        <div class="mini-cart__actions">
          <button type="button" class="mini-cart__open" id="miniCartOpenBtn">Открыть</button>
        </div>
      </div>
    `;

    document.body.appendChild(bar);

    // открыть корзину по кнопке
    bar.querySelector("#miniCartOpenBtn")?.addEventListener("click", openCart);

    // опционально: клик по тексту тоже открывает
    bar.querySelector(".mini-cart__text")?.addEventListener("click", openCart);

    return bar;
  }

  const miniCartBar = ensureMiniCartBar();
  const miniCartCountEl = document.getElementById("miniCartCount");
  const miniCartSumEl = document.getElementById("miniCartSum");

  function calcCartSum() {
    return cart.reduce((s, it) => s + Number(it.rubPrice || 0), 0);
  }

  function updateMiniCartBar() {
    // если есть плавающая кнопка корзины — мини-панель не показываем
    if (cartFloatBtn) return;
    if (!miniCartBar) return;

    if (!cart.length) {
      miniCartBar.classList.add("hidden");
      miniCartBar.style.display = "none"; // ✅ прячем всегда
      return;
    }

    const sum = calcCartSum();

    if (miniCartCountEl) miniCartCountEl.textContent = String(cart.length);
    if (miniCartSumEl) miniCartSumEl.textContent = String(sum);

    miniCartBar.classList.remove("hidden");
    miniCartBar.style.display = ""; // ✅ показываем только когда есть товары
  }

  function hideMiniCartBar() {
    if (!miniCartBar) return;
    miniCartBar.classList.add("hidden");
  }

  function showMiniCartBarIfNeeded() {
    updateMiniCartBar();
  }

  function saveCart() {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
  }

  function regionLabel(regionKey) {
    return regionKey === "ua" ? "Европа (UA)" : "Турция";
  }

  function getCartKey(item) {
    if (!item) return "";
    if (item.key) return String(item.key);

    const region = String(item.region || "");
    const url = String(item.url || "");

    // game
    if (url) return `game:${region}|${url}`;

    // subscription (fallback)
    const plan = String(item.plan || "");
    const period = String(item.period || "");
    if (plan && period) return `sub:${region}|${plan}|${period}`;

    return `${region}|${String(item.title || "")}`;
  }

  function subGroupFromPlanOrTitle(planOrTitle) {
    const s = String(planOrTitle || "").toLowerCase();
    if (s.includes("ea") && s.includes("play")) return "eaplay";
    return "psplus";
  }

  function normalizeCartItem(item) {
    const type = item?.type || (item?.url ? "game" : "sub");
    const base = { ...item, type };
    if (type === "sub") {
      const planLike = base.plan || base.title;
      base.subGroup = base.subGroup || subGroupFromPlanOrTitle(planLike);
    }
    return { ...base, key: getCartKey(base) };
  }

  function isKeyInCart(key) {
    const k = String(key || "");
    if (!k) return false;
    return cart.some((x) => getCartKey(x) === k);
  }

  function openCart() {
    if (!cartModal) return;

    // ✅ прячем мини-панель, чтобы не перекрывала корзину
    hideMiniCartBar();

    cartModal.classList.remove("hidden");
    cartModal.setAttribute("aria-hidden", "false");
    renderCart();
  }

  function closeCart() {
    if (!cartModal) return;

    cartModal.classList.add("hidden");
    cartModal.setAttribute("aria-hidden", "true");

    // ✅ возвращаем мини-панель (если в корзине есть товары)
    showMiniCartBarIfNeeded();
  }

  // ✅ ДОБАВЛЕНИЕ В КОРЗИНУ БЕЗ АВТООТКРЫТИЯ
  function cartAdd(item) {
    const normalized = normalizeCartItem(item);
    const key = normalized.key;
    const exists = isKeyInCart(key);

    if (exists) {
      renderCart();
      showToast("Уже в корзине", "error", 1400);
      return "exists";
    }

    cart.push(normalized);
    saveCart();
    renderCart();
    showToast("Добавлено в корзину", "success", 1600);
    return "added";
  }

  function cartRemove(key) {
    const k = String(key || "");
    cart = cart.filter((x) => getCartKey(x) !== k);
    saveCart();
    renderCart();
  }

  function cartRemoveMany(keys) {
    const ks = (keys || []).map((k) => String(k)).filter(Boolean);
    if (!ks.length) return;
    const set = new Set(ks);
    cart = cart.filter((x) => !set.has(getCartKey(x)));
    saveCart();
    renderCart();
  }

  function cartClear() {
    cart = [];
    saveCart();
    renderCart();
    showToast("Корзина очищена", "success", 1400);
  }

  function renderCart() {
    if (cartCount)
      cartCount.textContent = cart.length ? String(cart.length) : "";
    if (cartFloatCount)
      cartFloatCount.textContent = cart.length ? String(cart.length) : "";

    // синхронизируем кнопки "Купить" -> "В корзине"
    updateDealBuyButtonsState();
    updateSubsLinesState();

    // ✅ если вдруг каких-то DOM-элементов нет — всё равно обновим мини-панель
    if (!cartList || !cartTotal || !cartEmpty) {
      updateMiniCartBar();
      return;
    }

    cartList.innerHTML = "";

    // ✅ если корзина пустая — показываем empty + прячем мини-панель
    if (cart.length === 0) {
      cartEmpty.style.display = "block";
      cartTotal.textContent = "0";
      updateMiniCartBar();
      return;
    }

    cartEmpty.style.display = "none";

    let sum = 0;
    for (const it of cart) {
      const key = getCartKey(it);
      sum += Number(it.rubPrice || 0);

      const el = document.createElement("div");
      el.className = "cart-item";
      const imgHtml = it.img
        ? `<img src="${makeHiResImg(it.img, 360)}" alt="">`
        : `<div class="cart-item-placeholder" aria-hidden="true">🧾</div>`;

      const title =
        it.type === "sub"
          ? `Подписка: ${it.plan || it.title || "—"} • ${it.period || ""}`.trim()
          : it.title || "Игра";

      const meta = `${regionLabel(it.region)}${
        it.type === "sub" ? "" : it.url ? " • PS Store" : ""
      }`;

      el.innerHTML = `
        ${imgHtml}
        <div>
          <div class="cart-item-title">${title}</div>
          <div class="cart-item-meta">${meta}</div>
          <button class="cart-remove" type="button">Удалить</button>
        </div>
        <div class="cart-item-price">${Number(it.rubPrice || 0)} ₽</div>
      `;

      el.querySelector(".cart-remove").addEventListener("click", () => {
        cartRemove(key);
      });

      cartList.appendChild(el);
    }

    cartTotal.textContent = sum.toFixed(0);
    updateMiniCartBar();
  }

  // Открытие/закрытие корзины (теперь ТОЛЬКО вручную)
  cartOpenBtn?.addEventListener("click", openCart);
  cartFloatBtn?.addEventListener("click", openCart);
  cartCloseBtn?.addEventListener("click", closeCart);
  cartOverlay?.addEventListener("click", closeCart);

  // Очистить
  cartClearBtn?.addEventListener("click", cartClear);

  // Оформить в WhatsApp (только из корзины)
  cartWhatsappBtn?.addEventListener("click", () => {
    if (!cart.length) return;

    const lines = cart.map((it, idx) => {
      const title =
        it.type === "sub"
          ? `Подписка: ${it.plan || it.title || "—"} • ${it.period || ""}`.trim()
          : it.title || "Игра";

      const region = regionLabel(it.region);
      const price = `${Number(it.rubPrice || 0)} ₽`;

      if (it.type === "sub") {
        return `${idx + 1}) ${title} — ${price} (${region})`;
      }

      const url = it.url ? `\n${it.url}` : "";
      return `${idx + 1}) ${title} — ${price} (${region})${url}`;
    });

    const total = cart.reduce((s, it) => s + (it.rubPrice || 0), 0);

    const msg = `Здравствуйте!
Хочу оформить заказ:

${lines.join("\n\n")}

Итого: ${total} ₽`;

    const waUrl =
      "https://wa.me/" + WHATSAPP_PHONE + "?text=" + encodeURIComponent(msg);
    window.location.href = waUrl;
  });

  // при загрузке страницы обновим счётчик + мини-панель
  renderCart();

  // ====== SUBSCRIPTIONS (в отдельном блоке + добавление в корзину) ======
  const subsCatalogPanel = document.getElementById("subsCatalogPanel");
  const psplusCatalogGrid = document.getElementById("psplusCatalogGrid");
  const psplusCatalogMore = document.getElementById("psplusCatalogMore");
  const psplusCatalogLink = document.getElementById("psplusCatalogLink");
  const psplusCatalogNote = document.getElementById("psplusCatalogNote");
  const psplusCatalogCarouselTrack = document.getElementById("psplusCatalogCarouselTrack");
  const psplusCatalogCounter = document.getElementById("psplusCatalogCounter");
  const psplusCatalogPrev = document.getElementById("psplusCatalogPrev");
  const catalogTabEssential = document.getElementById("catalogTabEssential");
  const catalogTabExtra = document.getElementById("catalogTabExtra");
  const catalogTabDeluxe = document.getElementById("catalogTabDeluxe");
  const catalogTabEa = document.getElementById("catalogTabEa");
  const catalogDeluxeTabs = document.getElementById("catalogDeluxeTabs");

  let psplusRegion = "ua"; // ua|tr
  let catalogChoice = "psplus_essential"; // psplus_essential | psplus_game | psplus_deluxe | eaplay
  let catalogType = "psplus_monthly"; // psplus_monthly | psplus_game | psplus_ubisoft | psplus_classics | eaplay
  const CATALOG_LIMIT = 12;
  const CATALOG_PAGES = 10; // страниц с сервера для большего охвата каталога
  const catalogOffsets = {
    psplus_monthly: 0,
    psplus_game: 0,
    psplus_classics: 0,
    psplus_ubisoft: 0,
    eaplay: 0,
  };
  let catalogPages = [];
  let catalogCurrentPage = 0;
  let catalogTotalFromApi = 0;
  let psplusLoading = false;

  // Prefetch следующей страницы каталога
  // key = `${region}|${catalogType}|${offset}`
  const catalogPrefetchCache = new Map();

  function catalogPrefetchKey(type, offset) {
    return `${psplusRegion}|${type}|${offset}`;
  }

  const psplusCatalogNav =
    psplusCatalogMore?.closest(".subs-catalog-carousel__nav") ||
    psplusCatalogPrev?.closest(".subs-catalog-carousel__nav") ||
    null;

  const CATALOGS = {
    psplus_monthly: {
      endpoint: "/api/psplus-monthly",
      note: "Игры месяца PlayStation Plus. Состав может отличаться по регионам.",
    },
    psplus_game: {
      endpoint: "/api/psplus-catalog",
      note: "Каталог игр PS Plus (Game Catalog). Состав может отличаться по регионам.",
    },
    psplus_ubisoft: {
      endpoint: "/api/psplus-ubisoft",
      note: "Ubisoft+ Classics в PlayStation Plus. Состав может отличаться по регионам.",
    },
    psplus_classics: {
      endpoint: "/api/psplus-classics",
      note: "Делюкс: каталог классики PS Plus (Classics). Состав может отличаться по регионам.",
    },
    eaplay: {
      endpoint: "/api/eaplay-catalog",
      note: "EA Play: библиотека Play List. Состав может отличаться по регионам.",
    },
  };

  const SECTION_KEYS = {
    psplus_essential: ["psplus_monthly"],
    psplus_game: ["psplus_monthly", "psplus_game", "psplus_ubisoft"],
    psplus_deluxe: ["psplus_monthly", "psplus_game", "psplus_ubisoft", "psplus_classics"],
  };

  function setCatalogChoice(choice) {
    catalogChoice = choice || "psplus_essential";
    const tabs = [catalogTabEssential, catalogTabExtra, catalogTabDeluxe, catalogTabEa].filter(Boolean);
    tabs.forEach((btn) => btn?.classList.toggle("subs-tab--active", btn?.dataset?.catalog === catalogChoice));

    const showSections = ["psplus_essential", "psplus_game", "psplus_deluxe"].includes(catalogChoice);
    if (catalogDeluxeTabs) catalogDeluxeTabs.classList.toggle("hidden", !showSections);

    if (showSections) {
      // по умолчанию показываем «Игры месяца»
      catalogType = "psplus_monthly";
      const sectionBtns = Array.from(catalogDeluxeTabs?.querySelectorAll("[data-deluxe]") || []);
      const allowed = new Set(SECTION_KEYS[catalogChoice] || []);
      sectionBtns.forEach((b) => {
        const key = b.dataset.deluxe;
        b.classList.toggle("hidden", !allowed.has(key));
        b.classList.toggle("subs-tab--active", key === catalogType);
      });
    } else {
      catalogType = catalogChoice;
    }

    if (psplusCatalogNote) psplusCatalogNote.textContent = CATALOGS[catalogType]?.note ?? "";
  }

  function buildCatalogPageHtml(items) {
    if (!items || items.length === 0) return "<div class='deal-meta'>Нет данных.</div>";
    return items
      .map((it) => {
        const title = String(it.title || "").replace(/"/g, "&quot;");
        const img = it.img || "";
        const coverHtml = img
          ? `<img class="psplus-cover" src="${img}" alt="${title}" loading="lazy" />`
          : `<div class="psplus-cover psplus-cover--placeholder" aria-label="${title}"><span class="psplus-cover-placeholder-text">PS</span></div>`;
        return `<article class="psplus-card">
  ${coverHtml}
  <div class="psplus-title" title="${title}">${title}</div>
</article>`;
      })
      .join("");
  }

  function renderPsplusItems(items, { append = false } = {}) {
    if (!psplusCatalogGrid) return;
    const html = buildCatalogPageHtml(items) || "<div class='deal-meta'>Нет данных.</div>";
    if (append) psplusCatalogGrid.insertAdjacentHTML("beforeend", html);
    else psplusCatalogGrid.innerHTML = html;
  }

  function getCatalogTotalPages() {
    if (!catalogTotalFromApi || !CATALOG_LIMIT) return catalogPages.length || 1;
    return Math.max(1, Math.ceil(catalogTotalFromApi / CATALOG_LIMIT));
  }

  function renderCatalogCarousel() {
    if (!psplusCatalogCarouselTrack) return;
    const totalLoaded = catalogPages.length;
    const totalPages = getCatalogTotalPages();
    psplusCatalogCarouselTrack.innerHTML = catalogPages
      .map(
        (html, i) =>
          `<div class="subs-catalog-carousel__page"><div class="subs-catalog-grid"${i === 0 ? ' id="psplusCatalogGrid"' : ""}>${html}</div></div>`
      )
      .join("");
    if (psplusCatalogCounter) psplusCatalogCounter.textContent = totalLoaded > 0 ? `${catalogCurrentPage + 1} / ${totalPages}` : "0";
    if (psplusCatalogPrev) psplusCatalogPrev.disabled = catalogCurrentPage <= 0;
    if (psplusCatalogMore) {
      const hasMore = catalogOffsets[catalogType] < catalogTotalFromApi;
      const canGoNext = catalogCurrentPage < totalLoaded - 1;
      psplusCatalogMore.style.display = totalLoaded === 0 ? "none" : "inline-flex";
      psplusCatalogMore.disabled = !canGoNext && !hasMore;
    }
    psplusCatalogCarouselTrack.style.transform = `translateX(-${catalogCurrentPage * 100}%)`;
  }

  function goToCatalogPage(n) {
    const totalLoaded = catalogPages.length;
    if (totalLoaded === 0) return;
    catalogCurrentPage = Math.max(0, Math.min(n, totalLoaded - 1));
    if (psplusCatalogCarouselTrack) psplusCatalogCarouselTrack.style.transform = `translateX(-${catalogCurrentPage * 100}%)`;
    const totalPages = getCatalogTotalPages();
    if (psplusCatalogCounter) psplusCatalogCounter.textContent = `${catalogCurrentPage + 1} / ${totalPages}`;
    if (psplusCatalogPrev) psplusCatalogPrev.disabled = catalogCurrentPage <= 0;
    if (psplusCatalogMore) {
      const hasMore = catalogOffsets[catalogType] < catalogTotalFromApi;
      const canGoNext = catalogCurrentPage < totalLoaded - 1;
      psplusCatalogMore.disabled = !canGoNext && !hasMore;
    }
    scrollToSubscriptionsSection();
  }

  async function loadPsplusCatalog({ reset = false } = {}) {
    if (!psplusCatalogCarouselTrack && !psplusCatalogGrid) return;
    if (psplusLoading) return;
    psplusLoading = true;

    if (reset) {
      if (psplusCatalogNav) psplusCatalogNav.style.display = "none";
      catalogOffsets[catalogType] = 0;
      catalogPrefetchCache.clear();
      catalogPages = [psLoaderHtml("Загружаем каталог…")];
      catalogCurrentPage = 0;
      if (psplusCatalogCarouselTrack) renderCatalogCarousel();
      else if (psplusCatalogGrid) psplusCatalogGrid.innerHTML = psLoaderHtml("Загружаем каталог…");
    }

    try {
      // Запрос к API (через тот же домен/порт, где открыт сайт)
      const endpoint = CATALOGS[catalogType]?.endpoint || "/api/psplus-catalog";
      const urlObj = new URL(endpoint, window.location.origin);
      urlObj.searchParams.set("region", psplusRegion);
      urlObj.searchParams.set("pages", String(CATALOG_PAGES));
      urlObj.searchParams.set("sort", "popular");
      urlObj.searchParams.set("offset", String(catalogOffsets[catalogType] || 0));
      urlObj.searchParams.set("limit", String(CATALOG_LIMIT));

      const res = await fetch(urlObj.toString(), {
        headers: { Accept: "application/json" },
      });

      const contentType = (res.headers.get("content-type") || "").toLowerCase();
      const raw = await res.text();

      // Если сервер/хостинг вернул HTML (например index.html), покажем понятную ошибку
      if (!contentType.includes("application/json")) {
        const head = raw.slice(0, 120).replace(/\s+/g, " ").trim();
        throw new Error(
          `Ответ не JSON (${res.status}). URL: ${res.url || urlObj.pathname}. ${head}`
        );
      }

      const data = raw ? JSON.parse(raw) : {};
      if (data.error) throw new Error(data.error);

      const items = Array.isArray(data.items) ? data.items : [];
      catalogTotalFromApi = Number(data.total || 0);
      const pageHtml = buildCatalogPageHtml(items);

      if (reset) {
        catalogPages = [pageHtml];
        catalogCurrentPage = 0;
      } else {
        catalogPages.push(pageHtml);
        catalogCurrentPage = catalogPages.length - 1;
      }

      catalogOffsets[catalogType] = (catalogOffsets[catalogType] || 0) + items.length;

      if (psplusCatalogCarouselTrack) {
        renderCatalogCarousel();
      } else {
        renderPsplusItems(items, { append: !reset && (catalogOffsets[catalogType] || 0) > 0 });
        if (psplusCatalogMore) {
          psplusCatalogMore.style.display =
            (catalogOffsets[catalogType] || 0) >= catalogTotalFromApi ? "none" : "inline-flex";
        }
      }

      // Показать навигацию после появления первой страницы
      if (reset && psplusCatalogNav) psplusCatalogNav.style.display = "";

      if (psplusCatalogLink) {
        const baseUrl = String(data.baseUrl || "").trim();
        if (baseUrl) {
          // Essential ведёт на playstation.com/ps-plus/games — не добавляем /1
          const isPlaystationCom = baseUrl.includes("playstation.com/") && !baseUrl.includes("store.playstation.com");
          psplusCatalogLink.href = isPlaystationCom ? baseUrl : `${baseUrl}/1`;
        }
      }

      // Prefetch следующей страницы текущего типа каталога
      const nextOffset = catalogOffsets[catalogType] || 0;
      const hasMore = nextOffset < catalogTotalFromApi;
      const pKey = catalogPrefetchKey(catalogType, nextOffset);
      if (hasMore && !catalogPrefetchCache.has(pKey)) {
        const endpoint = CATALOGS[catalogType]?.endpoint || "/api/psplus-catalog";
        const urlNext = new URL(endpoint, window.location.origin);
        urlNext.searchParams.set("region", psplusRegion);
        urlNext.searchParams.set("pages", String(CATALOG_PAGES));
        urlNext.searchParams.set("sort", "popular");
        urlNext.searchParams.set("offset", String(nextOffset));
        urlNext.searchParams.set("limit", String(CATALOG_LIMIT));

        const promise = fetch(urlNext.toString(), { headers: { Accept: "application/json" } })
          .then((r) => r.json())
          .then((d) => {
            if (!d.items) throw new Error(d.error || "Не удалось загрузить.");
            const items = Array.isArray(d.items) ? d.items : [];
            return {
              total: Number(d.total || 0),
              itemsLen: items.length,
              html: buildCatalogPageHtml(items),
            };
          })
          .catch(() => null);

        catalogPrefetchCache.set(pKey, { promise });
      }
    } catch (e) {
      const errHtml = `<div class='deal-meta'>Не удалось загрузить каталог: ${e.message}</div>`;
      if (psplusCatalogCarouselTrack) {
        catalogPages = [errHtml];
        renderCatalogCarousel();
      } else if (psplusCatalogGrid) {
        psplusCatalogGrid.innerHTML = errHtml;
      }
      if (psplusCatalogMore) psplusCatalogMore.style.display = "none";
      if (reset && psplusCatalogNav) psplusCatalogNav.style.display = "";
    } finally {
      psplusLoading = false;
    }
  }

  // Выбор подписки для каталога: при клике открывается панель и грузится каталог
  function handleCatalogChoiceClick(e) {
    const btn = e.currentTarget;
    const choice = btn?.dataset?.catalog;
    if (!choice) return;
    setCatalogChoice(choice);
    if (subsCatalogPanel) subsCatalogPanel.hidden = false;
    loadPsplusCatalog({ reset: true });
  }

  [catalogTabEssential, catalogTabExtra, catalogTabDeluxe, catalogTabEa].filter(Boolean).forEach((btn) => {
    btn.addEventListener("click", handleCatalogChoiceClick);
  });

  // Под-вкладки разделов: Каталог игр | Ubisoft+ | (для Делюкс) Каталог классики
  catalogDeluxeTabs?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-deluxe]");
    if (!btn) return;
    const key = btn.dataset.deluxe;
    const allowed = new Set(SECTION_KEYS[catalogChoice] || []);
    if (!allowed.has(key)) return;
    catalogType = btn.dataset.deluxe;
    catalogDeluxeTabs.querySelectorAll("[data-deluxe]").forEach((b) => b.classList.toggle("subs-tab--active", b === btn));
    if (psplusCatalogNote) psplusCatalogNote.textContent = CATALOGS[catalogType]?.note ?? "";
    loadPsplusCatalog({ reset: true });
  });

  // Панель каталога видна по умолчанию (первая загрузка — ниже)
  if (subsCatalogPanel) subsCatalogPanel.hidden = false;

  function scrollToSubscriptionsSection() {
    const el =
      document.querySelector("#subsPricing .subs-catalog-choice") ||
      document.getElementById("subsPricing") ||
      document.getElementById("subscriptions");
    scrollToElement(el, 100);
  }

  psplusCatalogPrev?.addEventListener("click", () => {
    goToCatalogPage(catalogCurrentPage - 1);
  });

  psplusCatalogMore?.addEventListener("click", async () => {
    // Если следующая страница уже загружена — просто перелистываем
    if (catalogPages.length > 0 && catalogCurrentPage < catalogPages.length - 1) {
      goToCatalogPage(catalogCurrentPage + 1);
      return;
    }

    // Если следующая страница префетчена — применяем мгновенно
    const off = catalogOffsets[catalogType] || 0;
    const key = catalogPrefetchKey(catalogType, off);
    const pref = catalogPrefetchCache.get(key);
    if (pref?.promise) {
      try {
        const ready = await pref.promise;
        catalogPrefetchCache.delete(key);
        if (ready && ready.itemsLen > 0) {
          catalogTotalFromApi = Number(ready.total || catalogTotalFromApi || 0);
          catalogPages.push(ready.html);
          catalogCurrentPage = catalogPages.length - 1;
          catalogOffsets[catalogType] = (catalogOffsets[catalogType] || 0) + ready.itemsLen;
          renderCatalogCarousel();
          scrollToSubscriptionsSection();
          return;
        }
      } catch {
        catalogPrefetchCache.delete(key);
      }
    }

    loadPsplusCatalog({ reset: false }).then(() => scrollToSubscriptionsSection());
  });

  // вкладки каталога (Экстра / Делюкс / EA Play)
  // Первая загрузка каталога (Экстра по умолчанию)
  if (subsCatalogPanel) {
    setCatalogChoice("psplus_essential");
    loadPsplusCatalog({ reset: true });
  }

  function subsRegionKeyFromLabel(label) {
    const s = String(label || "").toLowerCase();
    if (s.includes("европ")) return "ua";
    if (s.includes("турц")) return "tr";
    // fallback: если вдруг поменяли подписи — считаем UA
    return "ua";
  }

  function subCartKey(regionKey, plan, period) {
    return `sub:${regionKey}|${plan}|${period}`;
  }

  function setSubsLineState(lineEl, inCart) {
    if (!lineEl) return;
    const yes = !!inCart;
    lineEl.classList.toggle("subs-line--in-cart", yes);
    lineEl.setAttribute("aria-pressed", yes ? "true" : "false");
  }

  function updateSubsLinesState() {
    if (!subsPricing) return;
    subsPricing.querySelectorAll(".subs-line[data-plan][data-period]").forEach((line) => {
      const regionKey = subsRegionKeyFromLabel(line.dataset.region);
      const plan = String(line.dataset.plan || "");
      const period = String(line.dataset.period || "");
      const key = subCartKey(regionKey, plan, period);
      setSubsLineState(line, isKeyInCart(key));
    });
  }

  function addSubscriptionFromLine(line) {
    if (!line) return;
    const plan = String(line.dataset.plan || "");
    const period = String(line.dataset.period || "");
    const price = Number(line.dataset.price || 0);
    const regionKey = subsRegionKeyFromLabel(line.dataset.region);

    if (!plan || !period || !Number.isFinite(price) || price <= 0) return;

    const group = subGroupFromPlanOrTitle(plan);
    const key = subCartKey(regionKey, plan, period);

    // toggle off
    if (isKeyInCart(key)) {
      cartRemove(key);
      showToast("Удалено из корзины", "success", 1400);
      updateSubsLinesState();
      return;
    }

    // взаимоисключающие выборы:
    // - PS Plus: только один вариант (тариф+срок)
    // - EA Play: только один срок (1 или 12)
    const toRemove = cart
      .filter((it) => {
        const norm = normalizeCartItem(it);
        return norm.type === "sub" && norm.subGroup === group;
      })
      .map((it) => getCartKey(it))
      .filter((k) => k && k !== key);

    if (toRemove.length) cartRemoveMany(toRemove);

    const item = {
      type: "sub",
      subGroup: group,
      key,
      title: `Подписка: ${plan} • ${period}`,
      plan,
      period,
      region: regionKey,
      rubPrice: price,
      img: "", // для подписок не обязателен
      url: "",
    };

    const r = cartAdd(item);
    if (r === "added" || r === "exists") {
      setSubsLineState(line, true);
      updateSubsLinesState(); // снимет "в корзине" со старых вариантов
    }
  }

  if (subsPricing) {
    let subsLineTouch = null;
    let subsLineTouchHandled = null;
    subsPricing.addEventListener("touchstart", (e) => {
      const line = e.target.closest(".subs-line");
      subsLineTouch = line ? { el: line, x: e.touches[0].clientX, y: e.touches[0].clientY } : null;
    }, { passive: true });
    subsPricing.addEventListener("touchend", (e) => {
      const line = e.target.closest(".subs-line");
      if (!line || !subsLineTouch || subsLineTouch.el !== line) { subsLineTouch = null; return; }
      const t = e.changedTouches[0];
      const dx = t ? Math.abs(t.clientX - subsLineTouch.x) : 0;
      const dy = t ? Math.abs(t.clientY - subsLineTouch.y) : 0;
      if (dx < 12 && dy < 12) {
        e.preventDefault();
        addSubscriptionFromLine(line);
        subsLineTouchHandled = { el: line, at: Date.now() };
      }
      subsLineTouch = null;
    }, { passive: false });

    subsPricing.addEventListener("click", (e) => {
      const line = e.target.closest(".subs-line");
      if (!line) return;
      if (subsLineTouchHandled?.el === line && Date.now() - subsLineTouchHandled.at < 400) {
        subsLineTouchHandled = null;
        return;
      }
      subsLineTouchHandled = null;
      addSubscriptionFromLine(line);
    });

    subsPricing.addEventListener("keydown", (e) => {
      const line = e.target.closest(".subs-line");
      if (!line) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        addSubscriptionFromLine(line);
      }
    });

    // Кнопка «i» (что входит): используем один глобальный поповер, чтобы его не обрезал overflow карточки
    let subsInfoOverlay = document.getElementById("subsInfoOverlay");
    let subsInfoOverlayLastOpenAt = 0;
    let subsInfoOverlayAnchorBtn = null;

    function ensureSubsInfoOverlay() {
      if (subsInfoOverlay) return subsInfoOverlay;
      subsInfoOverlay = document.createElement("div");
      subsInfoOverlay.id = "subsInfoOverlay";
      subsInfoOverlay.className = "subs-info-popover subs-info-popover--overlay";
      subsInfoOverlay.setAttribute("role", "tooltip");
      document.body.appendChild(subsInfoOverlay);
      return subsInfoOverlay;
    }

    function closeSubsInfoOverlay() {
      if (!subsInfoOverlay) return;
      subsInfoOverlay.classList.remove("is-open");
      subsInfoOverlay.innerHTML = "";
      subsInfoOverlay.style.left = "";
      subsInfoOverlay.style.top = "";
      subsInfoOverlayAnchorBtn = null;
    }

    function positionSubsInfoOverlay(btn) {
      if (!subsInfoOverlay || !btn) return;
      const rect = btn.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const gap = 8;
      // сначала ставим приблизительно, затем клампим по фактическим размерам
      subsInfoOverlay.style.left = `${Math.max(12, rect.left)}px`;
      subsInfoOverlay.style.top = `${Math.max(12, rect.bottom + gap)}px`;

      const box = subsInfoOverlay.getBoundingClientRect();
      let left = rect.left;
      let top = rect.bottom + gap;

      // если не помещается снизу — показываем сверху
      if (top + box.height > vh - 12) top = rect.top - box.height - gap;

      // clamp
      left = Math.max(12, Math.min(left, vw - box.width - 12));
      top = Math.max(12, Math.min(top, vh - box.height - 12));

      subsInfoOverlay.style.left = `${left}px`;
      subsInfoOverlay.style.top = `${top}px`;
    }

    subsPricing.addEventListener("click", (e) => {
      const btn = e.target.closest(".subs-info-btn");
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();

      const wrap = btn.closest(".subs-name-wrap");
      const source = wrap?.querySelector(".subs-info-popover");
      if (!source) return;

      const overlay = ensureSubsInfoOverlay();

      // toggle: если нажали ту же кнопку и поповер открыт — закрываем
      if (overlay.classList.contains("is-open") && subsInfoOverlayAnchorBtn === btn) {
        closeSubsInfoOverlay();
        return;
      }

      // открываем и переносим контент
      overlay.innerHTML = source.innerHTML;
      overlay.classList.add("is-open");
      subsInfoOverlayAnchorBtn = btn;
      subsInfoOverlayLastOpenAt = Date.now();

      // позиционирование после вставки контента
      requestAnimationFrame(() => positionSubsInfoOverlay(btn));
    });

    // закрытие по клику вне / скроллу / ресайзу
    document.addEventListener("click", (e) => {
      if (!subsInfoOverlay || !subsInfoOverlay.classList.contains("is-open")) return;
      if (Date.now() - subsInfoOverlayLastOpenAt < 250) return;
      if (e.target.closest(".subs-info-btn") || e.target.closest("#subsInfoOverlay")) return;
      closeSubsInfoOverlay();
    });
    window.addEventListener("scroll", closeSubsInfoOverlay, { passive: true, capture: true });
    window.addEventListener("resize", closeSubsInfoOverlay, { passive: true });
  }

  function showSubsRegion(regionKey) {
    const isUA = regionKey === "ua";
    if (subsTabUA && subsTabTR) {
      subsTabUA.classList.toggle("subs-tab--active", isUA);
      subsTabTR.classList.toggle("subs-tab--active", !isUA);
    }
    subsUA?.classList.toggle("hidden", !isUA);
    subsTR?.classList.toggle("hidden", isUA);

    // после смены региона — синхронизируем состояния
    updateSubsLinesState();

    // каталог PS Plus тоже зависит от региона
    psplusRegion = regionKey;
    if (subsCatalogPanel && !subsCatalogPanel.hidden) loadPsplusCatalog({ reset: true });

    // подпись вкладки Essential зависит от региона
    if (catalogTabEssential) catalogTabEssential.textContent = regionKey === "tr" ? "Essential" : "Основная";

    // подписи вкладок Extra/Deluxe: Extra зависит от региона, Deluxe тоже
    if (catalogTabExtra) catalogTabExtra.textContent = regionKey === "tr" ? "Extra" : "Экстра";
    if (catalogTabDeluxe) catalogTabDeluxe.textContent = regionKey === "tr" ? "Deluxe" : "Люкс";
  }

  // вкладки региона подписок
  subsTabUA?.addEventListener("click", () => showSubsRegion("ua"));
  subsTabTR?.addEventListener("click", () => showSubsRegion("tr"));

  function calculateGame({ showAlerts = false } = {}) {
    const regionKey = regionSelect.value;
    const settings = SETTINGS[regionKey];

    if (!settings) {
      if (showAlerts) alert("Неизвестный регион.");
      resultCard.classList.add("hidden");
      return;
    }

    const rawBase = basePriceInput.value.trim().replace(",", ".");
    if (!rawBase) {
      resultCard.classList.add("hidden");
      return;
    }

    const basePrice = parseFloat(rawBase);
    if (isNaN(basePrice) || basePrice <= 0) {
      if (showAlerts) alert("Введите корректную цену больше 0.");
      resultCard.classList.add("hidden");
      return;
    }

    const inputCurrency = settings.inputCurrency;
    const rate = getRate(regionKey, basePrice);

    let finalRub = basePrice * rate;
    finalRub = niceRubPrice(finalRub);

    // ✅ итог БЕЗ копеек (и без перезаписи toFixed(2))
    finalPriceSpan.textContent = String(finalRub);
    finalCurrencySpan.textContent = OUTPUT_CURRENCY;

    // исходная цена — можно оставить с копейками
    resultBasePriceSpan.textContent = basePrice.toFixed(2);
    resultCurrencySpan.textContent = inputCurrency;

    resultCard.classList.remove("hidden");
  }

  // инициализация: подписки видимы всегда, калькулятор считает игры
  showSubsRegion("ua");
  calculateGame();

  basePriceInput.addEventListener("input", () => {
    calculateGame();
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    calculateGame({ showAlerts: true });
  });

  const serviceCards = document.querySelectorAll(".service-card[data-action]");

  function scrollToCalculator() {
    const calcSection = document.getElementById("calculator");
    if (calcSection) {
      calcSection.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function scrollToSubscriptions() {
    const subsSection = document.getElementById("subscriptions");
    if (subsSection) {
      subsSection.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  serviceCards.forEach((card) => {
    const action = card.getAttribute("data-action");

    const run = () => {
      if (action === "games") {
        scrollToCalculator();
        setTimeout(() => basePriceInput?.focus(), 350);
      }

      if (action === "subs") {
        scrollToSubscriptions();
      }

      if (action === "consult") {
        const url = `https://wa.me/${WHATSAPP_PHONE}`;
        window.location.href = url;
      }
    };

    card.addEventListener("click", run);

    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        run();
      }
    });
  });

  if (orderBtn) {
    orderBtn.addEventListener("click", () => {
      const region = regionSelect.value === "ua" ? "Европа (UA)" : "Турция";

      if (!basePriceInput.value.trim()) {
        alert("Введите цену игры для оформления заказа.");
        return;
      }

      const finalPrice = finalPriceSpan.textContent;

      const message = `Здравствуйте!
Хочу оформить покупку игры.

Регион аккаунта: ${region}
Итоговая цена: ${finalPrice} ₽`;

      const url =
        "https://wa.me/" +
        WHATSAPP_PHONE +
        "?text=" +
        encodeURIComponent(message);

      window.location.href = url;
    });
  }

  regionSelect.addEventListener("change", () => {
    calculateGame();
  });

  const sections = document.querySelectorAll(
    "section.section, section.section-alt"
  );

  if (sections.length > 0 && "IntersectionObserver" in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio > 0.3) {
            entry.target.classList.add("section-visible");
            entry.target.classList.add("section-active");
          } else {
            entry.target.classList.remove("section-active");
          }
        });
      },
      { threshold: [0.25, 0.4] }
    );

    sections.forEach((section) => observer.observe(section));
  }

  setTimeout(() => {
    document
      .querySelectorAll("section.section, section.section-alt")
      .forEach((s) => {
        s.classList.add("section-visible");
      });
  }, 1000);

  // ====== DEALS (Скидки) ======
  const dealsGrid = document.getElementById("dealsGrid");

  const dealsTabUA = document.getElementById("dealsTabUA");
  const dealsTabTR = document.getElementById("dealsTabTR");
  const dealsSortSelect = document.getElementById("dealsSort");
  const dealsMoreBtn = document.getElementById("dealsMore");
  const dealsCarouselTrack = document.getElementById("dealsCarouselTrack");
  const dealsCarouselCounter = document.getElementById("dealsCarouselCounter");
  const dealsCarouselPrev = document.getElementById("dealsCarouselPrev");
  const dealsCarouselNav =
    dealsMoreBtn?.closest(".deals-carousel__nav") ||
    dealsCarouselPrev?.closest(".deals-carousel__nav") ||
    null;

  let dealsRegion = "ua"; // ua | tr
  let dealsSort = "popular"; // popular | discount | new
  let dealsOffset = 0;
  const DEALS_LIMIT = 24;
  let dealsPages = []; // массив HTML-строк, по одной на страницу карусели
  let dealsCurrentPage = 0;
  let dealsTotalFromApi = 0;

  // ====== DEALS SEARCH + FAVORITES VIEW ======
  let dealsSearchQuery = "";
  let dealsSearchActive = false;

  // Режим "показываем только избранное"
  let favoritesViewActive = false;

  // Полный список скидок (кэш)
  // ключ = `${region}|${sort}` -> массив всех items
  const dealsFullCache = new Map();

  // Prefetch следующей страницы (ускорение клика «Показать ещё»)
  // key = `${region}|${sort}|${offset}`
  const dealsPrefetchCache = new Map();

  function dealsPrefetchKey(offset) {
    return `${dealsRegion}|${dealsSort}|${offset}`;
  }

  function prunePrefetchCache(map, maxSize = 6) {
    while (map.size > maxSize) {
      const firstKey = map.keys().next().value;
      if (firstKey == null) break;
      map.delete(firstKey);
    }
  }

  // ====== HEADER FAVORITES BUTTON (рядом с корзиной) ======
  function ensureFavHeaderButton() {
    if (document.getElementById("favOpenBtn")) return;
    if (!cartOpenBtn) return;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.id = "favOpenBtn";
    btn.className = "header-fav-btn";
    btn.setAttribute("aria-label", "Избранное");
    btn.innerHTML = `
    <span class="header-fav-btn__icon">♥</span>
    <span class="header-fav-btn__count" id="favCount"></span>
  `;

    // Вставим рядом с кнопкой корзины
    cartOpenBtn.insertAdjacentElement("beforebegin", btn);

    btn.addEventListener("click", async () => {
      ensureDealsSearchUI();

      // toggle избранного
      favoritesViewActive = !favoritesViewActive;

      // сбрасываем текстовый поиск при переключении режима
      const input = document.getElementById("dealsSearchInput");
      if (input) input.value = "";
      dealsSearchQuery = "";
      dealsSearchActive = false;

      if (favoritesViewActive) {
        await renderFavoritesView();
        showToast("Показаны избранные игры", "success", 1400);
      } else {
        showToast("Избранное закрыто", "success", 1200);
        fetchDealsPage({ reset: true }).catch((e) => {
          if (dealsGrid)
            setDealsErrorHtml(`<div class='deal-meta'>Ошибка загрузки: ${e.message}</div>`);
        });
      }

      syncDealsControls();
    });

    // обновляет цифру на кнопке ♥ (функция у тебя есть выше по файлу)
    updateFavHeaderCount?.();
  }

  // Создадим кнопку в шапке сразу
  ensureFavHeaderButton();

  // ====== UI поиска (без кнопки "Найти") + отдельное закрытие избранного ======
  function ensureDealsSearchUI() {
    if (document.getElementById("dealsSearchWrap")) return;

    const anchor =
      dealsSortSelect?.parentElement ||
      dealsSortSelect ||
      dealsGrid?.parentElement;

    if (!anchor) return;

    const wrap = document.createElement("div");
    wrap.id = "dealsSearchWrap";
    wrap.className = "deals-search";

    // ✅ Внутри input: только очистка текста
    // ✅ Справа отдельно: закрытие избранного
    wrap.innerHTML = `
    <div class="deals-search__row">
      <div class="deals-search__field">
        <input
          id="dealsSearchInput"
          class="deals-search__input"
          type="search"
          placeholder="Поиск по скидкам (например: Mafia, FC26, UFC)…"
          autocomplete="off"
        />
        <button
          id="dealsSearchClear"
          class="deals-search__clear hidden"
          type="button"
          aria-label="Очистить поиск">×</button>
      </div>

      <button
        id="favCloseBtn"
        class="deals-fav-close hidden"
        type="button"
        aria-label="Закрыть избранное">×</button>
    </div>
  `;

    if (dealsSortSelect && dealsSortSelect.parentElement) {
      dealsSortSelect.parentElement.insertAdjacentElement("afterend", wrap);
    } else if (dealsGrid) {
      dealsGrid.insertAdjacentElement("beforebegin", wrap);
    } else {
      anchor.appendChild(wrap);
    }

    const input = document.getElementById("dealsSearchInput");
    const clear = document.getElementById("dealsSearchClear");
    const favCloseBtn = document.getElementById("favCloseBtn");

    // Ввод -> фильтрация на лету
    input?.addEventListener("input", () => {
      debounceSearch(() => applyDealsSearch(input.value), 180);
    });

    // Escape -> если есть текст — чистим поиск; если текста нет — просто blur
    input?.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        const q = String(input.value || "").trim();
        if (q) clearDealsSearch();
        input.blur();
      }
    });

    // крестик ВНУТРИ поля -> очистка текста
    clear?.addEventListener("click", () => {
      clearDealsSearch();
      input?.focus();
    });

    // ✅ отдельная кнопка закрытия избранного справа
    favCloseBtn?.addEventListener("click", async () => {
      favoritesViewActive = false;

      // если в поле есть текст — оставим поиск, но уже по всем скидкам
      const q = String(input?.value || "").trim();
      if (q) {
        dealsSearchQuery = q;
        dealsSearchActive = true;
        await applyDealsSearch(q);
        syncDealsControls();
        return;
      }

      // иначе — обычная лента
      dealsSearchQuery = "";
      dealsSearchActive = false;

      fetchDealsPage({ reset: true }).catch((e) => {
        setDealsErrorHtml(`<div class='deal-meta'>Ошибка загрузки: ${e.message}</div>`);
      });

      syncDealsControls();
    });

    syncDealsControls();
  }

  // ✅ видимость двух кнопок управления:
  // - крестик очистки (внутри поля) -> только когда есть текст
  // - крестик закрытия избранного (справа) -> только когда favoritesViewActive = true
  function syncDealsControls() {
    const input = document.getElementById("dealsSearchInput");
    const clearBtn = document.getElementById("dealsSearchClear");
    const favCloseBtn = document.getElementById("favCloseBtn");

    const hasText = !!String(input?.value || "").trim();

    if (clearBtn) clearBtn.classList.toggle("hidden", !hasText);
    if (favCloseBtn)
      favCloseBtn.classList.toggle("hidden", !favoritesViewActive);
  }

  // маленький debounce
  let _searchT = null;
  function debounceSearch(fn, ms = 180) {
    clearTimeout(_searchT);
    _searchT = setTimeout(fn, ms);
  }

  // Загрузить ВЕСЬ список скидок в память (для поиска/избранного)
  async function loadAllDealsForCurrentRegionSort() {
    const key = `${dealsRegion}|${dealsSort}`;
    if (dealsFullCache.has(key)) return dealsFullCache.get(key);

    if (dealsGrid) dealsGrid.innerHTML = psLoaderHtml("Загружаем полный список…");

    const all = [];
    let offset = 0;
    const limit = 60;
    let total = Infinity;

    while (offset < total) {
      const apiUrl = `/api/deals?region=${dealsRegion}&pages=10&sort=${dealsSort}&offset=${offset}&limit=${limit}`;
      const res = await fetch(apiUrl);
      const data = await res.json();

      if (!data.items)
        throw new Error(
          data.error || "Не удалось загрузить скидки для поиска."
        );

      total = Number(data.total || 0);
      all.push(...data.items);

      offset += data.items.length;
      if (data.items.length === 0) break;
    }

    dealsFullCache.set(key, all);
    return all;
  }

  function normalizeForSearch(s) {
    return String(s || "")
      .toLowerCase()
      .replace(/\u00A0/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function filterDeals(items, query) {
    const q = normalizeForSearch(query);
    if (!q) return items;
    return items.filter((it) => normalizeForSearch(it.title).includes(q));
  }

  function renderDealsFromItems(items) {
    if (!dealsClickRoot) return;

    if (!items || items.length === 0) {
      const emptyHtml = "<div class='deal-meta'>Ничего не найдено.</div>";
      if (dealsCarouselTrack) {
        dealsPages = [emptyHtml];
        dealsCurrentPage = 0;
        renderDealsCarousel();
      } else if (dealsGrid) {
        dealsGrid.innerHTML = emptyHtml;
      }
      if (dealsMoreBtn) dealsMoreBtn.style.display = "none";
      return;
    }

    const cards = items
      .map((it) => {
        const meta =
          it.discountPercent != null
            ? `-${it.discountPercent}% • ${it.psOffer}`
            : it.psOffer;

        const safeTitle = (it.title || "").replace(/"/g, "&quot;");
        const img = makeHiResImg(it.img, 720);

        const favActive = isFavorite(it.url) ? "fav-btn--active" : "";
        const inCart = isInCart(dealsRegion, it.url);
        const buyClass = inCart ? "deal-buy--in-cart" : "";
        const buyText = inCart ? "В корзине" : "Купить";

        return `
<article class="deal-card"
  data-url="${it.url}"
  data-title="${safeTitle}"
  data-img="${img}"
  data-rub="${it.rubPrice}">
  <div class="deal-media">

    <button class="fav-btn ${favActive}" type="button"
      aria-label="Добавить в избранное"
      data-action="toggle-fav"
      data-url="${it.url}">
      ♥
    </button>

    <img class="deal-img"
      src="${makeHiResImg(it.img, 720)}"
      srcset="${buildSrcset(it.img)}"
      sizes="(max-width: 800px) 50vw, 16vw"
      alt="${safeTitle}"
      loading="lazy"
    />
    ${
      it.discountPercent != null
        ? `<div class="deal-badge">-${it.discountPercent}</div>`
        : ``
    }
  </div>

  <div class="deal-body">
    <div class="deal-title" title="${safeTitle}">${it.title}</div>

    <div class="deal-priceRow">
      <div class="deal-rub">${it.rubPrice} ₽</div>
      <div class="deal-ps">${meta || ""}</div>
    </div>

    <div class="deal-actions">
      <button class="deal-btn deal-buy ${buyClass}" type="button" aria-pressed="${inCart ? "true" : "false"}"
        data-action="add-to-cart"
        data-title="${safeTitle}"
        data-img="${img}"
        data-url="${it.url}"
        data-rub="${it.rubPrice}"
        data-region="${dealsRegion}">
        ${buyText}
      </button>
    </div>
  </div>
</article>
`;
      })
      .join("");

    if (dealsCarouselTrack) {
      dealsPages = [cards];
      dealsCurrentPage = 0;
      renderDealsCarousel();
      if (dealsMoreBtn) dealsMoreBtn.style.display = "none";
    } else if (dealsGrid) {
      dealsGrid.innerHTML = cards;
      if (dealsMoreBtn) dealsMoreBtn.style.display = "none";
    }
  }

  async function renderFavoritesView() {
    ensureDealsSearchUI();

    if (!dealsClickRoot) return;

    if (!favs || !favs.size) {
      const emptyHtml = "<div class='deal-meta'>В избранном пока пусто. Нажми ♥ на игре — и она появится здесь.</div>";
      if (dealsCarouselTrack) {
        dealsPages = [emptyHtml];
        dealsCurrentPage = 0;
        renderDealsCarousel();
      } else if (dealsGrid) {
        dealsGrid.innerHTML = emptyHtml;
      }
      if (dealsMoreBtn) dealsMoreBtn.style.display = "none";
      syncDealsControls();
      return;
    }

    const all = await loadAllDealsForCurrentRegionSort();
    const favItems = (all || []).filter((it) => isFavorite(it.url));

    // если есть поиск — фильтруем внутри избранного
    const q = String(dealsSearchQuery || "").trim();
    const shown = q ? filterDeals(favItems, q) : favItems;

    renderDealsFromItems(shown);
    syncDealsControls();
  }

  async function applyDealsSearch(query) {
    const q = String(query || "");
    dealsSearchQuery = q;

    ensureDealsSearchUI();

    // пусто -> выключаем поиск
    if (!q.trim()) {
      dealsSearchActive = false;

      if (favoritesViewActive) {
        await renderFavoritesView();
        syncDealsControls();
        return;
      }

      fetchDealsPage({ reset: true }).catch((e) => {
        setDealsErrorHtml(`<div class='deal-meta'>Ошибка загрузки: ${e.message}</div>`);
      });

      syncDealsControls();
      return;
    }

    dealsSearchActive = true;

    // если избранное активно — фильтруем только избранное
    if (favoritesViewActive) {
      await renderFavoritesView();
      syncDealsControls();
      return;
    }

    // иначе — фильтруем полный список скидок
    const all = await loadAllDealsForCurrentRegionSort();
    const filtered = filterDeals(all, q);
    renderDealsFromItems(filtered);
    syncDealsControls();
  }

  function clearDealsSearch() {
    dealsSearchQuery = "";
    dealsSearchActive = false;

    const input = document.getElementById("dealsSearchInput");
    if (input) input.value = "";

    if (favoritesViewActive) {
      renderFavoritesView();
      syncDealsControls();
      return;
    }

    fetchDealsPage({ reset: true }).catch((e) => {
      if (dealsGrid)
        setDealsErrorHtml(`<div class='deal-meta'>Ошибка загрузки: ${e.message}</div>`);
    });

    syncDealsControls();
  }

  // ====== MODAL HANDLERS ======
  const dealModal = document.getElementById("dealModal");
  const dealModalOverlay = document.getElementById("dealModalOverlay");
  const dealModalClose = document.getElementById("dealModalClose");

  const dealModalImg = document.getElementById("dealModalImg");
  const dealModalTitle = document.getElementById("dealModalTitle");
  const dealModalPrice = document.getElementById("dealModalPrice");
  const dealModalBuy = document.getElementById("dealModalBuy");

  const dealModalUntil = document.getElementById("dealModalUntil");
  const dealModalPlatform = document.getElementById("dealModalPlatform");
  const dealModalRu = document.getElementById("dealModalRu");

  let currentModalItem = null;

  // ❤️ FAVORITE button inside modal (рядом с Купить)
  function ensureModalFavButton() {
    if (document.getElementById("dealModalFavBtn")) return;
    if (!dealModalBuy) return;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.id = "dealModalFavBtn";
    btn.className = "modal-fav";
    btn.setAttribute("aria-label", "Избранное");
    btn.textContent = "♥";

    dealModalBuy.insertAdjacentElement("afterend", btn);

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      if (!currentModalItem?.url) return;

      const nowFav = toggleFavorite(currentModalItem.url);
      syncModalFavButton();

      showToast(
        nowFav ? "Добавлено в избранное" : "Удалено из избранного",
        "success",
        1400
      );

      // если мы в избранном режиме и удалили — карточка должна исчезнуть
      if (favoritesViewActive && !nowFav) {
        renderFavoritesView();
      }
    });
  }

  function syncModalFavButton() {
    const btn = document.getElementById("dealModalFavBtn");
    if (!btn) return;

    const active = currentModalItem?.url
      ? isFavorite(currentModalItem.url)
      : false;
    btn.classList.toggle("modal-fav--active", active);
  }

  function openDealModal() {
    if (!dealModal) return;
    dealModal.classList.remove("hidden");
    dealModal.setAttribute("aria-hidden", "false");
    document.body.classList.add("menu-open");
  }

  function closeDealModal() {
    if (!dealModal) return;
    dealModal.classList.add("hidden");
    dealModal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("menu-open");
  }

  dealModalOverlay?.addEventListener("click", closeDealModal);
  dealModalClose?.addEventListener("click", closeDealModal);
  document.addEventListener("keydown", (e) => {
    if (
      e.key === "Escape" &&
      dealModal &&
      !dealModal.classList.contains("hidden")
    ) {
      closeDealModal();
    }
  });

  if (dealModalImg) {
    dealModalImg.onerror = () => {
      dealModalImg.style.display = "none";
    };
    dealModalImg.onload = () => {
      dealModalImg.style.display = "";
    };
  }

  if (dealModalBuy) {
    dealModalBuy.addEventListener("click", (e) => {
      e.preventDefault();
      if (!currentModalItem) return;
      const key = getCartKey({
        type: "game",
        region: currentModalItem.region,
        url: currentModalItem.url,
      });

      if (isKeyInCart(key)) {
        cartRemove(key);
        dealModalBuy.textContent = "Купить";
        showToast("Удалено из корзины", "success", 1400);
        return;
      }

      const r = cartAdd(currentModalItem);
      if (r === "added" || r === "exists") dealModalBuy.textContent = "В корзине";
    });
  }

  // Единый контейнер для делегирования (карусель или один грид)
  const dealsClickRoot = dealsCarouselTrack || dealsGrid;

  // ✅ ЕДИНСТВЕННЫЙ обработчик кликов по гриду/карусели:
  dealsClickRoot?.addEventListener("click", async (e) => {
    // 0) ❤️ Избранное (сердечко на обложке)
    const favBtn = e.target.closest('[data-action="toggle-fav"]');
    if (favBtn) {
      e.preventDefault();
      e.stopPropagation();

      const url = favBtn.dataset.url || "";
      const nowFav = toggleFavorite(url);

      favBtn.classList.toggle("fav-btn--active", nowFav);

      // если мы сейчас в избранном режиме и удалили — карточка должна исчезнуть
      if (favoritesViewActive && !nowFav) {
        await renderFavoritesView();
      }

      // если модалка на этой игре открыта — синхронизируем кнопку
      if (currentModalItem?.url && currentModalItem.url === url) {
        syncModalFavButton();
      }

      showToast(
        nowFav ? "Добавлено в избранное" : "Удалено из избранного",
        "success",
        1400
      );

      syncDealsControls();
      return;
    }

    // 1) Кнопка "Купить"
    const buyBtn = e.target.closest('[data-action="add-to-cart"]');
    if (buyBtn) {
      e.preventDefault();
      e.stopPropagation();

      const item = {
        title: buyBtn.dataset.title || "Игра",
        img: buyBtn.dataset.img || "",
        url: buyBtn.dataset.url || "",
        rubPrice: Number(buyBtn.dataset.rub || 0),
        region: buyBtn.dataset.region || dealsRegion,
      };

      const key = getCartKey({ type: "game", region: item.region, url: item.url });

      if (isKeyInCart(key)) {
        cartRemove(key);
        setBuyButtonState(buyBtn, false);
        showToast("Удалено из корзины", "success", 1400);
        return;
      }

      const r = cartAdd(item);
      if (r === "added" || r === "exists") setBuyButtonState(buyBtn, true);
      return;
    }

    // 2) Клик по карточке -> модалка
    const card = e.target.closest(".deal-card");
    if (!card) return;

    const url = card.dataset.url || "";
    const title = card.dataset.title || "Игра";
    const img = card.dataset.img || "";
    const rub = card.dataset.rub || "";

    dealModalTitle.textContent = title;

    const hi = makeHiResImg(img, 720);
    if (hi) {
      dealModalImg.src = hi;
      dealModalImg.srcset = buildSrcset(img);
      dealModalImg.sizes = "(max-width: 560px) 120px, 160px";
      dealModalImg.alt = title;
    } else {
      dealModalImg.removeAttribute("src");
      dealModalImg.removeAttribute("srcset");
      dealModalImg.alt = title;
    }

    dealModalPrice.textContent = rub ? `${rub} ₽` : "";
    dealModalPlatform.textContent = "Загрузка…";
    dealModalRu.textContent = "Загрузка…";
    dealModalUntil.textContent = "—";

    currentModalItem = {
      title,
      img,
      url,
      rubPrice: Number(rub || 0),
      region: dealsRegion,
    };

    if (dealModalBuy) {
      dealModalBuy.textContent = isInCart(dealsRegion, url) ? "В корзине" : "Купить";
    }

    ensureModalFavButton();
    syncModalFavButton();

    openDealModal();
    if (!url) {
      dealModalPlatform.textContent = "Нет ссылки на товар";
      dealModalRu.textContent = "—";
      dealModalUntil.textContent = "—";
      return;
    }

    try {
      const res = await fetch(
        `/api/game-details?region=${dealsRegion}&url=${encodeURIComponent(url)}`
      );
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      dealModalPlatform.textContent = data.platform || "—";
      dealModalRu.textContent = data.ruSupport || "—";
      dealModalUntil.textContent = data.discountUntil || "—";
    } catch (err) {
      dealModalPlatform.textContent = "Не удалось загрузить";
      dealModalRu.textContent = "—";
      dealModalUntil.textContent = "—";
    }
  });

  function buildDealsCardsHtml(items) {
    return (items || [])
      .map((it) => {
        const meta =
          it.discountPercent != null
            ? `-${it.discountPercent}% • ${it.psOffer}`
            : it.psOffer;
        const safeTitle = (it.title || "").replace(/"/g, "&quot;");
        const img = makeHiResImg(it.img, 720);
        const favActive = isFavorite(it.url) ? "fav-btn--active" : "";
        const inCart = isInCart(dealsRegion, it.url);
        const buyClass = inCart ? "deal-buy--in-cart" : "";
        const buyText = inCart ? "В корзине" : "Купить";
        return `
<article class="deal-card"
  data-url="${it.url}"
  data-title="${safeTitle}"
  data-img="${img}"
  data-rub="${it.rubPrice}">
  <div class="deal-media">
    <button class="fav-btn ${favActive}" type="button"
      aria-label="Добавить в избранное"
      data-action="toggle-fav"
      data-url="${it.url}">♥</button>
    <img class="deal-img"
      src="${makeHiResImg(it.img, 720)}"
      srcset="${buildSrcset(it.img)}"
      sizes="(max-width: 800px) 50vw, 16vw"
      alt="${safeTitle}"
      loading="lazy"
    />
    ${it.discountPercent != null ? `<div class="deal-badge">-${it.discountPercent}</div>` : ""}
  </div>
  <div class="deal-body">
    <div class="deal-title" title="${safeTitle}">${it.title}</div>
    <div class="deal-priceRow">
      <div class="deal-rub">${it.rubPrice} ₽</div>
      <div class="deal-ps">${meta || ""}</div>
    </div>
    <div class="deal-actions">
      <button class="deal-btn deal-buy ${buyClass}" type="button" aria-pressed="${inCart ? "true" : "false"}"
        data-action="add-to-cart"
        data-title="${safeTitle}"
        data-img="${img}"
        data-url="${it.url}"
        data-rub="${it.rubPrice}"
        data-region="${dealsRegion}">${buyText}</button>
    </div>
  </div>
</article>`;
      })
      .join("");
  }

  function getDealsTotalPages() {
    if (!dealsTotalFromApi || !DEALS_LIMIT) return Math.max(1, dealsPages.length);
    return Math.max(1, Math.ceil(dealsTotalFromApi / DEALS_LIMIT));
  }

  function scrollToDealsSection() {
    const input = document.getElementById("dealsSearchInput");
    const el = input || document.getElementById("deals");
    scrollToElement(el, 94);
  }

  function renderDealsCarousel() {
    if (!dealsCarouselTrack) return;
    const totalLoaded = dealsPages.length;
    const totalPages = getDealsTotalPages();
    dealsCarouselTrack.innerHTML = dealsPages
      .map(
        (html, i) =>
          `<div class="deals-carousel__page"><div class="deals-grid"${i === 0 ? ' id="dealsGrid"' : ""}>${html}</div></div>`
      )
      .join("");
    if (dealsCarouselCounter) dealsCarouselCounter.textContent = totalLoaded > 0 ? `${dealsCurrentPage + 1} / ${totalPages}` : "0";
    if (dealsCarouselPrev) dealsCarouselPrev.disabled = dealsCurrentPage <= 0;
    if (dealsMoreBtn) {
      const hasMoreData = dealsOffset < dealsTotalFromApi;
      const canGoNext = dealsCurrentPage < totalLoaded - 1;
      dealsMoreBtn.style.display = totalLoaded === 0 ? "none" : "inline-block";
      dealsMoreBtn.disabled = !canGoNext && !hasMoreData;
    }
    dealsCarouselTrack.style.transform = `translateX(-${dealsCurrentPage * 100}%)`;
  }

  function setDealsErrorHtml(html) {
    if (dealsCarouselTrack) {
      dealsPages = [html];
      dealsCurrentPage = 0;
      renderDealsCarousel();
    } else if (dealsGrid) dealsGrid.innerHTML = html;
  }

  function goToDealsPage(n) {
    const totalLoaded = dealsPages.length;
    if (totalLoaded === 0) return;
    dealsCurrentPage = Math.max(0, Math.min(n, totalLoaded - 1));
    if (dealsCarouselTrack) dealsCarouselTrack.style.transform = `translateX(-${dealsCurrentPage * 100}%)`;
    const totalPages = getDealsTotalPages();
    if (dealsCarouselCounter) dealsCarouselCounter.textContent = `${dealsCurrentPage + 1} / ${totalPages}`;
    if (dealsCarouselPrev) dealsCarouselPrev.disabled = dealsCurrentPage <= 0;
    if (dealsMoreBtn) {
      const hasMoreData = dealsOffset < dealsTotalFromApi;
      const canGoNext = dealsCurrentPage < totalLoaded - 1;
      dealsMoreBtn.disabled = !canGoNext && !hasMoreData;
    }
    scrollToDealsSection();
  }

  async function fetchDealsPage({ reset = false } = {}) {
    if (!dealsCarouselTrack && !dealsGrid) return;

    ensureDealsSearchUI();

    if (favoritesViewActive) {
      await renderFavoritesView();
      syncDealsControls();
      return;
    }

    if (dealsSearchActive && dealsSearchQuery && dealsSearchQuery.trim()) {
      await applyDealsSearch(dealsSearchQuery);
      syncDealsControls();
      return;
    }

    if (reset) {
      if (dealsCarouselNav) dealsCarouselNav.style.display = "none";
      dealsOffset = 0;
      dealsPrefetchCache.clear();
      dealsPages = [psLoaderHtml("Загружаем скидки…")];
      dealsCurrentPage = 0;
      if (dealsCarouselTrack) {
        renderDealsCarousel();
      } else if (dealsGrid) {
        dealsGrid.innerHTML = psLoaderHtml("Загружаем скидки…");
      }
    }

    const apiUrl = `/api/deals?region=${dealsRegion}&pages=10&sort=${dealsSort}&offset=${dealsOffset}&limit=${DEALS_LIMIT}`;

    const res = await fetch(apiUrl);
    const data = await res.json();

    if (!data.items) throw new Error(data.error || "Не удалось загрузить.");

    dealsTotalFromApi = Number(data.total || 0);
    const cardsHtml = buildDealsCardsHtml(data.items);

    if (reset) {
      dealsPages = [cardsHtml];
      dealsCurrentPage = 0;
    } else {
      dealsPages.push(cardsHtml);
      dealsCurrentPage = dealsPages.length - 1;
    }

    dealsOffset += data.items.length;
    if (dealsCarouselTrack) {
      renderDealsCarousel();
    } else if (dealsGrid) {
      if (reset) dealsGrid.innerHTML = cardsHtml;
      else dealsGrid.insertAdjacentHTML("beforeend", cardsHtml);
      if (dealsMoreBtn) dealsMoreBtn.style.display = dealsOffset >= dealsTotalFromApi ? "none" : "inline-block";
    }
    if (reset && dealsCarouselNav) dealsCarouselNav.style.display = "";
    syncDealsControls();

    // Тихо префетчим следующую страницу (если есть)
    if (!favoritesViewActive && !(dealsSearchActive && dealsSearchQuery && dealsSearchQuery.trim())) {
      const nextOffset = dealsOffset;
      const hasMore = nextOffset < dealsTotalFromApi;
      const key = dealsPrefetchKey(nextOffset);
      if (hasMore && !dealsPrefetchCache.has(key)) {
        const apiNext = `/api/deals?region=${dealsRegion}&pages=10&sort=${dealsSort}&offset=${nextOffset}&limit=${DEALS_LIMIT}`;
        const promise = fetch(apiNext)
          .then((r) => r.json())
          .then((d) => {
            if (!d.items) throw new Error(d.error || "Не удалось загрузить.");
            return {
              total: Number(d.total || 0),
              itemsLen: Array.isArray(d.items) ? d.items.length : 0,
              html: buildDealsCardsHtml(d.items),
            };
          })
          .catch(() => null);

        dealsPrefetchCache.set(key, { promise });
        prunePrefetchCache(dealsPrefetchCache, 6);
      }
    }
  }

  function setDealsTabs(active) {
    dealsTabUA?.classList.toggle("subs-tab--active", active === "ua");
    dealsTabTR?.classList.toggle("subs-tab--active", active === "tr");
  }

  // вкладки региона
  if (dealsTabUA && dealsTabTR) {
    dealsTabUA.addEventListener("click", async () => {
      dealsRegion = "ua";
      setDealsTabs("ua");

      // если мы в избранном режиме — перерисуем избранное для нового региона
      if (favoritesViewActive) {
        await renderFavoritesView();
        syncDealsControls();
        return;
      }

      clearDealsSearch();
    });

    dealsTabTR.addEventListener("click", async () => {
      dealsRegion = "tr";
      setDealsTabs("tr");

      if (favoritesViewActive) {
        await renderFavoritesView();
        syncDealsControls();
        return;
      }

      clearDealsSearch();
    });
  }

  // сортировка
  if (dealsSortSelect) {
    dealsSortSelect.addEventListener("change", async () => {
      dealsSort = dealsSortSelect.value;

      if (favoritesViewActive) {
        await renderFavoritesView();
        syncDealsControls();
        return;
      }

      fetchDealsPage({ reset: true }).catch((e) => {
        setDealsErrorHtml(`<div class='deal-meta'>Ошибка загрузки: ${e.message}</div>`);
      });
    });
  }

  // Назад / Вперёд (Показать ещё) для карусели скидок — скролл вверх только по кнопке «Показать ещё»
  dealsCarouselPrev?.addEventListener("click", () => {
    goToDealsPage(dealsCurrentPage - 1);
  });

  if (dealsMoreBtn) {
    dealsMoreBtn.addEventListener("click", async () => {
      // Если следующая страница уже загружена — просто перелистываем
      if (dealsPages.length > 0 && dealsCurrentPage < dealsPages.length - 1) {
        goToDealsPage(dealsCurrentPage + 1);
        return;
      }

      // Если страница уже префетчена — используем её без ожидания сети в момент клика
      const key = dealsPrefetchKey(dealsOffset);
      const pref = dealsPrefetchCache.get(key);
      if (pref?.promise) {
        try {
          const ready = await pref.promise;
          dealsPrefetchCache.delete(key);
          if (ready && ready.itemsLen > 0) {
            dealsTotalFromApi = Number(ready.total || dealsTotalFromApi || 0);
            dealsPages.push(ready.html);
            dealsCurrentPage = dealsPages.length - 1;
            dealsOffset += ready.itemsLen;
            renderDealsCarousel();
            syncDealsControls();
            scrollToDealsSection();
            return;
          }
        } catch {
          dealsPrefetchCache.delete(key);
        }
      }

      fetchDealsPage({ reset: false })
        .then(() => scrollToDealsSection())
        .catch((e) => {
          if (dealsCarouselTrack) {
            dealsPages = [`<div class='deal-meta'>Ошибка: ${e.message}</div>`];
            renderDealsCarousel();
          } else if (dealsGrid) {
            dealsGrid.insertAdjacentHTML(
              "beforeend",
              `<div class='deal-meta'>Ошибка: ${e.message}</div>`
            );
          }
        });
    });
  }

  async function safeFetchDealsFirstTime() {
    if (!dealsGrid) return;

    setDealsTabs("ua");
    if (dealsSortSelect) dealsSortSelect.value = "popular";

    await new Promise((r) =>
      requestAnimationFrame(() => requestAnimationFrame(r))
    );

    const attempts = 3;
    let lastErr = null;

    for (let i = 0; i < attempts; i++) {
      try {
        await fetchDealsPage({ reset: true });
        lastErr = null;
        break;
      } catch (e) {
        lastErr = e;
        await new Promise((r) => setTimeout(r, 400));
      }
    }

    if (lastErr) {
      setDealsErrorHtml(`<div class='deal-meta'>Ошибка загрузки: ${lastErr.message}</div>`);
    }
  }

  if (dealsGrid) {
    safeFetchDealsFirstTime();
  }

});
