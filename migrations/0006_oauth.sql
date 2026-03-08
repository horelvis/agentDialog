CREATE TABLE IF NOT EXISTS "oauth_clients" (
  "client_id" varchar(64) PRIMARY KEY,
  "client_secret" varchar(128) NOT NULL,
  "redirect_uris" text NOT NULL,
  "client_name" varchar(256),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "oauth_codes" (
  "code" varchar(64) PRIMARY KEY,
  "client_id" varchar(64) NOT NULL,
  "api_key" varchar(256) NOT NULL,
  "code_challenge" varchar(256) NOT NULL,
  "code_challenge_method" varchar(16) NOT NULL DEFAULT 'S256',
  "redirect_uri" text NOT NULL,
  "state" varchar(256),
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "oauth_codes_expires_at_idx" ON "oauth_codes" ("expires_at");
