import { env } from "../env";

export function getAuthConfig() {
  const e = env();
  return {
    apiKeySaltRounds: e.API_KEY_SALT_ROUNDS,
    sessionSecret: e.SESSION_SECRET,
    magicLinkExpiryMinutes: e.MAGIC_LINK_EXPIRY_MINUTES,
    sessionExpiryHours: e.SESSION_EXPIRY_HOURS,
    apiKeyPrefix: "mge_ag_",
    sessionPrefix: "sess_",
  };
}
