import { Hono } from "hono";
import type { AppEnv } from "../../types/hono";
import { createVerificationCode, verifyCode, logout } from "../../services/auth.service";
import { sendCodeSchema, verifyCodeSchema } from "../../validators/human.validators";
import { validateBody } from "../../middleware/validate";
import { sendVerificationCodeEmail } from "../../services/email.service";
import { humanAuth } from "../../middleware/human-auth";

const app = new Hono<AppEnv>();

app.post("/auth/send-code", validateBody(sendCodeSchema), async (c) => {
  const input = c.get("validatedBody") as { email: string };
  const { code } = await createVerificationCode(input.email);

  await sendVerificationCodeEmail(input.email, code);

  return c.json({
    data: { message: "Verification code sent to your email" },
  });
});

app.post("/auth/verify", validateBody(verifyCodeSchema), async (c) => {
  const input = c.get("validatedBody") as { email: string; code: string };
  const { sessionToken, human } = await verifyCode(input.email, input.code);

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
