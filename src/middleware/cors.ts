import { cors } from "hono/cors";
import { env } from "../env";

export const corsMiddleware = cors({
  origin: (origin) => {
    const e = env();
    const corsOrigins = e.CORS_ORIGINS;

    // Allow all in development or when explicitly set to "*"
    if (corsOrigins === "*" || e.NODE_ENV === "development") {
      return origin || "*";
    }

    // Parse comma-separated allowed origins
    const allowed = corsOrigins.split(",").map((o) => o.trim()).filter(Boolean);

    if (origin && allowed.includes(origin)) {
      return origin;
    }

    return "";
  },
  allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization", "X-Request-ID"],
  exposeHeaders: ["X-Request-ID", "X-RateLimit-Remaining", "X-RateLimit-Limit"],
  maxAge: 86400,
});
