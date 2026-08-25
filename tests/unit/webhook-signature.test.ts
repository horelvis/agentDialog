import { describe, expect, it } from "bun:test";
import { createHmac } from "crypto";
import {
  buildSignedContent,
  generateMessageId,
  generateWebhookSecret,
  signPayload,
  signatureHeader,
} from "../../src/lib/webhook-signature";

/**
 * Standard Webhooks, verbatim. These tests recompute the expected signature
 * from the specification rather than from our own helper, because a helper
 * that agrees with itself is exactly how the bcrypt bug survived.
 */

const SECRET = "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw";
const BODY = '{"event":"query.answered","data":{}}';
const MSG_ID = "msg_2KWPBgLlAfxdpx2AI54pPJ85f4W";
const TIMESTAMP = 1674087231;

function expectedSignature(secret: string): string {
  const raw = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const signed = `${MSG_ID}.${TIMESTAMP}.${BODY}`;
  return createHmac("sha256", raw).update(signed).digest("base64");
}

describe("generateWebhookSecret", () => {
  it("is whsec_ followed by 32 bytes of base64", () => {
    const secret = generateWebhookSecret();
    expect(secret).toStartWith("whsec_");
    expect(Buffer.from(secret.slice("whsec_".length), "base64")).toHaveLength(32);
  });

  it("does not repeat itself", () => {
    expect(generateWebhookSecret()).not.toBe(generateWebhookSecret());
  });
});

describe("generateMessageId", () => {
  it("is msg_ followed by an opaque id", () => {
    expect(generateMessageId()).toMatch(/^msg_[A-Za-z0-9_-]{27}$/);
  });
});

describe("buildSignedContent", () => {
  it("joins id, timestamp and body with full stops", () => {
    expect(buildSignedContent(MSG_ID, TIMESTAMP, BODY)).toBe(
      `${MSG_ID}.${TIMESTAMP}.${BODY}`,
    );
  });
});

describe("signPayload", () => {
  it("matches a signature computed straight from the specification", () => {
    expect(signPayload(SECRET, MSG_ID, TIMESTAMP, BODY)).toBe(
      `v1,${expectedSignature(SECRET)}`,
    );
  });

  it("keys the hmac with the decoded bytes, not the literal string", () => {
    const literal = createHmac("sha256", SECRET)
      .update(`${MSG_ID}.${TIMESTAMP}.${BODY}`)
      .digest("base64");

    expect(signPayload(SECRET, MSG_ID, TIMESTAMP, BODY)).not.toBe(`v1,${literal}`);
  });

  it("changes when the body changes", () => {
    expect(signPayload(SECRET, MSG_ID, TIMESTAMP, BODY)).not.toBe(
      signPayload(SECRET, MSG_ID, TIMESTAMP, `${BODY} `),
    );
  });

  it("changes when the timestamp changes, which is what stops a replay", () => {
    expect(signPayload(SECRET, MSG_ID, TIMESTAMP, BODY)).not.toBe(
      signPayload(SECRET, MSG_ID, TIMESTAMP + 1, BODY),
    );
  });
});

describe("signatureHeader", () => {
  it("emits one signature per live secret, space delimited", () => {
    const second = generateWebhookSecret();
    const header = signatureHeader([SECRET, second], MSG_ID, TIMESTAMP, BODY);

    expect(header).toBe(
      `${signPayload(SECRET, MSG_ID, TIMESTAMP, BODY)} ${signPayload(second, MSG_ID, TIMESTAMP, BODY)}`,
    );
    expect(header.split(" ")).toHaveLength(2);
  });

  it("emits a single signature when only one secret is live", () => {
    expect(signatureHeader([SECRET], MSG_ID, TIMESTAMP, BODY).split(" ")).toHaveLength(1);
  });
});
