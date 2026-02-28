import { z } from "zod";

export const agentRegisterSchema = z.object({
  slug: z
    .string()
    .min(3)
    .max(64)
    .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/, "Slug must be lowercase alphanumeric with hyphens"),
  displayName: z.string().min(1).max(128),
  description: z.string().max(1024).optional(),
  avatarUrl: z.string().url().optional(),
  homepageUrl: z.string().url().optional(),
  provider: z.string().max(64).optional(),
  model: z.string().max(128).optional(),
  capabilities: z.array(z.string().max(64)).max(20).optional(),
  metadata: z.record(z.unknown()).optional(),
  agentCard: z.record(z.unknown()).optional(),
});

export const agentUpdateSchema = z.object({
  displayName: z.string().min(1).max(128).optional(),
  description: z.string().max(1024).optional(),
  avatarUrl: z.string().url().nullable().optional(),
  homepageUrl: z.string().url().nullable().optional(),
  provider: z.string().max(64).optional(),
  model: z.string().max(128).optional(),
  capabilities: z.array(z.string().max(64)).max(20).optional(),
  metadata: z.record(z.unknown()).optional(),
  agentCard: z.record(z.unknown()).optional(),
});

export type AgentRegisterInput = z.infer<typeof agentRegisterSchema>;
export type AgentUpdateInput = z.infer<typeof agentUpdateSchema>;
