# Contrato de colaboración y notificación push de proyecto — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que coordinar agentes A2A deje de ser mecánico: un contrato de colaboración definido por el master y accesible por URL compartida, y webhooks de proyecto con entrega fiable (`task_new` al destinatario, `task_status`/`artifact`/`message` al remitente, reintentos + `eventId`).

**Architecture:**

- `a2a_project_shares` (token de contrato, patrón `query_grants`) + `GET /a2a/projects/{id}/contract?token=…`.
- `a2a_project_push_configs` (un callback por participante por proyecto) + `POST|GET|DELETE /api/v1/agent/projects/{id}/push`.
- Enrutado de eventos en `a2a-mailbox.service.ts` (via `metadata.projectId` de la tarea) y entrega con reintentos en `a2a-delivery.service.ts`.
- Se eliminan los push configs por tarea y la tabla `a2a_push_configs` (rompedor, feature joven y self-service).

**Tech Stack:** Bun, Hono, Drizzle, zod, Redis (SSE sigue igual), `bun test`.

**Spec:** `docs/superpowers/specs/2026-09-14-a2a-project-contract-design.md`

## Global Constraints

- Webhooks **solo a nivel de proyecto**; los per-tarea se eliminan (endpoints y tabla).
- `task_new` → destinatario; `task_status`/`task_artifact`/`task_message` → remitente.
- Un participante solo gestiona **su propio** callback de proyecto.
- El contrato deriva los campos de confianza del hub; el master aporta roles y `rules` (metadata).
- Entrega con reintentos (backoff 1s/5s), timeout, `redirect: manual`, `eventId` por notificación.
- La URL del webhook se inspecciona al escribir y en cada entrega; en on-prem se respeta red privada.
- El SSE y los webhooks de agente no se tocan.
- Código, comentarios y commits en inglés. Documentos del repo en español.
- `bunx tsc --noEmit` en 0. `tests/unit/` no toca BD ni red.

---

### Task 1: Token de contrato y esquema de proyecto

**Estado:** ✅ completado.

**Files:**
- Create: `src/db/schema/a2a-project-shares.ts`
- Create: `src/db/schema/a2a-project-push-configs.ts`
- Modify: `src/db/schema/agent-projects.ts` (columna `contract_rules` text)
- Modify: `src/db/schema/index.ts`
- Create: `migrations/0014_a2a_project_contract.sql` + registro en `migrations/meta/_journal.json`
- Create: `src/lib/a2a/project-contract-token.ts` (generación/prefix/verificación, patrón `query-grant-token.ts`)
- Create: `tests/unit/a2a/project-contract-token.test.ts`

**Interfaces:**
- `a2a_project_shares(project_id, token_prefix, token_hash, timestamps)`
- `a2a_project_push_configs(project_id, agent_id, url, auth_info, timestamps, unique(project_id, agent_id))`
- `agent_projects.contract_rules` (text, el Markdown de las reglas)
- `generateProjectShareToken(): string` (prefijo `a2p_`)
- `projectShareTokenPrefix(token): string`

- [x] **Step 1: Esquemas Drizzle + columna + index export**
- [x] **Step 2: Migración 0014 escrita a mano (crea ambas tablas, añade la columna, dropea `a2a_push_configs`) y registrada en el journal**
- [x] **Step 3: Helpers de token con tests**

---

### Task 2: Contrato de colaboración

**Estado:** ✅ completado.

**Files:**
- Create: `src/lib/a2a/project-contract.ts` (`buildProjectContract`, `contractParticipant`)
- Create: `src/services/a2a-project-share.service.ts` (share + reglas + resolución)
- Create: `src/routes/a2a/project-contract.ts` (`GET /a2a/projects/:id/contract?token=…`)
- Modify: `src/routes/agent/projects.ts` (`POST /:id/share`, `POST /:id/contract-rules`)
- Modify: `src/app.ts` (montar ruta pública antes de `/a2a/:agentSlug`)
- Create: `tests/unit/a2a/project-contract.test.ts`

**Interfaces:**
- `buildProjectContract(project, lead, participants, apiBaseUrl): ProjectContract`
- `createProjectShare(projectId, leadAgentId, apiBaseUrl): { token, shareUrl }`
- `setProjectContractRules(projectId, leadAgentId, markdown): void`
- `resolveProjectContract(token, projectId, apiBaseUrl): ProjectContract`
- `GET /a2a/projects/:id/contract` con `?token=`

- [x] **Step 1: `buildProjectContract` (campos derivados + `rules` Markdown) + tests**
- [x] **Step 2: Share y reglas en el servicio (solo lead) + tests**
- [x] **Step 3: Ruta pública del contrato + montaje + tests de integración**

---

### Task 3: Webhooks de proyecto (servicio)

**Estado:** ✅ completado.

**Files:**
- Create: `src/services/a2a-project-push.service.ts`
- Create: `tests/unit/a2a/project-push.test.ts`

**Interfaces:**
- `upsertProjectPushConfig(projectId, agentId, url, authInfo?): PublicProjectPushConfig`
- `getProjectPushConfig(projectId, agentId): PublicProjectPushConfig | null`
- `deleteProjectPushConfig(projectId, agentId): void`
- `getProjectPushConfigFor(projectId, agentId): PushConfig | null` (para entrega)
- Guard de participación: solo miembros activos del proyecto registran callback.

- [x] **Step 1: Servicio con upsert/get/delete**
- [x] **Step 2: Inspección de URL (escribir y entrega)**
- [x] **Step 3: Tests (participación, validación, upsert — vía integración y unit de entrega)**

---

### Task 4: Routes de webhook de proyecto

**Estado:** ✅ completado. Las rutas viven en `src/routes/agent/projects.ts` (mismo surface, sin duplicar `basePath` de `documented()`).

**Files:**
- Modify: `src/routes/agent/projects.ts`
- Create: `tests/integration/a2a-http.test.ts` (bloque de push de proyecto)

**Interfaces:**
- `POST /api/v1/agent/projects/:id/push` (upsert propio)
- `GET /api/v1/agent/projects/:id/push` (el propio)
- `DELETE /api/v1/agent/projects/:id/push`

- [x] **Step 1: Routes autenticadas (participante)**
- [x] **Step 2: Montaje + router coverage (44 rutas documentadas)**
- [x] **Step 3: Tests de integración**

---

### Task 5: Entrega con reintentos y `eventId`

**Estado:** ✅ completado.

**Files:**
- Modify: `src/services/a2a-delivery.service.ts`
- Modify: `tests/unit/a2a/delivery.test.ts`

**Interfaces:**
- Envelope pasa a `{ event, eventId, projectId, taskId, payload, timestamp }`.
- `deliverProjectPushNotifications(configs, envelope, opts?)`: reintentos con backoff, timeout, `redirect: manual`, auth bearer, guard de URL en cada entrega.
- `eventId` por notificación (uuid), estable para el mismo evento.

- [x] **Step 1: Envelope con `eventId` y `projectId`/`taskId`**
- [x] **Step 2: Entrega con reintentos + tests (fallo→reintento, success→stop, redirect, error de red)**

---

### Task 6: Enrutado de eventos en el buzón

**Estado:** ✅ completado.

**Files:**
- Modify: `src/services/a2a-mailbox.service.ts`
- Modify: `tests/integration/a2a-multiturn.test.ts` (flujo de proyecto completo)

**Interfaces:**
- En `sendMessage`: si `task.metadata.projectId` existe → `notifyTaskNew(recipient, task, projectId)` → webhook del destinatario.
- En `notifyTaskChange`: buscar el proyecto de la tarea (via `metadata.projectId`) → webhook del **remitente**; si no hay callback, no se entrega.
- Se eliminan `createPushConfig/getPushConfig/listPushConfigs/deletePushConfig/fetchPushConfigs` y el uso de `a2aPushConfigs`.

- [x] **Step 1: `notifyTaskNew` en el servicio de entrega**
- [x] **Step 2: `notifyTaskChange` enrutada al remitente por proyecto**
- [x] **Step 3: Eliminar funciones y tabla de push por tarea**
- [x] **Step 4: Tests (multiturn: `task_new`/`task_status`/`task_message`/`task_artifact` llegan al webhook de proyecto)**

---

### Task 7: Limpiar rutas de push por tarea

**Estado:** ✅ completado.

**Files:**
- Modify: `src/routes/a2a/tasks.ts` (quitados los 4 endpoints de push)
- Modify: `tests/integration/a2a-http.test.ts` y `a2a-multiturn.test.ts` (pasados a nivel proyecto)
- Modify: `src/db/schema/index.ts` (quitar export de `a2aPushConfigs`) + borrado `src/db/schema/a2a-push-configs.ts`

- [x] **Step 1: Quitar rutas y schema**
- [x] **Step 2: Actualizar tests afectados**

---

### Task 8: Migración y verificación local

- [x] **Step 1: Aplicar `0014` en la BD dev y test**
- [x] **Step 2: `bunx tsc --noEmit` en 0**
- [x] **Step 3: `bunx biome check src/`**
- [x] **Step 4: Suite unit + integration verde** (478 tests)
- [x] **Step 5: Flujo de integración: share → contrato → webhook de proyecto → `task_new`/`task_status`**

---

### Task 9: Documentación

**Files:**
- Modify: `docs-site/content/docs/a2a.mdx` (sección de contrato de proyecto y webhooks de proyecto; quitar/actualizar push por tarea)
- Modify: `docs-site/content/docs/agent-projects.mdx`
- Modify: `docs-site/content/docs/roadmap.mdx` (mención al contrato de colaboración)

- [ ] **Step 1: Documentar el contrato de proyecto**
- [ ] **Step 2: Documentar los webhooks de proyecto y la desaparición de los per-tarea**
- [ ] **Step 3: Actualizar roadmap**

---

### Task 10: Verificación final

- [ ] **Step 1: Typecheck + lint**
- [ ] **Step 2: Suite completa local**
- [ ] **Step 3: Revisar que SSE, buzón genérico y webhooks de agente no cambian**