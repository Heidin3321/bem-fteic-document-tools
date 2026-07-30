import { SESSION_COOKIE, assertSameOrigin, clearCookie, getSession, json } from "../_lib/auth.js";

export default {
  async fetch(request) {
    if (request.method !== "POST") return json({ error: "Method not allowed" }, 405, { Allow: "POST" });
    try {
      assertSameOrigin(request);
      const session = getSession(request);
      const token = session?.refreshToken || session?.accessToken;
      if (token) {
        await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" }
        }).catch(() => null);
      }
      return json({ ok: true }, 200, { "Set-Cookie": clearCookie(SESSION_COOKIE) });
    } catch (error) {
      return json({ error: error.message }, error.status || 400);
    }
  }
};
