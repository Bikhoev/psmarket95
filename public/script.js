// ====== НАСТРОЙКИ ======
const SETTINGS = {
  ua: { inputCurrency: "UAH" }, // Украина (гривны)
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
  const cartModal = document.getElementById("cartModal");
  const cartOverlay = document.getElementById("cartOverlay");
  const cartCloseBtn = document.getElementById("cartCloseBtn");
  const cartWhatsappBtn = document.getElementById("cartWhatsappBtn");
  const cartClearBtn = document.getElementById("cartClearBtn");
  const cartCount = document.getElementById("cartCount");
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
    const key = item.region + "|" + item.url;
    const exists = cart.some((x) => x.region + "|" + x.url === key);

    if (exists) {
      renderCart();
      showToast("Уже в корзине", "error", 1400);
      return "exists";
    }

    cart.push(item);
    saveCart();
    renderCart();
    showToast("Игра добавлена в корзину", "success", 1600);
    return "added";
  }

  function cartRemove(region, url) {
    cart = cart.filter((x) => !(x.region === region && x.url === url));
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
      sum += Number(it.rubPrice || 0);

      const el = document.createElement("div");
      el.className = "cart-item";
      el.innerHTML = `
        <img src="${makeHiResImg(it.img, 360)}" alt="">
        <div>
          <div class="cart-item-title">${it.title}</div>
          <div class="cart-item-meta">${
            it.region === "ua" ? "Украина" : "Турция"
          }</div>
          <button class="cart-remove" type="button">Удалить</button>
        </div>
        <div class="cart-item-price">${it.rubPrice} ₽</div>
      `;

      el.querySelector(".cart-remove").addEventListener("click", () => {
        cartRemove(it.region, it.url);
      });

      cartList.appendChild(el);
    }

    cartTotal.textContent = sum.toFixed(0);
    updateMiniCartBar();
  }

  // Открытие/закрытие корзины (теперь ТОЛЬКО вручную)
  cartOpenBtn?.addEventListener("click", openCart);
  cartCloseBtn?.addEventListener("click", closeCart);
  cartOverlay?.addEventListener("click", closeCart);

  // Очистить
  cartClearBtn?.addEventListener("click", cartClear);

  // Оформить в WhatsApp (только из корзины)
  cartWhatsappBtn?.addEventListener("click", () => {
    if (!cart.length) return;

    const lines = cart.map(
      (it, idx) =>
        `${idx + 1}) ${it.title} — ${it.rubPrice} ₽ (${it.region})\n${it.url}`
    );

    const total = cart.reduce((s, it) => s + (it.rubPrice || 0), 0);

    const msg = `Здравствуйте!
Хочу купить игры:

${lines.join("\n\n")}

Итого: ${total} ₽`;

    const waUrl =
      "https://wa.me/" + WHATSAPP_PHONE + "?text=" + encodeURIComponent(msg);
    window.location.href = waUrl;
  });

  // при загрузке страницы обновим счётчик + мини-панель
  renderCart();

  // ====== SUBS ======
  let selectedSub = null; // { region, plan, period, price }

  function clearSubsSelection() {
    selectedSub = null;
    document.querySelectorAll(".subs-line.subs-line--active").forEach((el) => {
      el.classList.remove("subs-line--active");
    });
    if (subsOrder) subsOrder.classList.add("hidden");
    if (subsPickedText) subsPickedText.textContent = "Выберите подписку ниже";
  }

  function selectSubLine(el) {
    document
      .querySelectorAll(".subs-line.subs-line--active")
      .forEach((x) => x.classList.remove("subs-line--active"));

    el.classList.add("subs-line--active");

    const region = el.dataset.region || "";
    const plan = el.dataset.plan || "";
    const period = el.dataset.period || "";
    const price = el.dataset.price || "";

    selectedSub = { region, plan, period, price };

    if (subsPickedText) {
      subsPickedText.textContent = `Выбрано: ${plan} • ${period} • ${price} ₽ • ${region}`;
    }

    if (subsOrder) subsOrder.classList.remove("hidden");

    setTimeout(() => {
      const btn = document.getElementById("subsOrderBtn");
      if (btn) btn.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 80);
  }

  function openWhatsappForSubscription() {
    if (!selectedSub) return;

    const msg = `Здравствуйте!
Хочу оформить подписку.

Регион: ${selectedSub.region}
Тариф: ${selectedSub.plan}
Срок: ${selectedSub.period}
Цена: ${selectedSub.price} ₽`;

    const url =
      "https://wa.me/" + WHATSAPP_PHONE + "?text=" + encodeURIComponent(msg);

    window.location.href = url;
  }

  if (subsPricing) {
    subsPricing.addEventListener("click", (e) => {
      const line = e.target.closest(".subs-line");
      if (!line) return;
      selectSubLine(line);
    });

    subsPricing.addEventListener("keydown", (e) => {
      const line = e.target.closest(".subs-line");
      if (!line) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        selectSubLine(line);
      }
    });
  }

  if (subsOrderBtn) {
    subsOrderBtn.addEventListener("click", openWhatsappForSubscription);
  }

  if (subsTabUA && subsTabTR) {
    subsTabUA.addEventListener("click", clearSubsSelection);
    subsTabTR.addEventListener("click", clearSubsSelection);
  }

  if (productTypeSelect) {
    productTypeSelect.addEventListener("change", () => {
      if (productTypeSelect.value !== "sub") clearSubsSelection();
    });
  }

  function updateInputCurrency() {}

  function syncProductTypeSelects(value) {
    if (productTypeSelect.value !== value) {
      productTypeSelect.value = value;
    }
    if (productTypeSubs && productTypeSubs.value !== value) {
      productTypeSubs.value = value;
    }
  }

  function showSubsRegion(regionKey) {
    const isUA = regionKey === "ua";

    subsTabUA.classList.toggle("subs-tab--active", isUA);
    subsTabTR.classList.toggle("subs-tab--active", !isUA);

    subsUA.classList.toggle("hidden", !isUA);
    subsTR.classList.toggle("hidden", isUA);
  }

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

  function updatePurchaseView() {
    const typeKey = productTypeSelect.value;

    syncProductTypeSelects(typeKey);

    if (typeKey === "sub") {
      gameRegionGroup?.classList.add("hidden");
      gameTypeGroup?.classList.add("hidden");

      gameFields?.classList.add("hidden");
      resultCard.classList.add("hidden");

      subsPricing.classList.remove("hidden");
      showSubsRegion(regionSelect.value);
    } else {
      gameRegionGroup?.classList.remove("hidden");
      gameTypeGroup?.classList.remove("hidden");

      subsPricing.classList.add("hidden");

      gameFields?.classList.remove("hidden");
      calculateGame();
    }
  }

  updateInputCurrency();
  updatePurchaseView();

  basePriceInput.addEventListener("input", () => {
    if (productTypeSelect.value === "game") calculateGame();
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (productTypeSelect.value === "game") calculateGame({ showAlerts: true });
  });

  const serviceCards = document.querySelectorAll(".service-card[data-action]");

  function scrollToCalculator() {
    const calcSection = document.getElementById("calculator");
    if (calcSection) {
      calcSection.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function setProductType(type) {
    productTypeSelect.value = type;
    updatePurchaseView();
  }

  serviceCards.forEach((card) => {
    const action = card.getAttribute("data-action");

    const run = () => {
      if (action === "games") {
        scrollToCalculator();
        setProductType("game");
        setTimeout(() => basePriceInput?.focus(), 350);
      }

      if (action === "subs") {
        scrollToCalculator();
        setProductType("sub");
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
      const region = regionSelect.value === "ua" ? "Украина" : "Турция";

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

  productTypeSelect.addEventListener("change", () => {
    syncProductTypeSelects(productTypeSelect.value);
    updatePurchaseView();
  });

  if (productTypeSubs) {
    productTypeSubs.addEventListener("change", () => {
      syncProductTypeSelects(productTypeSubs.value);
      updatePurchaseView();
    });
  }

  regionSelect.addEventListener("change", () => {
    updateInputCurrency();

    if (productTypeSelect.value === "sub") {
      showSubsRegion(regionSelect.value);
    } else {
      calculateGame();
    }
  });

  if (subsTabUA && subsTabTR) {
    subsTabUA.addEventListener("click", () => showSubsRegion("ua"));
    subsTabTR.addEventListener("click", () => showSubsRegion("tr"));
  }

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

  let dealsRegion = "ua"; // ua | tr
  let dealsSort = "popular"; // popular | discount
  let dealsOffset = 0;
  const DEALS_LIMIT = 24;

  // ====== DEALS SEARCH + FAVORITES VIEW ======
  let dealsSearchQuery = "";
  let dealsSearchActive = false;

  // Режим "показываем только избранное"
  let favoritesViewActive = false;

  // Полный список скидок (кэш)
  // ключ = `${region}|${sort}` -> массив всех items
  const dealsFullCache = new Map();

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
            dealsGrid.innerHTML = `<div class='deal-meta'>Ошибка загрузки: ${e.message}</div>`;
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
        if (dealsGrid)
          dealsGrid.innerHTML = `<div class='deal-meta'>Ошибка загрузки: ${e.message}</div>`;
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

    if (dealsGrid)
      dealsGrid.innerHTML =
        "<div class='deal-meta'>Загружаем полный список для поиска…</div>";

    const all = [];
    let offset = 0;
    const limit = 60;
    let total = Infinity;

    while (offset < total) {
      const apiUrl = `/api/deals?region=${dealsRegion}&pages=5&sort=${dealsSort}&offset=${offset}&limit=${limit}`;
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
    if (!dealsGrid) return;

    if (!items || items.length === 0) {
      dealsGrid.innerHTML = "<div class='deal-meta'>Ничего не найдено.</div>";
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
      <button class="deal-btn deal-buy" type="button"
        data-action="add-to-cart"
        data-title="${safeTitle}"
        data-img="${img}"
        data-url="${it.url}"
        data-rub="${it.rubPrice}"
        data-region="${dealsRegion}">
        Купить
      </button>
    </div>
  </div>
</article>
`;
      })
      .join("");

    dealsGrid.innerHTML = cards;
    if (dealsMoreBtn) dealsMoreBtn.style.display = "none";
  }

  async function renderFavoritesView() {
    ensureDealsSearchUI();

    if (!dealsGrid) return;

    if (!favs || !favs.size) {
      dealsGrid.innerHTML =
        "<div class='deal-meta'>В избранном пока пусто. Нажми ♥ на игре — и она появится здесь.</div>";
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
        if (dealsGrid)
          dealsGrid.innerHTML = `<div class='deal-meta'>Ошибка загрузки: ${e.message}</div>`;
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
        dealsGrid.innerHTML = `<div class='deal-meta'>Ошибка загрузки: ${e.message}</div>`;
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
      cartAdd(currentModalItem);
    });
  }

  // ✅ ЕДИНСТВЕННЫЙ обработчик кликов по гриду:
  dealsGrid?.addEventListener("click", async (e) => {
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

      cartAdd(item);
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

  async function fetchDealsPage({ reset = false } = {}) {
    if (!dealsGrid) return;

    ensureDealsSearchUI();

    // если включён избранный режим — показываем избранное (не пейджим)
    if (favoritesViewActive) {
      await renderFavoritesView();
      syncDealsControls();
      return;
    }

    // если активен поиск — показываем фильтр (не пейджим)
    if (dealsSearchActive && dealsSearchQuery && dealsSearchQuery.trim()) {
      await applyDealsSearch(dealsSearchQuery);
      syncDealsControls();
      return;
    }

    if (reset) {
      dealsOffset = 0;
      dealsGrid.innerHTML = "<div class='deal-meta'>Загружаем скидки…</div>";
    }

    const apiUrl = `/api/deals?region=${dealsRegion}&pages=5&sort=${dealsSort}&offset=${dealsOffset}&limit=${DEALS_LIMIT}`;

    const res = await fetch(apiUrl);
    const data = await res.json();

    if (!data.items) throw new Error(data.error || "Не удалось загрузить.");

    if (reset) dealsGrid.innerHTML = "";

    const cards = data.items
      .map((it) => {
        const meta =
          it.discountPercent != null
            ? `-${it.discountPercent}% • ${it.psOffer}`
            : it.psOffer;

        const safeTitle = (it.title || "").replace(/"/g, "&quot;");
        const img = makeHiResImg(it.img, 720);
        const favActive = isFavorite(it.url) ? "fav-btn--active" : "";

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
      <button class="deal-btn deal-buy" type="button"
        data-action="add-to-cart"
        data-title="${safeTitle}"
        data-img="${img}"
        data-url="${it.url}"
        data-rub="${it.rubPrice}"
        data-region="${dealsRegion}">
        Купить
      </button>
    </div>
  </div>
</article>
`;
      })
      .join("");

    dealsGrid.insertAdjacentHTML("beforeend", cards);
    dealsOffset += data.items.length;

    if (dealsMoreBtn) {
      dealsMoreBtn.style.display =
        dealsOffset >= data.total ? "none" : "inline-block";
    }

    syncDealsControls();
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
        if (dealsGrid)
          dealsGrid.innerHTML = `<div class='deal-meta'>Ошибка загрузки: ${e.message}</div>`;
      });
    });
  }

  // показать ещё
  if (dealsMoreBtn) {
    dealsMoreBtn.addEventListener("click", () => {
      fetchDealsPage({ reset: false }).catch((e) => {
        dealsGrid.insertAdjacentHTML(
          "beforeend",
          `<div class='deal-meta'>Ошибка: ${e.message}</div>`
        );
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
      dealsGrid.innerHTML = `<div class='deal-meta'>Ошибка загрузки: ${lastErr.message}</div>`;
    }
  }

  if (dealsGrid) {
    safeFetchDealsFirstTime();
  }

  // ====== БУРГЕР-МЕНЮ ======
  const burger = document.getElementById("burgerToggle");
  const nav = document.querySelector(".nav");

  function closeMenu() {
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

        if (!clickedInsideBurger && !clickedInsideNav) {
          closeMenu();
        }
      },
      true
    );
  }
});
