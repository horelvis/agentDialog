import { loadEnv } from "../src/env";
loadEnv();

import { getDb, closeDb } from "../src/db";
import { registerAgent } from "../src/services/agent.service";
import { createConversation } from "../src/services/conversation.service";
import { createMessage } from "../src/services/message.service";

async function seed() {
  console.log("[SEED] Starting seed...");

  // Create demo agent
  const { agent, apiKey } = await registerAgent({
    slug: "demo-assistant",
    displayName: "Demo Assistant",
    description: "A demo agent for testing AgentDialog",
    provider: "anthropic",
    model: "claude-sonnet-4-20250514",
    capabilities: ["chat", "tool-use", "forms", "approvals"],
  });
  console.log(`[SEED] Created agent: ${agent.slug}`);
  console.log(`[SEED] API Key: ${apiKey}`);

  // Create a conversation
  const conversation = await createConversation(agent.id, {
    title: "Welcome to AgentDialog",
    description: "A demo conversation",
    intentType: "notification",
  });
  console.log(`[SEED] Created conversation: ${conversation.id}`);

  // Add some messages
  await createMessage(conversation.id, "agent", agent.id, {
    type: "text",
    content: "Welcome to AgentDialog! I'm a demo agent ready to help.",
  });

  await createMessage(conversation.id, "agent", agent.id, {
    type: "notification",
    content: "System initialized successfully",
    structuredData: {
      severity: "success",
      title: "System Ready",
      details: "All services are operational",
    },
  });

  console.log("[SEED] Seed complete!");
  await closeDb();
  process.exit(0);
}

seed().catch((err) => {
  console.error("[SEED] Error:", err);
  process.exit(1);
});
