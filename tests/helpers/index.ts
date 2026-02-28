import { createApp } from "../../src/app";
import { registerAgent } from "../../src/services/agent.service";
import { createMagicLink, verifyMagicLink } from "../../src/services/auth.service";

export function createTestApp() {
  return createApp();
}

export async function createTestAgent(overrides: Record<string, unknown> = {}) {
  const slug = `test-agent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const { agent, apiKey } = await registerAgent({
    slug,
    displayName: "Test Agent",
    ...overrides,
  });
  return { agent, apiKey, authHeader: `Bearer ${apiKey}` };
}

export async function createTestHuman(email?: string) {
  const testEmail = email || `test-${Date.now()}@example.com`;
  const { token } = await createMagicLink(testEmail);
  const { sessionToken, human } = await verifyMagicLink(token);
  return { human, sessionToken, authHeader: `Bearer ${sessionToken}` };
}
