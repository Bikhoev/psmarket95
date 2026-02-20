import { Router } from "express";
import crypto from "node:crypto";

const router = Router();

const BOT_TOKEN = process.env.BOT_TOKEN || "";

function validateInitData(initData) {
  if (!initData || !BOT_TOKEN) return null;

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;

  params.delete("hash");

  const entries = [...params.entries()];
  entries.sort((a, b) => a[0].localeCompare(b[0]));
  const dataCheckString = entries.map(([k, v]) => `${k}=${v}`).join("\n");

  const secretKey = crypto
    .createHmac("sha256", "WebAppData")
    .update(BOT_TOKEN)
    .digest();

  const checkHash = crypto
    .createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");

  if (checkHash !== hash) return null;

  const userRaw = params.get("user");
  if (!userRaw) return { valid: true, user: null };

  try {
    return { valid: true, user: JSON.parse(userRaw) };
  } catch {
    return { valid: true, user: null };
  }
}

router.post("/auth", (req, res) => {
  const { initData } = req.body || {};

  if (!initData) {
    return res.status(400).json({ ok: false, error: "Missing initData" });
  }

  const result = validateInitData(initData);

  if (!result) {
    return res.status(403).json({ ok: false, error: "Invalid signature" });
  }

  return res.json({ ok: true, user: result.user });
});

export default router;
