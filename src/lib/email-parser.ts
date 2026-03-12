/**
 * Strips reply quotes, signatures, and forwarded headers from email reply text.
 * Returns only the new content the user typed.
 */
export function stripReplyQuotes(text: string): string {
  const lines = text.split("\n");

  // Patterns that indicate the start of quoted/forwarded content or signature
  const cutoffPatterns = [
    /^On .+ wrote:\s*$/,                      // Gmail English
    /^El .+ escribi[oó]:\s*$/,                // Gmail Spanish
    /^Le .+ a [eé]crit\s?:\s*$/,              // Gmail French
    /^Am .+ schrieb .+:\s*$/,                 // Gmail German
    /^\d{4}\/\d{1,2}\/\d{1,2} .+ <.+>:?\s*$/, // Gmail date format
    /^-- ?$/,                                  // Signature delimiter
    /^-{5,}/,                                  // Forwarded message separator
    /^_{5,}/,                                  // Alternative separator
    /^From:\s/,                                // Forwarded header
    /^Sent:\s/,                                // Outlook "Sent:" header
    /^---------- Forwarded message/,           // Gmail forwarded
    /^Begin forwarded message/i,               // Apple Mail forwarded
    /^> /,                                     // Quoted line
  ];

  let cutoffIndex = lines.length;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trimEnd();

    for (const pattern of cutoffPatterns) {
      if (pattern.test(trimmed)) {
        cutoffIndex = i;
        break;
      }
    }

    if (cutoffIndex < lines.length) break;
  }

  const result = lines.slice(0, cutoffIndex).join("\n").trim();
  return result;
}
