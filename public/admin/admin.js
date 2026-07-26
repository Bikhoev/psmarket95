const els = {
  searchForm:          document.getElementById("searchForm"),
  region:              document.getElementById("region"),
  query:               document.getElementById("query"),
  results:             document.getElementById("results"),
  editorForm:          document.getElementById("editorForm"),
  gameId:              document.getElementById("gameId"),
  title:               document.getElementById("title"),
  rubPriceUA:          document.getElementById("rubPriceUA"),
  rubPriceTR:          document.getElementById("rubPriceTR"),
  img:                 document.getElementById("img"),
  description:         document.getElementById("description"),
  editorMessage:       document.getElementById("editorMessage"),
  resetBtn:            document.getElementById("resetBtn"),
  overrides:           document.getElementById("overrides"),
  overridesBadge:      document.getElementById("overridesBadge"),
  refreshOverridesBtn: document.getElementById("refreshOverridesBtn"),
  logoutBtn:           document.getElementById("logoutBtn"),
  paneSelectedTitle:   document.getElementById("paneSelectedTitle"),
};

// ===== Navigation =====
document.querySelectorAll(".sidebar-link[data-section]").forEach((link) => {
  link.addEventListener("click", (e) => {
    e.preventDefault();
    const target = link.dataset.section;
    document.querySelectorAll(".sidebar-link").forEach((l) => l.classList.remove("sidebar-link--active"));
    link.classList.add("sidebar-link--active");
    document.querySelectorAll(".admin-section").forEach((s) => s.classList.add("hidden"));
    document.getElementById(`section${target.charAt(0).toUpperCase() + target.slice(1)}`)?.classList.remove("hidden");
    if (target === "overrides") loadOverrides();
  });
});

// ===== Helpers =====
function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function setMessage(text, type = "") {
  els.editorMessage.textContent = text;
  els.editorMessage.className = "editor-message" + (type ? ` is-${type}` : "");
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Ошибка запроса");
  return data;
}

// ===== Editor =====
let currentItems = [];

function selectGame(game) {
  // Снять выделение со всех
  document.querySelectorAll(".result-item").forEach((el) => el.classList.remove("is-selected"));
  // Подсветить выбранный
  document.querySelector(`.result-item[data-game-id="${CSS.escape(game.gameId)}"]`)?.classList.add("is-selected");

  els.gameId.value = game.gameId || "";
  els.title.value = game.override?.title || "";
  els.rubPriceUA.value = game.override?.rubPriceUA ?? "";
  els.rubPriceTR.value = game.override?.rubPriceTR ?? "";
  els.img.value = game.override?.img || "";
  els.description.value = game.override?.description || "";

  els.paneSelectedTitle.textContent = game.title || "Игра выбрана";
  setMessage("");
}

function renderResults(items) {
  currentItems = items;

  if (!items.length) {
    els.results.innerHTML = "<p class='admin-hint'>Ничего не найдено.</p>";
    return;
  }

  els.results.innerHTML = items
    .map((item) => `
      <button class="result-item" type="button" data-game-id="${escapeHtml(item.gameId)}">
        <img src="${escapeHtml(item.img || "")}" alt="" loading="lazy" />
        <div style="min-width:0;flex:1">
          <div class="result-item__title">${escapeHtml(item.title)}</div>
          <div class="result-item__meta">${escapeHtml(item.source)} · ${Number(item.rubPrice || 0)} ₽</div>
        </div>
        ${item.isOverridden ? `<span class="result-item__badge">правка</span>` : ""}
      </button>
    `)
    .join("");

  els.results.querySelectorAll(".result-item").forEach((button, index) => {
    button.addEventListener("click", () => selectGame(items[index]));
  });
}

els.searchForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  els.results.innerHTML = "<p class='admin-hint'>Ищем…</p>";
  const params = new URLSearchParams({ region: els.region.value, q: els.query.value });
  try {
    const data = await api(`/api/admin/find-games?${params}`);
    renderResults(data.items || []);
  } catch (err) {
    els.results.innerHTML = `<p class="admin-hint">${escapeHtml(err.message)}</p>`;
  }
});

els.editorForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!els.gameId.value) { setMessage("Сначала выберите игру.", "error"); return; }

  const payload = {
    title:       els.title.value,
    rubPriceUA:  els.rubPriceUA.value,
    rubPriceTR:  els.rubPriceTR.value,
    img:         els.img.value,
    description: els.description.value,
  };

  try {
    await api(`/api/admin/overrides/${encodeURIComponent(els.gameId.value)}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
    setMessage("Сохранено.", "success");
    // Обновить бейдж в навигации
    loadOverrides(true);
    // Обновить признак «правка» в результатах поиска
    const idx = currentItems.findIndex((it) => it.gameId === els.gameId.value);
    if (idx !== -1) {
      currentItems[idx] = { ...currentItems[idx], isOverridden: true, override: { ...payload } };
      renderResults(currentItems);
      // Восстановить выделение
      document.querySelector(`.result-item[data-game-id="${CSS.escape(els.gameId.value)}"]`)?.classList.add("is-selected");
    }
  } catch (err) {
    setMessage(err.message, "error");
  }
});

els.resetBtn.addEventListener("click", async () => {
  if (!els.gameId.value) { setMessage("Сначала выберите игру.", "error"); return; }
  try {
    await api(`/api/admin/overrides/${encodeURIComponent(els.gameId.value)}`, { method: "DELETE" });
    els.title.value = "";
    els.rubPriceUA.value = "";
    els.rubPriceTR.value = "";
    els.img.value = "";
    els.description.value = "";
    setMessage("Правка сброшена.", "success");
    loadOverrides(true);
    const idx = currentItems.findIndex((it) => it.gameId === els.gameId.value);
    if (idx !== -1) {
      currentItems[idx] = { ...currentItems[idx], isOverridden: false, override: null };
      renderResults(currentItems);
    }
  } catch (err) {
    setMessage(err.message, "error");
  }
});

// ===== Overrides list =====
async function loadOverrides(silentBadgeOnly = false) {
  try {
    const data = await api("/api/admin/overrides");
    const items = data.items || [];

    // Обновляем бейдж в навигации
    if (els.overridesBadge) {
      els.overridesBadge.textContent = items.length ? String(items.length) : "";
    }

    if (silentBadgeOnly) return;

    if (!items.length) {
      els.overrides.innerHTML = "<p class='admin-hint'>Правок пока нет.</p>";
      return;
    }

    els.overrides.innerHTML = items
      .map((item) => {
        const tags = [];
        if (typeof item.rubPriceUA === "number")
          tags.push(`<span class="override-tag override-tag--ua">🇺🇦 ${item.rubPriceUA} ₽</span>`);
        if (typeof item.rubPriceTR === "number")
          tags.push(`<span class="override-tag override-tag--tr">🇹🇷 ${item.rubPriceTR} ₽</span>`);
        if (typeof item.rubPrice === "number" && !tags.length)
          tags.push(`<span class="override-tag override-tag--price">${item.rubPrice} ₽</span>`);
        if (item.title)
          tags.push(`<span class="override-tag">📝 название</span>`);
        if (item.img)
          tags.push(`<span class="override-tag">🖼 обложка</span>`);
        if (item.description)
          tags.push(`<span class="override-tag">💬 описание</span>`);

        return `
          <div class="override-card">
            <div class="override-card__body">
              <div class="override-card__title">${escapeHtml(item.title || item.gameId)}</div>
              <div class="override-card__meta">${tags.join("")}</div>
              ${item.description ? `<div class="override-card__desc">${escapeHtml(item.description)}</div>` : ""}
            </div>
            <button class="btn-danger-ghost" type="button" data-delete="${escapeHtml(item.gameId)}">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
              Удалить
            </button>
          </div>
        `;
      })
      .join("");

    els.overrides.querySelectorAll("[data-delete]").forEach((button) => {
      button.addEventListener("click", async () => {
        if (!confirm(`Удалить правку для «${button.dataset.delete}»?`)) return;
        try {
          await api(`/api/admin/overrides/${encodeURIComponent(button.dataset.delete)}`, { method: "DELETE" });
          await loadOverrides();
        } catch (err) {
          alert(err.message);
        }
      });
    });
  } catch (err) {
    els.overrides.innerHTML = `<p class="admin-hint">${escapeHtml(err.message)}</p>`;
  }
}

els.refreshOverridesBtn?.addEventListener("click", () => loadOverrides());

els.logoutBtn.addEventListener("click", async () => {
  await api("/api/admin/logout", { method: "POST" });
  location.href = "/admin/login.html";
});

// Init
loadOverrides(true);
