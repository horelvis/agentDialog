import { describe, expect, it, beforeAll, afterAll, mock } from "bun:test";
import { sendQueryEmail } from "../../src/services/query-email.service";

/**
 * The email is captured rather than sent: what matters is which words the
 * product chose, not that SMTP works.
 */
const captured: Array<{ subject: string; html: string; text: string }> = [];

mock.module("../../src/lib/email", () => ({
  sendEmail: async (options: { subject: string; html: string; text: string }) => {
    captured.push(options);
    return true;
  },
}));

const base = {
  queryId: "q1",
  agentDisplayName: "Release Agent",
  question: "Is the Q4 revenue figure correct?",
  queryType: "validation",
  subject: { id: "s1", label: "Q4 revenue" },
  targetEmail: "person@example.com",
  expiresAt: new Date("2026-09-01T10:00:00Z"),
  invitationToken: "inv",
  conversationId: "c1",
  grantToken: "qgr_test",
};

describe("Query email language", () => {
  it("wraps the question in Catalan when the query declares ca", async () => {
    captured.length = 0;
    await sendQueryEmail({ ...base, language: "ca" });

    const mail = captured[0]!;
    expect(mail.html).toContain("té una pregunta per a tu");
    expect(mail.html).toContain("Respondre aquesta pregunta");
    // And the agent's own words are untouched.
    expect(mail.html).toContain("Is the Q4 revenue figure correct?");
  });

  it("uses English when the query declares nothing", async () => {
    captured.length = 0;
    await sendQueryEmail({ ...base, language: "en" });

    expect(captured[0]!.html).toContain("has a question for you");
  });

  it("formats the expiry date in the query's language", async () => {
    captured.length = 0;
    await sendQueryEmail({ ...base, language: "es" });

    // es-ES writes the month in Spanish; en-US would say "Sep".
    expect(captured[0]!.text).toContain("sept");
  });

  it("wraps the plain-text part in the query's language", async () => {
    captured.length = 0;
    await sendQueryEmail({ ...base, language: "ca" });

    const mail = captured[0]!;
    // Check Catalan wrapper in the plain-text alternative
    expect(mail.text).toContain("té una pregunta per a tu");
    expect(mail.text).toContain("Respondre aquest correu no arriba a");
    expect(mail.text).toContain("T'enviarem un codi d'accés per correu");
  });

  it("escapes agent display names containing HTML in the email body", async () => {
    captured.length = 0;
    const evilAgent = { ...base, agentDisplayName: 'Agent <script>alert("xss")</script>' };
    await sendQueryEmail({ ...evilAgent, language: "en" });

    const mail = captured[0]!;
    // The script tag should be escaped, not present as executable HTML
    expect(mail.html).toContain("&lt;script&gt;");
    expect(mail.html).not.toContain("<script>");
  });
});
