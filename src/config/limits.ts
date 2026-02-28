import { env } from "../env";

export function getLimitsConfig() {
  const e = env();
  return {
    agentRpm: e.RATE_LIMIT_AGENT_RPM,
    humanRpm: e.RATE_LIMIT_HUMAN_RPM,
    registerRph: e.RATE_LIMIT_REGISTER_RPH,
    maxFileSize: 10 * 1024 * 1024, // 10MB
    maxMessageLength: 32_000,
    maxConversationParticipants: 20,
    maxWebhooksPerAgent: 10,
    paginationDefault: 50,
    paginationMax: 100,
  };
}
