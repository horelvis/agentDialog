import { describe, expect, it } from "bun:test";
import { createHmac } from "crypto";
import { verifyWebhook } from "../src/webhooks.js";

const SECRET = "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw";
const BODY = '{"event":"query.answered","data":{}}';
const MSG_ID = "msg_2KWPBgLlAfxdpx2AI54pPJ85f4W";

function sign(secret: string, msgId: string, timestamp: number, body: string): string {
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  return `v1,${createHmac("sha256", key).update(`${msgId}.${timestamp}.${body}`).digest("base64")}`;
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

describe("verifyWebhook", () => {
  it("accepts a delivery we signed", () => {
    const timestamp = nowSeconds();
    expect(
      verifyWebhook({
        secret: SECRET,
        body: BODY,
        headers: {
          "webhook-id": MSG_ID,
          "webhook-timestamp": String(timestamp),
          "webhook-signature": sign(SECRET, MSG_ID, timestamp, BODY),
        },
      }),
    ).toBe(true);
  });

  it("rejects a tampered body", () => {
    const timestamp = nowSeconds();
    expect(
      verifyWebhook({
        secret: SECRET,
        body: `${BODY} `,
        headers: {
          "webhook-id": MSG_ID,
          "webhook-timestamp": String(timestamp),
          "webhook-signature": sign(SECRET, MSG_ID, timestamp, BODY),
        },
      }),
    ).toBe(false);
  });

  it("rejects a replay older than the tolerance", () => {
    const timestamp = nowSeconds() - 6 * 60;
    expect(
      verifyWebhook({
        secret: SECRET,
        body: BODY,
        headers: {
          "webhook-id": MSG_ID,
          "webhook-timestamp": String(timestamp),
          "webhook-signature": sign(SECRET, MSG_ID, timestamp, BODY),
        },
      }),
    ).toBe(false);
  });

  it("rejects a delivery timestamped in the future beyond the tolerance", () => {
    const timestamp = nowSeconds() + 6 * 60;
    expect(
      verifyWebhook({
        secret: SECRET,
        body: BODY,
        headers: {
          "webhook-id": MSG_ID,
          "webhook-timestamp": String(timestamp),
          "webhook-signature": sign(SECRET, MSG_ID, timestamp, BODY),
        },
      }),
    ).toBe(false);
  });

  it("accepts when one of several signatures matches, which is how rotation works", () => {
    const timestamp = nowSeconds();
    const other = "whsec_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
    expect(
      verifyWebhook({
        secret: SECRET,
        body: BODY,
        headers: {
          "webhook-id": MSG_ID,
          "webhook-timestamp": String(timestamp),
          "webhook-signature": `${sign(other, MSG_ID, timestamp, BODY)} ${sign(SECRET, MSG_ID, timestamp, BODY)}`,
        },
      }),
    ).toBe(true);
  });

  it("rejects when no signature in the list matches", () => {
    const timestamp = nowSeconds();
    const other = "whsec_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
    expect(
      verifyWebhook({
        secret: SECRET,
        body: BODY,
        headers: {
          "webhook-id": MSG_ID,
          "webhook-timestamp": String(timestamp),
          "webhook-signature": sign(other, MSG_ID, timestamp, BODY),
        },
      }),
    ).toBe(false);
  });
});
