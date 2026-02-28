import { z } from "zod";

export const magicLinkSchema = z.object({
  email: z.string().email(),
});

export const humanUpdateSchema = z.object({
  displayName: z.string().min(1).max(128).optional(),
  avatarUrl: z.string().url().nullable().optional(),
  preferences: z.record(z.unknown()).optional(),
});

export type MagicLinkInput = z.infer<typeof magicLinkSchema>;
export type HumanUpdateInput = z.infer<typeof humanUpdateSchema>;
