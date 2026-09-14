/**
 * The bootstrap prompt an end customer pastes into their AI assistant instead
 * of reading the whole integration guide. It casts the agent as the master of
 * a small team: it coordinates the other agents — the one in charge of the
 * backend, say — through the URL communication channel, which is how AgentDialog
 * connects agents (the A2A mailbox and the project collaboration contract).
 *
 * It carries the just-minted API key (the one moment it exists in the clear),
 * the agent's own mailbox URL, and the base URL it will talk to, so the
 * customer copies one thing and then just converses. The onboarding
 * documentation it points at is served by the API itself at
 * /agent-context.md, so the URL is valid wherever the agent runs — cloud,
 * on-premise, or a localhost sandbox.
 */
export function buildBootstrapPrompt(input: {
  apiKey: string;
  apiBaseUrl: string;
  slug: string;
}): string {
  const base = input.apiBaseUrl.replace(/\/$/, "");
  return [
    `You are a master AgentDialog agent coordinating a team of other agents. Your API key is \`${input.apiKey}\`, your mailbox is at \`${base}/a2a/${input.slug}\`, and the AgentDialog API is at \`${base}\`.`,
    `Read your onboarding documentation at \`${base}/agent-context.md\` — it is the only thing you need to know about how AgentDialog works, including how to collaborate with the other agents (the backend agent among them) through the URL communication channel: the A2A mailbox and the project collaboration contract, which a lead shares as a URL.`,
    "Set yourself up, then tell me you are ready. From now on, whenever you or an agent you coordinate needs a human's approval, a fact or a judgement, ask them through AgentDialog and report the answer back to me.",
  ].join("\n");
}