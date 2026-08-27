import { z } from "zod";

/**
 * POST /:id/upload/presigned is the one JSON body on this surface that used
 * to validate nothing: the route read `c.req.json()` by hand with no
 * `validateBody`, so a malformed body threw an unhandled `SyntaxError` that
 * fell through to the 500 fallback in error-handler.ts, on an operation the
 * document promises answers 422. This is what documented(...) points `body:`
 * at, and what validateBody(...) now runs before the handler.
 */
export const presignedUploadRequestSchema = z.object({
  fileName: z.string().min(1),
});

export type PresignedUploadRequestInput = z.infer<typeof presignedUploadRequestSchema>;
