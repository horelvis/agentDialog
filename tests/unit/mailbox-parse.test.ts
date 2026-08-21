import { describe, expect, it } from "bun:test";
import { parseRawMessage } from "../../src/lib/mailbox";

/**
 * The IMAP transport is verified by hand against the real mailbox once. What is
 * worth testing here is the translation from a raw RFC822 message to the three
 * fields the ingest actually uses.
 */

const QUERY_ID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";

function raw(headers: string, body: string): string {
  return `${headers}\r\n\r\n${body}\r\n`;
}

describe("parseRawMessage", () => {
  it("extracts the sender, the recipients and the plain text body", async () => {
    const message = raw(
      [
        `From: Ada Lovelace <ada@example.com>`,
        `To: AgentDialog <agentdialog.app+${QUERY_ID}@gmail.com>`,
        `Subject: Re: [AgentDialog] Should we deploy on a Friday?`,
        `Content-Type: text/plain; charset=utf-8`,
      ].join("\r\n"),
      "No. Wait until Monday.",
    );

    const parsed = await parseRawMessage(42, message);

    expect(parsed).not.toBeNull();
    expect(parsed!.uid).toBe(42);
    expect(parsed!.from).toBe("ada@example.com");
    expect(parsed!.recipients).toContain(`agentdialog.app+${QUERY_ID}@gmail.com`);
    expect(parsed!.text.trim()).toBe("No. Wait until Monday.");
  });

  it("includes Cc recipients, because the reply alias can land there", async () => {
    const message = raw(
      [
        `From: ada@example.com`,
        `To: boss@example.com`,
        `Cc: agentdialog.app+${QUERY_ID}@gmail.com`,
        `Content-Type: text/plain; charset=utf-8`,
      ].join("\r\n"),
      "Answering here.",
    );

    const parsed = await parseRawMessage(7, message);
    expect(parsed!.recipients).toEqual(
      expect.arrayContaining(["boss@example.com", `agentdialog.app+${QUERY_ID}@gmail.com`]),
    );
  });

  it("lowercases the sender so the caller compares like with like", async () => {
    const message = raw(
      [`From: ADA@Example.COM`, `To: agentdialog.app@gmail.com`].join("\r\n"),
      "Hi",
    );
    const parsed = await parseRawMessage(1, message);
    expect(parsed!.from).toBe("ada@example.com");
  });

  it("falls back to an empty body rather than failing", async () => {
    const message = raw([`From: ada@example.com`, `To: agentdialog.app@gmail.com`].join("\r\n"), "");
    const parsed = await parseRawMessage(1, message);
    expect(parsed!.text).toBe("");
  });

  it("returns null when there is no sender to attribute the reply to", async () => {
    const message = raw([`To: agentdialog.app@gmail.com`].join("\r\n"), "Anonymous");
    expect(await parseRawMessage(1, message)).toBeNull();
  });
});
