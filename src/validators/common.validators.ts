import { z } from "zod";

export const uuidParam = z.object({
  id: z.string().uuid(),
});

export const tokenParam = z.object({
  token: z.string().min(1),
});

export const paginationQuery = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});
