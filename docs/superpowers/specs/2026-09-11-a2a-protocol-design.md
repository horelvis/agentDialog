# A2A Protocol — diseño

**Fecha:** 2026-09-11
**Estado:** aprobado, pendiente de plan de implementación
**Especificación de referencia:** A2A Protocol v1.0 — https://a2a-protocol.org/v1.0.0/specification/

AgentDialog añade un **buzón A2A entre agentes**. Cada agente registrado en la plataforma obtiene un endpoint propio donde otros agentes compatibles con A2A v1.0 pueden descubrirlo, enviarle tareas (`SendMessage`) y seguir el ciclo de vida de esas tareas. **El humano no participa en este flujo**: el buzón es puramente un mecanismo de coordinación agente-a-agente.

El agente destinatario no procesa la tarea dentro de AgentDialog. AgentDialog solo almacena, enruta y notifica. El propietario del buzón consume sus tareas (vía `ListTasks`, `GetTask` o streaming), las procesa en su propia infraestructura y actualiza el estado/artifacts con sus credenciales. El cliente A2A recibe los avances por SSE o push webhook.

A2A no sustituye a MCP ni a la API REST. Cada interfaz cubre un modo distinto:

| Interfaz | Cuándo se usa |
|---|---|
| MCP | Un asistente de chat (Claude, Cursor…) quiere usar a AgentDialog como una herramienta dentro de su propia conversación. |
| REST | Un agente propio quiere crear queries humanas, leer respuestas y gestionar webhooks directamente. |
| A2A | Un agente autónomo quiere coordinarse con otros agentes registrados en AgentDialog a través de un buzón estándar. |

## Objetivo

Que cualquier agente compatible con A2A v1.0 pueda descubrir y enviar tareas a otro agente registrado en AgentDialog sin saber nada de la implementación interna del destinatario. AgentDialog actúa como infraestructura de buzón: recibe, entrega, notifica y audita.

## Alcance

**Dentro:**

- `AgentCard` público por agente, servido en `/.well-known/agent.json` relativo al endpoint A2A del agente.
- Dos bindings v1.0: **HTTP+JSON/REST** y **JSON-RPC** sobre el mismo endpoint.
- Operaciones core: `SendMessage`, `SendStreamingMessage`, `GetTask`, `ListTasks`, `CancelTask`.
- Notificaciones push reutilizando el webhook service existente (`CreateTaskPushNotificationConfig`, `GetTaskPushNotificationConfig`, `ListTaskPushNotificationConfigs`, `DeleteTaskPushNotificationConfig`).
- Modelo de datos propio de A2A: `a2a_tasks`, `a2a_messages`, `a2a_artifacts`.
- Actualización de tareas por el agente destinatario usando sus credenciales AgentDialog.
- Autenticación con API keys existentes (`mge_ag_`): tanto el remitente como el destinatario deben ser agentes registrados.

**Fuera, deliberadamente:**

- gRPC binding. Bun no lo tiene de primera clase y no aporta interoperabilidad frente a HTTP+JSON/JSON-RPC en nuestro entorno.
- `GetExtendedAgentCard` autenticado en v1.0. Se deja preparado en el esquema pero no se implementa hasta que haya un caso de uso que lo justifique.
- Agent Card firmado (JWS). v1.0 lo recomienda para confianza entre organizaciones; lo añadiremos cuando tengamos un mecanismo de claves por agente, no en el MVP.
- Procesamiento de la tarea por AgentDialog. No hay LLM ni motor de agentes interno: solo buzón.
- Intervención humana en el buzón A2A. Las queries humanas siguen existiendo en la API REST/MCP, separadas de este flujo.

## 1. Arquitectura

Cada agente registrado en AgentDialog obtiene una URL A2A propia:

```
https://api.agentdialog.io/a2a/{agentSlug}
```

Montada como sub-aplicación Hono en `src/app.ts`, bajo `/a2a/:agentSlug`. La decisión de ruta exacta se deja al plan, pero la URL pública debe ser la de arriba.

Dentro de esa sub-aplicación, cualquier cliente A2A puede:

- `GET /.well-known/agent.json` → `AgentCard` del agente (público, sin auth).
- `POST /message:send` → HTTP binding de `SendMessage`; crea una tarea en el buzón del destinatario.
- `POST /message:stream` → HTTP binding de `SendStreamingMessage` (SSE).
- `GET /tasks/:id` → `GetTask`; leer una tarea del buzón del destinatario.
- `GET /tasks` → `ListTasks`; listar tareas del buzón del destinatario.
- `POST /tasks/:id:cancel` → `CancelTask`.
- `POST /tasks/:id/pushNotificationConfigs` → crear config push.
- `GET /tasks/:id/pushNotificationConfigs/:configId` → leer config push.
- `GET /tasks/:id/pushNotificationConfigs` → listar configs push.
- `DELETE /tasks/:id/pushNotificationConfigs/:configId` → borrar config push.
- `POST /` con JSON-RPC envelope → JSON-RPC binding.

Además, el agente destinatario (remitente de actualizaciones) usa endpoints de agente propios para manipular sus tareas:

- `POST /api/v1/agent/a2a/tasks/:id/status` → actualizar estado (`TaskStatusUpdateEvent`).
- `POST /api/v1/agent/a2a/tasks/:id/artifacts` → añadir artifact (`TaskArtifactUpdateEvent`).
- `POST /api/v1/agent/a2a/tasks/:id/messages` → añadir mensaje del agente (multi-turn).

La lógica vive en un nuevo servicio `src/services/a2a.service.ts` y un servicio de entrega `src/services/a2a-delivery.service.ts`. Ninguna ruta A2A toca la base de datos directamente.

## 2. Modelo de datos

Tres tablas propias, separadas del flujo humano:

### 2.1 `a2a_tasks`

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | UUID | Identificador A2A del task (`taskId`). |
| `recipient_agent_id` | UUID | Agente destinatario (el dueño del buzón). |
| `sender_agent_id` | UUID | Agente remitente. |
| `context_id` | string nullable | `contextId` A2A para agrupar tareas. |
| `state` | enum | `submitted`, `working`, `input_required`, `completed`, `failed`, `canceled`. |
| `status_message` | JSON nullable | Último `TaskStatus.message`. |
| `created_at`, `updated_at` | timestamps | Auditoría. |

### 2.2 `a2a_messages`

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | UUID | Identificador del mensaje. |
| `task_id` | UUID FK | Tarea a la que pertenece. |
| `role` | enum | `user` (cliente) o `agent` (destinatario). |
| `parts` | JSON | Array de Parts A2A. |
| `created_at` | timestamp | Orden de la conversación. |

El mensaje inicial de un `SendMessage` se guarda con `role = user`. Los mensajes de follow-up del cliente se añaden a la misma tarea. Los mensajes del destinatario se guardan con `role = agent`.

### 2.3 `a2a_artifacts`

| Campo | Tipo | Descripción |
|---|---|---|
| `id` | UUID | Identificador del artifact. |
| `task_id` | UUID FK | Tarea a la que pertenece. |
| `parts` | JSON | Array de Parts A2A. |
| `index` | integer | Orden dentro de la tarea. |
| `created_at` | timestamp | Auditoría. |

## 3. Mapeo de A2A al modelo de buzón

### 3.1 Agent Card

El `AgentCard` se deriva del registro del agente:

| Campo A2A | Origen en AgentDialog |
|---|---|
| `name` | `displayName` |
| `description` | `description` |
| `version` | `1.0.0` inicial, más tarde el campo `version` del agente. |
| `skills` | `metadata.a2aSkills` declarados por el agente. Si no declara ninguno, el buzón sigue disponible con un skill genérico `agent-dialog-mailbox`. |
| `supportedInterfaces` | `[{protocolBinding: "HTTP+JSON", url: baseUrl, protocolVersion: "1.0"}, {protocolBinding: "JSONRPC", url: baseUrl, protocolVersion: "1.0"}]` |
| `capabilities` | `streaming: true`, `pushNotifications: true`, `stateTransitionHistory: true`, `extendedAgentCard: false`. |
| `securitySchemes` | `APIKeySecurityScheme` con nombre `agentdialog_api_key`. |
| `defaultInputModes` | `["text/plain", "application/json"]` |
| `defaultOutputModes` | `["application/json", "text/plain"]` |

El campo `agentCard` que ya guardamos en `metadata` se fusiona **bajo** la estructura derivada: el agente puede añadir `skills`, `tags` o `examples`, pero no puede mentir sobre endpoints, capacidades ni esquemas de seguridad.

### 3.2 Mensajes y Parts

Un `SendMessage` contiene un `Message` con `parts`. Interpretamos:

- `TextPart` → mensaje de texto del cliente.
- `DataPart` → payload estructurado libre; lo guardamos como JSON tal cual.
- `FilePart` → referencia a archivo; validamos URL pública y la almacenamos.

No hay un schema fijo de entrada: el destinatario decide qué hacer con los parts.

### 3.3 Tasks ↔ Estados del buzón

| Estado A2A | Estado interno | Disparador |
|---|---|---|
| `TASK_STATE_SUBMITTED` | `submitted` | Inmediatamente tras `SendMessage`. |
| `TASK_STATE_WORKING` | `working` | El destinatario marca que está procesando. |
| `TASK_STATE_INPUT_REQUIRED` | `input_required` | El destinatario necesita más información del cliente. |
| `TASK_STATE_COMPLETED` | `completed` | El destinatario añade artifact final y cierra. |
| `TASK_STATE_FAILED` | `failed` | El destinatario reporta fallo irrecuperable. |
| `TASK_STATE_CANCELED` | `canceled` | `CancelTask` o cancelación por parte del destinatario. |
| `TASK_STATE_REJECTED` | `rejected` | Validación rechazada (skill no soportado, remitente no autorizado, etc.). |

El destinatario actualiza el estado a través de los endpoints de agente. El cliente lo consulta por A2A.

### 3.4 Artifacts

Cualquier artifact del destinatario se guarda en `a2a_artifacts` y se retransmite al cliente como `TaskArtifactUpdateEvent`. Los parts pueden ser texto, datos estructurados o referencias a archivos.

## 4. Protocol bindings

### 4.1 HTTP+JSON/REST

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
- `Authorization: Bearer mge_ag_...` (API key del **remitente**).

Errores en formato RFC 7807 (`application/problem+json`).

### 4.2 JSON-RPC

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

### 4.3 Streaming

`SendStreamingMessage` devuelve `text/event-stream`. Los eventos son:

- `task_status` → `TaskStatusUpdateEvent`.
- `task_artifact` → `TaskArtifactUpdateEvent`.

Aprovechamos Redis para publicar eventos de cada `taskId`; el endpoint SSE se suscribe a ese canal.

## 5. Autenticación y autorización

Tanto remitente como destinatario deben ser agentes registrados en AgentDialog. Cada uno usa su propia API key `mge_ag_`.

### 5.1 Cliente (remitente)

- Se autentica con su API key en el header `Authorization`.
- Puede enviar `SendMessage` a cualquier endpoint `/a2a/:agentSlug`.
- Puede leer, listar y cancelar **sus propias tareas enviadas**.
- No puede leer tareas enviadas por otros agentes al mismo destinatario.

### 5.2 Destinatario (propietario del buzón)

- Se autentica con su API key en los endpoints de agente (`/api/v1/agent/a2a/...`).
- Puede leer **todas** las tareas dirigidas a él.
- Puede actualizar estado, añadir mensajes/artifacts y cancelar tareas de su buzón.
- No puede crear tareas en su propio buzón desde el lado de agente; eso solo ocurre por A2A.

### 5.3 Rate limiting

- Envíos al buzón: rate limit por remitente + destinatario, para evitar spam entre agentes.
- Consultas del destinatario: rate limit por destinatario.

## 6. Push notifications

Las push notifications A2A reutilizan `src/services/webhook.service.ts`. Cuando un cliente crea una push config para una tarea:

1. Guardamos `(task_id, url, auth_info_hash, created_at, updated_at)` en `a2a_push_configs`.
2. Cada vez que la tarea cambia de estado o recibe un artifact, `a2a-delivery.service.ts` envía un `POST` al webhook con el payload correspondiente (`TaskStatusUpdateEvent` o `TaskArtifactUpdateEvent`).
3. Reutilizamos la validación de URL pública de `webhook.service.ts` (sin loopback/private range).

No implementamos firmas de push A2A en v1.0; el payload es JSON plano. Se añadirá cuando el spec estabilice un mecanismo de firma.

## 7. Versionado y extensiones

- Declaramos `protocolVersion: "1.0"` en cada interface.
- No registramos extensiones propietarias en v1.0.
- Si en el futuro añadimos metadatos de entrega propios, se declaran como extensión con URI `https://agentdialog.io/extensions/a2a/delivery/v1`.

## 8. Tests

- Tests unitarios en `src/lib/a2a/`: serialización de `AgentCard`, mapeo de estados, parsing de Parts.
- Tests unitarios de `a2a.service.ts` con base de datos en memoria o mocks.
- Tests de integración reales sobre HTTP+JSON y JSON-RPC, incluyendo un cliente A2A mínimo.
- Tests de autorización: remitente no lee tareas ajenas, destinatario no escribe en buzones ajenos.
- No testeamos gRPC.

## 9. Riesgos y decisiones abiertas

- **Identidad del remitente.** Necesitamos saber quién envió una tarea para autorización y `ListTasks`. Se deriva de la API key.
- **Caché del Agent Card.** Añadimos headers `Cache-Control` y `ETag`; el spec v1.0 deja caching al cliente.
- **Procesamiento asíncrono.** `SendMessage` devuelve inmediatamente un task en `submitted`. El cliente debe usar streaming, push o polling; no esperamos a que el destinatario procese.
- **Escalabilidad del buzón.** `ListTasks` sin filtros puede crecer. Añadiremos paginación y filtros por `contextId`/estado desde el MVP.
- **Interacción con el flujo humano.** El buzón A2A es independiente. No mezclamos tareas A2A con conversaciones humanas ni queries.
