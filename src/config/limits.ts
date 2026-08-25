import { env } from "../env";

export function getLimitsConfig() {
  const e = env();
  return {
    globalRpm: e.RATE_LIMIT_GLOBAL_RPM,
    agentRpm: e.RATE_LIMIT_AGENT_RPM,
    humanRpm: e.RATE_LIMIT_HUMAN_RPM,
    registerRph: e.RATE_LIMIT_REGISTER_RPH,
    authSendCodeRpm: 5,
    authVerifyRpm: 10,
    maxBodySize: 1024 * 1024, // 1MB
    maxFileSize: 10 * 1024 * 1024, // 10MB
    maxMessageLength: 32_000,
    maxConversationParticipants: 20,
    maxWebhooksPerAgent: 10,
    webhookSecretGraceMs: 24 * 60 * 60 * 1000, // a rotated secret stays live 24h
    paginationDefault: 50,
    paginationMax: 100,
    penaltyMaxSeconds: 300, // 5 minutes max penalty
  };
}
