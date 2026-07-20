const els = {
  searchForm: document.getElementById("searchForm"),
  region: document.getElementById("region"),
  query: document.getElementById("query"),
  results: document.getElementById("results"),
  editorForm: document.getElementById("editorForm"),
  gameId: document.getElementById("gameId"),
  title: document.getElementById("title"),
  rubPrice: document.getElementById("rubPrice"),
  img: document.getElementById("img"),
  description: document.getElementById("description"),
  editorMessage: document.getElementById("editorMessage"),
  resetBtn: document.getElementById("resetBtn"),
  overrides: document.getElementById("overrides"),
  refreshOverridesBtn: document.getElementById("refreshOverridesBtn"),
  logoutBtn: document.getElementById("logoutBtn"),
};

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Ошибка запроса");
  return data;
}

function selectGame(game) {
  els.gameId.value = game.gameId || "";
  els.title.value = game.override?.title || "";
  els.rubPrice.value = game.override?.rubPrice ?? game.rubPrice ?? "";
  els.img.value = game.override?.img || "";
  els.description.value = game.override?.description || "";
  els.editorMessage.textContent = `Выбрано: ${game.title}`;
}

function renderResults(items) {
  if (!items.length) {
    els.results.innerHTML = "<p class='admin-empty'>Ничего не найдено.</p>";
    return;
  }

  els.results.innerHTML = items
    .map(
      (item) => `
        <button class="admin-result" type="button" data-game-id="${escapeHtml(item.gameId)}">
          <img src="${escapeHtml(item.img || "")}" alt="" loading="lazy" />
          <span>
            <strong>${escapeHtml(item.title)}</strong>
            <small>${escapeHtml(item.source)} · ${Number(item.rubPrice || 0)} ₽${item.isOverridden ? " · правка активна" : ""}</small>
          </span>
        </button>
      `
    )
    .join("");

  els.results.querySelectorAll(".admin-result").forEach((button, index) => {
    button.addEventListener("click", () => selectGame(items[index]));
  });
}

async function loadOverrides() {
  const data = await api("/api/admin/overrides");
  const items = data.items || [];
  if (!items.length) {
    els.overrides.innerHTML = "<p class='admin-empty'>Правок пока нет.</p>";
    return;
  }

  els.overrides.innerHTML = items
    .map(
      (item) => `
        <article class="admin-override">
          <div>
            <strong>${escapeHtml(item.title || item.gameId)}</strong>
            <small>${escapeHtml(item.gameId)}${typeof item.rubPrice === "number" ? ` · ${item.rubPrice} ₽` : ""}</small>
            ${item.description ? `<p>${escapeHtml(item.description)}</p>` : ""}
          </div>
          <button class="admin-ghost" type="button" data-delete="${escapeHtml(item.gameId)}">Удалить</button>
        </article>
      `
    )
    .join("");

  els.overrides.querySelectorAll("[data-delete]").forEach((button) => {
    button.addEventListener("click", async () => {
      await api(`/api/admin/overrides/${encodeURIComponent(button.dataset.delete)}`, {
        method: "DELETE",
      });
      await loadOverrides();
    });
  });
}

els.searchForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  els.results.innerHTML = "<p class='admin-empty'>Ищем...</p>";
  const params = new URLSearchParams({
    region: els.region.value,
    q: els.query.value,
  });
  const data = await api(`/api/admin/find-games?${params.toString()}`);
  renderResults(data.items || []);
});

els.editorForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!els.gameId.value) {
    els.editorMessage.textContent = "Сначала выберите игру.";
    return;
  }

  const payload = {
    title: els.title.value,
    rubPrice: els.rubPrice.value,
    img: els.img.value,
    description: els.description.value,
  };

  await api(`/api/admin/overrides/${encodeURIComponent(els.gameId.value)}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
  els.editorMessage.textContent = "Сохранено.";
  await loadOverrides();
});

els.resetBtn.addEventListener("click", async () => {
  if (!els.gameId.value) {
    els.editorMessage.textContent = "Сначала выберите игру.";
    return;
  }
  await api(`/api/admin/overrides/${encodeURIComponent(els.gameId.value)}`, {
    method: "DELETE",
  });
  els.title.value = "";
  els.rubPrice.value = "";
  els.img.value = "";
  els.description.value = "";
  els.editorMessage.textContent = "Правка удалена.";
  await loadOverrides();
});

els.refreshOverridesBtn.addEventListener("click", loadOverrides);

els.logoutBtn.addEventListener("click", async () => {
  await api("/api/admin/logout", { method: "POST" });
  location.href = "/admin/login.html";
});

loadOverrides().catch((err) => {
  els.overrides.innerHTML = `<p class="admin-empty">${escapeHtml(err.message)}</p>`;
});
