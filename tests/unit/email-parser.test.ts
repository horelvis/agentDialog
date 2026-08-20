import { describe, expect, it } from "bun:test";
import { stripReplyQuotes } from "../../src/lib/email-parser";

describe("stripReplyQuotes", () => {
  it("returns full text when no quotes present", () => {
    expect(stripReplyQuotes("Hello, the answer is 42.")).toBe("Hello, the answer is 42.");
  });

  it("strips Gmail English quoted text", () => {
    const text = `Yes, I approve this.

On Mon, Mar 10, 2026 at 3:15 PM Agent via AgentDialog <noreply@agentdialog.io> wrote:
> Please review the data.
> Thanks.`;
    expect(stripReplyQuotes(text)).toBe("Yes, I approve this.");
  });

  it("strips Gmail Spanish quoted text", () => {
    const text = `Sí, aprobado.

El lun, 10 mar 2026 a las 15:15, Agent escribió:
> Por favor revisa los datos.`;
    expect(stripReplyQuotes(text)).toBe("Sí, aprobado.");
  });

  it("strips Gmail French quoted text", () => {
    const text = `Oui, approuvé.

Le lun. 10 mars 2026 à 15:15, Agent a écrit :
> Veuillez vérifier.`;
    expect(stripReplyQuotes(text)).toBe("Oui, approuvé.");
  });

  it("strips Gmail German quoted text", () => {
    const text = `Ja, genehmigt.

Am Mo., 10. März 2026 um 15:15 Uhr schrieb Agent:
> Bitte überprüfen.`;
    expect(stripReplyQuotes(text)).toBe("Ja, genehmigt.");
  });

  it("strips quoted lines starting with >", () => {
    const text = `Approved.

> Original question here
> More context`;
    expect(stripReplyQuotes(text)).toBe("Approved.");
  });

  it("strips signature delimiter --", () => {
    const text = `My answer is yes.

--
John Doe
Senior Engineer`;
    expect(stripReplyQuotes(text)).toBe("My answer is yes.");
  });

  it("strips signature delimiter -- (no trailing space)", () => {
    const text = `My answer is yes.

--
John Doe`;
    expect(stripReplyQuotes(text)).toBe("My answer is yes.");
  });

  it("strips forwarded message headers", () => {
    const text = `Check this out.

---------- Forwarded message ----------
From: someone@example.com
Subject: Original`;
    expect(stripReplyQuotes(text)).toBe("Check this out.");
  });

  it("strips Apple Mail forwarded", () => {
    const text = `Here you go.

Begin forwarded message:
From: someone@example.com`;
    expect(stripReplyQuotes(text)).toBe("Here you go.");
  });

  it("strips Outlook From: header", () => {
    const text = `Confirmed.

From: Agent via AgentDialog
Sent: Monday, March 10, 2026`;
    expect(stripReplyQuotes(text)).toBe("Confirmed.");
  });

  it("handles multiline response before quote", () => {
    const text = `Line 1 of my response.
Line 2 of my response.
Line 3 of my response.

On Mon, Mar 10, 2026 wrote:
> quoted`;
    expect(stripReplyQuotes(text)).toBe(
      "Line 1 of my response.\nLine 2 of my response.\nLine 3 of my response.",
    );
  });

  it("returns empty string for empty input", () => {
    expect(stripReplyQuotes("")).toBe("");
  });

  it("returns empty string for only quotes", () => {
    const text = `> This is all quoted
> No original content`;
    expect(stripReplyQuotes(text)).toBe("");
  });

  it("handles Windows-style line endings", () => {
    const text = "My answer.\r\n\r\nOn Mon wrote:\r\n> quote";
    expect(stripReplyQuotes(text)).toBe("My answer.");
  });
});
