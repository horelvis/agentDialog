import { createHmac, timingSafeEqual } from "node:crypto";

const SECRET_PREFIX = "whsec_";
const DEFAULT_TOLERANCE_SECONDS = 300;

export interface VerifyWebhookOptions {
  /** The signing secret AgentDialog returned when the webhook was created. */
  secret: string;
  /** The raw request body, byte for byte. Re-serialising it breaks the signature. */
  body: string;
  headers: Record<string, string | undefined>;
  /** How old a delivery may be, in seconds. Defaults to five minutes. */
  toleranceSeconds?: number;
  /** Injectable for tests. */
  now?: () => number;
}

/**
 * Verify a delivery: that we signed it, that nobody altered it, and that it is
 * not a replay. Several signatures may arrive while a secret is being rotated;
 * any one of them matching is enough.
 */
export function verifyWebhook(options: VerifyWebhookOptions): boolean {
  const { secret, body, headers } = options;
  const tolerance = options.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS;
  const now = options.now ? options.now() : Math.floor(Date.now() / 1000);

  const id = headers["webhook-id"];
  const rawTimestamp = headers["webhook-timestamp"];
  const signatures = headers["webhook-signature"];
  if (!id || !rawTimestamp || !signatures) return false;

  const timestamp = Number(rawTimestamp);
  if (!Number.isFinite(timestamp)) return false;
  if (Math.abs(now - timestamp) > tolerance) return false;

  const key = Buffer.from(
    secret.startsWith(SECRET_PREFIX) ? secret.slice(SECRET_PREFIX.length) : secret,
    "base64",
  );
  const expected = createHmac("sha256", key)
    .update(`${id}.${timestamp}.${body}`)
    .digest();

  return signatures.split(" ").some((entry) => {
    const [version, value] = entry.split(",");
    if (version !== "v1" || !value) return false;

    const received = Buffer.from(value, "base64");
    return received.length === expected.length && timingSafeEqual(received, expected);
  });
}
