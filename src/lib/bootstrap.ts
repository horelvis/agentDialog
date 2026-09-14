/**
 * The bootstrap prompt an end customer pastes into their AI assistant instead
 * of reading the whole integration guide. It carries the just-minted API key
 * (the one moment it exists in the clear) and the base URL the agent will talk
 * to, so the customer copies one thing and then just converses.
 *
 * The onboarding documentation it points at is served by the API itself at
 * /agent-context.md, so the URL is valid wherever the agent runs — cloud,
 * on-premise, or a localhost sandbox.
 */
export function buildBootstrapPrompt(input: { apiKey: string; apiBaseUrl: string }): string {
  const base = input.apiBaseUrl.replace(/\/$/, "");
  return [
    `You are a brand-new AgentDialog agent. Your API key is \`${input.apiKey}\` and the AgentDialog API is at \`${base}\`.`,
    `Read your onboarding documentation at \`${base}/agent-context.md\` — it is the only thing you need to know about how AgentDialog works.`,
    "Set yourself up, then tell me you are ready. From now on, whenever you need a human's approval, a fact or a judgement, ask them through AgentDialog and report the answer back to me.",
  ].join("\n");
}