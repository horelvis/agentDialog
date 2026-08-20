import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default("0.0.0.0"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),

  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().default("redis://localhost:6379"),

  MINIO_ENDPOINT: z.string().default("localhost"),
  MINIO_PORT: z.coerce.number().default(9000),
  MINIO_ACCESS_KEY: z.string().default("minioadmin"),
  MINIO_SECRET_KEY: z.string().default("minioadmin"),
  MINIO_BUCKET: z.string().default("agentdialog-files"),
  MINIO_USE_SSL: z.string().default("false").transform((v) => v === "true"),
  MINIO_PUBLIC_URL: z.string().optional(),

  API_KEY_SALT_ROUNDS: z.coerce.number().default(12),
  SESSION_SECRET: z.string().min(32),
  VERIFICATION_CODE_EXPIRY_MINUTES: z.coerce.number().default(15),
  VERIFICATION_MAX_ATTEMPTS: z.coerce.number().default(5),
  SESSION_EXPIRY_HOURS: z.coerce.number().default(168),

  SMTP_HOST: z.string().default("localhost"),
  SMTP_PORT: z.coerce.number().default(1025),
  SMTP_USER: z.string().default(""),
  SMTP_PASS: z.string().default(""),
  SMTP_FROM: z.string().default("noreply@agentdialog.io"),
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

  REPLY_DOMAIN: z.string().default("reply.agentdialog.io"),
  INBOUND_EMAIL_WEBHOOK_SECRET: z.string().optional(),
  INBOUND_EMAIL_PROVIDER: z.enum(["resend", "sendgrid"]).default("resend"),
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
