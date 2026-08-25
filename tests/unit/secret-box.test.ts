import { describe, expect, it } from "bun:test";
import { seal, open, type SealedSecret } from "../../src/lib/secret-box";

/**
 * The signing secret has to come back out — that is the whole point, and the
 * reason bcrypt was the wrong tool. What must not come back out is anything
 * an attacker tampered with.
 */

describe("seal / open", () => {
  it("returns the original secret", () => {
    const secret = "whsec_K5oZfzN95Z9UVu1EsfQmfVNQhnkZ2pj9o9NDN";
    expect(open(seal(secret))).toBe(secret);
  });

  it("uses a fresh iv every time, so the same secret never seals alike", () => {
    const a = seal("whsec_same");
    const b = seal("whsec_same");
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it("refuses a tampered ciphertext", () => {
    const sealed = seal("whsec_original");
    const tampered: SealedSecret = { ...sealed, ciphertext: flipFirstByte(sealed.ciphertext) };
    expect(() => open(tampered)).toThrow();
  });

  it("refuses a tampered authentication tag", () => {
    const sealed = seal("whsec_original");
    const tampered: SealedSecret = { ...sealed, tag: flipFirstByte(sealed.tag) };
    expect(() => open(tampered)).toThrow();
  });

  it("refuses a tampered iv", () => {
    const sealed = seal("whsec_original");
    const tampered: SealedSecret = { ...sealed, iv: flipFirstByte(sealed.iv) };
    expect(() => open(tampered)).toThrow();
  });
});

function flipFirstByte(base64: string): string {
  const buf = Buffer.from(base64, "base64");
  buf[0] = buf[0] ^ 0xff;
  return buf.toString("base64");
}
