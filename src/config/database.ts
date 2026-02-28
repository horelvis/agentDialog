import { env } from "../env";

export function getDatabaseConfig() {
  const e = env();
  return {
    url: e.DATABASE_URL,
    max: e.NODE_ENV === "production" ? 20 : 5,
    idle_timeout: 20,
    connect_timeout: 10,
  };
}
