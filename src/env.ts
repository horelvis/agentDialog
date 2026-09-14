import { z } from "zod";

export const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default("0.0.0.0"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  // Where the instance runs. `cloud` is the managed SaaS; `onprem` is a
  // company's own Docker deployment. The two share a binary but not a security
  // posture: on-prem explicitly permits webhooks into the private network,
  // requires its own SMTP relay, and serves over https.
  DEPLOYMENT_MODE: z.enum(["cloud", "onprem"]).default("cloud"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),

  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().default("redis://localhost:6379"),

  MINIO_ENDPOINT: z.string().default("localhost"),
  MINIO_PORT: z.coerce.number().default(9000),
  MINIO_ACCESS_KEY: z.string().default("minioadmin"),
  MINIO_SECRET_KEY: z.string().default("minioadmin"),
  MINIO_BUCKET: z.string().default("agentdialog-files"),
  MINIO_USE_SSL: z.string().default("false").transform((v) => v === "true"),
  MINIO_PUBLIC_URL: z.string().url().optional(),

  API_KEY_SALT_ROUNDS: z.coerce.number().default(12),
  SESSION_SECRET: z.string().min(32),
  VERIFICATION_CODE_EXPIRY_MINUTES: z.coerce.number().default(15),
  VERIFICATION_MAX_ATTEMPTS: z.coerce.number().default(5),
  SESSION_EXPIRY_HOURS: z.coerce.number().default(168),

  SMTP_HOST: z.string().default("localhost"),
  SMTP_PORT: z.coerce.number().default(1025),
  SMTP_USER: z.string().default(""),
  SMTP_PASS: z.string().default(""),
  // Local only: development sends to MailHog, where the sender is decoration.
  // Production sets this explicitly, and cannot be noreply@agentdialog.io while
  // outbound goes through Gmail SMTP — Gmail sends as the account that
  // authenticated, whatever this says. See docs/operations.md, "Email".
  SMTP_FROM: z.string().default("agentdialog@localhost"),
  SMTP_SECURE: z.string().default("false").transform((v) => v === "true"),

  APP_URL: z.string().url().default("http://localhost:3000"),
  APP_NAME: z.string().default("AgentDialog"),

  RATE_LIMIT_GLOBAL_RPM: z.coerce.number().default(200),
  RATE_LIMIT_AGENT_RPM: z.coerce.number().default(60),
  RATE_LIMIT_HUMAN_RPM: z.coerce.number().default(120),
  RATE_LIMIT_REGISTER_RPH: z.coerce.number().default(10),

  CORS_ORIGINS: z.string().default("*"),

  WEBHOOK_TIMEOUT_MS: z.coerce.number().default(10000),
  WEBHOOK_MAX_RETRIES: z.coerce.number().default(3),
  // Whether a webhook may point at a loopback or private address. Left unset it
  // resolves to `NODE_ENV !== "production"` (see privateTargetsAllowed), so the
  // test suite's localhost receiver and `bun run dev` need no configuration.
  WEBHOOK_ALLOW_PRIVATE_TARGETS: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
  // The key that encrypts webhook signing secrets at rest. 32 bytes, base64.
  // Losing it loses every signing secret; recovery is rotation.
  WEBHOOK_ENCRYPTION_KEY: z.string().optional(),

  // The amount above which a money question is treated as high risk regardless
  // of what the agent declared. Deliberately crude: no currency conversion, the
  // number is compared as-is. Comparing euros with yen without a rate table
  // would be worse than not comparing, and its job is to raise the floor rather
  // than to measure.
  RISK_ELEVATION_AMOUNT: z.coerce.number().default(1000),

  // Reply addressing, used only by the dormant provider webhook. Nothing sends
  // a per-query Reply-To today: inbound email is not ingested at all, so a
  // reply reaches a person, not the system. See REPLY_TO_ADDRESS below.
  REPLY_DOMAIN: z.string().default("reply.agentdialog.io"),
  REPLY_LOCAL_PART: z.string().default("reply"),
  INBOUND_EMAIL_WEBHOOK_SECRET: z.string().optional(),
  INBOUND_EMAIL_PROVIDER: z.enum(["resend", "sendgrid"]).default("resend"),

  // Where a human's reply to a notification actually lands. Nothing reads it
  // programmatically — it is a real mailbox with an auto-responder telling the
  // sender to answer in the app. Unset means the email carries no Reply-To.
  REPLY_TO_ADDRESS: z.string().optional(),
}).superRefine((env, ctx) => {
  // The inbound email webhook records a human's answer to an agent's query and
  // auto-accepts their invitation. Without a signing secret the endpoint has no
  // authentication at all, so a caller who knows a query id can forge an
  // approval. Fail at startup rather than serve an open endpoint.
  if (env.NODE_ENV === "production" && !env.INBOUND_EMAIL_WEBHOOK_SECRET) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["INBOUND_EMAIL_WEBHOOK_SECRET"],
      message:
        "INBOUND_EMAIL_WEBHOOK_SECRET is required in production: without it the " +
        "inbound email webhook accepts unsigned requests and a human's answer " +
        "can be forged.",
    });
  }

  // Without this key a webhook secret cannot be stored recoverably, and a
  // secret we cannot recover cannot sign anything the consumer can verify —
  // which is the bug this exists to prevent recurring.
  if (env.NODE_ENV === "production" && !env.WEBHOOK_ENCRYPTION_KEY) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["WEBHOOK_ENCRYPTION_KEY"],
      message:
        "WEBHOOK_ENCRYPTION_KEY is required in production: without it webhook " +
        "signing secrets cannot be stored recoverably and no delivery can be verified.",
    });
  }

  // On a public API the webhook URL is attacker-chosen, so allowing a private
  // target in production hands any agent a probe into the VPC and the cloud
  // metadata service. On an on-premise deployment there is no cloud metadata and
  // the private network is the product's reason to exist — an agent delivering
  // webhooks to internal services is the point. The operator opts in explicitly
  // with WEBHOOK_ALLOW_PRIVATE_TARGETS=true; env.ts only refuses the value when
  // the deployment is cloud.
  if (
    env.NODE_ENV === "production" &&
    env.DEPLOYMENT_MODE === "cloud" &&
    env.WEBHOOK_ALLOW_PRIVATE_TARGETS === true
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["WEBHOOK_ALLOW_PRIVATE_TARGETS"],
      message:
        "WEBHOOK_ALLOW_PRIVATE_TARGETS must not be true in cloud production: it " +
        "disables the guard that stops a webhook reaching loopback, the private " +
        "ranges and the cloud metadata service. On-premise deployments set " +
        "DEPLOYMENT_MODE=onprem to permit it.",
    });
  }

  // An on-premise deployment without an SMTP relay is one nobody can sign in to:
  // humans authenticate with a code sent by email, and there is no other door.
  // Fail at startup rather than ship a deploy that looks healthy and is empty.
  if (
    env.NODE_ENV === "production" &&
    env.DEPLOYMENT_MODE === "onprem" &&
    ["localhost", "127.0.0.1", "::1"].includes(env.SMTP_HOST.toLowerCase())
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["SMTP_HOST"],
      message:
        "SMTP_HOST must be a real relay in on-premise production. A local " +
        "address means no sign-in codes ever leave the box, and no human can " +
        "authenticate.",
    });
  }

  // One-click answer links and sign-in codes travel by email. Serving them from
  // a plain-http URL hands the credential to whoever sees the traffic.
  if (
    env.NODE_ENV === "production" &&
    env.DEPLOYMENT_MODE === "onprem" &&
    !env.APP_URL.startsWith("https://")
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["APP_URL"],
      message:
        "APP_URL must be https in on-premise production: answer links and " +
        "sign-in codes travel by email and must not point at a plain-http URL.",
    });
  }

  // secret-box.ts checks this same thing, but only when a webhook is first
  // sealed or opened — a malformed key otherwise boots green, serves traffic,
  // and then fails silently on the first dispatch. Catch it at startup instead,
  // the same way INBOUND_EMAIL_WEBHOOK_SECRET is validated above. The runtime
  // guard in secret-box.ts stays too, as defence in depth.
  if (env.WEBHOOK_ENCRYPTION_KEY) {
    const decoded = Buffer.from(env.WEBHOOK_ENCRYPTION_KEY, "base64");
    if (decoded.length !== 32) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["WEBHOOK_ENCRYPTION_KEY"],
        message: `WEBHOOK_ENCRYPTION_KEY must decode to 32 bytes, got ${decoded.length}.`,
      });
    }
  }
});

export type Env = z.infer<typeof envSchema>;

let _env: Env | null = null;

export function loadEnv(): Env {
  if (_env) return _env;
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error("Invalid environment variables:");
    console.error(result.error.flatten().fieldErrors);
    process.exit(1);
  }
  _env = result.data;
  return _env;
}

export function env(): Env {
  if (!_env) return loadEnv();
  return _env;
}
