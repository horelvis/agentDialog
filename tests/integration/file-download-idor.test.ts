import { beforeAll, describe, expect, it } from "bun:test";
import { eq } from "drizzle-orm";
import { createTestApp, createTestAgent, createTestHuman } from "../helpers";
import { getDb } from "../../src/db";
import { invitations } from "../../src/db/schema/invitations";
import { acceptInvitation } from "../../src/services/invitation.service";
import { initStorage } from "../../src/services/file.service";

/**
 * The download route checks that the caller participates in the conversation
 * named in the URL, and then resolves the attachment by id alone. Nothing ties
 * the two together, so pairing somebody else's attachment id with a
 * conversation you do belong to hands you their file.
 */

const app = createTestApp();

// The server creates the bucket at boot; createTestApp() does not.
beforeAll(async () => {
  await initStorage();
});

async function conversationWithHuman(email: string) {
  const { authHeader: agentAuth } = await createTestAgent();

  const convRes = await app.request("/api/v1/agent/conversations", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: agentAuth },
    body: JSON.stringify({
      title: "Attachment holder",
      description: "Holds a file",
      intentType: "clarification",
    }),
  });
  expect(convRes.status).toBe(201);
  const { data: conversation } = await convRes.json();

  const invRes = await app.request(
    `/api/v1/agent/conversations/${conversation.id}/invitations`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: agentAuth },
      body: JSON.stringify({ email, message: "Join" }),
    },
  );
  expect(invRes.status).toBe(201);

  const db = getDb();
  const [invitation] = await db
    .select()
    .from(invitations)
    .where(eq(invitations.conversationId, conversation.id));

  const human = await createTestHuman(email);
  await acceptInvitation(invitation.token as string, human.human.id);

  return { conversationId: conversation.id as string, humanAuth: human.authHeader };
}

async function uploadFile(
  conversationId: string,
  humanAuth: string,
  fileName: string,
  contents: string,
) {
  const form = new FormData();
  form.append("file", new File([contents], fileName, { type: "text/plain" }));

  const res = await app.request(`/api/v1/human/conversations/${conversationId}/upload`, {
    method: "POST",
    headers: { Authorization: humanAuth },
    body: form,
  });
  expect(res.status).toBe(201);
  const { data } = await res.json();
  return data.attachments[0].id as string;
}

describe("file download authorization", () => {
  it("refuses an attachment that belongs to another conversation", async () => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    const victim = await conversationWithHuman(`victim-${stamp}@example.com`);
    const attachmentId = await uploadFile(
      victim.conversationId,
      victim.humanAuth,
      "payroll.txt",
      "SALARIES 2026 CONFIDENTIAL",
    );

    // Somebody with a perfectly valid session and a conversation of their own.
    const stranger = await conversationWithHuman(`stranger-${stamp}@example.com`);

    const res = await app.request(
      `/api/v1/human/conversations/${stranger.conversationId}/files/${attachmentId}/download`,
      { headers: { Authorization: stranger.humanAuth } },
    );

    expect(res.status).toBe(404);
    expect(await res.text()).not.toContain("SALARIES 2026 CONFIDENTIAL");
  });

  it("still serves an attachment from a conversation the caller belongs to", async () => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    const owner = await conversationWithHuman(`owner-${stamp}@example.com`);
    const attachmentId = await uploadFile(
      owner.conversationId,
      owner.humanAuth,
      "notes.txt",
      "MY OWN NOTES",
    );

    const res = await app.request(
      `/api/v1/human/conversations/${owner.conversationId}/files/${attachmentId}/download`,
      { headers: { Authorization: owner.humanAuth } },
    );

    expect(res.status).toBe(200);
    expect(await res.text()).toBe("MY OWN NOTES");
  });
});
