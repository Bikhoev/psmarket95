(function () {
  "use strict";

  const tg = window.Telegram?.WebApp;
  if (!tg) return;

  tg.ready();
  tg.expand();

  if (tg.themeParams?.bg_color) {
    document.documentElement.style.setProperty(
      "--tg-bg",
      tg.themeParams.bg_color
    );
  }

  window.__tgUser = null;

  async function authenticate() {
    const initData = tg.initData;
    if (!initData) return;

    try {
      const res = await fetch("/api/tg/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData }),
      });
      const data = await res.json();
      if (data.ok && data.user) {
        window.__tgUser = data.user;
      }
    } catch {
      // auth failed silently — app still works without user data
    }
  }

  authenticate();

  function setupMainButton() {
    const CART_KEY = "psm_cart_v1";

    function getCart() {
      try {
        const raw = localStorage.getItem(CART_KEY);
        return raw ? JSON.parse(raw) : [];
      } catch {
        return [];
      }
    }

    function updateMainButton() {
      const cart = getCart();
      if (!cart.length) {
        tg.MainButton.hide();
        return;
      }
      const total = cart.reduce((s, it) => s + Number(it.rubPrice || 0), 0);
      tg.MainButton.setText(`Оформить заказ — ${total} ₽`);
      tg.MainButton.show();
    }

    tg.MainButton.onClick(() => {
      const cart = getCart();
      if (!cart.length) return;

      const lines = cart.map((it, idx) => {
        const title =
          it.type === "sub"
            ? `Подписка: ${it.plan || it.title || "—"} • ${it.period || ""}`.trim()
            : it.title || "Игра";
        const region =
          it.region === "ua" || it.region === "Европа (UA)"
            ? "Европа (UA)"
            : "Турция";
        const price = `${Number(it.rubPrice || 0)} ₽`;

        if (it.type === "sub") {
          return `${idx + 1}) ${title} — ${price} (${region})`;
        }
        const url = it.url ? `\n${it.url}` : "";
        return `${idx + 1}) ${title} — ${price} (${region})${url}`;
      });

      const total = cart.reduce((s, it) => s + (it.rubPrice || 0), 0);

      const userName = window.__tgUser
        ? [window.__tgUser.first_name, window.__tgUser.last_name]
            .filter(Boolean)
            .join(" ")
        : "";

      const msg =
        (userName ? `Заказ от ${userName}\n\n` : "") +
        lines.join("\n\n") +
        `\n\nИтого: ${total} ₽`;

      tg.sendData(JSON.stringify({ action: "order", text: msg, total }));
    });

    updateMainButton();

    const observer = new MutationObserver(() => {
      requestAnimationFrame(updateMainButton);
    });
    observer.observe(document.body, { childList: true, subtree: true });

    window.addEventListener("storage", updateMainButton);
  }

  setupMainButton();
})();
