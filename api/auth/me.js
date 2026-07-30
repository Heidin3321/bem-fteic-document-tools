import { getAllowedEmail, getSession, json } from "../_lib/auth.js";

export default {
  async fetch(request) {
    try {
      const session = getSession(request);
      if (!session) {
        return json({ authenticated: false, allowedEmail: getAllowedEmail() }, 401);
      }
      return json({
        authenticated: true,
        allowedEmail: getAllowedEmail(),
        user: {
          email: session.email,
          name: session.name,
          picture: session.picture
        }
      });
    } catch (error) {
      return json({ authenticated: false, error: error.message }, 500);
    }
  }
};
