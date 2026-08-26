import { z } from "zod";
import { SUPPORTED_LANGUAGES } from "../i18n";

export const createInvitationSchema = z.object({
  email: z.string().email(),
  message: z.string().max(1024).optional(),
  language: z.enum(SUPPORTED_LANGUAGES).optional(),
  expiresInHours: z.number().int().min(1).max(168).default(48),
});

export type CreateInvitationInput = z.infer<typeof createInvitationSchema>;
