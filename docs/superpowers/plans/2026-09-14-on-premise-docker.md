# Modo on-premise con contenedores Docker — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que una empresa despliegue AgentDialog completo en su infra con un solo contenedor de producto (API + UI + MinIO embebido) más Postgres y Redis, un CLI de operador para el bootstrap, webhooks a red privada permitidos en on-prem, y SMTP corporativo obligatorio.

**Architecture:**

- Un contenedor de producto construido con un nuevo target `onprem` del `Dockerfile` raíz (que además aprende a construir `web/`), con MinIO embebido arrancado por `docker-entrypoint-onprem.sh`.
- `docker-compose.onprem.yml`: `app` (1 réplica) + `postgres` + `redis` sin puertos al host.
- `DEPLOYMENT_MODE` en `src/env.ts` separa las reglas de producción cloud vs on-prem.
- CLI de operador `scripts/admin.ts` (`init-env`, `create-agent`, `health`).
- `MINIO_PUBLIC_URL` reescribe el origen de URLs presignadas para que el navegador las alcance.

**Tech Stack:** Bun, Hono, Drizzle, zod, Docker, MinIO. Sin Helm, sin multi-réplica.

**Spec:** `docs/superpowers/specs/2026-09-14-on-premise-docker-design.md`

## Global Constraints

- **Un solo contenedor de producto.** Postgres y Redis son contenedores separados del compose (o gestionados por la empresa); NO van dentro del contenedor de app.
- On-prem v1 es **1 réplica**: WebSocket registry y MCP sessions viven en memoria. No escalar el contenedor de app.
- En cloud, `DEPLOYMENT_MODE` queda en `cloud` (default) y las reglas de producción actuales se conservan al pie de la letra. `WEBHOOK_ALLOW_PRIVATE_TARGETS=true` en producción sigue siendo un error de arranque en cloud.
- En on-prem, `WEBHOOK_ALLOW_PRIVATE_TARGETS=true` se permite explícitamente; sin él, el guard sigue bloqueando.
- En on-prem + producción, `SMTP_HOST` no puede ser `localhost`/`127.0.0.1`/`::1` y `APP_URL` debe ser `https://`.
- Las URLs presignadas se reescriben a `MINIO_PUBLIC_URL` **solo si** la variable está definida; si no, comportamiento actual.
- Código, comentarios y mensajes de commit en inglés. Documentos del repo en español.
- `bunx tsc --noEmit` debe seguir saliendo con 0.
- `tests/unit/` no toca PostgreSQL, Redis ni la red.
- `docker compose` siempre; nunca `docker-compose` (espacio).

---

### Task 1: `DEPLOYMENT_MODE` y reglas en `src/env.ts`

**Files:**
- Modify: `src/env.ts`
- Modify: `tests/unit/env.test.ts` (o el fichero donde se teste `envSchema`)
- Modify: `tests/unit/webhook-url-guard.test.ts`

**Interfaces:**
- `DEPLOYMENT_MODE: z.enum(["cloud", "onprem"]).default("cloud")`.
- El rechazo de `WEBHOOK_ALLOW_PRIVATE_TARGETS=true` en producción se restringe a `DEPLOYMENT_MODE === "cloud"`.
- En `onprem` + `NODE_ENV=production`: `SMTP_HOST` distinto de `localhost`, `127.0.0.1`, `::1`.
- En `onprem` + `NODE_ENV=production`: `APP_URL` debe ser `https://`.

- [ ] **Step 1: Añadir `DEPLOYMENT_MODE` al esquema**
- [ ] **Step 2: Ajustar el `superRefine` (webhook guard, SMTP, APP_URL)**
- [ ] **Step 3: Tests unitarios de las combinaciones por modo**
- [ ] **Step 4: Typecheck**

---

### Task 2: `privateTargetsAllowed` con `DEPLOYMENT_MODE`

**Files:**
- Modify: `src/lib/webhook-url-guard.ts`
- Modify: `tests/unit/webhook-url-guard.test.ts`

**Interfaces:**
- `privateTargetsAllowed` mantiene la semántica actual; es `env.ts` quien decide si el valor es legal. Verificar que las pruebas cubren `DEPLOYMENT_MODE` cloud vs onprem.

- [ ] **Step 1: Revisar/ajustar `privateTargetsAllowed` si hace falta**
- [ ] **Step 2: Ampliar tests con `DEPLOYMENT_MODE=onprem`**
- [ ] **Step 3: Typecheck**

---

### Task 3: Reescribir origen de URLs presignadas (`MINIO_PUBLIC_URL`)

**Files:**
- Modify: `src/lib/storage.ts`
- Create: `tests/unit/storage-rewrite.test.ts` (función pura)

**Interfaces:**
- Helper puro `rewritePresignedOrigin(url, publicUrl): string` — reemplaza esquema+host+puerto, conserva ruta y query (la firma).
- `getPresignedUrl` y `getPresignedPutUrl` aplican el rewrite cuando `MINIO_PUBLIC_URL` está definida.
- El helper debe manejar: URL con query de firma, path-style `http://127.0.0.1:9000/bucket/key?...`, IPv6 en el origen.

- [ ] **Step 1: Implementar `rewritePresignedOrigin`**
- [ ] **Step 2: Aplicarlo en `getPresignedUrl` / `getPresignedPutUrl`**
- [ ] **Step 3: Tests unitarios (incluida la rama «sin MINIO_PUBLIC_URL → sin cambio»)**
- [ ] **Step 4: Typecheck**

---

### Task 4: `Dockerfile` — construir `web/` en `production` + target `onprem`

**Files:**
- Modify: `Dockerfile`

**Interfaces:**
- El target `production` hereda lo que hace `Dockerfile.cloudrun` para el frontend (build de `web/` → `web/dist`).
- Nuevo target `onprem` a partir de `production`, que copia el binario de MinIO desde `minio/minio` y el entrypoint on-prem.
- `Dockerfile.cloudrun` NO se toca.

- [ ] **Step 1: Añadir la construcción de `web/` al `Dockerfile` raíz**
- [ ] **Step 2: Añadir stage `minio-source` y target `onprem`**
- [ ] **Step 3: Build local de los targets `production` y `onprem` y verificar `/health`**
- [ ] **Step 4: Verificar que el build de `production` sigue sirviendo la UI (compose raíz)**

---

### Task 5: Entrypoint on-prem

**Files:**
- Create: `docker-entrypoint-onprem.sh`

**Interfaces:**
1. Si `MINIO_EMBEDDED=true` (default): `minio server /data --address 127.0.0.1:9000 --console-address :9001` en segundo plano.
2. Esperar readiness de MinIO (`mc ready local` o `curl` a `:9000`).
3. Migraciones (`bun run db:migrate`), con el mismo aviso tolerante que `docker-entrypoint.sh`.
4. `exec bun run src/index.ts`.

- [ ] **Step 1: Escribir el script**
- [ ] **Step 2: `chmod +x` y verificar con el target `onprem` construido**
- [ ] **Step 3: Probar que MinIO embebido responde y el bucket se crea en el arranque**

---

### Task 6: `docker-compose.onprem.yml` y `.env.onprem.example`

**Files:**
- Create: `docker-compose.onprem.yml`
- Create: `.env.onprem.example`
- Modify: `.gitignore` (si `.env` no está ya cubierto)

**Interfaces:**
- `app`: image/build target `onprem`, `:3000`, `env_file: .env`, volumen `minio-data:/data`, `restart: unless-stopped`, `deploy: replicas: 1`.
- `postgres` y `redis`: sin puertos al host, healthchecks, volúmenes.
- Sin servicio MinIO.
- `.env.onprem.example`: `DEPLOYMENT_MODE=onprem`, `MINIO_EMBEDDED=true`, `MINIO_*` (embebido o externo), `SMTP_*`, `APP_URL`, huecos para los secretos que rellena `admin init-env`.

- [ ] **Step 1: Escribir `docker-compose.onprem.yml`**
- [ ] **Step 2: Escribir `.env.onprem.example`**
- [ ] **Step 3: Levantar el stack on-prem localmente y verificar `/health`**

---

### Task 7: CLI de operador `scripts/admin.ts`

**Files:**
- Create: `scripts/admin.ts`
- Create: `tests/unit/admin.test.ts` (para lo testable sin BD)

**Interfaces:**
- `admin init-env` → genera `.env` desde `.env.onprem.example` rellenando `SESSION_SECRET`, `WEBHOOK_ENCRYPTION_KEY`, credenciales MinIO y SMTP (prompt); valida con `envSchema`.
- `admin create-agent --slug <s> [--name <n>] [--description <d>] [--provider <p>] [--model <m>]` → `registerAgent` e imprime la API key una vez.
- `admin health` → GET `/health` de `APP_URL` y resumen.

- [ ] **Step 1: Implementar `init-env`**
- [ ] **Step 2: Implementar `create-agent` (reusa `registerAgent`)**
- [ ] **Step 3: Implementar `health`**
- [ ] **Step 4: Prueba manual contra el stack on-prem levantado**
- [ ] **Step 5: Typecheck**

---

### Task 8: Smoke on-prem

**Files:**
- Create: `scripts/onprem-smoke.sh`
- Modify: `.github/workflows/ci.yml` (job aparte, con docker disponible)

**Interfaces:**
1. `docker build --target onprem -t agentdialog:onprem .`
2. `docker compose -f docker-compose.onprem.yml up -d`
3. Esperar `/health` verde.
4. `admin create-agent` y ejecutar `createQuery` con esa key.
5. `docker compose -f docker-compose.onprem.yml down`.

- [ ] **Step 1: Escribir el script**
- [ ] **Step 2: Ejecutarlo localmente de punta a punta**
- [ ] **Step 3: Añadir el job de CI**

---

### Task 9: Documentación

**Files:**
- Create: `docs/onprem.md`
- Modify: `AGENTS.md`
- Modify: `docs-site/content/docs/roadmap.mdx`

**Interfaces:**
- `docs/onprem.md` (español): requisitos, `admin init-env`/`create-agent`, SMTP corporativo, reverse proxy/TLS y `X-Forwarded-*`, backup (`pg_dump` + volumen MinIO), upgrade (`compose pull` + `up -d`) y rollback (migraciones no se deshacen), «1 réplica, no escales el contenedor de app», y el matiz de webhooks a red privada.
- `AGENTS.md`: los dos despliegues y dónde vive cada fichero.
- `roadmap.mdx`: modo on-prem en «Available now» cuando la implementación cierre.

- [ ] **Step 1: Escribir `docs/onprem.md`**
- [ ] **Step 2: Actualizar `AGENTS.md`**
- [ ] **Step 3: Actualizar `roadmap.mdx`**

---

### Task 10: Verificación final

- [ ] **Step 1: `bunx tsc --noEmit` en 0**
- [ ] **Step 2: `bunx biome check src/`**
- [ ] **Step 3: Suite unit local** (`bun test tests/unit`)
- [ ] **Step 4: Suite integration local** (`bun test tests/integration`) con Postgres, Redis, MinIO y MailHog del compose dev
- [ ] **Step 5: Smoke on-prem de punta a punta**
- [ ] **Step 6: Revisar que el modo cloud no ha cambiado comportamiento (no `MINIO_PUBLIC_URL`, `DEPLOYMENT_MODE` default cloud)**
