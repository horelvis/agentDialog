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
};

export type AppEnv = {
  Variables: AppVariables;
};

export type AppContext = Context<AppEnv>;
