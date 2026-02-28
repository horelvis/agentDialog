import { api } from "./client";
import type { ApiResponse, Human } from "./types";

export function requestMagicLink(email: string) {
  return api.post<ApiResponse<{ message: string }>>("/human/auth/magic-link", { email });
}

export function verifyToken(token: string) {
  return api.get<ApiResponse<{ sessionToken: string; human: Human }>>(`/human/auth/verify?token=${token}`);
}

export function logout() {
  return api.post("/human/auth/logout");
}
