import { getAllowedEmail, json, requiredEnv } from "./_lib/auth.js";

export default {
  async fetch() {
    try {
      requiredEnv("APP_URL");
      requiredEnv("GOOGLE_CLIENT_ID");
      requiredEnv("GOOGLE_CLIENT_SECRET");
      requiredEnv("SESSION_SECRET");
      return json({ ok: true, allowedEmail: getAllowedEmail() });
    } catch (error) {
      return json({ ok: false, error: error.message }, 500);
    }
  }
};
