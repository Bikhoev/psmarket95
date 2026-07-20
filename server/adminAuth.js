import crypto from "node:crypto";

const COOKIE_NAME = "psm_admin";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;

function sessionSecret() {
  return process.env.ADMIN_SESSION_SECRET || process.env.CLEAR_CACHE_SECRET || "dev-admin-secret";
}

function adminPassword() {
  return process.env.ADMIN_PASSWORD || "";
}

function sign(value) {
  return crypto.createHmac("sha256", sessionSecret()).update(value).digest("hex");
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function parseCookies(req) {
  return String(req.headers.cookie || "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((acc, part) => {
      const index = part.indexOf("=");
      if (index === -1) return acc;
      acc[decodeURIComponent(part.slice(0, index))] = decodeURIComponent(
        part.slice(index + 1)
      );
      return acc;
    }, {});
}

function buildCookie(value, maxAgeSeconds) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${COOKIE_NAME}=${encodeURIComponent(
    value
  )}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
}

export function createSessionCookie() {
  const expires = Date.now() + SESSION_TTL_MS;
  const payload = String(expires);
  return buildCookie(`${payload}.${sign(payload)}`, Math.floor(SESSION_TTL_MS / 1000));
}

export function clearSessionCookie() {
  return buildCookie("", 0);
}

export function isAdminRequest(req) {
  const token = parseCookies(req)[COOKIE_NAME];
  if (!token) return false;

  const [expires, signature] = token.split(".");
  if (!expires || !signature) return false;
  if (Number(expires) < Date.now()) return false;
  return safeEqual(signature, sign(expires));
}

export function validateAdminPassword(password) {
  const expected = adminPassword();
  return Boolean(expected) && safeEqual(String(password || ""), expected);
}

export function requireAdminSession(req, res, next) {
  if (isAdminRequest(req)) return next();
  if (req.originalUrl.startsWith("/api/")) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  return res.redirect("/admin/login.html");
}
