// Test setup - preloaded by Bun test runner
process.env.NODE_ENV = "test";
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || "postgresql://messeger:messeger@localhost:5432/messeger_test";
process.env.REDIS_URL = process.env.TEST_REDIS_URL || "redis://localhost:6379/1";
process.env.SESSION_SECRET = "test-secret-minimum-32-characters-long!!";
process.env.APP_URL = "http://localhost:3000";
