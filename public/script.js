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

  function saveCart() {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
  }

  function openCart() {
    if (!cartModal) return;
    cartModal.classList.remove("hidden");
    cartModal.setAttribute("aria-hidden", "false");
    renderCart();
  }

  function closeCart() {
    if (!cartModal) return;
    cartModal.classList.add("hidden");
    cartModal.setAttribute("aria-hidden", "true");
  }

  // ====== MINI CART BAR (нижняя панель) ======
  function ensureMiniCartBar() {
    let bar = document.getElementById("miniCartBar");
    if (bar) return bar;

    bar = document.createElement("div");
    bar.id = "miniCartBar";
    bar.className = "mini-cart hidden";
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
      return;
    }

    const sum = calcCartSum();

    if (miniCartCountEl) miniCartCountEl.textContent = String(cart.length);
    if (miniCartSumEl) miniCartSumEl.textContent = String(sum);

    miniCartBar.classList.remove("hidden");
  }

  // ✅ ДОБАВЛЕНИЕ В КОРЗИНУ БЕЗ АВТООТКРЫТИЯ
  // Возвращает: "added" | "exists"
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
  // FIX mobile: если IntersectionObserver не сработал сразу — покажем секции принудительно через секунду
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

  // ✅ FIX: обложка модалки не ломает интерфейс, если битая
  if (dealModalImg) {
    dealModalImg.onerror = () => {
      dealModalImg.style.display = "none";
    };
    dealModalImg.onload = () => {
      dealModalImg.style.display = "";
    };
  }

  // ✅ Кнопка "Купить" в модалке = добавить в корзину (без авто-открытия)
  if (dealModalBuy) {
    dealModalBuy.addEventListener("click", (e) => {
      e.preventDefault();
      if (!currentModalItem) return;
      cartAdd(currentModalItem);
      // ❌ openCart();  // убрали авто-открытие
    });
  }

  // ✅ ЕДИНСТВЕННЫЙ обработчик кликов по гриду:
  // - клик по кнопке "Купить" -> в корзину + тост
  // - клик по карточке -> модалка
  dealsGrid?.addEventListener("click", async (e) => {
    // 1) Кнопка "Купить" (добавить в корзину)
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
      // ❌ openCart(); // убрали авто-открытие
      return;
    }

    // 2) Клик по карточке -> модалка
    const card = e.target.closest(".deal-card");
    if (!card) return;

    const url = card.dataset.url || "";
    const title = card.dataset.title || "Игра";
    const img = card.dataset.img || "";
    const rub = card.dataset.rub || "";

    // наполнение "сразу"
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

    // current item для модалки (чтобы "Купить" добавляло именно её)
    currentModalItem = {
      title,
      img,
      url,
      rubPrice: Number(rub || 0),
      region: dealsRegion,
    };

    // если ссылки нет — просто откроем модалку и покажем сообщение
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

    if (reset) {
      dealsOffset = 0;
      dealsGrid.innerHTML = "<div class='deal-meta'>Загружаем скидки…</div>";
    }

    // ✅ ВАЖНО ДЛЯ RENDER: относительный URL (без localhost)
    const apiUrl = `/api/deals?region=${dealsRegion}&pages=5&sort=${dealsSort}&offset=${dealsOffset}&limit=${DEALS_LIMIT}`;

    const res = await fetch(apiUrl);
    const data = await res.json();
    console.log("DEALS LOADED:", data.items?.length, "total:", data.total);

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

        return `
<article class="deal-card"
  data-url="${it.url}"
  data-title="${safeTitle}"
  data-img="${img}"
  data-rub="${it.rubPrice}">
  <div class="deal-media">
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

    // кнопка "Показать ещё"
    if (dealsMoreBtn) {
      dealsMoreBtn.style.display =
        dealsOffset >= data.total ? "none" : "inline-block";
    }
  }

  function setDealsTabs(active) {
    dealsTabUA?.classList.toggle("subs-tab--active", active === "ua");
    dealsTabTR?.classList.toggle("subs-tab--active", active === "tr");
  }

  // вкладки региона
  if (dealsTabUA && dealsTabTR) {
    dealsTabUA.addEventListener("click", () => {
      dealsRegion = "ua";
      setDealsTabs("ua");
      fetchDealsPage({ reset: true }).catch((e) => {
        dealsGrid.innerHTML = `<div class='deal-meta'>Ошибка загрузки: ${e.message}</div>`;
      });
    });

    dealsTabTR.addEventListener("click", () => {
      dealsRegion = "tr";
      setDealsTabs("tr");
      fetchDealsPage({ reset: true }).catch((e) => {
        dealsGrid.innerHTML = `<div class='deal-meta'>Ошибка загрузки: ${e.message}</div>`;
      });
    });
  }

  // сортировка
  if (dealsSortSelect) {
    dealsSortSelect.addEventListener("change", () => {
      dealsSort = dealsSortSelect.value;
      fetchDealsPage({ reset: true }).catch((e) => {
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

  // старт
  async function safeFetchDealsFirstTime() {
    if (!dealsGrid) return;

    setDealsTabs("ua");
    if (dealsSortSelect) dealsSortSelect.value = "popular";

    // на мобиле иногда нужно дождаться реального layout
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

  // старт
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
