# A2A Protocol — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Exponer cada agente registrado en AgentDialog como un remote agent A2A v1.0, con HTTP+JSON/REST y JSON-RPC bindings, de forma que un agente cliente pueda descubrirlo por su `AgentCard` y delegar decisiones humanas como tareas A2A.

**Architecture:** Una sub-aplicación Hono montada en `/a2a/:agentSlug` deriva el `AgentCard` del agente, despacha mensajes a `a2a.service.ts`, y ese servicio mapea objetos A2A a llamadas de `query.service.ts`. El ciclo de vida de una tarea A2A es el mismo de una query tipada; los updates via SSE o push webhook se alimentan de los mismos eventos internos que usa el chat. La lógica pura de mapeo vive en `src/lib/a2a/` para que los dos bindings compartan código.

**Tech Stack:** Bun, Hono, Drizzle, zod, Redis, `bun test`. gRPC queda fuera.

**Spec:** `docs/superpowers/specs/2026-09-11-a2a-protocol-design.md`

## Global Constraints

- gRPC binding **no** se implementa. Bun no lo soporta de primera clase y no justifica la complejidad en v1.0.
- `GetExtendedAgentCard` autenticado se declara como `capabilities.extendedAgentCard: false` en el `AgentCard` público.
- El `AgentCard` se deriva del registro del agente; el campo `metadata.agentCard` solo puede añadir `skills`, `tags` y `examples`, nunca endpoints ni capacidades.
- Cada tarea A2A se mapea **uno a uno** a una query tipada. `contextId` se usa como `conversationId` cuando viene; si no, se crea una conversación nueva.
- Estados A2A fijos del spec v1.0; su mapeo a estados de query se centraliza en `src/lib/a2a/states.ts`.
- Wire en snake_case según el spec A2A (por ejemplo `task_id`, `context_id`). El SDK propio los traducirá en v1.0 si añadimos subpath `@agentdialog/sdk/a2a`.
- Código, comentarios y mensajes de commit en inglés. Documentos del repo en español.
- `bunx tsc --noEmit` debe seguir saliendo con 0.
- `tests/unit/` no puede tocar PostgreSQL, Redis ni la red.
- Todos los endpoints A2A deben incluirse en el test de cobertura de router de `src/app.ts`.

---

### Task 1: Tipos y mapeo puro A2A

**Files:**
- Create: `src/lib/a2a/types.ts`
- Create: `src/lib/a2a/states.ts`
- Create: `src/lib/a2a/agent-card.ts`
- Create: `tests/unit/a2a/types.test.ts`
- Create: `tests/unit/a2a/states.test.ts`

**Interfaces:**
- Typescript types/zod schemas para `AgentCard`, `AgentSkill`, `AgentInterface`, `AgentCapabilities`, `Task`, `TaskStatus`, `Message`, `Part`, `Artifact`, `TaskStatusUpdateEvent`, `TaskArtifactUpdateEvent`.
- `toAgentDialogQueryState(a2aState: string): QueryState` y `toA2ATaskState(queryState: QueryState, metadata?: {...}): string`.
- `buildAgentCard(agent: Agent): AgentCard`.
- Validación de que un `DataPart` contiene los campos mínimos para `human_query`.

- [ ] **Step 1: Escribir los tests de mapeo de estados**

Crea `tests/unit/a2a/states.test.ts` con casos para `SUBMITTED`, `WORKING`, `INPUT_REQUIRED`, `COMPLETED`, `FAILED`, `CANCELED`, `REJECTED`, incluyendo el mapeo desde estados de query (`pending`, `assigned`, `answered`, `needs_context`, `cancelled`, `expired`, `rejected`).

- [ ] **Step 2: Implementar `states.ts`**

- [ ] **Step 3: Escribir tests de `AgentCard`**

Verifica que `buildAgentCard` produce URLs correctas, `protocolBinding` `HTTP+JSON` y `JSONRPC`, y rechaza un `metadata.agentCard` que intente sobrescribir `supportedInterfaces` o `capabilities`.

- [ ] **Step 4: Implementar `agent-card.ts` y `types.ts`**

- [ ] **Step 5: Ejecutar tests unitarios**

```bash
bun test tests/unit/a2a
```

Expected: all pass.

---

### Task 2: Servicio A2A

**Files:**
- Create: `src/services/a2a.service.ts`
- Create: `tests/unit/a2a/service.test.ts` (con mocks de query/conversation/webhook)

**Interfaces:**
- `sendMessage(agentId: string, requesterId: string, request: SendMessageRequest): Promise<Task | Message>`
- `getTask(agentId: string, requesterId: string, taskId: string): Promise<Task>`
- `listTasks(agentId: string, requesterId: string, contextId?: string): Promise<Task[]>`
- `cancelTask(agentId: string, requesterId: string, taskId: string): Promise<Task>`
- `createPushConfig(...)`, `getPushConfig(...)`, `listPushConfigs(...)`, `deletePushConfig(...)`

Reglas de negocio:
- `sendMessage` extrae del `DataPart` los campos de query, llama a `createQuery`, y devuelve un `Task` en `SUBMITTED`.
- Si la admisión rechaza la query, el task queda en `REJECTED` con el mensaje de error en `status.message`.
- `requesterId` se deriva del hash de la API key usada; se guarda junto a la query para autorizar `listTasks` y `getTask` posteriores.
- `cancelTask` solo cancela tareas creadas por el mismo `requesterId`.

- [ ] **Step 1: Tests de `sendMessage` con mocks**

- [ ] **Step 2: Implementar `a2a.service.ts`**

- [ ] **Step 3: Tests de cancelación y listado**

- [ ] **Step 4: Ejecutar tests unitarios**

```bash
bun test tests/unit/a2a
```

---

### Task 3: Esquema de base de datos para push configs y requester

**Files:**
- Create: `src/db/schema/a2a-tasks.ts`
- Create: `src/db/schema/a2a-push-configs.ts`
- Modify: `src/db/schema/queries.ts` — añadir `a2a_requester_id` opcional.
- Create: `src/db/migrations/...a2a_tasks_and_push_configs.sql`

**Interfaces:**
- Tabla `a2a_tasks` solo si necesitamos datos propios de A2A no cubiertos por queries. En v1.0 se puede almacenar todo en la query; esta tabla es opcional.
- Tabla `a2a_push_configs(task_id, url, auth_info_hash, created_at, updated_at)`.

- [ ] **Step 1: Añadir columnas a `queries` y crear tablas**

- [ ] **Step 2: Generar migración**

```bash
bun run db:generate
```

- [ ] **Step 3: Revisar que la migración sea reversible y no borre datos**

- [ ] **Step 4: Aplicar migración en local**

```bash
bun run db:migrate
```

---

### Task 4: Routes A2A HTTP+JSON/REST

**Files:**
- Create: `src/routes/a2a/index.ts` — entry point con `:agentSlug`.
- Create: `src/routes/a2a/agent-card.ts`
- Create: `src/routes/a2a/tasks.ts`
- Create: `src/routes/a2a/stream.ts`
- Create: `tests/integration/a2a-http.test.ts`

**Interfaces:**
- `GET /a2a/:agentSlug/.well-known/agent.json` → `AgentCard`.
- `POST /a2a/:agentSlug/message:send` → `Task` o `Message`.
- `POST /a2a/:agentSlug/message:stream` → SSE.
- `GET /a2a/:agentSlug/tasks/:id` → `Task`.
- `GET /a2a/:agentSlug/tasks?contextId=...` → `Task[]`.
- `POST /a2a/:agentSlug/tasks/:id:cancel` → `Task`.
- Push config routes bajo `/a2a/:agentSlug/tasks/:id/pushNotificationConfigs`.

Autenticación: middleware A2A API key en todas las rutas excepto `/.well-known/agent.json`. La key debe corresponder al `agentSlug`.

- [ ] **Step 1: Implementar agent card público**

- [ ] **Step 2: Implementar auth middleware A2A**

- [ ] **Step 3: Implementar `message:send` y `tasks/:id`**

- [ ] **Step 4: Implementar listado y cancelación**

- [ ] **Step 5: Implementar SSE streaming**

- [ ] **Step 6: Tests de integración sobre HTTP real**

```bash
bun test tests/integration/a2a-http.test.ts
```

---

### Task 5: JSON-RPC binding

**Files:**
- Create: `src/routes/a2a/jsonrpc.ts`
- Create: `src/lib/a2a/jsonrpc.ts`
- Create: `tests/unit/a2a/jsonrpc.test.ts`
- Create: `tests/integration/a2a-jsonrpc.test.ts`

**Interfaces:**
- `POST /a2a/:agentSlug/` lee `jsonrpc`, `method`, `id`, `params`.
- Dispatcher a `SendMessage`, `SendStreamingMessage`, `GetTask`, `ListTasks`, `CancelTask`, métodos de push config.
- Errores JSON-RPC 2.0 (`-32600` a `-32603`) y errores A2A (`TaskNotFoundError`, etc.).
- Streaming JSON-RPC se sirve como SSE igual que en HTTP binding.

- [ ] **Step 1: Implementar dispatcher puro con tests unitarios**

- [ ] **Step 2: Montar endpoint JSON-RPC en la sub-aplicación A2A**

- [ ] **Step 3: Tests de integración JSON-RPC**

```bash
bun test tests/integration/a2a-jsonrpc.test.ts
```

---

### Task 6: Push notifications A2A

**Files:**
- Modify: `src/services/a2a.service.ts`
- Create: `src/services/a2a-push.service.ts`
- Create: `tests/unit/a2a/push.test.ts`
- Create: `tests/integration/a2a-push.test.ts`

**Interfaces:**
- `createPushConfig` guarda URL y token hash.
- Cuando `query.service.ts` emite un evento de cambio de estado, `a2a-push.service.ts` busca configs para ese `taskId` y envía POST con `TaskStatusUpdateEvent` o `TaskArtifactUpdateEvent`.
- Reutilizar la validación de URL pública de `webhook.service.ts`.

- [ ] **Step 1: Crear tabla y tests unitarios de serialización de payload push**

- [ ] **Step 2: Implementar `a2a-push.service.ts`**

- [ ] **Step 3: Conectar con eventos de query**

- [ ] **Step 4: Tests de integración con webhook de prueba**

---

### Task 7: Cobertura de router, typecheck y lint

**Files:**
- Modify: `src/app.ts` — montar `/a2a/:agentSlug`.
- Modify: tests de cobertura de router si es necesario.

- [ ] **Step 1: Montar sub-aplicación A2A en `src/app.ts`**

- [ ] **Step 2: Asegurar que el test de router coverage incluye rutas A2A**

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

### Task 8: Documentación de integradores

**Files:**
- Create: `docs-site/content/docs/a2a.mdx`
- Modify: `docs-site/content/docs/roadmap.mdx` — marcar A2A como en progreso si se implementa.
- Modify: `docs/api/README.md` — sección A2A en español.

**Interfaces:**
- Ejemplo de `AgentCard`.
- Ejemplo de `SendMessage` con HTTP+JSON y JSON-RPC.
- Mapeo de estados y timeouts.

Nota: esta tarea se hace al final, cuando los endpoints ya existen y los tests pasan. No se documenta lo que aún no está en `main`.
