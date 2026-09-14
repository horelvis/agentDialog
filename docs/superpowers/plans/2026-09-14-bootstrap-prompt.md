# Bootstrap prompt para agentes nuevos — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que un cliente final que quiera usar AgentDialog copie UNA cosa y empiece a hablar: el registro devuelve un `bootstrapPrompt` con su API key y la base URL ya dentro, la API sirve el contexto de arranque en `/agent-context.md`, y la landing lo muestra con botón de copiar.

**Architecture:**

- `src/lib/bootstrap.ts` — `buildBootstrapPrompt({ apiKey, apiBaseUrl })`, función pura.
- `POST /api/v1/agent/register` devuelve `bootstrapPrompt` (base URL derivada del request).
- `GET /agent-context.md` sirve `docs/agent-context.md` (Bun.file), con `COPY` en el Dockerfile y excepción en `.dockerignore`.
- `web/src/components/landing/GetKeyForm.tsx` muestra el prompt para copiar.

**Tech Stack:** Bun, Hono, zod-openapi, React, i18next. Sin nueva infraestructura.

**Spec:** `docs/superpowers/specs/2026-09-14-bootstrap-prompt-design.md`

## Global Constraints

- El `bootstrapPrompt` se reconstruye por request; nunca se guarda.
- La base URL se deriva de `x-forwarded-host`/`host` + proto, como la Agent Card.
- El prompt usa la key recién acuñada — el único momento en claro.
- `GET /agent-context.md` es público, `text/markdown`, sin auth.
- Código, comentarios y commits en inglés. Documentos del repo en español.
- `bunx tsc --noEmit` en 0; suite completa verde; web build + lint verdes.

---

### Task 1: `buildBootstrapPrompt` y tests

**Estado:** ✅ completado.

**Files:**
- Create: `src/lib/bootstrap.ts`
- Create: `tests/unit/bootstrap.test.ts`

**Interfaces:**
- `buildBootstrapPrompt(input: { apiKey: string; apiBaseUrl: string }): string`
- El prompt lleva la key y `{apiBase}/agent-context.md`, y es estable.

- [x] **Step 1: Implementar la función**
- [x] **Step 2: Tests unitarios (key/base embebidas, formato)**

---

### Task 2: `bootstrapPrompt` en la respuesta de registro

**Estado:** ✅ completado.

**Files:**
- Modify: `src/routes/agent/register.ts`
- Modify: `src/validators/agent.responses.ts` (`agentRegisterResponse` + `bootstrapPrompt`)
- Create: `tests/integration/bootstrap-prompt.test.ts`

**Interfaces:**
- `POST /api/v1/agent/register` → `data.bootstrapPrompt` presente, contiene la key y apunta a `…/agent-context.md`. El proto cae al del request cuando no hay `x-forwarded-proto`.

- [x] **Step 1: Derivar `apiBaseUrl` del request y construir el prompt**
- [x] **Step 2: Añadir `bootstrapPrompt` al schema de respuesta**
- [x] **Step 3: Test de integración**

---

### Task 3: `GET /agent-context.md`

**Estado:** ✅ completado.

**Files:**
- Modify: `src/app.ts` (ruta pública)
- Modify: `Dockerfile` (COPY del fichero en `production`)
- Modify: `.dockerignore` (excepción `docs/*` + `!docs/agent-context.md`)
- Modify: `tests/integration/bootstrap-prompt.test.ts` (también cubre la ruta)

**Interfaces:**
- `GET /agent-context.md` → 200 `text/markdown` con el contenido del fichero.
- El fichero viaja en las imágenes `production` y `onprem`.

- [x] **Step 1: Ruta con `Bun.file`**
- [x] **Step 2: Dockerfile + dockerignore**
- [x] **Step 3: Test de integración**

---

### Task 4: Mostrar el prompt en la landing

**Estado:** ✅ completado.

**Files:**
- Modify: `web/src/components/landing/GetKeyForm.tsx` (bloque de bootstrap prompt en `KeyIssued`)
- Modify: `web/src/i18n/catalogues/en/landing.ts`, `es/landing.ts`, `ca/landing.ts`

**Interfaces:**
- Tras el registro, el bloque muestra el `bootstrapPrompt` con botón de copiar.
- Fallback: si el backend no trae `bootstrapPrompt`, se construye en cliente con `location.origin` y la key.

- [x] **Step 1: Bloque del prompt + copiar en `KeyIssued`**
- [x] **Step 2: Claves i18n en los tres catálogos**
- [x] **Step 3: Build + lint web**

---

### Task 5: Verificación final

- [x] **Step 1: `bunx tsc --noEmit` en 0**
- [x] **Step 2: `bunx biome check src/`**
- [x] **Step 3: Suite unit + integration verde** (482 tests)
- [x] **Step 4: Prueba manual: registrar contra localhost, el prompt se copia y apunta a `/agent-context.md`**