import {
  STATE_COOKIE,
  VERIFIER_COOKIE,
  NONCE_COOKIE,
  googleAuthorizationUrl,
  makeOAuthTempCookie,
  randomToken,
  redirect,
  sha256Base64Url
} from "../_lib/auth.js";

export default {
  async fetch() {
    try {
      const state = randomToken(32);
      const verifier = randomToken(64);
      const nonce = randomToken(32);
      const authorizationUrl = googleAuthorizationUrl({
        state,
        nonce,
        codeChallenge: sha256Base64Url(verifier)
      });

      return redirect(authorizationUrl, [
        makeOAuthTempCookie(STATE_COOKIE, state),
        makeOAuthTempCookie(VERIFIER_COOKIE, verifier),
        makeOAuthTempCookie(NONCE_COOKIE, nonce)
      ]);
    } catch (error) {
      return new Response(`Konfigurasi OAuth belum siap: ${error.message}`, {
        status: 500,
        headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" }
      });
    }
  }
};
