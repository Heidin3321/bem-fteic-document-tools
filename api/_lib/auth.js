import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createPublicKey,
  randomBytes,
  timingSafeEqual,
  verify as verifySignature
} from "node:crypto";

export const SESSION_COOKIE = "bem_session";
export const STATE_COOKIE = "bem_oauth_state";
export const VERIFIER_COOKIE = "bem_oauth_verifier";
export const NONCE_COOKIE = "bem_oauth_nonce";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
const OAUTH_TEMP_MAX_AGE_SECONDS = 10 * 60;

let jwksCache = { keys: [], expiresAt: 0 };

export function requiredEnv(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`Environment variable ${name} belum diisi.`);
  return value;
}

export function getAppUrl() {
  const url = new URL(requiredEnv("APP_URL"));
  url.pathname = "/";
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

export function getAllowedEmail() {
  return requiredEnv("ALLOWED_GOOGLE_EMAIL").toLowerCase();
}

export function getOAuthConfig() {
  return {
    clientId: requiredEnv("GOOGLE_CLIENT_ID"),
    clientSecret: requiredEnv("GOOGLE_CLIENT_SECRET"),
    redirectUri: `${getAppUrl()}/api/auth/callback`
  };
}

export function randomToken(byteLength = 32) {
  return randomBytes(byteLength).toString("base64url");
}

export function sha256Base64Url(value) {
  return createHash("sha256").update(value).digest("base64url");
}

export function parseCookies(request) {
  const header = request.headers.get("cookie") || "";
  const result = {};
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (!key) continue;
    try {
      result[key] = decodeURIComponent(value);
    } catch {
      result[key] = value;
    }
  }
  return result;
}

function isSecureCookie() {
  return getAppUrl().startsWith("https://");
}

export function makeCookie(name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  parts.push(`Path=${options.path || "/"}`);
  if (options.maxAge !== undefined) parts.push(`Max-Age=${Math.max(0, Number(options.maxAge))}`);
  if (options.httpOnly !== false) parts.push("HttpOnly");
  if (options.sameSite !== false) parts.push(`SameSite=${options.sameSite || "Lax"}`);
  if (options.secure !== false && isSecureCookie()) parts.push("Secure");
  return parts.join("; ");
}

export function clearCookie(name) {
  return makeCookie(name, "", { maxAge: 0 });
}

export function makeOAuthTempCookie(name, value) {
  return makeCookie(name, value, { maxAge: OAUTH_TEMP_MAX_AGE_SECONDS });
}

function getSessionKey() {
  const secret = requiredEnv("SESSION_SECRET");
  if (secret.length < 32) {
    throw new Error("SESSION_SECRET minimal 32 karakter.");
  }
  return createHash("sha256").update(secret).digest();
}

export function encryptSession(payload) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getSessionKey(), iv);
  const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString("base64url");
}

export function decryptSession(value) {
  try {
    const packed = Buffer.from(String(value || ""), "base64url");
    if (packed.length < 29) return null;
    const iv = packed.subarray(0, 12);
    const tag = packed.subarray(12, 28);
    const ciphertext = packed.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", getSessionKey(), iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    const payload = JSON.parse(plaintext.toString("utf8"));
    if (!payload || payload.v !== 1) return null;
    if (!Number.isFinite(payload.hardExpiresAt) || Date.now() >= payload.hardExpiresAt) return null;
    return payload;
  } catch {
    return null;
  }
}

export function makeSessionCookie(session) {
  return makeCookie(SESSION_COOKIE, encryptSession(session), {
    maxAge: SESSION_MAX_AGE_SECONDS
  });
}

export function safeEqual(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length === b.length && timingSafeEqual(a, b);
}

function decodeJwtPart(value) {
  return JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
}

async function getGoogleJwks() {
  if (jwksCache.keys.length && Date.now() < jwksCache.expiresAt) return jwksCache.keys;

  const response = await fetch(GOOGLE_JWKS_URL, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error("Gagal mengambil kunci verifikasi Google.");
  const body = await response.json();
  const cacheControl = response.headers.get("cache-control") || "";
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/i);
  const maxAge = maxAgeMatch ? Number(maxAgeMatch[1]) : 3600;
  jwksCache = {
    keys: Array.isArray(body.keys) ? body.keys : [],
    expiresAt: Date.now() + Math.max(300, maxAge) * 1000
  };
  return jwksCache.keys;
}

export async function verifyGoogleIdToken(idToken, expectedNonce) {
  const parts = String(idToken || "").split(".");
  if (parts.length !== 3) throw new Error("ID token Google tidak valid.");

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = decodeJwtPart(encodedHeader);
  const payload = decodeJwtPart(encodedPayload);
  if (header.alg !== "RS256" || !header.kid) throw new Error("Algoritma ID token Google tidak valid.");

  const keys = await getGoogleJwks();
  const jwk = keys.find(item => item.kid === header.kid);
  if (!jwk) {
    jwksCache.expiresAt = 0;
    const refreshedKeys = await getGoogleJwks();
    const refreshedJwk = refreshedKeys.find(item => item.kid === header.kid);
    if (!refreshedJwk) throw new Error("Kunci tanda tangan Google tidak ditemukan.");
    return verifyWithJwk(refreshedJwk, encodedHeader, encodedPayload, encodedSignature, payload, expectedNonce);
  }

  return verifyWithJwk(jwk, encodedHeader, encodedPayload, encodedSignature, payload, expectedNonce);
}

function verifyWithJwk(jwk, encodedHeader, encodedPayload, encodedSignature, payload, expectedNonce) {
  const publicKey = createPublicKey({ key: jwk, format: "jwk" });
  const validSignature = verifySignature(
    "RSA-SHA256",
    Buffer.from(`${encodedHeader}.${encodedPayload}`),
    publicKey,
    Buffer.from(encodedSignature, "base64url")
  );
  if (!validSignature) throw new Error("Tanda tangan ID token Google tidak valid.");

  const now = Math.floor(Date.now() / 1000);
  const clientId = requiredEnv("GOOGLE_CLIENT_ID");
  if (!['accounts.google.com', 'https://accounts.google.com'].includes(payload.iss)) {
    throw new Error("Issuer ID token Google tidak valid.");
  }
  const audienceValid = Array.isArray(payload.aud)
    ? payload.aud.includes(clientId)
    : payload.aud === clientId;
  if (!audienceValid) throw new Error("Audience ID token Google tidak valid.");
  if (!Number.isFinite(payload.exp) || payload.exp <= now) throw new Error("ID token Google sudah kedaluwarsa.");
  if (payload.iat && payload.iat > now + 300) throw new Error("Waktu ID token Google tidak valid.");
  if (!safeEqual(payload.nonce, expectedNonce)) throw new Error("Nonce OAuth tidak cocok.");
  if (payload.email_verified !== true && payload.email_verified !== "true") {
    throw new Error("Email Google belum terverifikasi.");
  }
  return payload;
}

export async function exchangeAuthorizationCode({ code, codeVerifier }) {
  const { clientId, clientSecret, redirectUri } = getOAuthConfig();
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
    code_verifier: codeVerifier
  });

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error_description || payload.error || "Pertukaran token Google gagal.");
  }
  return payload;
}

export async function refreshAccessToken(refreshToken) {
  const { clientId, clientSecret } = getOAuthConfig();
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token"
  });
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error_description || payload.error || "Refresh token Google gagal.");
  }
  return payload;
}

export function getSession(request) {
  const cookies = parseCookies(request);
  const session = decryptSession(cookies[SESSION_COOKIE]);
  if (!session) return null;
  if (String(session.email || "").toLowerCase() !== getAllowedEmail()) return null;
  return session;
}

export async function ensureFreshAccessToken(session) {
  if (session.accessToken && Date.now() < Number(session.accessTokenExpiresAt || 0) - 60_000) {
    return { session, changed: false };
  }
  if (!session.refreshToken) throw new Error("Refresh token tidak tersedia. Silakan login ulang.");

  const refreshed = await refreshAccessToken(session.refreshToken);
  session.accessToken = refreshed.access_token;
  session.accessTokenExpiresAt = Date.now() + Number(refreshed.expires_in || 3600) * 1000;
  if (refreshed.refresh_token) session.refreshToken = refreshed.refresh_token;
  return { session, changed: true };
}

export function assertSameOrigin(request) {
  const origin = request.headers.get("origin");
  const expectedOrigin = new URL(getAppUrl()).origin;
  if (!origin || origin !== expectedOrigin) {
    throw Object.assign(new Error("Origin permintaan tidak diizinkan."), { status: 403 });
  }
}

export function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...extraHeaders
    }
  });
}

export function redirect(location, cookies = []) {
  const headers = new Headers({
    Location: location,
    "Cache-Control": "no-store"
  });
  for (const cookie of cookies) headers.append("Set-Cookie", cookie);
  return new Response(null, { status: 302, headers });
}

export function googleAuthorizationUrl({ state, nonce, codeChallenge }) {
  const { clientId, redirectUri } = getOAuthConfig();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile https://www.googleapis.com/auth/drive",
    access_type: "offline",
    prompt: "consent select_account",
    include_granted_scopes: "true",
    state,
    nonce,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    login_hint: getAllowedEmail()
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}
