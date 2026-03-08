import { api } from "./client";
import type { ApiResponse } from "./types";

export interface TrustedAgent {
  agentId: string;
  displayName: string;
  slug: string;
  avatarUrl: string | null;
  description: string | null;
  firstAcceptedAt: string;
}

export function listTrustedAgents() {
  return api.get<{ data: TrustedAgent[] }>("/human/trusted-agents");
}

export function revokeTrust(agentId: string) {
  return api.post<ApiResponse<{ agentId: string; revoked: boolean }>>(
    `/human/trusted-agents/${agentId}/revoke`,
  );
}
