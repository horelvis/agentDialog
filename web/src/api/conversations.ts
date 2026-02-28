import { api } from "./client";
import type { ApiResponse, Conversation, Message, PaginatedResponse, SendMessageInput } from "./types";

export function listConversations(limit = 50, cursor?: string) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (cursor) params.set("cursor", cursor);
  return api.get<PaginatedResponse<Conversation>>(`/human/conversations?${params}`);
}

export function getConversation(id: string) {
  return api.get<ApiResponse<Conversation>>(`/human/conversations/${id}`);
}

export function listMessages(conversationId: string, limit = 50, cursor?: string) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (cursor) params.set("cursor", cursor);
  return api.get<PaginatedResponse<Message>>(`/human/conversations/${conversationId}/messages?${params}`);
}

export function sendMessage(conversationId: string, input: SendMessageInput) {
  return api.post<ApiResponse<Message>>(`/human/conversations/${conversationId}/messages`, input);
}

export function uploadFile(conversationId: string, file: File) {
  return api.upload<ApiResponse<Message>>(`/human/conversations/${conversationId}/upload`, file);
}
