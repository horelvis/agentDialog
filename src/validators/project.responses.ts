import { z } from "zod";
import { ok } from "./response.helpers";
import {
  projectStatusEnum,
  participantRoleEnum,
  participantStatusEnum,
  projectTaskStatusEnum,
} from "../db/schema/enums";

export const projectParticipantObject = z.object({
  participant_id: z.string().uuid(),
  agent_id: z.string().uuid(),
  role: z.enum(participantRoleEnum.enumValues),
  status: z.enum(participantStatusEnum.enumValues),
  created_at: z.string().datetime(),
});

export const projectTaskObject = z.object({
  task_id: z.string().uuid(),
  a2a_task_id: z.string().uuid(),
  title: z.string(),
  description: z.string().nullable(),
  assignee_agent_id: z.string().uuid(),
  status: z.enum(projectTaskStatusEnum.enumValues),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export const projectObject = z.object({
  project_id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  status: z.enum(projectStatusEnum.enumValues),
  lead_agent_id: z.string().uuid(),
  participants: z.array(projectParticipantObject),
  tasks: z.array(projectTaskObject),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export const projectResponse = ok(projectObject);
export const projectListResponse = ok(z.array(projectObject));