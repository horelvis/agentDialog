# A2A Protocol — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Añadir a AgentDialog un buzón A2A v1.0 entre agentes registrados: cada agente tiene un endpoint propio donde otros agentes le envían tareas, y AgentDialog almacena, enruta y notifica. El humano **no** participa en este flujo.

**Architecture:** Una sub-aplicación Hono montada en `/a2a/:agentSlug` recibe `SendMessage` de clientes A2A y crea tareas en un modelo propio (`a2a_tasks`, `a2a_messages`, `a2a_artifacts`). El agente destinatario consume su buzón por endpoints de agente (`/api/v1/agent/a2a/...`) para leer tareas, actualizar estado y añadir artifacts/mensajes. Los clientes reciben updates por SSE o push webhook. La lógica pura de mapeo A2A vive en `src/lib/a2a/` y la entrega en `src/services/a2a-delivery.service.ts`.

**Tech Stack:** Bun, Hono, Drizzle, zod, Redis, `bun test`. gRPC queda fuera.

**Spec:** `docs/superpowers/specs/2026-09-11-a2a-protocol-design.md`

## Global Constraints

- gRPC binding **no** se implementa.
- `GetExtendedAgentCard` autenticado se declara como `capabilities.extendedAgentCard: false`.
- El `AgentCard` se deriva del registro del agente; `metadata.agentCard` solo puede añadir `skills`, `tags` y `examples`.
- **No se reutiliza el flujo humano.** `a2a_tasks`, `a2a_messages` y `a2a_artifacts` son tablas nuevas. No se tocan `conversations`, `queries` ni `messages` humanos.
- Wire en snake_case según A2A v1.0 (`task_id`, `context_id`, etc.).
- Código, comentarios y mensajes de commit en inglés. Documentos del repo en español.
- `bunx tsc --noEmit` debe seguir saliendo con 0.
- `tests/unit/` no puede tocar PostgreSQL, Redis ni la red.
- Todos los endpoints A2A deben incluirse en el test de cobertura de router de `src/app.ts`.
- **Trampa de resolución de imports en tests:** `bun test` no resuelve imports relativos (`../../src/lib/a2a/...`) desde tests unitarios recién creados en este repo. Usa imports absolutos `@/lib/a2a/...` en `tests/unit/a2a/`.

---

### Task 1: Tipos y mapeo puro A2A

**Files:**
- Create: `src/lib/a2a/types.ts`
- Create: `src/lib/a2a/states.ts`
- Create: `src/lib/a2a/agent-card.ts`
- Create: `src/lib/a2a/jsonrpc.ts` (solo tipos de envelope)
- Create: `tests/unit/a2a/types.test.ts`
- Create: `tests/unit/a2a/states.test.ts`

**Interfaces:**
- TypeScript types/zod schemas para `AgentCard`, `AgentSkill`, `AgentInterface`, `AgentCapabilities`, `Task`, `TaskStatus`, `Message`, `Part`, `Artifact`, `TaskStatusUpdateEvent`, `TaskArtifactUpdateEvent`, `JsonRpcRequest`, `JsonRpcResponse`.
- `a2aStateFromInternal(state: InternalTaskState): string` y `internalStateFromA2a(state: string): InternalTaskState`.
- `buildAgentCard(agent: Agent, baseUrl: string): AgentCard`.
- Validación de que `metadata.agentCard` no sobrescriba campos protegidos.

- [ ] **Step 1: Tests de mapeo de estados**

Casos para `SUBMITTED`, `WORKING`, `INPUT_REQUIRED`, `COMPLETED`, `FAILED`, `CANCELED`, `REJECTED` mapeados a estados internos del buzón.

- [ ] **Step 2: Implementar `states.ts` y `types.ts`**

- [ ] **Step 3: Tests de `buildAgentCard`**

Verifica URLs, `supportedInterfaces`, `capabilities`, skill `agent-dialog-mailbox` por defecto, y rechazo de sobrescritura.

- [ ] **Step 4: Implementar `agent-card.ts`**

- [x] **Step 5: Ejecutar tests**

```bash
bun test tests/unit/a2a
```

Expected: all pass.

---

### Task 2: Esquema de base de datos

**Files:**
- Create: `src/db/schema/a2a-tasks.ts`
- Create: `src/db/schema/a2a-messages.ts`
- Create: `src/db/schema/a2a-artifacts.ts`
- Create: `src/db/schema/a2a-push-configs.ts`
- Create: `src/db/migrations/...a2a_mailbox.sql`

**Interfaces:**
- `a2a_tasks(id, recipient_agent_id, sender_agent_id, context_id, state, status_message, created_at, updated_at)`.
- `a2a_messages(id, task_id, role, parts, created_at)`.
- `a2a_artifacts(id, task_id, parts, index, created_at)`.
- `a2a_push_configs(id, task_id, url, auth_info_hash, created_at, updated_at)`.

Índices clave: `(recipient_agent_id, state)`, `(sender_agent_id)`, `(task_id)` en mensajes/artifacts/push configs.

- [ ] **Step 1: Definir tablas e índices con Drizzle**

- [ ] **Step 2: Generar migración**

```bash
bun run db:generate
```

- [ ] **Step 3: Revisar migración (reversible, sin borrar datos)**

- [ ] **Step 4: Aplicar en local**

```bash
bun run db:migrate
```

---

### Task 3: Servicio de buzón A2A

**Files:**
- Create: `src/services/a2a-mailbox.service.ts`
- Create: `src/services/a2a-delivery.service.ts`
- Create: `tests/unit/a2a/mailbox.test.ts`
- Create: `tests/unit/a2a/delivery.test.ts`

**Interfaces:**
- `sendMessage(recipientAgentId, senderAgentId, request): Task` — crea task, mensaje inicial, estado `submitted`.
- `getTaskAsSender(taskId, senderAgentId): Task` — remitente solo ve sus tareas.
- `getTaskAsRecipient(taskId, recipientAgentId): Task` — destinatario ve todo lo dirigido a él.
- `listTasksAsSender(senderAgentId, contextId?): Task[]`.
- `listTasksAsRecipient(recipientAgentId, filters): Task[]`.
- `cancelTaskAsSender(taskId, senderAgentId): Task`.
- `cancelTaskAsRecipient(taskId, recipientAgentId): Task`.
- `updateTaskStatus(recipientAgentId, taskId, statusUpdate): Task`.
- `addTaskArtifact(recipientAgentId, taskId, artifact): Artifact`.
- `addTaskMessage(recipientAgentId, taskId, message): Message`.
- `createPushConfig(...)`, `getPushConfig(...)`, `listPushConfigs(...)`, `deletePushConfig(...)`.

Reglas de negocio:
- El remitente solo puede leer/cancelar tareas que él envió.
- El destinatario puede leer/actualizar/cancelar cualquier tarea dirigida a él.
- `SendMessage` inicial siempre crea estado `submitted`; el destinatario lo pasa a `working` cuando empiece.
- Cada cambio de estado o artifact dispara notificación a push configs y publicación en Redis para SSE.

- [ ] **Step 1: Tests con base de datos en memoria (Drizzle SQLite/memory)**

- [ ] **Step 2: Implementar `a2a-mailbox.service.ts`**

- [ ] **Step 3: Implementar `a2a-delivery.service.ts` (push + Redis pub)**

- [ ] **Step 4: Tests de autorización (sender vs recipient)**

- [ ] **Step 5: Ejecutar tests unitarios**

```bash
bun test tests/unit/a2a
```

---

### Task 4: Auth A2A

**Files:**
- Create: `src/middleware/a2a-auth.ts`
- Create: `tests/unit/a2a/auth.test.ts`

**Interfaces:**
- `a2aClientAuth(c, next)` — valida API key, resuelve `senderAgentId`, continúa.
- `a2aRecipientAuth(c, next)` — valida API key, resuelve `recipientAgentId`, verifica que coincide con `:agentSlug`.
- `a2aAgentOwnerAuth(c, next)` — para endpoints `/api/v1/agent/a2a/...`: valida API key del destinatario y resuelve `recipientAgentId`.

- [ ] **Step 1: Implementar middleware reutilizando auth de agentes existente**

- [ ] **Step 2: Tests con keys válidas, inválidas y de otro agente**

---

### Task 5: Routes A2A HTTP+JSON/REST (cliente → buzón)

**Files:**
- Create: `src/routes/a2a/index.ts`
- Create: `src/routes/a2a/agent-card.ts`
- Create: `src/routes/a2a/tasks.ts`
- Create: `src/routes/a2a/stream.ts`
- Create: `tests/integration/a2a-http.test.ts`

**Interfaces:**
- `GET /a2a/:agentSlug/.well-known/agent.json` → `AgentCard` (público).
- `POST /a2a/:agentSlug/message:send` → `SendMessage`, autenticado como remitente.
- `POST /a2a/:agentSlug/message:stream` → SSE, autenticado como remitente.
- `GET /a2a/:agentSlug/tasks/:id` → `GetTask` como remitente.
- `GET /a2a/:agentSlug/tasks?contextId=...` → `ListTasks` como remitente.
- `POST /a2a/:agentSlug/tasks/:id:cancel` → `CancelTask` como remitente.
- Push config routes bajo `/a2a/:agentSlug/tasks/:id/pushNotificationConfigs`.

Errores en RFC 7807.

- [ ] **Step 1: Implementar agent card público**

- [ ] **Step 2: Implementar `message:send` y `tasks/:id` para remitente**

- [ ] **Step 3: Implementar listado y cancelación para remitente**

- [ ] **Step 4: Implementar SSE streaming sobre Redis**

- [ ] **Step 5: Tests de integración sobre HTTP real**

```bash
bun test tests/integration/a2a-http.test.ts
```

---

### Task 6: Routes de agente destinatario (owner del buzón)

**Files:**
- Create: `src/routes/agent/a2a.ts`
- Create: `tests/integration/a2a-owner.test.ts`

**Interfaces:**
- `GET /api/v1/agent/a2a/tasks` → listar tareas dirigidas al agente autenticado.
- `GET /api/v1/agent/a2a/tasks/:id` → leer tarea dirigida al agente autenticado.
- `POST /api/v1/agent/a2a/tasks/:id/status` → actualizar estado (`working`, `input_required`, `completed`, `failed`).
- `POST /api/v1/agent/a2a/tasks/:id/artifacts` → añadir artifact.
- `POST /api/v1/agent/a2a/tasks/:id/messages` → añadir mensaje (multi-turn).
- `POST /api/v1/agent/a2a/tasks/:id/cancel` → cancelar tarea del buzón.

- [ ] **Step 1: Implementar listado y lectura de tareas recibidas**

- [ ] **Step 2: Implementar actualización de estado**

- [ ] **Step 3: Implementar añadir artifacts y mensajes**

- [ ] **Step 4: Tests de integración del flujo completo cliente → buzón → destinatario → cliente**

```bash
bun test tests/integration/a2a-owner.test.ts
```

---

### Task 7: JSON-RPC binding

**Files:**
- Create: `src/routes/a2a/jsonrpc.ts`
- Create: `src/lib/a2a/jsonrpc-dispatcher.ts`
- Create: `tests/unit/a2a/jsonrpc.test.ts`
- Create: `tests/integration/a2a-jsonrpc.test.ts`

**Interfaces:**
- `POST /a2a/:agentSlug/` lee `jsonrpc`, `method`, `id`, `params`.
- Dispatcher a `SendMessage`, `SendStreamingMessage`, `GetTask`, `ListTasks`, `CancelTask`, métodos de push config.
- Errores JSON-RPC 2.0 y errores A2A mapeados.
- Streaming JSON-RPC como SSE.

- [ ] **Step 1: Implementar dispatcher puro con tests unitarios**

- [ ] **Step 2: Montar endpoint JSON-RPC en sub-aplicación A2A**

- [ ] **Step 3: Tests de integración JSON-RPC**

```bash
bun test tests/integration/a2a-jsonrpc.test.ts
```

---

### Task 8: Push notifications A2A

**Files:**
- Modify: `src/services/a2a-delivery.service.ts`
- Create: `src/lib/a2a/push-payload.ts`
- Create: `tests/unit/a2a/push-payload.test.ts`
- Create: `tests/integration/a2a-push.test.ts`

**Interfaces:**
- `createPushConfig(taskId, senderAgentId, url, authInfo)` — guarda config.
- Envío de `TaskStatusUpdateEvent` y `TaskArtifactUpdateEvent` por POST.
- Reutilizar validación de URL pública de `webhook.service.ts`.

- [ ] **Step 1: Implementar serialización de payloads push**

- [ ] **Step 2: Conectar delivery service con cambios de task/artifact**

- [ ] **Step 3: Tests de integración con webhook de prueba**

---

### Task 9: Cobertura de router, typecheck y lint

**Files:**
- Modify: `src/app.ts` — montar `/a2a/:agentSlug` y `/api/v1/agent/a2a/*`.
- Modify: tests de router coverage si es necesario.

- [ ] **Step 1: Montar sub-aplicaciones A2A en `src/app.ts`**

- [ ] **Step 2: Asegurar router coverage test incluye rutas A2A**

- [ ] **Step 3: Typecheck**

```bash
bunx tsc --noEmit
```

- [ ] **Step 4: Lint**

```bash
bun run lint
```

- [ ] **Step 5: Suite completa local**

```bash
redis-cli -n 1 FLUSHDB
bun test tests/unit tests/integration
```

---

### Task 10: Documentación de integradores

**Files:**
- Create: `docs-site/content/docs/a2a.mdx`
- Modify: `docs-site/content/docs/roadmap.mdx` — marcar A2A como en progreso/available según estado.
- Modify: `docs/api/README.md` — sección A2A en español.

**Interfaces:**
- Ejemplo de `AgentCard`.
- Ejemplo de `SendMessage` y actualización por el destinatario.
- Diagrama de flujo cliente → buzón → destinatario → cliente.

Nota: esta tarea se hace al final, cuando los endpoints existen y los tests pasan. No se documenta lo que aún no está en `main`.
