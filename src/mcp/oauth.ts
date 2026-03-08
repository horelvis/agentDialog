import { nanoid } from "nanoid";
import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { agents } from "../db/schema/agents";
import { verifyApiKey } from "../lib/crypto";
import { createHash } from "crypto";

// --- Types ---

interface OAuthClient {
  clientId: string;
  clientSecret: string;
  redirectUris: string[];
  clientName?: string;
  createdAt: number;
}

interface AuthCode {
  apiKey: string;
  clientId: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  redirectUri: string;
  state?: string;
  expiresAt: number;
}

// --- In-memory stores ---

const oauthClients = new Map<string, OAuthClient>();
const authCodes = new Map<string, AuthCode>();

// Cleanup expired auth codes periodically
setInterval(() => {
  const now = Date.now();
  for (const [code, data] of authCodes) {
    if (data.expiresAt < now) authCodes.delete(code);
  }
}, 60_000);

// --- Helpers ---

function base64UrlEncode(buffer: Buffer): string {
  return buffer.toString("base64url");
}

function sha256(input: string): Buffer {
  return createHash("sha256").update(input).digest();
}

async function validateApiKey(apiKey: string): Promise<boolean> {
  if (!apiKey.startsWith("mge_ag_")) return false;

  const prefix = apiKey.slice(0, 15); // "mge_ag_" + 8 chars
  const db = getDb();
  const [agent] = await db
    .select()
    .from(agents)
    .where(eq(agents.apiKeyPrefix, prefix))
    .limit(1);

  if (!agent || agent.status !== "active") return false;
  return verifyApiKey(apiKey, agent.apiKeyHash);
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
    token_endpoint_auth_methods_supported: ["client_secret_post"],
    code_challenge_methods_supported: ["S256"],
    scopes_supported: ["mcp"],
  };
}

// --- Dynamic Client Registration (RFC 7591) ---

export function handleRegister(body: Record<string, unknown>) {
  const redirectUris = body.redirect_uris;
  if (!Array.isArray(redirectUris) || redirectUris.length === 0) {
    return {
      status: 400 as const,
      body: { error: "invalid_client_metadata", error_description: "redirect_uris is required" },
    };
  }

  for (const uri of redirectUris) {
    if (typeof uri !== "string") {
      return {
        status: 400 as const,
        body: { error: "invalid_client_metadata", error_description: "redirect_uris must be strings" },
      };
    }
  }

  const clientId = `client_${nanoid(24)}`;
  const clientSecret = `secret_${nanoid(48)}`;

  const client: OAuthClient = {
    clientId,
    clientSecret,
    redirectUris: redirectUris as string[],
    clientName: typeof body.client_name === "string" ? body.client_name : undefined,
    createdAt: Date.now(),
  };

  oauthClients.set(clientId, client);

  return {
    status: 201 as const,
    body: {
      client_id: clientId,
      client_secret: clientSecret,
      client_id_issued_at: Math.floor(client.createdAt / 1000),
      client_secret_expires_at: 0, // never expires
      redirect_uris: client.redirectUris,
      grant_types: ["authorization_code"],
      response_types: ["code"],
      token_endpoint_auth_method: "client_secret_post",
      ...(client.clientName ? { client_name: client.clientName } : {}),
    },
  };
}

// --- Authorize (GET → render form) ---

export function renderAuthorizePage(query: Record<string, string>) {
  const { client_id, redirect_uri, state, code_challenge, code_challenge_method, scope } = query;

  // Validate required params
  if (!client_id || !redirect_uri || !code_challenge) {
    return {
      status: 400 as const,
      html: errorPage("Missing required parameters: client_id, redirect_uri, code_challenge"),
    };
  }

  const client = oauthClients.get(client_id);
  if (!client) {
    return { status: 400 as const, html: errorPage("Unknown client_id") };
  }

  if (!client.redirectUris.includes(redirect_uri)) {
    return { status: 400 as const, html: errorPage("Invalid redirect_uri") };
  }

  if (code_challenge_method && code_challenge_method !== "S256") {
    return { status: 400 as const, html: errorPage("Only S256 code_challenge_method is supported") };
  }

  return {
    status: 200 as const,
    html: authorizePage({ client_id, redirect_uri, state, code_challenge, code_challenge_method: code_challenge_method || "S256", scope, clientName: client.clientName }),
  };
}

// --- Authorize (POST → validate API key, redirect with code) ---

export async function handleAuthorizeSubmit(body: Record<string, string>) {
  const { client_id, redirect_uri, state, code_challenge, code_challenge_method, api_key } = body;

  // Re-validate params
  if (!client_id || !redirect_uri || !code_challenge || !api_key) {
    return {
      status: 400 as const,
      html: errorPage("Missing required parameters"),
    };
  }

  const client = oauthClients.get(client_id);
  if (!client) {
    return { status: 400 as const, html: errorPage("Unknown client_id") };
  }

  if (!client.redirectUris.includes(redirect_uri)) {
    return { status: 400 as const, html: errorPage("Invalid redirect_uri") };
  }

  // Validate the API key against the database
  const valid = await validateApiKey(api_key);
  if (!valid) {
    return {
      status: 200 as const,
      html: authorizePage({
        client_id,
        redirect_uri,
        state,
        code_challenge,
        code_challenge_method: code_challenge_method || "S256",
        errorMessage: "Invalid API key. Please check and try again.",
      }),
    };
  }

  // Generate authorization code
  const code = nanoid(32);
  authCodes.set(code, {
    apiKey: api_key,
    clientId: client_id,
    codeChallenge: code_challenge,
    codeChallengeMethod: code_challenge_method || "S256",
    redirectUri: redirect_uri,
    state,
    expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes
  });

  // Build redirect URL
  const redirectUrl = new URL(redirect_uri);
  redirectUrl.searchParams.set("code", code);
  if (state) redirectUrl.searchParams.set("state", state);

  return { status: 302 as const, redirect: redirectUrl.toString() };
}

// --- Token Exchange ---

export function handleToken(body: Record<string, string>) {
  const { grant_type, code, code_verifier, client_id, client_secret, redirect_uri } = body;

  if (grant_type !== "authorization_code") {
    return {
      status: 400 as const,
      body: { error: "unsupported_grant_type" },
    };
  }

  if (!code || !code_verifier) {
    return {
      status: 400 as const,
      body: { error: "invalid_request", error_description: "code and code_verifier are required" },
    };
  }

  const authCode = authCodes.get(code);
  if (!authCode) {
    return {
      status: 400 as const,
      body: { error: "invalid_grant", error_description: "Invalid or expired authorization code" },
    };
  }

  // Check expiry
  if (authCode.expiresAt < Date.now()) {
    authCodes.delete(code);
    return {
      status: 400 as const,
      body: { error: "invalid_grant", error_description: "Authorization code expired" },
    };
  }

  // Verify client
  if (client_id && authCode.clientId !== client_id) {
    return {
      status: 400 as const,
      body: { error: "invalid_grant", error_description: "client_id mismatch" },
    };
  }

  // Verify redirect_uri matches
  if (redirect_uri && authCode.redirectUri !== redirect_uri) {
    return {
      status: 400 as const,
      body: { error: "invalid_grant", error_description: "redirect_uri mismatch" },
    };
  }

  // Verify PKCE: S256 → BASE64URL(SHA256(code_verifier)) === code_challenge
  const computedChallenge = base64UrlEncode(sha256(code_verifier));
  if (computedChallenge !== authCode.codeChallenge) {
    return {
      status: 400 as const,
      body: { error: "invalid_grant", error_description: "PKCE verification failed" },
    };
  }

  // Consume the code (single use)
  authCodes.delete(code);

  // The access_token IS the agent's API key
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
  client_id: string;
  redirect_uri: string;
  state?: string;
  code_challenge: string;
  code_challenge_method: string;
  scope?: string;
  clientName?: string;
  errorMessage?: string;
}): string {
  const { client_id, redirect_uri, state, code_challenge, code_challenge_method, clientName, errorMessage } = params;

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
    .client-name {
      color: #60a5fa;
      font-weight: 500;
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
      font-family: 'SF Mono', 'Fira Code', monospace;
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
      ${clientName ? `<span class="client-name">${escapeHtml(clientName)}</span> is requesting` : "An application is requesting"} access to your AgentDialog agent via MCP.
    </p>
    ${errorMessage ? `<div class="error">${escapeHtml(errorMessage)}</div>` : ""}
    <form method="POST" action="/mcp/oauth/authorize">
      <input type="hidden" name="client_id" value="${escapeHtml(client_id)}">
      <input type="hidden" name="redirect_uri" value="${escapeHtml(redirect_uri)}">
      <input type="hidden" name="code_challenge" value="${escapeHtml(code_challenge)}">
      <input type="hidden" name="code_challenge_method" value="${escapeHtml(code_challenge_method)}">
      ${state ? `<input type="hidden" name="state" value="${escapeHtml(state)}">` : ""}
      <label for="api_key">Agent API Key</label>
      <input type="text" id="api_key" name="api_key" placeholder="mge_ag_..." required autocomplete="off" spellcheck="false">
      <p class="hint">Enter your agent's API key to authorize this connection.</p>
      <button type="submit">Authorize</button>
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

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
