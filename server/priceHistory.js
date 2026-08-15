/**
 * Хранилище исторических цен для вычисления скидок.
 * Для каждой игры (npTitleId) сохраняем максимальную виденную цену по регионам.
 * Когда текущая цена < max, считаем разницу скидкой.
 */
import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dir = dirname(fileURLToPath(import.meta.url));

// Хранилище: { [npTitleId]: { ua: { maxPrice, ts }, tr: { maxPrice, ts } } }
let history = {};
let dirty = false;

const HISTORY_FILE = process.env.PRICE_HISTORY_FILE
  || join(__dir, "../data/priceHistory.json");

async function ensureDir() {
  const dir = dirname(HISTORY_FILE);
  if (!existsSync(dir)) await mkdir(dir, { recursive: true });
}

export async function loadHistory() {
  try {
    const raw = await readFile(HISTORY_FILE, "utf8");
    history = JSON.parse(raw);
  } catch {
    history = {};
  }
}

export async function saveHistory() {
  if (!dirty) return;
  await ensureDir();
  await writeFile(HISTORY_FILE, JSON.stringify(history), "utf8");
  dirty = false;
}

/**
 * Записываем "полную" (не скидочную) цену для базового каталога (PS5/PS4)
 * @param {string} npTitleId
 * @param {string} region - 'ua' | 'tr'
 * @param {number} price - числовое значение цены в валюте региона
 */
export function recordBasePrice(npTitleId, region, price) {
  if (!npTitleId || !price || price <= 0) return;
  const key = region.toLowerCase();
  if (!history[npTitleId]) history[npTitleId] = {};
  if (!history[npTitleId][key]) history[npTitleId][key] = { maxPrice: 0, ts: 0 };
  const entry = history[npTitleId][key];
  if (price > entry.maxPrice) {
    entry.maxPrice = price;
    entry.ts = Date.now();
    dirty = true;
  }
}

/**
 * Вычисляем процент скидки для текущей цены по сравнению с историческим максимумом.
 * @returns {number|null} процент скидки (1-99) или null если нет истории / нет скидки
 */
export function getDiscountPercent(npTitleId, region, currentPrice) {
  if (!npTitleId || !currentPrice || currentPrice <= 0) return null;
  const key = region.toLowerCase();
  const entry = history[npTitleId]?.[key];
  if (!entry || !entry.maxPrice) return null;
  const maxPrice = entry.maxPrice;
  // Считаем скидкой только если цена ниже хотя бы на 5%
  if (currentPrice >= maxPrice * 0.95) return null;
  const pct = Math.round((1 - currentPrice / maxPrice) * 100);
  return pct >= 5 && pct <= 99 ? pct : null;
}

// Автосохранение каждые 5 минут если были изменения
setInterval(saveHistory, 5 * 60 * 1000);
