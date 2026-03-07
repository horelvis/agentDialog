import { env } from "../env";

export function getAuthConfig() {
  const e = env();
  return {
    apiKeySaltRounds: e.API_KEY_SALT_ROUNDS,
    sessionSecret: e.SESSION_SECRET,
    verificationCodeExpiryMinutes: e.VERIFICATION_CODE_EXPIRY_MINUTES,
    verificationMaxAttempts: e.VERIFICATION_MAX_ATTEMPTS,
    sessionExpiryHours: e.SESSION_EXPIRY_HOURS,
    apiKeyPrefix: "mge_ag_",
    sessionPrefix: "sess_",
  };
}
