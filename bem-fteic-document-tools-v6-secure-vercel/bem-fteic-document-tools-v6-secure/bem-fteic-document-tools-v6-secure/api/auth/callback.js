import {
  NONCE_COOKIE,
  SESSION_COOKIE,
  STATE_COOKIE,
  VERIFIER_COOKIE,
  clearCookie,
  exchangeAuthorizationCode,
  getAllowedEmail,
  getAppUrl,
  makeSessionCookie,
  parseCookies,
  redirect,
  safeEqual,
  verifyGoogleIdToken
} from "../_lib/auth.js";

function finishRedirect(query, sessionCookie = null) {
  const cookies = [
    clearCookie(STATE_COOKIE),
    clearCookie(VERIFIER_COOKIE),
    clearCookie(NONCE_COOKIE)
  ];
  if (sessionCookie) cookies.unshift(sessionCookie);
  return redirect(`${getAppUrl()}/${query}`, cookies);
}

export default {
  async fetch(request) {
    try {
      const url = new URL(request.url);
      if (url.searchParams.get("error")) {
        return finishRedirect(`?auth_error=${encodeURIComponent("Login Google dibatalkan atau ditolak.")}`);
      }

      const code = url.searchParams.get("code");
      const returnedState = url.searchParams.get("state");
      const cookies = parseCookies(request);
      const storedState = cookies[STATE_COOKIE];
      const codeVerifier = cookies[VERIFIER_COOKIE];
      const nonce = cookies[NONCE_COOKIE];

      if (!code || !returnedState || !storedState || !codeVerifier || !nonce) {
        throw new Error("Sesi OAuth tidak lengkap atau sudah kedaluwarsa.");
      }
      if (!safeEqual(returnedState, storedState)) throw new Error("State OAuth tidak cocok.");

      const tokens = await exchangeAuthorizationCode({ code, codeVerifier });
      if (!tokens.id_token) throw new Error("Google tidak mengirim ID token.");
      if (!tokens.access_token) throw new Error("Google tidak mengirim access token.");
      if (!tokens.refresh_token) {
        throw new Error("Google tidak mengirim refresh token. Cabut akses aplikasi di akun Google, lalu login kembali.");
      }

      const profile = await verifyGoogleIdToken(tokens.id_token, nonce);
      const email = String(profile.email || "").trim().toLowerCase();
      const allowedEmail = getAllowedEmail();
      if (email !== allowedEmail) {
        throw new Error(`Akses ditolak. Wajib menggunakan ${allowedEmail}.`);
      }

      const session = {
        v: 1,
        sub: String(profile.sub || ""),
        email,
        name: String(profile.name || "Akun BEM FTEIC"),
        picture: String(profile.picture || ""),
        accessToken: tokens.access_token,
        accessTokenExpiresAt: Date.now() + Number(tokens.expires_in || 3600) * 1000,
        refreshToken: tokens.refresh_token,
        hardExpiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000
      };

      return finishRedirect("?login=success", makeSessionCookie(session));
    } catch (error) {
      console.error("OAuth callback error:", error);
      return finishRedirect(`?auth_error=${encodeURIComponent(error.message || "Login Google gagal.")}`);
    }
  }
};
