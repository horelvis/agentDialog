import { api } from "./client";
import type { ApiResponse, HumanQuery } from "./types";

export function listQueries() {
  return api.get<{ data: HumanQuery[] }>("/human/queries");
}

export function getQuery(id: string) {
  return api.get<ApiResponse<HumanQuery>>(`/human/queries/${id}`);
}

export function respondQuery(
  id: string,
  input: { answer: string; comment?: string; confidence?: number },
) {
  return api.post<ApiResponse<HumanQuery>>(`/human/queries/${id}/respond`, input);
}
