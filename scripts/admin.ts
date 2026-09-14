#!/usr/bin/env bun
/**
 * Operator CLI for on-premise deployments.
 *
 *   bun run scripts/admin.ts init-env          # write .env from .env.onprem.example
 *   bun run scripts/admin.ts create-agent --slug payments --name "Payments Agent"
 *   bun run scripts/admin.ts health [--url https://...]
 *
 * init-env runs on the host and needs no database. create-agent and health
 * connect to the database named by DATABASE_URL in .env — run them from the
 * deployment directory (or inside the product container, where .env is the
 * container's own).
 */
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { env, envSchema, loadEnv } from "../src/env";
import { registerAgent } from "../src/services/agent.service";
import { closeDb } from "../src/db";

const TEMPLATE = ".env.onprem.example";
const TARGET = ".env";

const [, , subcommand, ...rest] = process.argv;

function flag(args: string[], name: string): string | undefined {
  const at = args.indexOf(`--${name}`);
  if (at === -1) return undefined;
  const value = args[at + 1];
  if (value === undefined) throw new Error(`--${name} requires a value`);
  return value;
}

function usage(): void {
  console.log(
    [
      "usage: bun run scripts/admin.ts <command>",
      "",
      "  init-env",
      "    Write .env from .env.onprem.example, generating secrets and prompting",
      "    for the SMTP relay and public URLs. No database needed.",
      "",
      "  create-agent --slug <s> [--name <n>] [--description <d>]",
      "                [--provider <p>] [--model <m>]",
      "    Register an agent and print its API key, which is shown once and",
      "    cannot be recovered. Needs the database from .env.",
      "",
      "  health [--url <url>]",
      "    GET /health and print the result. Defaults to APP_URL from .env.",
    ].join("\n"),
  );
}

async function prompt(question: string, defaultValue = ""): Promise<string> {
  // Non-interactive (CI, a piped stdin) falls back to the default. readline
  // would otherwise hang waiting for a line that is never coming.
  if (!stdin.isTTY) return defaultValue;
  const rl = createInterface({ input: stdin, output: stdout });
  const suffix = defaultValue ? ` [${defaultValue}]` : "";
  const answer = await rl.question(`${question}${suffix}: `);
  rl.close();
  return answer.trim() || defaultValue;
}

function parseDotEnv(text: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match) result[match[1]] = match[2];
  }
  return result;
}

const generatedSecrets: Record<string, string> = {
  SESSION_SECRET: randomBytes(32).toString("hex"),
  WEBHOOK_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
  INBOUND_EMAIL_WEBHOOK_SECRET: randomBytes(32).toString("hex"),
  MINIO_ACCESS_KEY: randomBytes(16).toString("hex"),
  MINIO_SECRET_KEY: randomBytes(32).toString("hex"),
  POSTGRES_PASSWORD: randomBytes(16).toString("hex"),
};

const prompted: Record<string, { question: string; default: string }> = {
  SMTP_HOST: { question: "SMTP relay host", default: "smtp.corp.example" },
  SMTP_PORT: { question: "SMTP port", default: "465" },
  SMTP_USER: { question: "SMTP username (empty if none)", default: "" },
  SMTP_PASS: { question: "SMTP password (empty if none)", default: "" },
  SMTP_FROM: { question: "Sender address", default: "" },
  SMTP_SECURE: { question: "SMTP over TLS (true/false)", default: "true" },
  APP_URL: { question: "Public https URL of the app", default: "https://agentdialog.corp.example" },
  MINIO_PUBLIC_URL: { question: "Public URL of MinIO via your proxy (empty if none)", default: "" },
};

async function initEnv(): Promise<void> {
  if (existsSync(TARGET)) {
    console.error(`[admin] ${TARGET} already exists. Remove it first to regenerate.`);
    process.exit(1);
  }
  if (!existsSync(TEMPLATE)) {
    console.error(`[admin] ${TEMPLATE} not found here. Run from the repository root or the deployment directory.`);
    process.exit(1);
  }

  const template = await readFile(TEMPLATE, "utf8");
  const out: string[] = [];

  for (const line of template.split("\n")) {
    const match = line.match(/^([A-Z0-9_]+)=/);
    const key = match?.[1];
    if (key && key in generatedSecrets && line.includes("<generated-by-admin-init-env>")) {
      out.push(`${key}=${generatedSecrets[key]}`);
    } else if (key === "DATABASE_URL" && line.includes("change-me")) {
      // Keep the DB password and the compose interpolation in step: the compose
      // file reads POSTGRES_PASSWORD, and DATABASE_URL must carry the same one.
      out.push(line.replace("change-me", generatedSecrets.POSTGRES_PASSWORD ?? ""));
    } else if (key && key in prompted) {
      const value = await prompt(prompted[key].question, prompted[key].default);
      // An empty optional value is an unset one, not a broken one: comment the
      // line out so validation (and the app) sees the variable as absent.
      out.push(value === "" ? `# ${line}` : `${key}=${value}`);
    } else {
      out.push(line);
    }
  }

  await writeFile(TARGET, `${out.join("\n")}\n`);

  const validation = envSchema.safeParse(parseDotEnv(await readFile(TARGET, "utf8")));
  if (!validation.success) {
    console.error(`[admin] Generated ${TARGET} failed validation:`);
    console.error(validation.error.flatten().fieldErrors);
    console.error(`[admin] Fix the values above in ${TARGET}.`);
    process.exit(1);
  }

  console.log(`[admin] Wrote ${TARGET} — it passes environment validation.`);
  console.log("[admin] Start the stack with:");
  console.log("  docker compose -f docker-compose.onprem.yml up -d");
}

async function createAgent(args: string[]): Promise<void> {
  const slug = flag(args, "slug");
  if (!slug) throw new Error("--slug is required");
  const displayName = flag(args, "name") ?? slug;
  const description = flag(args, "description");
  const provider = flag(args, "provider");
  const model = flag(args, "model");

  loadEnv();
  const { agent, apiKey } = await registerAgent({
    slug,
    displayName,
    description,
    provider,
    model,
    capabilities: ["chat", "tool-use", "forms", "approvals"],
  });
  await closeDb();

  console.log(`[admin] Agent created: ${agent.slug} (${agent.id})`);
  console.log(`[admin] API key — shown once, keep it safe:`);
  console.log(`  ${apiKey}`);
  console.log("[admin] It authenticates with: Authorization: Bearer <key>");
}

async function health(args: string[]): Promise<void> {
  loadEnv();
  const url = flag(args, "url") ?? env().APP_URL;
  const response = await fetch(`${url.replace(/\/$/, "")}/health`);
  const body = (await response.json()) as unknown;
  console.log(`[admin] ${url}/health -> ${response.status}`);
  console.log(JSON.stringify(body, null, 2));
  if (!response.ok) process.exit(1);
}

(async () => {
  try {
    switch (subcommand) {
      case "init-env":
        await initEnv();
        break;
      case "create-agent":
        await createAgent(rest);
        break;
      case "health":
        await health(rest);
        break;
      default:
        usage();
        process.exit(subcommand ? 1 : 0);
    }
  } catch (error) {
    console.error("[admin]", error instanceof Error ? error.message : error);
    process.exit(1);
  }
})();