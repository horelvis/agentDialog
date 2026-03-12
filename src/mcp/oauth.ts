import { nanoid } from "nanoid";
import { eq, lt } from "drizzle-orm";
import { getDb } from "../db";
import { oauthClients, oauthCodes } from "../db/schema/oauth";
import { registerAgent } from "../services/agent.service";
import { createHash } from "crypto";

// --- Helpers ---

function base64UrlEncode(buffer: Buffer): string {
  return buffer.toString("base64url");
}

function sha256(input: string): Buffer {
  return createHash("sha256").update(input).digest();
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// --- Protected Resource Metadata (RFC 9728) ---

export function getProtectedResourceMetadata(baseUrl: string) {
  return {
    resource: `${baseUrl}/mcp`,
    authorization_servers: [baseUrl],
    bearer_methods_supported: ["header"],
  };
}

// --- Authorization Server Metadata (RFC 8414) ---

export function getAuthServerMetadata(baseUrl: string) {
  return {
    issuer: baseUrl,
    authorization_endpoint: `${baseUrl}/mcp/oauth/authorize`,
    token_endpoint: `${baseUrl}/mcp/oauth/token`,
    registration_endpoint: `${baseUrl}/mcp/oauth/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
    token_endpoint_auth_methods_supported: ["none"],
    code_challenge_methods_supported: ["S256"],
    scopes_supported: ["mcp"],
  };
}

// --- Dynamic Client Registration (RFC 7591) ---
// Minimal: Claude Desktop calls this automatically, we return a dummy client.

export async function handleRegister(body: Record<string, unknown>) {
  const redirectUris = body.redirect_uris;
  if (!Array.isArray(redirectUris) || redirectUris.length === 0) {
    console.warn("[OAUTH] Client registration failed: missing redirect_uris");
    return {
      status: 400 as const,
      body: { error: "invalid_client_metadata", error_description: "redirect_uris is required" },
    };
  }

  const clientId = `client_${nanoid(24)}`;
  const clientSecret = `secret_${nanoid(48)}`;
  const now = new Date();

  try {
    const db = getDb();
    await db.insert(oauthClients).values({
      clientId,
      clientSecret,
      redirectUris: JSON.stringify(redirectUris),
      clientName: typeof body.client_name === "string" ? body.client_name : null,
    });
  } catch (err) {
    console.error(`[OAUTH] DB error registering client ${clientId}:`, err);
    throw err;
  }

  console.log(`[OAUTH] Client registered: ${clientId} (name: ${body.client_name || "none"})`);

  return {
    status: 201 as const,
    body: {
      client_id: clientId,
      client_secret: clientSecret,
      client_id_issued_at: Math.floor(now.getTime() / 1000),
      client_secret_expires_at: 0,
      redirect_uris: redirectUris,
      grant_types: ["authorization_code"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      ...(typeof body.client_name === "string" ? { client_name: body.client_name } : {}),
    },
  };
}

// --- Authorize (GET → render form) ---

export async function renderAuthorizePage(query: Record<string, string>) {
  const { redirect_uri, state, code_challenge, code_challenge_method } = query;

  if (!redirect_uri || !code_challenge) {
    console.warn("[OAUTH] Authorize page: missing required params");
    return {
      status: 400 as const,
      html: errorPage("Missing required parameters: redirect_uri, code_challenge"),
    };
  }

  if (code_challenge_method && code_challenge_method !== "S256") {
    console.warn(`[OAUTH] Authorize page: unsupported code_challenge_method ${code_challenge_method}`);
    return { status: 400 as const, html: errorPage("Only S256 code_challenge_method is supported") };
  }

  console.log("[OAUTH] Authorize page rendered");
  return {
    status: 200 as const,
    html: authorizePage({ redirect_uri, state, code_challenge, code_challenge_method: code_challenge_method || "S256" }),
  };
}

// --- Authorize (POST → create agent, redirect with code) ---

export async function handleAuthorizeSubmit(body: Record<string, string>) {
  const { redirect_uri, state, code_challenge, code_challenge_method, agent_name } = body;

  if (!redirect_uri || !code_challenge || !agent_name) {
    return {
      status: 400 as const,
      html: errorPage("Missing required parameters"),
    };
  }

  // Create agent with the given name
  const slug = agent_name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `agent-${nanoid(8)}`;
  let apiKey: string;

  try {
    const result = await registerAgent({
      slug,
      displayName: agent_name,
    });
    apiKey = result.apiKey;
    console.log(`[OAUTH] Agent created: ${slug} → ${result.agent.id}`);
  } catch (err: any) {
    console.error(`[OAUTH] Agent creation failed for slug ${slug}:`, err);
    return {
      status: 200 as const,
      html: authorizePage({
        redirect_uri,
        state,
        code_challenge,
        code_challenge_method: code_challenge_method || "S256",
        errorMessage: err.message || "Failed to create agent",
      }),
    };
  }

  // Generate authorization code
  const code = nanoid(32);
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

  try {
    const db = getDb();
    await db.insert(oauthCodes).values({
      code,
      clientId: "direct",
      apiKey,
      codeChallenge: code_challenge,
      codeChallengeMethod: code_challenge_method || "S256",
      redirectUri: redirect_uri,
      state: state || null,
      expiresAt,
    });
  } catch (err) {
    console.error("[OAUTH] DB error inserting authorization code:", err);
    throw err;
  }

  console.log(`[OAUTH] Authorization code generated for slug ${slug}`);

  // Redirect back with code
  const redirectUrl = new URL(redirect_uri);
  redirectUrl.searchParams.set("code", code);
  if (state) redirectUrl.searchParams.set("state", state);

  return { status: 302 as const, redirect: redirectUrl.toString() };
}

// --- Token Exchange ---

export async function handleToken(body: Record<string, string>) {
  const { grant_type, code, code_verifier } = body;

  if (grant_type !== "authorization_code") {
    console.warn(`[OAUTH] Token exchange failed: unsupported grant_type ${grant_type}`);
    return {
      status: 400 as const,
      body: { error: "unsupported_grant_type" },
    };
  }

  if (!code || !code_verifier) {
    console.warn("[OAUTH] Token exchange failed: missing code or code_verifier");
    return {
      status: 400 as const,
      body: { error: "invalid_request", error_description: "code and code_verifier are required" },
    };
  }

  const db = getDb();
  const [authCode] = await db
    .select()
    .from(oauthCodes)
    .where(eq(oauthCodes.code, code))
    .limit(1);

  if (!authCode) {
    console.warn("[OAUTH] Token exchange failed: invalid or expired code");
    return {
      status: 400 as const,
      body: { error: "invalid_grant", error_description: "Invalid or expired authorization code" },
    };
  }

  if (authCode.expiresAt < new Date()) {
    await db.delete(oauthCodes).where(eq(oauthCodes.code, code));
    console.warn("[OAUTH] Token exchange failed: code expired");
    return {
      status: 400 as const,
      body: { error: "invalid_grant", error_description: "Authorization code expired" },
    };
  }

  // Verify PKCE
  const computedChallenge = base64UrlEncode(sha256(code_verifier));
  if (computedChallenge !== authCode.codeChallenge) {
    console.warn("[OAUTH] Token exchange failed: PKCE verification mismatch");
    return {
      status: 400 as const,
      body: { error: "invalid_grant", error_description: "PKCE verification failed" },
    };
  }

  // Consume the code
  await db.delete(oauthCodes).where(eq(oauthCodes.code, code));

  // Cleanup expired codes
  db.delete(oauthCodes).where(lt(oauthCodes.expiresAt, new Date())).catch((err) => {
    console.error("[OAUTH] Failed to cleanup expired codes:", err);
  });

  console.log(`[OAUTH] Token exchanged successfully (clientId: ${authCode.clientId})`);

  return {
    status: 200 as const,
    body: {
      access_token: authCode.apiKey,
      token_type: "bearer",
      scope: "mcp",
    },
  };
}

// --- HTML Templates ---

function authorizePage(params: {
  redirect_uri: string;
  state?: string;
  code_challenge: string;
  code_challenge_method: string;
  errorMessage?: string;
}): string {
  const { redirect_uri, state, code_challenge, code_challenge_method, errorMessage } = params;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Authorize - AgentDialog</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0a0a0a;
      color: #e5e5e5;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .container {
      background: #171717;
      border: 1px solid #262626;
      border-radius: 12px;
      padding: 2rem;
      max-width: 420px;
      width: 100%;
      margin: 1rem;
    }
    h1 {
      font-size: 1.25rem;
      font-weight: 600;
      margin-bottom: 0.5rem;
      color: #fafafa;
    }
    .subtitle {
      font-size: 0.875rem;
      color: #a3a3a3;
      margin-bottom: 1.5rem;
      line-height: 1.5;
    }
    label {
      display: block;
      font-size: 0.875rem;
      font-weight: 500;
      margin-bottom: 0.5rem;
      color: #d4d4d4;
    }
    input[type="text"] {
      width: 100%;
      padding: 0.625rem 0.75rem;
      background: #0a0a0a;
      border: 1px solid #404040;
      border-radius: 8px;
      color: #fafafa;
      font-size: 0.875rem;
      outline: none;
      transition: border-color 0.15s;
    }
    input[type="text"]:focus {
      border-color: #60a5fa;
    }
    input[type="text"]::placeholder {
      color: #525252;
    }
    .error {
      background: #2d1115;
      border: 1px solid #7f1d1d;
      color: #fca5a5;
      padding: 0.625rem 0.75rem;
      border-radius: 8px;
      font-size: 0.8125rem;
      margin-bottom: 1rem;
    }
    button {
      width: 100%;
      padding: 0.625rem;
      background: #2563eb;
      color: #fff;
      border: none;
      border-radius: 8px;
      font-size: 0.875rem;
      font-weight: 500;
      cursor: pointer;
      margin-top: 1rem;
      transition: background 0.15s;
    }
    button:hover { background: #1d4ed8; }
    button:active { background: #1e40af; }
    .hint {
      font-size: 0.75rem;
      color: #737373;
      margin-top: 0.5rem;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Authorize MCP Access</h1>
    <p class="subtitle">
      Create a new agent to connect to AgentDialog via MCP.
    </p>
    ${errorMessage ? `<div class="error">${escapeHtml(errorMessage)}</div>` : ""}
    <form method="POST" action="/mcp/oauth/authorize">
      <input type="hidden" name="redirect_uri" value="${escapeHtml(redirect_uri)}">
      <input type="hidden" name="code_challenge" value="${escapeHtml(code_challenge)}">
      <input type="hidden" name="code_challenge_method" value="${escapeHtml(code_challenge_method)}">
      ${state ? `<input type="hidden" name="state" value="${escapeHtml(state)}">` : ""}
      <label for="agent_name">Agent Name</label>
      <input type="text" id="agent_name" name="agent_name" placeholder="My Agent" required autocomplete="off">
      <p class="hint">Choose a name for your agent. A token will be auto-generated.</p>
      <button type="submit">Create Agent & Authorize</button>
    </form>
  </div>
</body>
</html>`;
}

function errorPage(message: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Error - AgentDialog</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0a0a0a;
      color: #e5e5e5;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .container {
      background: #171717;
      border: 1px solid #262626;
      border-radius: 12px;
      padding: 2rem;
      max-width: 420px;
      width: 100%;
      margin: 1rem;
      text-align: center;
    }
    h1 { font-size: 1.25rem; color: #fca5a5; margin-bottom: 1rem; }
    p { font-size: 0.875rem; color: #a3a3a3; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Authorization Error</h1>
    <p>${escapeHtml(message)}</p>
  </div>
</body>
</html>`;
}
