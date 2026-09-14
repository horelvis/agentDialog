import { describe, expect, test } from "bun:test";
import { rewritePresignedOrigin } from "../../src/lib/storage";

/**
 * On-premise runs MinIO embedded on 127.0.0.1, unreachable from a browser. The
 * operator points MINIO_PUBLIC_URL at their reverse proxy and every presigned
 * URL is rewritten to it. The rewrite swaps the origin only: presigned URLs are
 * signed over path and query, so the signature survives the host change.
 */
describe("rewritePresignedOrigin", () => {
  test("swaps the origin and keeps path and signature query", () => {
    const url = "http://127.0.0.1:9000/agentdialog-files/abc/report.pdf?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=deadbeef";
    const rewritten = rewritePresignedOrigin(url, "https://files.corp.example");
    expect(rewritten).toBe(
      "https://files.corp.example/agentdialog-files/abc/report.pdf?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=deadbeef",
    );
  });

  test("preserves a path prefix on the public URL", () => {
    const url = "http://127.0.0.1:9000/agentdialog-files/abc/report.pdf?X-Amz-Signature=deadbeef";
    const rewritten = rewritePresignedOrigin(url, "https://files.corp.example/minio");
    expect(rewritten).toBe(
      "https://files.corp.example/minio/agentdialog-files/abc/report.pdf?X-Amz-Signature=deadbeef",
    );
  });

  test("preserves a trailing slash on the public URL without doubling it", () => {
    const url = "http://127.0.0.1:9000/bucket/key";
    expect(rewritePresignedOrigin(url, "https://files.corp.example/")).toBe("https://files.corp.example/bucket/key");
  });

  test("switches scheme when the public URL is http", () => {
    expect(rewritePresignedOrigin("http://127.0.0.1:9000/bucket/key", "http://files.corp.example")).toBe(
      "http://files.corp.example/bucket/key",
    );
  });

  test("leaves the URL alone when the public URL is not http(s)", () => {
    const url = "http://127.0.0.1:9000/bucket/key";
    expect(rewritePresignedOrigin(url, "ftp://files.corp.example")).toBe(url);
  });

  test("leaves a malformed URL alone", () => {
    expect(rewritePresignedOrigin("not a url", "https://files.corp.example")).toBe("not a url");
  });

  test("leaves a malformed public URL alone", () => {
    const url = "http://127.0.0.1:9000/bucket/key";
    expect(rewritePresignedOrigin(url, "not a url")).toBe(url);
  });
});
