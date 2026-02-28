import { api } from "./client";
import type { ApiResponse, Invitation, PaginatedResponse } from "./types";

export function listInvitations() {
  return api.get<PaginatedResponse<Invitation>>("/human/invitations");
}

export function acceptInvitation(token: string) {
  return api.post<ApiResponse<Invitation>>(`/human/invitations/${token}/accept`);
}

export function declineInvitation(token: string) {
  return api.post<ApiResponse<Invitation>>(`/human/invitations/${token}/decline`);
}
