// ====== НАСТРОЙКИ ======
const SETTINGS = {
  ua: { inputCurrency: "UAH" }, // Украина (гривны)
  tr: { inputCurrency: "TRY" }, // Турция (лиры)
};

const OUTPUT_CURRENCY = "RUB";
const MIN_GAME_PRICE_RUB = 390;

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

  let selectedSub = null; // { region, plan, period, price }

  function clearSubsSelection() {
    selectedSub = null;
    document.querySelectorAll(".subs-line.subs-line--active").forEach((el) => {
      el.classList.remove("subs-line--active");
    });
    if (subsOrder) subsOrder.classList.add("hidden");
    if (subsPickedText) subsPickedText.textContent = "Выберите подписку ниже";
  }

  // ✅ ЗАМЕНЕНО НА ТВОЮ ВЕРСИЮ (С АВТОСКРОЛЛОМ ВНУТРИ)
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

    // ✅ автопрокрутка к кнопке оформления (после выбора)
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

  // клики по строкам прайса (делегирование)
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

  // ====== ФУНКЦИИ ======
  function updateInputCurrency() {
    // валюта теперь определяется по региону, поле не нужно
  }

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

    // 1) Курс по диапазонам
    const rate = getRate(regionKey, basePrice);

    // 2) Цена в рублях
    let finalRub = basePrice * rate;

    // 3) Минимальная цена игры
    if (finalRub < MIN_GAME_PRICE_RUB) {
      finalRub = MIN_GAME_PRICE_RUB;
    }

    // 4) Округление
    const basePriceRounded = basePrice.toFixed(2);
    const finalRounded = finalRub.toFixed(2);

    // 5) Вывод
    finalPriceSpan.textContent = finalRounded;
    finalCurrencySpan.textContent = OUTPUT_CURRENCY;

    resultBasePriceSpan.textContent = basePriceRounded;
    resultCurrencySpan.textContent = inputCurrency;

    resultCard.classList.remove("hidden");
  }

  function updatePurchaseView() {
    const typeKey = productTypeSelect.value;

    syncProductTypeSelects(typeKey);

    if (typeKey === "sub") {
      // скрываем верхние селекты
      gameRegionGroup?.classList.add("hidden");
      gameTypeGroup?.classList.add("hidden");

      // скрываем калькулятор игр
      gameFields?.classList.add("hidden");
      resultCard.classList.add("hidden");

      // показываем прайс
      subsPricing.classList.remove("hidden");
      showSubsRegion(regionSelect.value);
    } else {
      // показываем верхние селекты
      gameRegionGroup?.classList.remove("hidden");
      gameTypeGroup?.classList.remove("hidden");

      // скрываем прайс
      subsPricing.classList.add("hidden");

      // возвращаем калькулятор
      gameFields?.classList.remove("hidden");
      calculateGame();
    }
  }

  // ====== ИНИЦИАЛИЗАЦИЯ ======
  updateInputCurrency();
  updatePurchaseView();

  // ====== СОБЫТИЯ: КАЛЬКУЛЯТОР ======
  basePriceInput.addEventListener("input", () => {
    if (productTypeSelect.value === "game") calculateGame();
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (productTypeSelect.value === "game") calculateGame({ showAlerts: true });
  });

  // ====== КЛИК ПО КАРТОЧКАМ УСЛУГ ======
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
        setTimeout(() => {}, 200);
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

  // ====== КНОПКА "ОФОРМИТЬ ЗАКАЗ" (ИГРЫ) ======
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

  // ====== СОБЫТИЯ: ТИП ПОКУПКИ / РЕГИОН ======
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

  // ====== СОБЫТИЯ: ВКЛАДКИ ПОДПИСОК ======
  if (subsTabUA && subsTabTR) {
    subsTabUA.addEventListener("click", () => showSubsRegion("ua"));
    subsTabTR.addEventListener("click", () => showSubsRegion("tr"));
  }

  // ====== АНИМАЦИИ СЕКЦИЙ (visible + active) ======
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
  // ====== DEALS (Скидки) ======
  const dealsGrid = document.getElementById("dealsGrid");
  const dealsTabUA = document.getElementById("dealsTabUA");
  const dealsTabTR = document.getElementById("dealsTabTR");

  function setDealsTabs(active) {
    dealsTabUA?.classList.toggle("subs-tab--active", active === "ua");
    dealsTabTR?.classList.toggle("subs-tab--active", active === "tr");
  }

  async function loadDeals(regionKey) {
    if (!dealsGrid) return;

    dealsGrid.innerHTML = `<div class="deal-meta">Загружаем скидки…</div>`;

    try {
      const res = await fetch(
        `http://localhost:3000/api/deals?region=${regionKey}&pages=5`
      );
      const data = await res.json();

      if (!data.items || !Array.isArray(data.items)) {
        throw new Error(data.error || "Не удалось загрузить скидки.");
      }

      dealsGrid.innerHTML = data.items
        .map((it) => {
          const titleSafe = (it.title || "").replace(/"/g, "&quot;");

          const buyMsg = `Здравствуйте!
Хочу купить игру по скидке.

Регион: ${regionKey === "ua" ? "Украина" : "Турция"}
Игра: ${it.title}
Цена: ${it.rubPrice} ₽
Ссылка PS Store: ${it.url}`;

          const waUrl =
            "https://wa.me/" +
            WHATSAPP_PHONE +
            "?text=" +
            encodeURIComponent(buyMsg);

          return `
        <article class="deal-card">
          <img class="deal-img" src="${it.img}" alt="${titleSafe}">
          <div class="deal-body">
            <div class="deal-title">${it.title}</div>
            <div class="deal-prices">
              <div class="deal-rub">${it.rubPrice} ₽</div>
              <div class="deal-meta">${it.psPrice}</div>
            </div>
            <div class="deal-actions">
              <a class="deal-buy" href="${waUrl}">Купить</a>
            </div>
          </div>
        </article>
      `;
        })
        .join("");
    } catch (e) {
      dealsGrid.innerHTML = `<div class="deal-meta">Ошибка загрузки: ${e.message}</div>`;
    }
  }

  if (dealsTabUA && dealsTabTR) {
    dealsTabUA.addEventListener("click", () => {
      setDealsTabs("ua");
      loadDeals("ua");
    });

    dealsTabTR.addEventListener("click", () => {
      setDealsTabs("tr");
      loadDeals("tr");
    });
  }

  // старт по умолчанию
  if (dealsGrid) {
    setDealsTabs("ua");
    loadDeals("ua");
  }

  // ====== БУРГЕР-МЕНЮ ======
  const burger = document.getElementById("burgerToggle");
  const nav = document.querySelector(".nav");

  if (burger && nav) {
    burger.addEventListener("click", () => {
      const isOpen = nav.classList.toggle("nav--open");
      burger.classList.toggle("burger--open", isOpen);
      document.body.classList.toggle("menu-open", isOpen);
      burger.setAttribute("aria-expanded", isOpen ? "true" : "false");
    });

    nav.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => {
        nav.classList.remove("nav--open");
        burger.classList.remove("burger--open");
        document.body.classList.remove("menu-open");
        burger.setAttribute("aria-expanded", "false");
      });
    });
  }
});
// ====== ЗАКРЫТИЕ БУРГЕРА ПО КЛИКУ ВНЕ МЕНЮ (capture) ======
document.addEventListener(
  "click",
  (e) => {
    if (!burger || !nav) return;

    const isMenuOpen = nav.classList.contains("nav--open");
    if (!isMenuOpen) return;

    const clickedInsideBurger = burger.contains(e.target);
    const clickedInsideNav = nav.contains(e.target);

    // если клик НЕ по бургеру и НЕ внутри меню — закрываем
    if (!clickedInsideBurger && !clickedInsideNav) {
      nav.classList.remove("nav--open");
      burger.classList.remove("burger--open");
      document.body.classList.remove("menu-open");
      burger.setAttribute("aria-expanded", "false");
    }
  },
  true // ← ВОТ ЭТО КЛЮЧЕВО
);
