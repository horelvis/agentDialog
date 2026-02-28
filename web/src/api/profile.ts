import { api } from "./client";
import type { ApiResponse, Human } from "./types";

export function getMe() {
  return api.get<ApiResponse<Human>>("/human/me");
}

export function updateProfile(data: { displayName?: string; avatarUrl?: string }) {
  return api.patch<ApiResponse<Human>>("/human/me", data);
}
