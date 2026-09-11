# A2A Protocol — diseño

**Fecha:** 2026-09-11
**Estado:** aprobado, pendiente de plan de implementación
**Especificación de referencia:** A2A Protocol v1.0 — https://a2a-protocol.org/v1.0.0/specification/

AgentDialog se expone como un **A2A Server** cuyo skill principal es insertar a un humano en el ciclo de decisión de otro agente. Un agente cliente descubre a un agente registrado en AgentDialog a través de su `AgentCard`, le envía una tarea (`SendMessage`), y AgentDialog la convierte en la query/convocatoria humana que ya existe. Cuando el humano responde, la respuesta regresa al cliente como resultado de la tarea A2A.

A2A no sustituye a MCP ni a la API REST. Cada interfaz cubre un modo distinto:

| Interfaz | Cuándo se usa |
|---|---|
| MCP | Un asistente de chat (Claude, Cursor…) quiere usar a AgentDialog como una herramienta dentro de su propia conversación. |
| REST | Un agente propio quiere crear queries, leer respuestas y gestionar webhooks directamente. |
| A2A | Un agente autónomo quiere delegar en otro agente (el registrado en AgentDialog) y seguir el ciclo de vida de esa tarea. |

## Objetivo

Que cualquier agente compatible con A2A v1.0 pueda descubrir y delegar en un agente registrado en AgentDialog sin saber nada de nuestra API REST interna.

## Alcance

**Dentro:**

- `AgentCard` público por agente, servido en `/.well-known/agent.json` relativo al endpoint A2A del agente.
- Dos bindings v1.0: **HTTP+JSON/REST** y **JSON-RPC** sobre el mismo endpoint.
- Operaciones core: `SendMessage`, `SendStreamingMessage`, `GetTask`, `ListTasks`, `CancelTask`.
- Notificaciones push reutilizando el webhook service existente (`CreateTaskPushNotificationConfig`, `GetTaskPushNotificationConfig`, `ListTaskPushNotificationConfigs`, `DeleteTaskPushNotificationConfig`).
- Mapeo de una tarea A2A al ciclo de vida de una `human_query` tipada.
- Autenticación con API key tipo `mge_ag_` emitida por agente.

**Fuera, deliberadamente:**

- gRPC binding. Bun no lo tiene de primera clase y no aporta interoperabilidad frente a HTTP+JSON/JSON-RPC en nuestro entorno.
- `GetExtendedAgentCard` autenticado en v1.0. Se deja preparado en el esquema pero no se implementa hasta que haya un caso de uso que lo justifique.
- Agent Card firmado (JWS). v1.0 lo recomienda para confianza entre organizaciones; lo añadiremos cuando tengamos un mecanismo de claves por agente, no en el MVP.
- Subtareas A2A paralelas dentro de una misma `contextId`. `contextId` se mapea a `conversationId`, pero cada `SendMessage` crea una única query.

## 1. Arquitectura

Cada agente registrado en AgentDialog obtiene una URL A2A propia:

```
https://api.agentdialog.io/a2a/{agentSlug}
```

Montada como sub-aplicación Hono en `src/app.ts`, bajo `/api/v1/a2a/:agentSlug` o directamente `/a2a/:agentSlug`. La decisión de ruta se deja al plan, pero la URL pública debe ser la de arriba.

Dentro de esa sub-aplicación:

- `GET /.well-known/agent.json` → `AgentCard` del agente (público, sin auth).
- `POST /message:send` → HTTP binding de `SendMessage`.
- `POST /message:stream` → HTTP binding de `SendStreamingMessage` (SSE).
- `GET /tasks/:id` → `GetTask`.
- `GET /tasks` → `ListTasks`.
- `POST /tasks/:id/cancel` → `CancelTask`.
- `POST /tasks/:id/pushNotificationConfigs` → crear config push.
- `GET /tasks/:id/pushNotificationConfigs/:configId` → leer config push.
- `GET /tasks/:id/pushNotificationConfigs` → listar configs push.
- `DELETE /tasks/:id/pushNotificationConfigs/:configId` → borrar config push.
- `POST /` con JSON-RPC envelope → JSON-RPC binding (misma lógica, distinta serialización).

La lógica vive en un nuevo servicio `src/services/a2a.service.ts` que recibe objetos A2A y llama a `query.service.ts` y `conversation.service.ts`. Ninguna ruta A2A toca la base de datos directamente.

## 2. Mapeo de A2A al modelo de AgentDialog

### 2.1 Agent Card

El `AgentCard` se deriva del registro del agente:

| Campo A2A | Origen en AgentDialog |
|---|---|
| `name` | `displayName` |
| `description` | `description` |
| `version` | `1.0.0` inicial, más tarde el campo `version` del agente. |
| `skills` | Un skill fijo `human_query` más los skills que el agente declare en `metadata.a2aSkills`. |
| `supportedInterfaces` | `[{protocolBinding: "HTTP+JSON", url: baseUrl, protocolVersion: "1.0"}, {protocolBinding: "JSONRPC", url: baseUrl, protocolVersion: "1.0"}]` |
| `capabilities` | `streaming: true`, `pushNotifications: true`, `stateTransitionHistory: false`, `extendedAgentCard: false`. |
| `securitySchemes` | `APIKeySecurityScheme` con nombre `agentdialog_api_key`. |
| `defaultInputModes` | `["text/plain", "application/json"]` |
| `defaultOutputModes` | `["application/json", "text/plain"]` |

El campo `agentCard` que ya guardamos en `metadata` se fusiona **bajo** la estructura derivada: el agente puede añadir `skills`, `tags` o `examples`, pero no puede mentir sobre endpoints ni capacidades.

### 2.2 Mensajes y Parts

Un `SendMessage` contiene un `Message` con `parts`. Interpretamos:

- `TextPart` → `subject.body` de la query.
- `DataPart` con estructura reconocida → campos de la query (`query_type`, `target_human_email`, `timeout_minutes`, `answer_space`, `context`, `subject.uri`, `risk_level`, etc.).
- `FilePart` → adjunto de la query (depende de la funcionalidad de adjuntos a queries que entra en v0.10).

Si el mensaje no trae `DataPart`, se rechaza con `ContentTypeNotSupportedError` o `InvalidParams` (JSON-RPC `-32602`) indicando que el skill `human_query` requiere una carga estructurada.

### 2.3 Tasks ↔ Queries

Cada `SendMessage` crea:

1. Una conversación (`conversation`), usando `contextId` del mensaje A2A como `conversationId` si existe; si no, se genera uno.
2. Una query tipada (`human_query`) dentro de esa conversación.
3. Un `Task` A2A cuyo `id` es el `queryId`.

Estados del task:

| Estado A2A | Estado AgentDialog | Disparador |
|---|---|---|
| `TASK_STATE_SUBMITTED` | query creada, notificación aún no enviada. | Inmediatamente tras `SendMessage`. |
| `TASK_STATE_WORKING` | query notificada/pendiente o asignada, esperando humano. | Cuando la query queda en estado `pending` o `assigned`. |
| `TASK_STATE_INPUT_REQUIRED` | `needs_context`. | El humano pide más contexto y el agente no ha respondido todavía. |
| `TASK_STATE_COMPLETED` | `answered`. | El humano respondió. |
| `TASK_STATE_FAILED` | Error irrecuperable del servicio. | No usado para rechazos de admisión (esos van como `TASK_STATE_REJECTED`). |
| `TASK_STATE_CANCELED` | `cancelled`. | `CancelTask` o cancelación por parte del agente propietario. |
| `TASK_STATE_REJECTED` | Admission gate rechazó la query. | La admisión dice que la pregunta no es decidible. |

El `Task` devuelto incluye el `status` actual y, cuando esté `COMPLETED`, un `Artifact` con la respuesta estructurada como `DataPart`.

### 2.4 Artifacts

Un artifact final contiene un único `DataPart`:

```json
{
  "data": {
    "kind": "choice",
    "option_ids": ["renegotiate"]
  }
}
```

La forma sigue exactamente el espacio de respuestas de queries tipadas (`answer_space`).

## 3. Protocol bindings

### 3.1 HTTP+JSON/REST

Seguimos la tabla de mapeo v1.0:

| Operación | Método HTTP | Ruta |
|---|---|---|
| `SendMessage` | `POST` | `/message:send` |
| `SendStreamingMessage` | `POST` | `/message:stream` |
| `GetTask` | `GET` | `/tasks/:id` |
| `ListTasks` | `GET` | `/tasks?contextId=...` |
| `CancelTask` | `POST` | `/tasks/:id:cancel` |
| Crear push config | `POST` | `/tasks/:id/pushNotificationConfigs` |
| Listar push configs | `GET` | `/tasks/:id/pushNotificationConfigs` |
| Borrar push config | `DELETE` | `/tasks/:id/pushNotificationConfigs/:configId` |
| Agent Card | `GET` | `/.well-known/agent.json` |

Headers:

- `Content-Type: application/a2a+json` en requests.
- `A2A-Version: 1.0`.
- `Authorization: Bearer mge_ag_...`.

Errores en formato RFC 7807 (`application/problem+json`).

### 3.2 JSON-RPC

Un único endpoint `POST /` recibe envelopes JSON-RPC 2.0 y despacha por `method`:

| Method | Operación |
|---|---|
| `SendMessage` | `SendMessage` |
| `SendStreamingMessage` | `SendStreamingMessage` (SSE) |
| `GetTask` | `GetTask` |
| `ListTasks` | `ListTasks` |
| `CancelTask` | `CancelTask` |
| `CreateTaskPushNotificationConfig` | Crear push config |
| `GetTaskPushNotificationConfig` | Leer push config |
| `ListTaskPushNotificationConfigs` | Listar push configs |
| `DeleteTaskPushNotificationConfig` | Borrar push config |

Errores JSON-RPC 2.0. Los errores A2A específicos se mapean a códigos propios del spec.

### 3.3 Streaming

`SendStreamingMessage` devuelve `text/event-stream`. Los eventos son:

- `task_status` → `TaskStatusUpdateEvent`.
- `task_artifact` → `TaskArtifactUpdateEvent` cuando la respuesta llega.

Aprovechamos la infraestructura de WebSocket y Redis: cuando una query cambia de estado, publicamos en el canal de la tarea y el endpoint SSE lo reenvía.

## 4. Autenticación y autorización

Cada agente registrado en AgentDialog tiene un API key A2A. Inicialmente reutilizamos el mismo esquema `mge_ag_` de la API REST, pero la ruta A2A autentica al **cliente** que delega en el agente, no al agente propietario.

La autorización es simple:

- Un request a `https://api.agentdialog.io/a2a/{agentSlug}` está dirigido a ese agente.
- La API key debe corresponder a ese agente.
- El cliente autenticado puede crear tareas, leer sus propias tareas (filtradas por `requester` si lo registramos), cancelar tareas que él creó, y suscribirse a updates.

Si en el futuro queremos que un agente cliente se autentique con OAuth2, añadimos un `OAuth2SecurityScheme` al `AgentCard`; ahora usamos API key para no bloquearnos en flujos OAuth externos.

## 5. Push notifications

Las push notifications A2A reutilizan `src/services/webhook.service.ts`. Cuando un cliente crea una push config para una tarea:

1. Guardamos `(taskId, webhookUrl, authInfo)` en una tabla nueva `a2a_push_configs`.
2. Cada vez que la query cambia de estado o recibe una respuesta, si existe push config, enviamos un `POST` al webhook con el payload `TaskStatusUpdateEvent` o `TaskArtifactUpdateEvent`.
3. Verificamos que la URL no apunte a loopback/private range (misma lógica que webhooks de agentes).

No implementamos firmas de push A2A en v1.0; el payload es JSON plano. Se añadirá cuando el spec tenga un mecanismo de firma estable.

## 6. Versionado y extensiones

- Declaramos `protocolVersion: "1.0"` en cada interface.
- No registramos extensiones propietarias en v1.0.
- Si en el futuro añadimos un modo `a2a+agentdialog` (por ejemplo, para enviar una query directamente sin envolverla en parts), se declara como extensión con URI `https://agentdialog.io/extensions/a2a/query-direct/v1`.

## 7. Tests

- Tests unitarios en `src/lib/a2a/`: mapeo de estados, serialización de `AgentCard`, parsing de `DataPart`.
- Tests unitarios de binding: JSON-RPC dispatcher, HTTP router coverage.
- Tests de integración reales sobre HTTP+JSON y JSON-RPC contra la API, incluyendo un cliente A2A mínimo.
- No testeamos gRPC.

## 8. Riesgos y decisiones abiertas

- **Identidad del requester.** Necesitamos saber quién creó una tarea A2A para `ListTasks` y autorización. A2A no define identidad del cliente más allá de la auth. Guardaremos un `requesterId` derivado del hash de la API key o de un campo `metadata.requester` si lo provee.
- **Caché del Agent Card.** El spec v1.0 habla de caching por parte del cliente; nosotros añadimos headers `Cache-Control` y `ETag`.
- **Multi-tenancy del endpoint.** `/a2a/{agentSlug}` deja claro qué agente es el remote agent. Esto evita que un `mcp-session-id` o similar se confunda con otro agente.
- **Interacción con rate limiting.** Las llamadas A2A entran en el rate limit por agente, no por IP.
- **Datos personales en el Agent Card.** No exponemos `target_human_email` ni contenido de conversaciones en el card; solo capacidades e identidad pública del agente.
