import { Hono } from "hono";
import type { AppEnv } from "../../types/hono";
import {
  listHumanInvitations,
  acceptInvitation,
  declineInvitation,
} from "../../services/invitation.service";

const app = new Hono<AppEnv>();

app.get("/invitations", async (c) => {
  const human = c.get("human");
  const invitationList = await listHumanInvitations(human.email);
  return c.json({ data: invitationList });
});

app.post("/invitations/:token/accept", async (c) => {
  const token = c.req.param("token");
  const humanId = c.get("humanId");
  const invitation = await acceptInvitation(token, humanId);
  return c.json({ data: invitation });
});

app.post("/invitations/:token/decline", async (c) => {
  const token = c.req.param("token");
  const invitation = await declineInvitation(token, c.get("humanId"));
  return c.json({ data: invitation });
});

export default app;
