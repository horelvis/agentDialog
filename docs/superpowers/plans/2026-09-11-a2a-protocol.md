# Colaboración agente-agente distribuida — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que agentes registrados en AgentDialog, corriendo en ordenadores diferentes, colaboren en proyectos con subtareas. A2A v1.0 es el protocolo de red; AgentDialog es el hub que retiene buzones y proyectos.

**Architecture:**

- Capa de red A2A (`src/lib/a2a/`, `src/routes/a2a/`, `src/services/a2a-mailbox.service.ts`).
- Buzón central: tablas `a2a_tasks`, `a2a_messages`, `a2a_artifacts`, `a2a_push_configs`.
- Proyectos: tablas `projects`, `project_participants`, `project_tasks`.
- Servicio de proyectos (`src/services/agent-project.service.ts`) orquesta subtareas usando el buzón A2A.
- Notificaciones push reutilizan `webhook.service.ts`.

**Tech Stack:** Bun, Hono, Drizzle, zod, Redis, `bun test`. gRPC queda fuera.

**Spec:** `docs/superpowers/specs/2026-09-11-a2a-protocol-design.md`

## Global Constraints

- A2A es **transporte**, no orquestador. AgentDialog no ejecuta subtareas, solo las guarda y notifica.
- Cada agente usa su propia API key `mge_ag_` tanto para enviar como para recibir.
- Un agente remoto no necesita exponer servidor propio: consume su buzón por polling o webhook.
- gRPC binding **no** se implementa.
- Wire A2A en snake_case/camelCase según spec v1.0.
- Código, comentarios y mensajes de commit en inglés. Documentos del repo en español.
- `bunx tsc --noEmit` debe seguir saliendo con 0.
- `tests/unit/` no toca PostgreSQL, Redis ni la red.
- **Trampa de resolución de imports en tests:** usar imports absolutos `@/lib/a2a/...` en `tests/unit/a2a/`.

---

### Task 1: Tipos y mapeo puro A2A

**Estado:** ✅ completado.

- `src/lib/a2a/types.ts`
- `src/lib/a2a/states.ts`
- `src/lib/a2a/agent-card.ts`
- Tests en `tests/unit/a2a/`.

---

### Task 2: Esquema de base de datos A2A mailbox

**Estado:** ✅ tablas definidas. ⬜ migración pendiente de PostgreSQL local.

**Files:**
- Create: `src/db/schema/a2a-tasks.ts`
- Create: `src/db/schema/a2a-messages.ts`
- Create: `src/db/schema/a2a-artifacts.ts`
- Create: `src/db/schema/a2a-push-configs.ts`
- Modify: `src/db/schema/enums.ts`
- Modify: `src/db/schema/index.ts`
- Create: `migrations/0011_a2a_mailbox.sql` (pendiente)

- [x] **Step 1: Definir tablas e índices con Drizzle**
- [ ] **Step 2: Generar migración** (requiere `docker compose -f docker-compose.dev.yml up -d postgres`)
- [ ] **Step 3: Revisar migración**
- [ ] **Step 4: Aplicar en local**

---

### Task 3: Servicio de buzón A2A

**Files:**
- Create: `src/services/a2a-mailbox.service.ts`
- Create: `src/services/a2a-delivery.service.ts`
- Create: `tests/unit/a2a/mailbox.test.ts`
- Create: `tests/unit/a2a/delivery.test.ts`

**Interfaces:**
- `sendMessage(recipientAgentId, senderAgentId, request): Task`
- `getTaskAsSender(taskId, senderAgentId): Task`
- `getTaskAsRecipient(taskId, recipientAgentId): Task`
- `listTasksAsSender(senderAgentId, filters): Task[]`
- `listTasksAsRecipient(recipientAgentId, filters): Task[]`
- `cancelTaskAsSender(taskId, senderAgentId): Task`
- `cancelTaskAsRecipient(taskId, recipientAgentId): Task`
- `updateTaskStatus(recipientAgentId, taskId, status): Task`
- `addTaskMessage(recipientAgentId, taskId, message): Message`
- `addTaskArtifact(recipientAgentId, taskId, artifact): Artifact`
- Push config CRUD.
- Delivery: publicar en Redis para SSE; enviar webhooks A2A.

- [ ] **Step 1: Implementar `a2a-mailbox.service.ts` y helpers puros**
- [ ] **Step 2: Implementar `a2a-delivery.service.ts` con Redis y webhook**
- [ ] **Step 3: Tests unitarios de serialización de Task/Message/Artifact**
- [ ] **Step 4: Tests de delivery con mocks de fetch y Redis**

---

### Task 4: Auth A2A

**Files:**
- Create: `src/middleware/a2a-auth.ts`

**Interfaces:**
- Autenticar remitente en `/a2a/:agentSlug/*`.
- Autenticar destinatario en `/api/v1/agent/a2a/*`.
- Verificar que el destinatario de la URL existe y coincide con la key (cuando aplica).

- [ ] **Step 1: Middleware remitente**
- [ ] **Step 2: Middleware destinatario**
- [ ] **Step 3: Tests unitarios**

---

### Task 5: Routes A2A HTTP+JSON/REST (red pública)

**Files:**
- Create: `src/routes/a2a/index.ts`
- Create: `src/routes/a2a/agent-card.ts`
- Create: `src/routes/a2a/tasks.ts`
- Create: `src/routes/a2a/stream.ts`
- Create: `tests/integration/a2a-http.test.ts`

**Interfaces:**
- `GET /a2a/:agentSlug/.well-known/agent.json`
- `POST /a2a/:agentSlug/message:send`
- `POST /a2a/:agentSlug/message:stream` (SSE)
- `GET /a2a/:agentSlug/tasks/:id`
- `GET /a2a/:agentSlug/tasks`
- `POST /a2a/:agentSlug/tasks/:id:cancel`
- Push config routes.

- [ ] **Step 1: Agent Card público**
- [ ] **Step 2: SendMessage y GetTask**
- [ ] **Step 3: ListTasks y CancelTask**
- [ ] **Step 4: SSE streaming**
- [ ] **Step 5: Tests de integración**

---

### Task 6: Routes de agente destinatario (owner del buzón)

**Files:**
- Create: `src/routes/agent/a2a.ts`
- Create: `tests/integration/a2a-owner.test.ts`

**Interfaces:**
- `GET /api/v1/agent/a2a/tasks`
- `GET /api/v1/agent/a2a/tasks/:id`
- `POST /api/v1/agent/a2a/tasks/:id/status`
- `POST /api/v1/agent/a2a/tasks/:id/artifacts`
- `POST /api/v1/agent/a2a/tasks/:id/messages`
- `POST /api/v1/agent/a2a/tasks/:id/cancel`

- [ ] **Step 1: Lectura del buzón**
- [ ] **Step 2: Actualizar estado y añadir artifacts/mensajes**
- [ ] **Step 3: Tests de integración del flujo completo**

---

### Task 7: JSON-RPC binding

**Files:**
- Create: `src/routes/a2a/jsonrpc.ts`
- Create: `src/lib/a2a/jsonrpc-dispatcher.ts`
- Create: `tests/integration/a2a-jsonrpc.test.ts`

- [ ] **Step 1: Dispatcher JSON-RPC**
- [ ] **Step 2: Endpoint `/a2a/:agentSlug/` con envelope**
- [ ] **Step 3: Tests de integración**

---

### Task 8: Esquema de proyectos colaborativos

**Files:**
- Create: `src/db/schema/agent-projects.ts`
- Create: `src/db/schema/agent-project-participants.ts`
- Create: `src/db/schema/agent-project-tasks.ts`
- Modify: `src/db/schema/index.ts`
- Create: migración correspondiente (con PostgreSQL local)

**Interfaces:**
- `projects(id, name, description, status, lead_agent_id, metadata, timestamps)`
- `project_participants(project_id, agent_id, role, status)`
- `project_tasks(project_id, a2a_task_id, title, description, assignee_agent_id, status, timestamps)`

- [ ] **Step 1: Definir tablas**
- [ ] **Step 2: Generar y aplicar migración**
- [ ] **Step 3: Tests de validación de estados del proyecto**

---

### Task 9: Servicio de proyectos

**Files:**
- Create: `src/services/agent-project.service.ts`
- Create: `tests/unit/agent-project.test.ts`
- Create: `tests/integration/agent-project.test.ts`

**Interfaces:**
- `createProject(leadAgentId, input): Project`
- `inviteParticipant(leadAgentId, projectId, agentId, role): Participant`
- `createTask(leadAgentId, projectId, assigneeAgentId, title, description, message): ProjectTask`
- `getProject(leadAgentId, projectId): Project with tasks`
- `listProjects(leadAgentId): Project[]`
- `cancelProject(leadAgentId, projectId): Project`
- Helper: `computeProjectStatus(tasks): ProjectStatus`

- [ ] **Step 1: Lógica pura de estados del proyecto**
- [ ] **Step 2: Implementar servicio usando buzón A2A**
- [ ] **Step 3: Tests unitarios con mocks**
- [ ] **Step 4: Tests de integración flujo completo**

---

### Task 10: Routes de proyectos

**Files:**
- Create: `src/routes/agent/projects.ts`
- Modify: `src/app.ts`

**Interfaces:**
- `POST /api/v1/agent/projects`
- `GET /api/v1/agent/projects`
- `GET /api/v1/agent/projects/:id`
- `POST /api/v1/agent/projects/:id/participants`
- `POST /api/v1/agent/projects/:id/tasks`
- `POST /api/v1/agent/projects/:id/cancel`

- [ ] **Step 1: CRUD de proyectos**
- [ ] **Step 2: Invitar participantes y crear subtareas**
- [ ] **Step 3: Router coverage test incluye estas rutas**

---

### Task 11: Cobertura de router, typecheck y lint

- [ ] **Step 1: Montar `/a2a/:agentSlug` y `/api/v1/agent/a2a` en `src/app.ts`**
- [ ] **Step 2: Montar `/api/v1/agent/projects` en `src/app.ts`**
- [ ] **Step 3: Router coverage test incluye rutas A2A y proyectos**
- [ ] **Step 4: Typecheck**
- [ ] **Step 5: Lint**
- [ ] **Step 6: Suite completa local**

```bash
redis-cli -n 1 FLUSHDB
bun test tests/unit tests/integration
```

---

### Task 12: Documentación

**Files:**
- Create: `docs-site/content/docs/a2a.mdx`
- Create: `docs-site/content/docs/agent-projects.mdx`
- Modify: `docs-site/content/docs/roadmap.mdx`

- [ ] **Step 1: Documentar A2A mailbox**
- [ ] **Step 2: Documentar proyectos colaborativos con ejemplo frontend+backend**
- [ ] **Step 3: Actualizar roadmap**
