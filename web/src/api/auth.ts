import { api } from "./client";
import type { ApiResponse, Human } from "./types";

export function sendCode(email: string) {
  return api.post<ApiResponse<{ message: string }>>("/human/auth/send-code", { email });
}

export function verifyCode(email: string, code: string) {
  return api.post<ApiResponse<{ sessionToken: string; human: Human }>>("/human/auth/verify", { email, code });
}

export function logout() {
  return api.post("/human/auth/logout");
}
