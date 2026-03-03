import { Telegraf, Markup } from "telegraf";

const BOT_TOKEN = process.env.BOT_TOKEN;
const BASE_URL = process.env.BASE_URL || "";

let bot = null;

function createBot() {
  if (!BOT_TOKEN) {
    console.warn("[bot] BOT_TOKEN not set — Telegram bot disabled");
    return null;
  }

  bot = new Telegraf(BOT_TOKEN);

  const webAppUrl = `${BASE_URL}/app/`;

  bot.command("start", (ctx) => {
    return ctx.reply(
      "Добро пожаловать в PSMarket95!\nОткройте магазин, чтобы посмотреть скидки, подписки и оформить заказ.",
      Markup.inlineKeyboard([
        Markup.button.webApp("Открыть магазин", webAppUrl),
      ])
    );
  });

  bot.command("app", (ctx) => {
    return ctx.reply(
      "Нажмите кнопку ниже, чтобы открыть магазин:",
      Markup.inlineKeyboard([
        Markup.button.webApp("Открыть магазин", webAppUrl),
      ])
    );
  });

  bot.catch((err) => {
    console.error("[bot] Unhandled error:", err.message);
  });

  return bot;
}

export async function setupBot(app) {
  const instance = createBot();
  if (!instance) return;

  const isProd = process.env.NODE_ENV === "production";

  if (isProd && BASE_URL) {
    const webhookPath = "/bot/webhook";
    const webhookUrl = `${BASE_URL}${webhookPath}`;

    await instance.telegram.setWebhook(webhookUrl);
    app.use(webhookPath, instance.webhookCallback(webhookPath));
    console.log(`[bot] Webhook set: ${webhookUrl}`);
  } else {
    instance.launch({ dropPendingUpdates: true });
    console.log("[bot] Long polling started (dev mode)");

    const stop = () => {
      instance.stop("SIGINT");
      process.exit(0);
    };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  }
}

export { bot };
