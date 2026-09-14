# Contrato de colaboración y notificación push de proyecto — diseño

**Fecha:** 2026-09-14
**Estado:** aprobado, en diseño

Coordinar agentes A2A hoy es mecánico: cada agente tiene su buzón, el lead invita
por slug, y para enterarse de lo que pasa hay que configurar cada instancia a
mano (push por tarea registrado por el remitente, o polling del buzón por parte
del destinatario). Este diseño le da a la colaboración dos piezas que le faltan:

1. **Un contrato de colaboración** que el agente master define y los demás leen
   al unirse: roles, endpoints y reglas de comunicación en un único documento
   accesible por una URL compartida.
2. **Notificaciones push a nivel de proyecto** con entrega fiable: el
   destinatario se entera de que le llega una tarea, y nadie configura webhooks
   por tarea.

## Problema (lo que hay hoy)

| Mecánica | Hoy | Por qué molesta |
|---|---|---|
| Descubrimiento | Solo por slug, el lead conoce los slugs | No hay un documento compartido que defina roles ni reglas |
| Aviso de tarea nueva | El destinatario hace polling de `GET /a2a/{slug}/tasks` | Sin aviso no sabe que le llegó trabajo |
| Aviso de progreso | Push **por tarea**, registrado por el remitente (`POST /tasks/:id/pushNotificationConfigs`) | Configurar cada tarea a mano; el nivel correcto es el proyecto |
| Fiabilidad | Entrega *fire-and-forget*, un solo intento (`src/services/a2a-delivery.service.ts:122`) | Una caída del receptor pierde la notificación sin rastro |

## Decisiones tomadas

| Decisión | Opción elegida | Por qué |
|---|---|---|
| Alojamiento del contrato | **En el hub** | El master define el contenido; el hub lo sirve en una URL privada con token compartido (mismo patrón que `query_grants`). Un contrato alojado en el master exigiría que el hub confíe en una URL externa y verifique firma. |
| Push configs | **Solo nivel proyecto** | Los per-tarea se eliminan; el nivel correcto es «un callback por participante por proyecto». Cambio rompedor, acotado: la feature es joven y self-service. |
| Fiabilidad | **Reintentos + `eventId`** | Reintentos con backoff por entrega y un id de evento por notificación para que el agente deduplique. |
| Entregable | **Spec + plan + implementación** | Según convención del repo. |

## Arquitectura

```
 master (lead)                        hub                            participante
    │  crea proyecto ────────────────►│
    │◄─ share URL + token ────────────┤
    │  comparte la URL (fuera de banda) ───────────────────────────►
    │                                 │◄── GET /a2a/projects/{id}/contract?token=…
    │                                 │     (lee roles, endpoints, reglas)
    │                                 │◄── POST /api/v1/agent/projects/{id}/push
    │                                 │     (registra su callback del proyecto, 1×)
    │  POST /message:send ───────────►│
    │                                 ├── task_new ───────────────────► (webhook del asignado)
    │◄── task_status / artifact ──────┤── task_status ────────────────► (webhook del remitente)
    │                                 │   + SSE (igual que hoy)
```

El contrato y los webhooks son **del proyecto, no del buzón**. Un `message:send`
fuera de un proyecto sigue funcionando igual que hoy (SSE para el remitente,
polling para el destinatario); los webhooks de proyecto solo aplican a tareas
que llevan `projectId`.

## Cambios por componente

### 1. Contrato de colaboración

**Tabla `a2a_project_shares`** (migración `0014`), con el patrón de
`query_grants`: prefijo indexado + hash bcrypt, el token completo solo se
compara contra el hash.

| Columna | Nota |
|---|---|
| `id` | uuid PK |
| `project_id` | FK → `agent_projects`, `onDelete: cascade` |
| `token_prefix` | unique, índice |
| `token_hash` | bcrypt |
| `created_at` / `updated_at` | |

**Contenido del contrato** (montado por el hub desde el estado del proyecto):

```json
{
  "projectId": "…",
  "name": "…",
  "status": "active",
  "specVersion": "1.0",
  "hub": {
    "apiBaseUrl": "https://api.agentdialog.io",
    "mailboxBase": "/a2a/{slug}",
    "notificationEndpoint": "/api/v1/agent/projects/{projectId}/push"
  },
  "lead": { "slug": "…", "displayName": "…", "agentCardUrl": "…" },
  "participants": [
    { "slug": "…", "displayName": "…", "role": "member", "status": "active", "agentCardUrl": "…" }
  ],
  "rules": "# Rules\n\n- never deploy on Fridays"
}
```

- **El master define las reglas** en un documento **Markdown** que sube por API
  (`POST /api/v1/agent/projects/:id/contract-rules`, solo el lead). El hub lo
  guarda en una columna propia (`agent_projects.contract_rules`, text) y lo
  sirve dentro del contrato como `rules`, tal cual. Legible para humanos,
  montado sobre el esqueleto verificable.
- Los campos de confianza (endpoints, versión, URL de agent card) los deriva el
  hub, igual que `buildAgentCard` (`src/lib/a2a/agent-card.ts`) protege los
  campos de seguridad: el master no puede inventarse un endpoint.
- `agentCardUrl` usa `buildAgentCardUrl` (`src/lib/a2a/agent-card.ts:113`).

**Endpoints del contrato:**

- `POST /api/v1/agent/projects/:id/share` — solo el lead. Genera (o rota) el
  token y devuelve `{ share_url, token }`. Rotar = regenerar el token; el
  anterior deja de valer.
- `GET /a2a/projects/:id/contract?token=<token>` — ruta pública, la credencial
  es el token (igual que `query_grants`). Devuelve el contrato JSON.
- `POST /api/v1/agent/projects/:id/contract-rules` — solo el lead. Guarda el
  Markdown de las reglas.

### 2. Webhooks de proyecto (push configs)

**Tabla `a2a_project_push_configs`** (migración `0014`):

| Columna | Nota |
|---|---|
| `id` | uuid PK |
| `project_id` | FK → `agent_projects`, `onDelete: cascade` |
| `agent_id` | FK → `agents`, el participante dueño del callback |
| `url` | varchar(512) |
| `auth_info` | jsonb (igual que los push configs actuales: bearer en memoria, nunca en claro en BD) |
| `created_at` / `updated_at` | |
| **unique** | `(project_id, agent_id)` — un callback por participante |

**Endpoints** (autenticado como agente participante del proyecto):

- `POST /api/v1/agent/projects/:id/push` — crea o reemplaza el callback propio.
- `GET /api/v1/agent/projects/:id/push` — el callback propio.
- `DELETE /api/v1/agent/projects/:id/push` — 204.

La URL se valida con `inspectWebhookTarget` al escribir **y** en cada entrega
(igual que `webhook-delivery.ts`); en on-prem se respeta
`WEBHOOK_ALLOW_PRIVATE_TARGETS=true`.

### 3. Enrutado y entrega de eventos

**Eventos** (envelope único, con id para dedupe):

```json
{
  "event": "task_new" | "task_status" | "task_artifact" | "task_message",
  "eventId": "<uuid por notificación>",
  "projectId": "…",
  "taskId": "…",
  "payload": { … },
  "timestamp": "…"
}
```

**Enrutado:**

- `task_new` → al webhook de proyecto del **destinatario** de la tarea. Se
  dispara en `sendMessage` cuando la tarea lleva `metadata.projectId` (el
  servicio de proyecto ya lo pone, `src/services/agent-project.service.ts:206`).
- `task_status` / `task_artifact` / `task_message` → al webhook de proyecto del
  **remitente** de la tarea. Se dispara en `notifyTaskChange`
  (`src/services/a2a-mailbox.service.ts:444`), que hoy hace fire-and-forget con
  los push configs por tarea.
- Si el participante destino no tiene callback de proyecto, no se entrega nada
  (se registra en el log); el SSE sigue existiendo para el remitente.

**Entrega fiable** (`a2a-delivery.service.ts`):

- Reintentos con backoff (p. ej. 3 intentos, esperas 1s/5s), timeout por
  intento (`WEBHOOK_TIMEOUT_MS`), `redirect: manual`, auth bearer desde
  `auth_info`.
- `eventId` nuevo por notificación → el receptor deduplica.
- Los fallos se loguean con `projectId` + `taskId` + `eventId`. Sin cola
  persistente en v1 (los reintentos viven en el proceso); se documenta.

### 4. Eliminar push configs por tarea

- Se eliminan los endpoints `/a2a/{slug}/tasks/:id/pushNotificationConfigs`
  (`src/routes/a2a/tasks.ts:73-100`) y las funciones del servicio
  (`createPushConfig`, `getPushConfig`, `listPushConfigs`, `deletePushConfig`,
  `fetchPushConfigs`).
- La migración `0014` **dropea la tabla `a2a_push_configs`**. Es un cambio
  rompedor explícito: la feature es nueva y self-service; los callbacks por
  tarea existentes se deben re-registrar a nivel de proyecto. Documentado en el
  plan y en las notas de release.
- `notifyTaskChange` deja de consultar push configs por tarea y entrega al
  webhook de proyecto del remitente.

## Seguridad

- **El token del contrato es una capability** con el mismo tratamiento que
  `query_grants`: aleatorio, prefijo indexado, solo hash en BD, nunca en claro.
  Quien lo tiene lee el contrato de ese proyecto y nada más. Rotar revoca.
- **Los campos de confianza del contrato son derivados por el hub**; el master
  solo aporta roles (vía participación) y `rules` (metadata). No puede inventar
  endpoints ni bajar la versión del spec.
- **La URL de webhook se inspecciona al escribir y en cada entrega**, igual que
  los webhooks de agente; en on-prem se permite red privada explícitamente.
- Un participante solo registra/lee/borra **su propio** callback de proyecto.
- `auth_info` (bearer) nunca se guarda en claro; solo en memoria durante la
  entrega, como ya hace `a2aPushConfigs`.

## Fuera de alcance (v1)

- **Cola de entrega persistente** (dead-letter durable en Redis/BD): los
  reintentos viven en el proceso; un reinicio del hub pierde un reintento
  pendiente. Se documenta y queda como mejora.
- **Contrato alojado en el master con firma**: el hub es la única fuente del
  contrato. Firmar contratos externos es trabajo aparte.
- **Webhooks de buzón** (avisar al dueño de un buzón de tareas fuera de
  proyectos): fuera, porque la decisión fue «solo nivel proyecto».
- **Firma Standard Webhooks** en la entrega A2A: la entrega mantiene auth
  bearer. Firmar las notificaciones A2A es otra pieza.

## Tests

- **Unitarios:**
  - `buildProjectContract`: campos derivados presentes, `rules` pasa del
    metadata, los campos de confianza no son overrideables.
  - Token de contrato: generación, prefijo, verificación, rotación (el viejo
    deja de valer).
  - Entrega con retries: fallo → reintento con backoff; `eventId` distinto por
    entrega y estable para el mismo evento; timeout aborta; `redirect: manual`
    no se sigue; en on-prem la URL privada pasa.
  - Enrutado: `task_new` → destinatario; `task_status` → remitente; sin
    callback → no se entrega.
- **Integración:**
  - Flujo completo: lead crea proyecto → genera share → participante lee el
    contrato con el token → participante registra su webhook → lead asigna
    subtarea → el webhook del asignado recibe `task_new` → el webhook del lead
    recibe `task_status`.
  - Los endpoints de push por tarea responden 410/404 tras la migración.
- `bunx tsc --noEmit` en 0; suite completa local verde.

## Impacto

- La entrega SSE no cambia; los push configs por tarea desaparecen (rompedor,
  documentado).
- Los webhooks de agente (`webhook.service.ts`) no se tocan; la entrega A2A
  nueva es independiente.