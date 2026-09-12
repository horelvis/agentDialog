import { z } from "zod";
import { taskSchema, messageSchema, artifactSchema } from "../lib/a2a";

export const a2aTaskResponse = z.object({ data: taskSchema });
export const a2aTaskListResponse = z.object({ data: z.array(taskSchema) });
export const a2aMessageResponse = z.object({ data: messageSchema });
export const a2aArtifactResponse = z.object({ data: artifactSchema });
export const a2aEmptyResponse = z.object({ data: z.record(z.unknown()).optional() });