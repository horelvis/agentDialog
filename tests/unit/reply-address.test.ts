import { describe, expect, it } from "bun:test";
import {
  buildReplyToAddress,
  classifyRecipient,
  classifyRecipients,
  extractBareAddress,
} from "../../src/lib/reply-address";

/**
 * The query id travels in the Reply-To address and comes back in the To header
 * of the human's reply. Building and reading that address are two halves of one
 * contract, so they live in one module and are tested against each other.
 */

const gmail = { localPart: "agentdialog.app", domain: "gmail.com" };
const own = { localPart: "reply", domain: "reply.agentdialog.io" };

const QUERY_ID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";

describe("buildReplyToAddress", () => {
  it("builds a plus address from the configured local part and domain", () => {
    expect(buildReplyToAddress(QUERY_ID, gmail)).toBe(
      `agentdialog.app+${QUERY_ID}@gmail.com`,
    );
    expect(buildReplyToAddress(QUERY_ID, own)).toBe(
      `reply+${QUERY_ID}@reply.agentdialog.io`,
    );
  });
});

describe("classifyRecipient", () => {
  it("round-trips an address it built itself", () => {
    for (const config of [gmail, own]) {
      const built = buildReplyToAddress(QUERY_ID, config);
      expect(classifyRecipient(built, config)).toEqual({
        kind: "reply",
        queryId: QUERY_ID,
      });
    }
  });

  it("reads the address out of a display-name header", () => {
    const header = `AgentDialog <${buildReplyToAddress(QUERY_ID, gmail)}>`;
    expect(classifyRecipient(header, gmail)).toEqual({
      kind: "reply",
      queryId: QUERY_ID,
    });
  });

  it("ignores case in the local part and the domain", () => {
    expect(
      classifyRecipient(`AgentDialog.App+${QUERY_ID.toUpperCase()}@GMAIL.COM`, gmail),
    ).toEqual({ kind: "reply", queryId: QUERY_ID });
  });

  // A tag that is not a query id is addressed to us but unusable. Retrying it
  // will never work, so the caller marks it read rather than looping forever.
  it("reports a plus tag that is not a query id as malformed", () => {
    expect(classifyRecipient("agentdialog.app+newsletter@gmail.com", gmail)).toEqual({
      kind: "malformed",
    });
    expect(classifyRecipient("agentdialog.app+@gmail.com", gmail)).toEqual({
      kind: "malformed",
    });
    expect(classifyRecipient("agentdialog.app+not-a-uuid-at-all@gmail.com", gmail)).toEqual({
      kind: "malformed",
    });
  });

  // Anything else is somebody else's mail. The mailbox belongs to a person too.
  it("reports mail that is not addressed to the reply alias as foreign", () => {
    expect(classifyRecipient("agentdialog.app@gmail.com", gmail)).toEqual({ kind: "foreign" });
    expect(classifyRecipient("someone@example.com", gmail)).toEqual({ kind: "foreign" });
    expect(classifyRecipient(`support+${QUERY_ID}@gmail.com`, gmail)).toEqual({ kind: "foreign" });
    expect(classifyRecipient(`agentdialog.app+${QUERY_ID}@example.com`, gmail)).toEqual({
      kind: "foreign",
    });
    expect(classifyRecipient("not an address", gmail)).toEqual({ kind: "foreign" });
    expect(classifyRecipient("", gmail)).toEqual({ kind: "foreign" });
  });
});

describe("classifyRecipients", () => {
  it("finds the reply address among several recipients", () => {
    const result = classifyRecipients(
      ["someone@example.com", buildReplyToAddress(QUERY_ID, gmail), "cc@example.com"],
      gmail,
    );
    expect(result).toEqual({ kind: "reply", queryId: QUERY_ID });
  });

  it("prefers a usable reply address over a malformed one", () => {
    const result = classifyRecipients(
      ["agentdialog.app+junk@gmail.com", buildReplyToAddress(QUERY_ID, gmail)],
      gmail,
    );
    expect(result).toEqual({ kind: "reply", queryId: QUERY_ID });
  });

  it("reports malformed when the only address of ours is unusable", () => {
    expect(
      classifyRecipients(["boss@example.com", "agentdialog.app+junk@gmail.com"], gmail),
    ).toEqual({ kind: "malformed" });
  });

  it("reports foreign when none of the addresses is ours", () => {
    expect(classifyRecipients(["a@example.com", "b@example.com"], gmail)).toEqual({
      kind: "foreign",
    });
    expect(classifyRecipients([], gmail)).toEqual({ kind: "foreign" });
  });
});

describe("extractBareAddress", () => {
  it("strips a display name", () => {
    expect(extractBareAddress("Ada Lovelace <ada@example.com>")).toBe("ada@example.com");
  });

  it("passes a bare address through, trimmed", () => {
    expect(extractBareAddress("  ada@example.com ")).toBe("ada@example.com");
  });

  it("returns null for something that is not an address", () => {
    expect(extractBareAddress("undisclosed-recipients")).toBeNull();
  });
});
