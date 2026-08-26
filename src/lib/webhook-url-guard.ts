import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { env, type Env } from "../env";

export interface TargetVerdict {
  allowed: boolean;
  /** Present when refused. Written for the agent that has to correct itself. */
  reason?: string;
}

/**
 * Whether a webhook may point at a private or loopback address. Development and
 * the test suite need it — the suite's own receiver is a localhost server — and
 * env.ts refuses the value in production, so this can only be true off it.
 */
export function privateTargetsAllowed(config: Env = env()): boolean {
  return config.WEBHOOK_ALLOW_PRIVATE_TARGETS ?? config.NODE_ENV !== "production";
}

function ipv4IsPrivate(address: string): boolean {
  const [a, b] = address.split(".").map(Number);
  if (a === undefined || b === undefined) return true;

  if (a === 0) return true; // "this network"
  if (a === 10) return true;
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local, and cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
  if (a === 192 && b === 0) return true; // IETF protocol assignments
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a >= 224) return true; // multicast, reserved, broadcast

  return false;
}

/** The IPv4 address inside an IPv4-mapped IPv6 address, in either spelling. */
function mappedIpv4(address: string): string | null {
  const dotted = address.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) return dotted[1]!;

  const hex = address.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (!hex) return null;

  const high = parseInt(hex[1]!, 16);
  const low = parseInt(hex[2]!, 16);
  return [high >> 8, high & 0xff, low >> 8, low & 0xff].join(".");
}

function ipv6IsPrivate(address: string): boolean {
  const normalized = address.toLowerCase().split("%")[0]!; // drop any zone id

  // An IPv4 address wearing an IPv6 costume reaches the same host, so judge the
  // address it actually carries. Both spellings have to be understood: a URL
  // normalizes ::ffff:169.254.169.254 into the hex form ::ffff:a9fe:a9fe.
  const embedded = mappedIpv4(normalized);
  if (embedded) return ipv4IsPrivate(embedded);

  if (normalized === "::" || normalized === "::1") return true;
  if (/^f[cd]/.test(normalized)) return true; // fc00::/7 unique local
  if (/^fe[89ab]/.test(normalized)) return true; // fe80::/10 link-local
  if (normalized.startsWith("ff")) return true; // ff00::/8 multicast

  return false;
}

function addressIsPrivate(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return ipv4IsPrivate(address);
  if (family === 6) return ipv6IsPrivate(address);
  return true; // not an address we can judge, so not one we will call
}

/**
 * Judges a webhook destination. It resolves the hostname and inspects every
 * address behind it rather than matching the text, which is what makes
 * http://2130706433/ and http://0177.0.0.1/ fall out without a rule each.
 *
 * Called twice on purpose: at create and update, so the agent gets a 422 it can
 * act on, and again immediately before every delivery, which is the call that
 * carries the security. Only the second one covers webhooks already stored.
 */
export async function inspectWebhookTarget(
  rawUrl: string,
  allowPrivate: boolean = privateTargetsAllowed(),
): Promise<TargetVerdict> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { allowed: false, reason: "Webhook URL is not a valid URL" };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { allowed: false, reason: "Webhook URL must use http or https" };
  }

  if (url.username || url.password) {
    return { allowed: false, reason: "Webhook URL must not embed credentials" };
  }

  if (allowPrivate) return { allowed: true };

  const host = url.hostname.replace(/^\[|\]$/g, "");

  let addresses: Array<{ address: string }>;
  try {
    addresses = await lookup(host, { all: true });
  } catch {
    return { allowed: false, reason: `Webhook URL host '${host}' does not resolve` };
  }

  // Every address, not the first: a hostname that answers with one public and
  // one private address would otherwise be a way in.
  for (const { address } of addresses) {
    if (addressIsPrivate(address)) {
      return {
        allowed: false,
        reason: `Webhook URL host '${host}' resolves to a private or reserved address (${address})`,
      };
    }
  }

  return { allowed: true };
}
