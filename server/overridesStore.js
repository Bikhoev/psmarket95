import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const defaultDataDir = path.join(__dirname, "..", "data");
const dataDir = process.env.DATA_DIR || defaultDataDir;
const overridesPath = path.join(dataDir, "overrides.json");

let loaded = false;
let overrides = {};

export function extractGameId(url) {
  const raw = String(url || "").trim();
  if (!raw) return "";
  const match = raw.match(/\/(?:concept|product)\/([^/?#]+)/i);
  if (match) return decodeURIComponent(match[1]).toLowerCase();
  return raw.toLowerCase();
}

function normalizeOverride(input = {}) {
  const out = {};

  for (const key of ["title", "img", "description"]) {
    if (Object.prototype.hasOwnProperty.call(input, key)) {
      const value = String(input[key] ?? "").trim();
      if (value) out[key] = value;
    }
  }

  if (Object.prototype.hasOwnProperty.call(input, "rubPrice")) {
    const value = Number(input.rubPrice);
    if (Number.isFinite(value) && value >= 0) out.rubPrice = Math.round(value);
  }

  return out;
}

async function ensureLoaded() {
  if (loaded) return;
  try {
    const raw = await readFile(overridesPath, "utf8");
    const parsed = JSON.parse(raw);
    overrides = parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : {};
  } catch (err) {
    if (err.code !== "ENOENT") {
      console.warn(`Failed to read overrides store: ${err.message}`);
    }
    overrides = {};
  }
  loaded = true;
}

async function save() {
  await mkdir(dataDir, { recursive: true });
  const tmpPath = `${overridesPath}.tmp`;
  await writeFile(tmpPath, `${JSON.stringify(overrides, null, 2)}\n`, "utf8");
  await rename(tmpPath, overridesPath);
}

export async function listOverrides() {
  await ensureLoaded();
  return Object.entries(overrides).map(([gameId, value]) => ({
    gameId,
    ...value,
  }));
}

export async function getOverrideById(gameId) {
  await ensureLoaded();
  const key = String(gameId || "").toLowerCase();
  return overrides[key] ? { gameId: key, ...overrides[key] } : null;
}

export async function getOverrideForUrl(url) {
  const gameId = extractGameId(url);
  if (!gameId) return null;
  return getOverrideById(gameId);
}

export async function setOverride(gameId, input) {
  await ensureLoaded();
  const key = String(gameId || "").toLowerCase().trim();
  if (!key) throw new Error("gameId is required");

  const normalized = normalizeOverride(input);
  if (Object.keys(normalized).length === 0) {
    delete overrides[key];
    await save();
    return null;
  }

  overrides[key] = {
    ...(overrides[key] || {}),
    ...normalized,
    updatedAt: new Date().toISOString(),
  };
  await save();
  return { gameId: key, ...overrides[key] };
}

export async function deleteOverride(gameId) {
  await ensureLoaded();
  const key = String(gameId || "").toLowerCase().trim();
  if (!key) return false;
  const existed = Boolean(overrides[key]);
  delete overrides[key];
  if (existed) await save();
  return existed;
}

export async function applyOverridesToItems(items = []) {
  await ensureLoaded();
  return items.map((item) => {
    const gameId = extractGameId(item?.url);
    const override = gameId ? overrides[gameId] : null;
    if (!override) return item;

    return {
      ...item,
      gameId,
      title: override.title || item.title,
      img: override.img || item.img,
      description: override.description || item.description || "",
      rubPrice:
        typeof override.rubPrice === "number" ? override.rubPrice : item.rubPrice,
      isOverridden: true,
    };
  });
}
