import type { Context } from "hono";

// Declare the custom context variables used across routes/middleware
export type AppVariables = {
  requestId: string;
  agent: any;
  agentId: string;
  human: any;
  humanId: string;
  validatedBody: any;
  validatedQuery: any;
  // Set by query-grant-auth. A grant is a capability, not an identity: it never
  // sets `human`, and holding one is not being signed in.
  grantId: string;
  grantQueryId: string;
  grantEmail: string;
};

export type AppEnv = {
  Variables: AppVariables;
};

export type AppContext = Context<AppEnv>;
