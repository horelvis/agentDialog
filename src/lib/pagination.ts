import { z } from "zod";
import { getLimitsConfig } from "../config/limits";

export const paginationSchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  direction: z.enum(["before", "after"]).default("after"),
});

export type PaginationParams = z.infer<typeof paginationSchema>;

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    hasMore: boolean;
    nextCursor: string | null;
    prevCursor: string | null;
    count: number;
  };
}

export function getLimit(requested?: number): number {
  const config = getLimitsConfig();
  if (!requested) return config.paginationDefault;
  return Math.min(requested, config.paginationMax);
}
