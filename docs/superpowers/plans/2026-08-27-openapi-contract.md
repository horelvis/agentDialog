# El contrato OpenAPI — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** que `GET /openapi.json` devuelva un OpenAPI 3.1 exacto de los 26 endpoints de
`/api/v1/agent` y de los webhooks salientes, y que nada pueda cambiar una respuesta sin
romper un test.

**Architecture:** un envoltorio de unas cuarenta líneas sobre Hono —`documented(app, {
basePath, tag })`— deja declarar la documentación en la misma línea que la ruta y la
registra con su método y su ruta completa. Los zod de entrada que ya validan se
reutilizan tal cual; los de respuesta se escriben ahora y se usan **dos veces**: para
emitir el documento con `zod-openapi`, y para afirmar en los tests de integración que
existen que la respuesta real los cumple.

**Tech Stack:** Bun, Hono 4.13, zod 3.25.76 (API clásica v3), `zod-openapi@4`, Drizzle. Sin tocar el
`overrides` de zod.

**Spec:** `docs/superpowers/specs/2026-08-27-openapi-contract-design.md`

## Global Constraints

- **Código, comentarios y mensajes de commit en inglés.** Los specs y planes de este
  repo van en español; el código no.
- **`zod-openapi@^4.2.4`, NO la línea 5.** La 5 declara `zod: "^3.25.74 || ^4.0.0"`,
  que parece aceptar el zod 3.25.76 de este repo y no lo hace: exige esquemas
  construidos con el subpath `zod/v4` (objetos marcados `_zod`), y los validadores de
  aquí usan la API clásica v3 (objetos con `_def`). La 4.2.4 declara `zod: "^3.21.4"` y
  trabaja con los esquemas tal como están. **No toques el
  `"overrides": {"zod": "$zod"}` de `package.json`**: existe porque el SDK de MCP
  importa `zod/v3` y `zod/v4-mini`, y quitarlo mete dos instancias de zod en el
  proceso.
- **No se cambia cómo validan las rutas.** `validateBody` y `validateQuery` se quedan
  exactamente como están; la documentación se añade al lado, nunca en su lugar.
- **Alcance cerrado:** `/api/v1/agent/**` y los webhooks salientes. Ni `human/*`, ni
  `public/queries`, ni MCP, ni `health`.
- **La suite se nombra entera:** `bun test tests/unit tests/integration`. Un `bun test`
  a secas desde la raíz arrastra la del SDK y falla en un clon limpio.
- **Los tests de integración no son herméticos:** el alta de agentes está limitada a 10
  por hora y el contador vive en Redis. Si aparecen `429` que parecen fallos reales,
  `redis-cli -n 1 FLUSHDB` contra la base de datos de pruebas. **Registra un agente por
  fichero en un `beforeAll` y reutilízalo**; añadir altas por caso rompe *otro* fichero.
- **Once códigos de error, no nueve.** Nueve en `src/lib/errors.ts`, más
  `PAYLOAD_TOO_LARGE` (el `bodyLimit` de `app.ts`) e `INTERNAL_ERROR` (el fallback de
  `src/middleware/error-handler.ts`).

---

## Estructura de ficheros

**Se crean:**

| Fichero | Responsabilidad |
|---|---|
| `src/openapi/documented.ts` | El envoltorio sobre Hono y el registro. Sin dependencias de zod-openapi |
| `src/openapi/document.ts` | Construye el documento OpenAPI 3.1 desde el registro |
| `src/openapi/types.ts` | `RouteDoc`, el tipo que se escribe en cada ruta |
| `src/validators/response.helpers.ts` | `ok`, `paginated`, `apiError`, `ERROR_CODES` |
| `src/validators/*.responses.ts` | Un fichero por recurso con la forma de sus respuestas |
| `openapi.json` | La copia commiteada, regenerada y comparada en CI |
| `scripts/generate-openapi.ts` | Escribe esa copia |
| `tests/unit/openapi-document.test.ts` | Que el documento tenga versión, servidores y seguridad |
| `tests/unit/openapi-coverage.test.ts` | Que ninguna ruta de agente quede sin describir |

**Se modifican:** los nueve ficheros de `src/routes/agent/`, `src/app.ts`,
`package.json`, `.github/workflows/ci.yml`, y los tests de integración de cada recurso.

---

## Task 1: Los cimientos, y una ruta descrita de punta a punta

Al terminar, `GET /openapi.json` devuelve un documento válido con **un** endpoint
dentro. Los otros 25 llegan en las tareas siguientes; lo que se cierra aquí es la
maquinaria.

**Files:**
- Create: `src/openapi/types.ts`, `src/openapi/documented.ts`, `src/openapi/document.ts`
- Create: `src/validators/response.helpers.ts`, `src/validators/query.responses.ts`
- Modify: `package.json`, `src/routes/agent/queries.ts`, `src/app.ts`
- Test: `tests/unit/openapi-document.test.ts`, y `tests/integration/agent-queries.test.ts`

**Interfaces:**
- Produces:
  - `interface RouteDoc { summary: string; description?: string; body?: ZodTypeAny; query?: ZodTypeAny; params?: ZodTypeAny; responses: Record<number, ZodTypeAny>; idempotent?: boolean; security?: "bearer" | "none" }`
  - `documented(app: Hono<AppEnv>, opts: { basePath: string; tag: string }): DocumentedApp` — expone `get/post/patch/delete` con la misma firma de Hono más un `RouteDoc` como segundo argumento
  - `registeredRoutes(): Array<{ method: string; path: string; tag: string; doc: RouteDoc }>`
  - `buildDocument(): object` — el OpenAPI 3.1 completo
  - `ok(schema)`, `paginated(schema)`, `apiError`, `ERROR_CODES`

- [ ] **Paso 1: instala la dependencia**

```bash
bun add zod-openapi@^4.2.4
```

Comprueba que **no** ha tocado la versión de zod:

```bash
cat node_modules/zod/package.json | grep '"version"'
```

Espera: `3.25.76`. Si ha cambiado, para y avisa — significa que el `overrides` no ha
hecho su trabajo y eso rompe el servidor MCP antes que nada.

- [ ] **Paso 2: escribe la prueba que falla**

Crea `tests/unit/openapi-document.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { buildDocument } from "../../src/openapi/document";

describe("the OpenAPI document", () => {
  test("reports the version the service reports", () => {
    // Not a constant. The root endpoint stamps appVersion() and so does this;
    // a second source is a second thing that can be wrong, which is the drift
    // PR #22 removed from the root in the first place.
    const doc = buildDocument({ APP_VERSION: "v9.9.9" });
    expect(doc.info.version).toBe("v9.9.9");
    expect(buildDocument({}).info.version).toBe("dev");
  });

  test("is OpenAPI 3.1 and points at production", () => {
    const doc = buildDocument({});
    expect(doc.openapi).toStartWith("3.1");
    expect(doc.servers).toEqual([{ url: "https://api.agentdialog.io" }]);
  });

  test("declares one bearer scheme, applied by default", () => {
    const doc = buildDocument({});
    expect(doc.components.securitySchemes.bearerAuth).toMatchObject({
      type: "http",
      scheme: "bearer",
    });
    expect(doc.security).toEqual([{ bearerAuth: [] }]);
  });

  test("describes POST /api/v1/agent/queries, with its request schema", () => {
    const doc = buildDocument({});
    const op = doc.paths["/api/v1/agent/queries"].post;

    expect(op.tags).toEqual(["queries"]);
    expect(op.summary).toBeString();

    // The body schema is the very object that validates the request, so this
    // asserts the reuse rather than a copy: query_type is snake_case on the
    // wire, and would be queryType if somebody had retyped it from the SDK.
    const body = op.requestBody.content["application/json"].schema;
    expect(Object.keys(body.properties)).toContain("query_type");
    expect(Object.keys(body.properties)).toContain("target_human_email");

    expect(Object.keys(op.responses)).toContain("201");
    expect(Object.keys(op.responses)).toContain("422");
  });

  test("marks the idempotent POST, and only as a header", () => {
    const doc = buildDocument({});
    const op = doc.paths["/api/v1/agent/queries"].post;
    const header = op.parameters.find((p: any) => p.name === "Idempotency-Key");
    expect(header).toMatchObject({ in: "header", required: false });
  });
});
```

- [ ] **Paso 3: ejecútala y comprueba que falla**

```bash
bun test tests/unit/openapi-document.test.ts
```

Espera: `Cannot find module '../../src/openapi/document'`.

- [ ] **Paso 4: escribe los sobres de respuesta**

Crea `src/validators/response.helpers.ts`:

```ts
import { z } from "zod";

/**
 * Every code this API can put in an error envelope. Nine come from
 * src/lib/errors.ts; PAYLOAD_TOO_LARGE is emitted inline by app.ts's bodyLimit
 * and INTERNAL_ERROR by the error handler's fallback, so counting only the
 * error classes misses two.
 */
export const ERROR_CODES = [
  "NOT_FOUND",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "CONFLICT",
  "VALIDATION_ERROR",
  "RATE_LIMIT",
  "IDEMPOTENCY_IN_PROGRESS",
  "IDEMPOTENCY_KEY_REUSED",
  "UNDECIDABLE_QUERY",
  "PAYLOAD_TOO_LARGE",
  "INTERNAL_ERROR",
] as const;

/**
 * The envelope is not flat, and pretending otherwise would misdescribe the
 * error an integrator reads most. src/middleware/error-handler.ts spreads extra
 * fields *beside* `code`, not under `details`: retryAfter on a rate limit, and
 * reason / detail / remedy / prior_query_id on an admission-gate refusal.
 */
export const apiError = z.object({
  error: z.object({
    code: z.enum(ERROR_CODES),
    message: z.string(),
    details: z.record(z.unknown()).optional(),
    retryAfter: z.number().int().optional(),
    reason: z.string().optional(),
    detail: z.string().optional(),
    remedy: z.string().optional(),
    prior_query_id: z.string().uuid().optional(),
  }),
});

export function ok<T extends z.ZodTypeAny>(schema: T) {
  return z.object({ data: schema });
}

export function paginated<T extends z.ZodTypeAny>(schema: T) {
  return z.object({
    data: z.array(schema),
    pagination: z.object({
      hasMore: z.boolean(),
      nextCursor: z.string().nullable(),
      prevCursor: z.string().nullable(),
      count: z.number().int(),
    }),
  });
}
```

- [ ] **Paso 5: escribe el envoltorio y el registro**

Crea `src/openapi/types.ts`:

```ts
import type { ZodTypeAny } from "zod";

export interface RouteDoc {
  summary: string;
  description?: string;
  /** Reuse the very schema that validates the request. Never a copy of it. */
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
  responses: Record<number, ZodTypeAny>;
  /** Only the seven POSTs that actually honour Idempotency-Key. */
  idempotent?: boolean;
  /** "none" is for register, the one agent route outside the auth wall. */
  security?: "bearer" | "none";
}

export interface RegisteredRoute {
  method: string;
  /** The full path, with Hono's :id turned into OpenAPI's {id}. */
  path: string;
  tag: string;
  doc: RouteDoc;
}
```

Crea `src/openapi/documented.ts`:

```ts
import type { Hono, MiddlewareHandler } from "hono";
import type { RegisteredRoute, RouteDoc } from "./types";

/**
 * Why a wrapper rather than a middleware.
 *
 * A middleware handed to app.post("/", mw, handler) never learns its own method
 * or path — it can read them from the context at request time, but the document
 * has to exist before any traffic arrives. The wrapper sees both arguments at
 * registration, so the description lives on the same line as the route it
 * describes and nothing is written twice.
 *
 * basePath is declared per route file because a route file only knows its own
 * relative paths; the prefix lives in app.ts. A wrong one is caught by
 * tests/unit/openapi-coverage.test.ts, which compares this registry against
 * Hono's own route table.
 */
const registry: RegisteredRoute[] = [];

export function registeredRoutes(): RegisteredRoute[] {
  return registry;
}

/** Hono says /:id, OpenAPI says /{id}. */
function toOpenApiPath(basePath: string, path: string): string {
  const joined = `${basePath}${path === "/" ? "" : path}`;
  return joined.replace(/:([A-Za-z0-9_]+)/g, "{$1}");
}

type Method = "get" | "post" | "patch" | "delete";

export function documented(
  app: Hono<any>,
  opts: { basePath: string; tag: string },
) {
  function register(method: Method) {
    return (path: string, doc: RouteDoc, ...handlers: MiddlewareHandler[]) => {
      registry.push({
        method: method.toUpperCase(),
        path: toOpenApiPath(opts.basePath, path),
        tag: opts.tag,
        doc,
      });
      // The doc is metadata, not behaviour: it never reaches Hono.
      (app as any)[method](path, ...handlers);
      return app;
    };
  }

  return {
    get: register("get"),
    post: register("post"),
    patch: register("patch"),
    delete: register("delete"),
    app,
  };
}
```

- [ ] **Paso 6: escribe el constructor del documento**

Crea `src/openapi/document.ts`:

```ts
import { createDocument } from "zod-openapi";
import { appVersion } from "../lib/app-version";
import { registeredRoutes } from "./documented";
import { apiError } from "../validators/response.helpers";

const IDEMPOTENCY_HEADER = {
  name: "Idempotency-Key",
  in: "header" as const,
  required: false,
  description:
    "Repeat a POST with the same key and the original response comes back instead of the work happening twice. Only successful responses are remembered, so a refusal leaves the key free for the corrected retry.",
  schema: { type: "string" as const },
};

export function buildDocument(env: Record<string, string | undefined> = process.env) {
  const paths: Record<string, Record<string, unknown>> = {};

  for (const route of registeredRoutes()) {
    const { doc } = route;
    const operation: Record<string, unknown> = {
      tags: [route.tag],
      summary: doc.summary,
      ...(doc.description ? { description: doc.description } : {}),
      responses: Object.fromEntries(
        Object.entries(doc.responses).map(([status, schema]) => [
          status,
          { description: "", content: { "application/json": { schema } } },
        ]),
      ),
    };

    if (doc.body) {
      operation.requestBody = { content: { "application/json": { schema: doc.body } } };
    }

    // OpenAPI 3.1 requires every {template} in a path to have a matching
    // parameter entry, so a route with :id and no `params` produces a document
    // a strict validator rejects. createDocument does not check this.
    //
    // It has to go through `requestParams`, not `parameters`. A hand-built
    // parameters array only expands elements that are individual ZodTypes
    // carrying .openapi({ param: { name, in } }); an object schema handed to it
    // passes through unconverted, which looks populated and is still invalid.
    // requestParams expands an object into one parameter per property and
    // derives `required` from optionality.
    if (doc.params) (operation.requestParams ??= {}).path = doc.params;
    if (doc.query) (operation.requestParams ??= {}).query = doc.query;
    if (doc.idempotent) operation.parameters = [IDEMPOTENCY_HEADER];

    if (doc.security === "none") operation.security = [];

    paths[route.path] ??= {};
    paths[route.path][route.method.toLowerCase()] = operation;
  }

  return createDocument({
    openapi: "3.1.0",
    info: {
      title: "AgentDialog Agent API",
      // The same source the root endpoint uses. See src/lib/app-version.ts.
      version: appVersion(env),
      description:
        "The surface an AI agent integrates against: conversations, messages, human queries and webhooks.",
    },
    servers: [{ url: "https://api.agentdialog.io" }],
    security: [{ bearerAuth: [] }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          description: "An agent API key, prefixed `mge_ag_`.",
        },
      },
      schemas: { ApiError: apiError },
    },
    paths,
  });
}
```

- [ ] **Paso 7: describe la primera ruta**

Escribe `src/validators/query.responses.ts` con la forma de una query devuelta. Sácala
del servicio, **no** de la guía: es la respuesta real la que manda.

**Cuidado, que hay dos formas y es fácil coger la que no es.** `src/services/query.service.ts`
tiene `shapeQuery` —lo que ve **el agente**, y por tanto lo que devuelven las rutas de
esta superficie— y `shapeHumanQuery`, que es lo que ve el humano y lleva campos que un
agente nunca recibe (`conversation_id`, `query_message_id`, `subject`, `changes`,
`risk`, `answer_space`, `prior_decision_at`). **Para `/api/v1/agent/**` manda
`shapeQuery`.**

Y una tercera: `createQuery` no devuelve ninguna de las dos, sino un acuse pequeño
—`{ query_id, status, conversation_id, message, next_step, expires_at }`— así que la
respuesta 201 de `POST /queries` tiene su propio esquema.

```ts
import { z } from "zod";
import { ok } from "./response.helpers";

/**
 * Read off shapeHumanQuery in src/services/query.service.ts, which is what
 * actually goes on the wire — not off the guide, which is prose and can age.
 *
 * Five fields are null unless the query has been answered, and two more depend
 * on its status; nullable() rather than optional() because the service emits
 * the key with null in it, and a client that checks `in` would be misled by
 * optional.
 */
export const queryObject = z.object({
  query_id: z.string().uuid(),
  conversation_id: z.string().uuid(),
  query_message_id: z.string().uuid().nullable(),
  status: z.enum(["pending", "answered", "needs_context", "expired", "cancelled"]),
  status_description: z.string(),
  query_type: z.enum(["validation", "interpretation", "expert_query", "labeling"]),
  question: z.string(),
  context: z.string().nullable(),
  confidence: z.number().nullable(),
  subject: z.object({
    id: z.string(),
    label: z.string(),
    uri: z.string().optional(),
    body: z.string().optional(),
  }),
  self_contained: z.boolean(),
  changes: z
    .array(
      z.object({
        path: z.string(),
        before: z.string(),
        after: z.string(),
        materiality: z.enum(["material", "cosmetic"]),
      }),
    )
    .nullable(),
  risk: z.enum(["low", "medium", "high", "critical"]),
  answer_space: z.record(z.unknown()),
  language: z.enum(["en", "es", "ca"]),
  insufficient_reason: z.string().nullable(),
  answer: z.record(z.unknown()).nullable(),
  comment: z.string().nullable(),
  human_confidence: z.number().nullable(),
  response_time_ms: z.number().int().nullable(),
  prior_decision_at: z.string().datetime().nullable(),
  created_at: z.string().datetime(),
  expires_at: z.string().datetime(),
});

export const queryResponse = ok(queryObject);
```

Dos avisos sobre este esquema, porque son los dos sitios donde es fácil equivocarse:

- **`answer_space` y `answer` quedan como `z.record(z.unknown())` en esta tarea, a
  propósito.** Son uniones discriminadas por `kind` con seis variantes cada una, y
  merecen su propio esquema — pero eso es trabajo de la tarea 2, cuando ya haya
  maquinaria que probar. Documentar `unknown` es peor que documentarlo bien y mejor
  que documentarlo mal; **anótalo en el informe** para que la tarea 2 lo recoja.
- **Comprueba los tipos contra la base de datos, no contra tu lectura.**
  `query_message_id` y `confidence` los he puesto `nullable()` leyendo el servicio; si
  el esquema Drizzle dice `notNull()`, gana el esquema. El test de integración del
  paso 10 es lo que resuelve la duda: si te equivocas, falla ahí.

Y en `src/routes/agent/queries.ts`, cambia **solo** la declaración de la ruta:

```ts
const hono = new Hono<AppEnv>();
const app = documented(hono, { basePath: "/api/v1/agent/queries", tag: "queries" });

app.post(
  "/",
  {
    summary: "Ask a human a question",
    body: createQuerySchema,
    responses: { 201: queryResponse, 422: apiError },
    idempotent: true,
  },
  idempotency(),
  validateBody(createQuerySchema),
  async (c) => {
    // …el handler, sin tocar una línea
  },
);

export default hono;   // se exporta el Hono, no el envoltorio
```

Las otras cuatro rutas de este fichero siguen sobre `hono` hasta la tarea 2.

- [ ] **Paso 8: sirve el documento**

En `src/app.ts`, junto a las rutas de salud —público, sin autenticar, antes del muro:

```ts
  // The contract, from the running service: what somebody reads is the version
  // that is answering them, not what is on main.
  app.get("/openapi.json", (c) => c.json(buildDocument()));
```

- [ ] **Paso 9: ejecuta la prueba y comprueba que pasa**

```bash
bun test tests/unit/openapi-document.test.ts
cd web >/dev/null 2>&1; cd - >/dev/null; bunx tsc --noEmit
```

Espera: cinco tests verdes, typecheck limpio.

- [ ] **Paso 10: afirma la respuesta real contra el esquema**

Esto es lo que convierte el documento en un contrato. En
`tests/integration/agent-queries.test.ts`, en el caso que ya crea una query, añade tras
el `expect(createRes.status).toBe(201)`:

```ts
    // The documented shape has to be the real one. If a field is added, renamed
    // or dropped in the service, this fails here rather than silently making
    // openapi.json a lie.
    expect(() => queryResponse.parse(await createRes.clone().json())).not.toThrow();
```

Cuidado con el `clone()`: el cuerpo ya se consume más abajo en ese test.

```bash
bun test tests/integration/agent-queries.test.ts
```

Si sale `429`, es el límite de altas: `redis-cli -n 1 FLUSHDB` contra la base de pruebas.

- [ ] **Paso 11: míralo**

```bash
bun run dev
curl -s localhost:3000/openapi.json | python3 -m json.tool | head -40
```

Espera: `openapi: "3.1.0"`, `info.version: "dev"`, y un único `paths`.

- [ ] **Paso 12: commit**

```bash
git add package.json bun.lock src/openapi src/validators/response.helpers.ts \
  src/validators/query.responses.ts src/routes/agent/queries.ts src/app.ts \
  tests/unit/openapi-document.test.ts tests/integration/agent-queries.test.ts
git commit -m "Serve an OpenAPI document, with one route in it"
```

---

## Tasks 2-4: los 25 endpoints restantes

Cada una es autónoma: el procedimiento va escrito entero dentro de las tres.

### Task 2: queries y conversations — 8 endpoints

- [ ] Las cuatro rutas restantes de `src/routes/agent/queries.ts` (`GET /`, `GET /:id`, `PATCH /:id`, `POST /:id/cancel`)
- [ ] Las cuatro de `src/routes/agent/conversations.ts` (`POST /`, `GET /`, `GET /:id`, `PATCH /:id`)
- [ ] `src/validators/conversation.responses.ts`
- [ ] `GET /queries` usa `paginated(...)`; comprueba en el servicio si de verdad pagina o si devuelve una lista pelada, y documenta lo que haya
- [ ] Afirmaciones en `tests/integration/agent-queries.test.ts` y `conversation-flow.test.ts`

**Procedimiento, paso a paso. Se repite entero en cada una de las tareas 2, 3 y 4
porque cada una la ejecuta alguien que solo lee la suya.**

- [ ] **Paso 1: lee lo que el servicio devuelve de verdad.** Abre la función de
  `src/services/` que alimenta cada ruta y escribe
  `src/validators/<recurso>.responses.ts` a partir de lo que construye su `return`.
  **No de `docs/api/README.md`**: la guía es prosa y puede haber envejecido; el
  servicio es lo que responde. Usa `ok(...)` y `paginated(...)` de
  `src/validators/response.helpers.ts` para el sobre, y `nullable()` —no
  `optional()`— donde el servicio emite la clave con `null` dentro, porque un cliente
  que compruebe con `in` sería engañado por `optional`.

- [ ] **Paso 2: convierte el fichero de rutas.** Sustituye

  ```ts
  const app = new Hono<AppEnv>();
  ```

  por

  ```ts
  const hono = new Hono<AppEnv>();
  const app = documented(hono, { basePath: "<el prefijo real>", tag: "<recurso>" });
  ```

  y al final `export default hono;` — el envoltorio es solo para registrar; `app.route(...)`
  en `src/app.ts` necesita un Hono de verdad. El `basePath` es el prefijo con el que
  `src/app.ts` monta ese fichero; búscalo ahí, no lo deduzcas.

- [ ] **Paso 3: añade el `RouteDoc` a cada ruta**, como segundo argumento, antes de los
  middlewares. Los handlers **no se tocan, ni una línea**.

- [ ] **Paso 4: `idempotent: true` solo donde hay `idempotency()`** en la cadena de
  middlewares de esa ruta. Míralo en la línea, no de memoria: son siete en toda la API
  y documentarlo donde no se respeta es peor que omitirlo.

- [ ] **Paso 5: los códigos de respuesta son los que el handler puede devolver de
  verdad.** El éxito con su esquema, más `apiError` para lo que su servicio lanza. No
  inventes un 500 en cada endpoint, y no omitas el 422 donde hay `validateBody`.

- [ ] **Paso 6: afirma la respuesta real contra el esquema** en el test de integración
  que ya cubre ese recurso, igual que el paso 10 de la tarea 1:

  ```ts
  const body = await res.clone().json();
  expect(() => <esquema>.parse(body)).not.toThrow();
  ```

  Dos cosas, y las dos han mordido ya. El `clone()` importa porque el cuerpo suele
  consumirse más abajo en esos tests. Y el `await` va **fuera** de la flecha: meterlo
  dentro de `expect(() => …)` no compila, porque esa flecha no es `async`. **Si no hay
  test de integración para un endpoint, no inventes uno** — dilo en el informe, que es
  una laguna real y conviene conocerla.

- [ ] **Paso 7: verifica.**

  ```bash
  bun test tests/unit tests/integration
  bunx tsc --noEmit
  bunx biome check src/
  ```

  Y con el servidor levantado, que el documento haya crecido:

  ```bash
  curl -s localhost:3000/openapi.json | python3 -c "import json,sys; print(len(json.load(sys.stdin)['paths']), 'paths')"
  ```

  Un `429` en integración es el límite de altas de agente en Redis, no un fallo tuyo:
  `redis-cli -n 1 FLUSHDB` contra la base de datos de pruebas.

- [ ] **Paso 8: commit**, con las rutas explícitas. Este checkout tiene trabajo ajeno
  sin commitear bajo `docs-site/`: nunca `git add .`.

### Task 3: messages, invitations y upload — 8 endpoints

- [ ] `src/routes/agent/messages.ts` (2), `invitations.ts` (3), `upload.ts` (3)
- [ ] `src/validators/message.responses.ts`, `invitation.responses.ts`, `upload.responses.ts`
- [ ] **Las subidas no son JSON.** `POST /:id/upload` y `/voice-note` reciben
      `multipart/form-data`; documéntalas con ese `content`, no con
      `application/json`, y describe la respuesta, que sí es JSON. `/upload/presigned`
      sí es JSON en ambos sentidos
- [ ] Afirmaciones en los tests de integración correspondientes

**Procedimiento, paso a paso. Se repite entero en cada una de las tareas 2, 3 y 4
porque cada una la ejecuta alguien que solo lee la suya.**

- [ ] **Paso 1: lee lo que el servicio devuelve de verdad.** Abre la función de
  `src/services/` que alimenta cada ruta y escribe
  `src/validators/<recurso>.responses.ts` a partir de lo que construye su `return`.
  **No de `docs/api/README.md`**: la guía es prosa y puede haber envejecido; el
  servicio es lo que responde. Usa `ok(...)` y `paginated(...)` de
  `src/validators/response.helpers.ts` para el sobre, y `nullable()` —no
  `optional()`— donde el servicio emite la clave con `null` dentro, porque un cliente
  que compruebe con `in` sería engañado por `optional`.

- [ ] **Paso 2: convierte el fichero de rutas.** Sustituye

  ```ts
  const app = new Hono<AppEnv>();
  ```

  por

  ```ts
  const hono = new Hono<AppEnv>();
  const app = documented(hono, { basePath: "<el prefijo real>", tag: "<recurso>" });
  ```

  y al final `export default hono;` — el envoltorio es solo para registrar; `app.route(...)`
  en `src/app.ts` necesita un Hono de verdad. El `basePath` es el prefijo con el que
  `src/app.ts` monta ese fichero; búscalo ahí, no lo deduzcas.

- [ ] **Paso 3: añade el `RouteDoc` a cada ruta**, como segundo argumento, antes de los
  middlewares. Los handlers **no se tocan, ni una línea**.

- [ ] **Paso 4: `idempotent: true` solo donde hay `idempotency()`** en la cadena de
  middlewares de esa ruta. Míralo en la línea, no de memoria: son siete en toda la API
  y documentarlo donde no se respeta es peor que omitirlo.

- [ ] **Paso 5: los códigos de respuesta son los que el handler puede devolver de
  verdad.** El éxito con su esquema, más `apiError` para lo que su servicio lanza. No
  inventes un 500 en cada endpoint, y no omitas el 422 donde hay `validateBody`.

- [ ] **Paso 6: afirma la respuesta real contra el esquema** en el test de integración
  que ya cubre ese recurso, igual que el paso 10 de la tarea 1:

  ```ts
  const body = await res.clone().json();
  expect(() => <esquema>.parse(body)).not.toThrow();
  ```

  Dos cosas, y las dos han mordido ya. El `clone()` importa porque el cuerpo suele
  consumirse más abajo en esos tests. Y el `await` va **fuera** de la flecha: meterlo
  dentro de `expect(() => …)` no compila, porque esa flecha no es `async`. **Si no hay
  test de integración para un endpoint, no inventes uno** — dilo en el informe, que es
  una laguna real y conviene conocerla.

- [ ] **Paso 7: verifica.**

  ```bash
  bun test tests/unit tests/integration
  bunx tsc --noEmit
  bunx biome check src/
  ```

  Y con el servidor levantado, que el documento haya crecido:

  ```bash
  curl -s localhost:3000/openapi.json | python3 -c "import json,sys; print(len(json.load(sys.stdin)['paths']), 'paths')"
  ```

  Un `429` en integración es el límite de altas de agente en Redis, no un fallo tuyo:
  `redis-cli -n 1 FLUSHDB` contra la base de datos de pruebas.

- [ ] **Paso 8: commit**, con las rutas explícitas. Este checkout tiene trabajo ajeno
  sin commitear bajo `docs-site/`: nunca `git add .`.

### Task 4: webhooks, profile, key y register — 9 endpoints

- [ ] `src/routes/agent/webhooks.ts` (5), `profile.ts` (2), `key.ts` (1), `register.ts` (1)
- [ ] `src/validators/webhook.responses.ts`, `agent.responses.ts`
- [ ] **El secreto del webhook se devuelve una sola vez, al crearlo y al rotarlo.** La
      respuesta de creación y la de rotación no tienen la misma forma que la de
      listado — descríbelas por separado en vez de reutilizar un solo objeto
- [ ] **`register` es la única con `security: "none"`**, y su respuesta lleva la clave
      en claro, también una sola vez
- [ ] Afirmaciones en `tests/integration/agent-register.test.ts` y las de webhooks

**Procedimiento, paso a paso. Se repite entero en cada una de las tareas 2, 3 y 4
porque cada una la ejecuta alguien que solo lee la suya.**

- [ ] **Paso 1: lee lo que el servicio devuelve de verdad.** Abre la función de
  `src/services/` que alimenta cada ruta y escribe
  `src/validators/<recurso>.responses.ts` a partir de lo que construye su `return`.
  **No de `docs/api/README.md`**: la guía es prosa y puede haber envejecido; el
  servicio es lo que responde. Usa `ok(...)` y `paginated(...)` de
  `src/validators/response.helpers.ts` para el sobre, y `nullable()` —no
  `optional()`— donde el servicio emite la clave con `null` dentro, porque un cliente
  que compruebe con `in` sería engañado por `optional`.

- [ ] **Paso 2: convierte el fichero de rutas.** Sustituye

  ```ts
  const app = new Hono<AppEnv>();
  ```

  por

  ```ts
  const hono = new Hono<AppEnv>();
  const app = documented(hono, { basePath: "<el prefijo real>", tag: "<recurso>" });
  ```

  y al final `export default hono;` — el envoltorio es solo para registrar; `app.route(...)`
  en `src/app.ts` necesita un Hono de verdad. El `basePath` es el prefijo con el que
  `src/app.ts` monta ese fichero; búscalo ahí, no lo deduzcas.

- [ ] **Paso 3: añade el `RouteDoc` a cada ruta**, como segundo argumento, antes de los
  middlewares. Los handlers **no se tocan, ni una línea**.

- [ ] **Paso 4: `idempotent: true` solo donde hay `idempotency()`** en la cadena de
  middlewares de esa ruta. Míralo en la línea, no de memoria: son siete en toda la API
  y documentarlo donde no se respeta es peor que omitirlo.

- [ ] **Paso 5: los códigos de respuesta son los que el handler puede devolver de
  verdad.** El éxito con su esquema, más `apiError` para lo que su servicio lanza. No
  inventes un 500 en cada endpoint, y no omitas el 422 donde hay `validateBody`.

- [ ] **Paso 6: afirma la respuesta real contra el esquema** en el test de integración
  que ya cubre ese recurso, igual que el paso 10 de la tarea 1:

  ```ts
  const body = await res.clone().json();
  expect(() => <esquema>.parse(body)).not.toThrow();
  ```

  Dos cosas, y las dos han mordido ya. El `clone()` importa porque el cuerpo suele
  consumirse más abajo en esos tests. Y el `await` va **fuera** de la flecha: meterlo
  dentro de `expect(() => …)` no compila, porque esa flecha no es `async`. **Si no hay
  test de integración para un endpoint, no inventes uno** — dilo en el informe, que es
  una laguna real y conviene conocerla.

- [ ] **Paso 7: verifica.**

  ```bash
  bun test tests/unit tests/integration
  bunx tsc --noEmit
  bunx biome check src/
  ```

  Y con el servidor levantado, que el documento haya crecido:

  ```bash
  curl -s localhost:3000/openapi.json | python3 -c "import json,sys; print(len(json.load(sys.stdin)['paths']), 'paths')"
  ```

  Un `429` en integración es el límite de altas de agente en Redis, no un fallo tuyo:
  `redis-cli -n 1 FLUSHDB` contra la base de datos de pruebas.

- [ ] **Paso 8: commit**, con las rutas explícitas. Este checkout tiene trabajo ajeno
  sin commitear bajo `docs-site/`: nunca `git add .`.

---

## Task 5: los webhooks salientes, y las etiquetas

Lo que enviamos nosotros, que es lo que un integrador necesita para verificar una
entrega y no está en ninguna parte legible por una máquina.

**Files:**
- Create: `src/validators/webhook-delivery.responses.ts`
- Modify: `src/openapi/document.ts`

- [ ] **Paso 1: escribe el cuerpo de la entrega**

El cuerpo real es `{ event, data, timestamp }` (`src/services/webhook.service.ts:233`).
Saca la lista de eventos del código, no de la guía.

- [ ] **Paso 2: añádelo como `webhooks`, no como `paths`**

OpenAPI 3.1 tiene una sección propia para esto, y meterlo en `paths` diría que
*nosotros* servimos ese endpoint, que es lo contrario de lo que pasa:

```ts
    webhooks: {
      delivery: {
        post: {
          summary: "A delivery to the URL you registered",
          description:
            "Signed per Standard Webhooks. The signed content covers the timestamp, so a captured delivery cannot be replayed. Verify with verifyWebhook from @agentdialog/sdk/webhooks, or any off-the-shelf implementation.",
          parameters: [
            { name: "webhook-id", in: "header", required: true, schema: { type: "string" } },
            { name: "webhook-timestamp", in: "header", required: true, schema: { type: "string" } },
            { name: "webhook-signature", in: "header", required: true, schema: { type: "string" } },
          ],
          requestBody: { content: { "application/json": { schema: deliveryBody } } },
          responses: { 200: { description: "Any 2xx is treated as delivered." } },
        },
      },
    },
```

- [ ] **Paso 3: `webhook-id` identifica el mensaje, no el intento**

Dilo en la descripción de esa cabecera. Es la propiedad que permite deduplicar, está
decidida en el diseño de firma, y quien la lea al revés construirá mal su lado.

- [ ] **Paso 3b: las tres respuestas que produce el middleware, no el handler**

El documento solo lista los errores que lanza cada handler. Nunca describe el **401**
del muro de autenticación, el **429** del limitador ni el **409** que devuelve el
middleware de idempotencia ante una clave reutilizada — porque ninguno sale del
handler. Se decidió sin decidirlo en la tarea 1 y las cuatro siguientes lo heredaron.

Un cliente generado que no ve el 401 ni el 429 es un cliente que no maneja los dos
primeros fallos que se encuentra un integrador, y el 429 lleva `retryAfter`, que es
justo el campo que dice qué hacer al respecto.

No se toca ninguno de los 26 `RouteDoc`. La regla es mecánica y `document.ts` ya tiene
en la mano todo lo que necesita:

- **429** en las 26. `app.use("*", globalRateLimit())` corre antes de todas, incluida
  la de `security: "none"`.
- **401** en todas menos esa: `doc.security !== "none"`, 25 de 26.
- **409** exactamente en las siete con `doc.idempotent`.

Y no hace falta esquema nuevo: `apiError` ya cubre los tres, porque
`src/middleware/error-handler.ts` pinta todo `AppError` por el mismo sobre, y
`retryAfter` ya está en él.

Define las tres una sola vez en `components.responses` —`Unauthorized`, `RateLimited`,
`IdempotencyKeyReused`, compartiendo `apiError` como esquema y diferenciándose en la
descripción— y en el mismo bucle que ya construye `operation.responses`, mezcla los
`$ref`. Cada operación gana tres líneas de referencia; los tres cuerpos existen una vez.

Es la misma forma que el arreglo de los parámetros: calcular en el centro a partir de
banderas que el `RouteDoc` ya lleva, en vez de repetir en 26 sitios.

- [ ] **Paso 4: etiquetas con descripción**

Añade `tags` al documento —una entrada por recurso, con una frase— para que un
generador produzca clientes agrupados de forma reconocible.

- [ ] **Paso 5: verifica y commitea**

```bash
bun test tests/unit tests/integration
curl -s localhost:3000/openapi.json | python3 -c "import json,sys; d=json.load(sys.stdin); print(sorted(d.get('webhooks',{})))"
```

---

## Task 6: lo que impide que mienta

**Files:**
- Create: `tests/unit/openapi-coverage.test.ts`, `scripts/generate-openapi.ts`, `openapi.json`
- Modify: `.github/workflows/ci.yml`, `CLAUDE.md`, `docs/api/README.md`, `docs-site/content/docs/roadmap.mdx`

- [ ] **Paso 1: la prueba de cobertura, que es la que impide que un endpoint nuevo entre sin contrato**

```ts
import { describe, expect, test } from "bun:test";
import { createApp } from "../../src/app";
import { registeredRoutes } from "../../src/openapi/documented";

/** Hono says /:id, OpenAPI says {id}. Compare like with like. */
function normalise(path: string): string {
  return path.replace(/:([A-Za-z0-9_]+)/g, "{$1}");
}

describe("every agent route is in the contract", () => {
  test("no route under /api/v1/agent is undocumented", () => {
    const app = createApp();
    const real = app.routes
      .filter((r) => r.path.startsWith("/api/v1/agent") && r.method !== "ALL")
      .map((r) => `${r.method} ${normalise(r.path)}`);

    const documented = new Set(
      registeredRoutes().map((r) => `${r.method} ${r.path}`),
    );

    const missing = [...new Set(real)].filter((r) => !documented.has(r));
    expect(missing).toEqual([]);
  });

  test("nothing is documented that does not exist", () => {
    // Catches a wrong basePath in a route file, which would otherwise publish a
    // path nobody can call.
    const app = createApp();
    const real = new Set(
      app.routes
        .filter((r) => r.method !== "ALL")
        .map((r) => `${r.method} ${normalise(r.path)}`),
    );
    const ghosts = registeredRoutes()
      .map((r) => `${r.method} ${r.path}`)
      .filter((r) => !real.has(r));
    expect(ghosts).toEqual([]);
  });
});
```

Cuidado: `app.routes` incluye los middlewares montados con `use("*", …)` como método
`ALL`; por eso se filtran. Comprueba con un `console.log` cómo se ven de verdad antes
de dar el filtro por bueno.

- [ ] **Paso 2: valida contra el meta-esquema de OpenAPI 3.1**

Añade a `tests/unit/openapi-document.test.ts` un caso que valide el documento emitido
contra el meta-esquema. Si traer el meta-esquema resulta ser una dependencia pesada,
haz las comprobaciones estructurales a mano —`openapi`, `info.title`, `info.version`,
que toda operación tenga `responses` no vacío y que todo `$ref` resuelva— y **dilo en
el informe**, en vez de instalar un validador de JSON Schema entero por un test.

- [ ] **Paso 2b: comprueba que cada `{parámetro}` está declarado**

Esto se escapó una vez y ninguna de las otras comprobaciones lo veía: `createDocument`
no valida que una plantilla de ruta tenga su entrada en `parameters`, la prueba de
cobertura solo mira qué rutas existen, y un `curl | len(paths)` cuenta rutas, no
parámetros. Añade a `tests/unit/openapi-document.test.ts`:

```ts
test("every path template declares its parameter", () => {
  const doc = buildDocument({});
  const missing: string[] = [];

  for (const [path, item] of Object.entries<any>(doc.paths)) {
    const templated = [...path.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]);
    if (!templated.length) continue;

    for (const [method, op] of Object.entries<any>(item)) {
      const declared = new Set(
        (op.parameters ?? [])
          .filter((p: any) => p.in === "path")
          .flatMap((p: any) => Object.keys(p.schema?.properties ?? { [p.name]: true })),
      );
      for (const name of templated) {
        if (!declared.has(name)) missing.push(`${method.toUpperCase()} ${path} → ${name}`);
      }
    }
  }

  expect(missing).toEqual([]);
});
```

Ajusta la lectura de `declared` a la forma que emita de verdad `zod-openapi` para un
objeto de parámetros — míralo con `curl` antes de dar el test por bueno, en vez de
confiar en esta suposición.

- [ ] **Paso 2c: guarda las tres respuestas del middleware**

En `tests/unit/openapi-document.test.ts`: toda operación con `security !== "none"`
declara 401, las 26 declaran 429, y las siete idempotentes declaran 409. Es lo que
impide que la tarea 5 se deshaga en silencio.

- [ ] **Paso 2d: las dos afirmaciones que faltan, sin dar de alta un agente**

`PATCH /me` y `POST /key/rotate` se quedaron sin comprobar su esquema contra una
respuesta real, porque añadir un alta de agente empuja el contador compartido de Redis
y rompe otros ficheros. No hace falta un alta nueva: `conversation-flow.test.ts` ya
registra un agente y puede llamar a `PATCH /me` con él antes de seguir, y
`agent-register.test.ts` ya registra por caso y puede llamar a `POST /key/rotate` con
la credencial recién emitida. Añade las dos afirmaciones ahí.

- [ ] **Paso 3: la copia commiteada**

`scripts/generate-openapi.ts` escribe `openapi.json` en la raíz con
`JSON.stringify(buildDocument({}), null, 2)` y un salto de línea final. Con el entorno
vacío, para que la versión sea `dev` y el fichero no cambie en cada release.

Añade a `package.json`: `"openapi": "bun run scripts/generate-openapi.ts"`.

- [ ] **Paso 4: CI lo regenera y compara**

En el job que ya existe, tras los tests:

```yaml
      - name: Check the committed contract is current
        run: |
          bun run openapi
          git diff --exit-code openapi.json
```

- [ ] **Paso 5: documentación**

- **`CLAUDE.md`**, en Conventions: una ruta nueva bajo `/api/v1/agent` se declara con
  `documented(...)` y su `RouteDoc`, y `tests/unit/openapi-coverage.test.ts` falla si
  no. Los esquemas de respuesta viven en `src/validators/*.responses.ts` y se afirman
  en los tests de integración: son contrato, no adorno.
- **`docs/api/README.md`**: un párrafo al principio diciendo que existe
  `GET /openapi.json` y qué relación tienen — la guía dice por qué y cuándo, el
  documento dice qué forma tiene.
- **`docs-site/content/docs/roadmap.mdx`**: una entrada en «Available now».

- [ ] **Paso 6: la comprobación final, entera**

```bash
bun test tests/unit tests/integration
bunx tsc --noEmit
bunx biome check src/
bun run openapi && git diff --exit-code openapi.json
cd web && bun install && bunx tsc -b && bunx eslint . && bun run build
```

El último bloque es de `web/` y no debería cambiar nada — se corre porque `bun run
build` regenera `web/public/agentdialog-integration-guide.md` desde
`docs/api/README.md`, que **sí** se toca en el paso 5. Si sale modificado, va en el
commit.

- [ ] **Paso 7: commit y PR**

---

## Lo que este plan deja fuera a propósito

- **Pintarlo en `docs-site`** con Scalar o equivalente.
- **Generar clientes**, incluido el SDK de TypeScript.
- **`human/*`, `public/queries`, MCP y `health`.**
- **Reescribir `docs/api/README.md`.** Sigue siendo la fuente narrativa; solo gana un
  párrafo que apunta al documento.
