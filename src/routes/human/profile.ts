import { Hono } from "hono";
import type { AppEnv } from "../../types/hono";
import { updateHuman } from "../../services/human.service";
import { humanUpdateSchema } from "../../validators/human.validators";
import { validateBody } from "../../middleware/validate";

const app = new Hono<AppEnv>();

app.get("/me", async (c) => {
  const human = c.get("human");
  return c.json({
    data: {
      id: human.id,
      email: human.email,
      displayName: human.displayName,
      avatarUrl: human.avatarUrl,
      preferences: human.preferences,
      createdAt: human.createdAt.toISOString(),
    },
  });
});

app.patch("/me", validateBody(humanUpdateSchema), async (c) => {
  const humanId = c.get("humanId");
  const input = c.get("validatedBody");
  const human = await updateHuman(humanId, input);

  return c.json({
    data: {
      id: human.id,
      email: human.email,
      displayName: human.displayName,
      avatarUrl: human.avatarUrl,
      preferences: human.preferences,
      updatedAt: human.updatedAt.toISOString(),
    },
  });
});

export default app;
