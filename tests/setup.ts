// Test setup - preloaded by Bun test runner
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || "postgresql://agentdialog:agentdialog@localhost:5432/agentdialog_test";
process.env.REDIS_URL = process.env.TEST_REDIS_URL || "redis://localhost:6379/1";
process.env.SESSION_SECRET = "test-secret-minimum-32-characters-long!!";
process.env.APP_URL = "http://localhost:3000";

// 32 bytes in base64. Only for tests; production receives it from Secret Manager.
process.env.WEBHOOK_ENCRYPTION_KEY = "dGVzdC13ZWJob29rLWtleS0zMi1ieXRlcy1sb25nISE=";

// The suite registers an agent per test file and the counter lives in Redis
// across runs. Production's ten an hour is the right number there and the wrong
// one here: it makes whichever file runs eleventh fail with a 429 that looks
// like a defect in that file.
process.env.RATE_LIMIT_REGISTER_RPH = "1000";
