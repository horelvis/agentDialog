import { Hono } from "hono";
import type { AppEnv } from "../../types/hono";
import { createMagicLink, verifyMagicLink, logout } from "../../services/auth.service";
import { magicLinkSchema } from "../../validators/human.validators";
import { validateBody } from "../../middleware/validate";
import { sendMagicLinkEmail } from "../../services/email.service";
import { humanAuth } from "../../middleware/human-auth";

const app = new Hono<AppEnv>();

app.post("/auth/magic-link", validateBody(magicLinkSchema), async (c) => {
  const input = c.get("validatedBody") as { email: string };
  const { token } = await createMagicLink(input.email);

  await sendMagicLinkEmail(input.email, token);

  return c.json({
    data: { message: "Magic link sent to your email" },
  });
});

app.get("/auth/verify", async (c) => {
  const token = c.req.query("token");
  if (!token) {
    return c.json({ error: { code: "VALIDATION_ERROR", message: "Token is required" } }, 422);
  }

  const { sessionToken, human } = await verifyMagicLink(token);

  return c.json({
    data: {
      sessionToken,
      human: {
        id: human.id,
        email: human.email,
        displayName: human.displayName,
      },
    },
  });
});

app.post("/auth/logout", humanAuth, async (c) => {
  const humanId = c.get("humanId");
  await logout(humanId);
  return c.json({ data: { message: "Logged out successfully" } });
});

export default app;
