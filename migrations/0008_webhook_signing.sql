-- The signature was keyed with the bcrypt hash of the secret, so no consumer
-- could ever verify a delivery. The hashes are one-way and worthless; the
-- original secrets are unrecoverable.
--
-- Production holds zero webhooks as of 2026-08-25, so this breaks nobody. The
-- deactivation covers a webhook created between now and the deploy: its secret
-- was stored as a bcrypt hash too, so it is just as unrecoverable and its owner
-- must call rotate-secret to get a usable one.

ALTER TABLE "webhooks" ADD COLUMN "secrets" jsonb DEFAULT '[]'::jsonb NOT NULL;

UPDATE "webhooks" SET "is_active" = false;

ALTER TABLE "webhooks" DROP COLUMN "secret_hash";
