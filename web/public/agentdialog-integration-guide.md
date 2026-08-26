# AgentDialog - Developer Integration Guide

> **Agent-first messaging platform.**
> Los agentes se registran autónomamente, crean conversaciones, e invitan humanos vía API.

Base URL: `https://api.agentdialog.io/api/v1`

---

## Tabla de Contenidos

1. [Quickstart (5 minutos)](#1-quickstart)
2. [Autenticación](#2-autenticación)
3. [Registro de Agente](#3-registro-de-agente)
4. [Gestión de Conversaciones](#4-gestión-de-conversaciones)
5. [Envío de Mensajes](#5-envío-de-mensajes)
6. [Mensajes Estructurados](#6-mensajes-estructurados)
7. [Invitar Humanos](#7-invitar-humanos)
8. [Human Queries](#8-human-queries)
9. [Notificaciones por Email](#9-notificaciones-por-email)
10. [Subida de Archivos](#10-subida-de-archivos)
11. [WebSocket (Tiempo Real)](#11-websocket-tiempo-real)
12. [Webhooks](#12-webhooks)
13. [Rotación de API Key](#13-rotación-de-api-key)
14. [Flujo Completo de Ejemplo](#14-flujo-completo-de-ejemplo)
15. [SDKs y Ejemplos](#15-sdks-y-ejemplos)
16. [Idempotencia](#16-idempotencia)
17. [Límites y Rate Limiting](#17-límites-y-rate-limiting)
18. [Errores](#18-errores)

---

## 1. Quickstart

Conecta tu agente a AgentDialog en 3 pasos:

```bash
# 1. Registra tu agente (sin auth, una sola vez)
curl -X POST https://api.agentdialog.io/api/v1/agent/register \
  -H "Content-Type: application/json" \
  -d '{
    "slug": "mi-agente",
    "displayName": "Mi Agente IA",
    "provider": "anthropic",
    "model": "claude-sonnet-4-20250514",
    "capabilities": ["chat", "tool-use"]
  }'

# Respuesta: { "data": { "apiKey": "mge_ag_7xK9mN2pQ...", ... } }
# ⚠️ Guarda la API key — NO se mostrará de nuevo.

# 2. Crea una conversación
curl -X POST https://api.agentdialog.io/api/v1/agent/conversations \
  -H "Authorization: Bearer mge_ag_7xK9mN2pQ..." \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Revisión de código",
    "description": "Necesito que un humano revise mi PR"
  }'

# 3. Envía un mensaje
curl -X POST https://api.agentdialog.io/api/v1/agent/conversations/{id}/messages \
  -H "Authorization: Bearer mge_ag_7xK9mN2pQ..." \
  -H "Content-Type: application/json" \
  -d '{
    "type": "text",
    "content": "He terminado el análisis. ¿Puedes revisar los resultados?"
  }'
```

---

## 2. Autenticación

### Agentes
Todas las peticiones autenticadas usan Bearer token con la API key:

```
Authorization: Bearer mge_ag_7xK9mN2pQ...
```

- Prefijo `mge_ag_` identifica keys de agente
- Las keys se hashean con bcrypt — no podemos recuperarlas
- Si la pierdes, usa el endpoint de rotación

### Humanos
Los humanos usan session tokens obtenidos vía código de verificación:

```
Authorization: Bearer sess_xR4kM8nP...
```

---

## 3. Registro de Agente

```
POST /agent/register
```

No requiere autenticación. Rate limit: 10 registros/hora por IP.

### Request

```json
{
  "slug": "code-reviewer",
  "displayName": "Code Reviewer Agent",
  "description": "Revisa PRs y sugiere mejoras de código",
  "avatarUrl": "https://example.com/avatar.png",
  "homepageUrl": "https://github.com/my-agent",
  "provider": "anthropic",
  "model": "claude-sonnet-4-20250514",
  "capabilities": ["chat", "tool-use", "code-review"],
  "metadata": {
    "version": "1.0.0",
    "languages": ["typescript", "python"]
  },
  "agentCard": {
    "name": "Code Reviewer",
    "url": "https://my-agent.dev",
    "description": "Automated code review agent",
    "skills": [
      { "id": "review-pr", "name": "Review Pull Request" }
    ]
  }
}
```

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `slug` | string | Sí | Identificador único (3-64 chars, lowercase, alfanumérico + guiones) |
| `displayName` | string | Sí | Nombre visible (1-128 chars) |
| `description` | string | No | Descripción del agente (max 1024) |
| `avatarUrl` | string | No | URL de avatar |
| `homepageUrl` | string | No | URL de la página del agente |
| `provider` | string | No | Proveedor LLM (anthropic, openai, custom) |
| `model` | string | No | Modelo usado |
| `capabilities` | string[] | No | Lista de capacidades (max 20) |
| `metadata` | object | No | Datos adicionales libres |
| `agentCard` | object | No | Agent Card compatible con protocolo A2A |

### Response (201)

```json
{
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "slug": "code-reviewer",
    "displayName": "Code Reviewer Agent",
    "status": "active",
    "apiKeyPrefix": "mge_ag_7xK9mN2p",
    "apiKey": "mge_ag_7xK9mN2pQ4rT8wB1nC5vF3jL6yH0eA9kD2gM...",
    "createdAt": "2026-02-26T10:00:00.000Z"
  }
}
```

> **IMPORTANTE**: `apiKey` solo se retorna en este momento. Guárdala de forma segura.

---

## 4. Gestión de Conversaciones

### Crear conversación

```
POST /agent/conversations
```

```json
{
  "title": "Deploy a producción",
  "description": "Necesito aprobación para deploy v2.0",
  "intentType": "permission",
  "context": {
    "environment": "production",
    "version": "2.0.0",
    "previousDeploy": "2026-02-25T15:00:00Z"
  },
  "settings": {
    "autoArchiveHours": 72
  }
}
```

| Campo | Valores | Descripción |
|-------|---------|-------------|
| `intentType` | `permission`, `clarification`, `solicitation`, `notification` | Compatible con protocolo A2H |
| `context` | object | Estado persistente del agente para esta conversación |

### Listar conversaciones

```
GET /agent/conversations?limit=20&cursor={uuid}
```

### Obtener detalle con participantes

```
GET /agent/conversations/{id}
```

```json
{
  "data": {
    "id": "...",
    "title": "Deploy a producción",
    "status": "active",
    "context": { "environment": "production" },
    "participants": [
      {
        "actorType": "agent",
        "agentId": "550e...",
        "displayName": "Deploy Bot",
        "role": "owner",
        "joinedAt": "2026-02-26T10:00:00Z"
      },
      {
        "actorType": "human",
        "humanId": "660f...",
        "displayName": "carlos@empresa.com",
        "role": "participant",
        "joinedAt": "2026-02-26T10:05:00Z"
      }
    ]
  }
}
```

### Actualizar conversación (solo owner)

```
PATCH /agent/conversations/{id}
```

```json
{
  "status": "archived",
  "context": { "deployResult": "success", "completedAt": "2026-02-26T12:00:00Z" }
}
```

---

## 5. Envío de Mensajes

### Enviar mensaje

```
POST /agent/conversations/{id}/messages
```

```json
{
  "type": "text",
  "content": "He analizado el código. Encontré 3 issues críticos.",
  "metadata": {
    "model": "claude-sonnet-4-20250514",
    "tokensUsed": 1523
  }
}
```

### Tipos de mensaje

| Tipo | Descripción | Quién lo envía |
|------|-------------|----------------|
| `text` | Texto/markdown | Agente o Humano |
| `tool_call` | Agente ejecutando herramienta | Agente |
| `tool_result` | Resultado de herramienta | Agente |
| `form` | Formulario interactivo | Agente |
| `form_response` | Respuesta a formulario | Humano |
| `approval` | Solicitud de aprobación | Agente |
| `approval_response` | Decisión de aprobación | Humano |
| `notification` | Notificación no-blocking | Agente |
| `file` | Archivo adjunto | Agente o Humano |
| `system` | Evento del sistema | Sistema |

### Listar mensajes (paginado)

```
GET /agent/conversations/{id}/messages?limit=50
```

Retorna mensajes en orden cronológico con cursor para paginar hacia atrás.

### Responder a un mensaje

```json
{
  "type": "text",
  "content": "Tienes razón, voy a corregirlo",
  "replyToId": "message-uuid-del-mensaje-original"
}
```

---

## 6. Mensajes Estructurados

Los mensajes estructurados son el corazón de la interacción agente↔humano. Usan el campo `structuredData` junto con el `type` correspondiente.

### 6.1 Tool Calls (Visibilidad de herramientas)

El humano ve EN TIEMPO REAL qué herramientas está usando el agente:

```json
{
  "type": "tool_call",
  "content": "Buscando en la base de datos...",
  "structuredData": {
    "toolName": "database_query",
    "toolInput": {
      "query": "SELECT * FROM orders WHERE status = 'pending'"
    },
    "toolServer": "mcp://db-server",
    "status": "running"
  }
}
```

Cuando termina, envía el resultado:

```json
{
  "type": "tool_result",
  "content": "Encontré 15 órdenes pendientes",
  "structuredData": {
    "toolCallId": "uuid-del-tool-call",
    "output": { "count": 15, "orders": ["..."] },
    "durationMs": 234
  },
  "toolCallId": "uuid-del-tool-call"
}
```

### 6.2 Formularios Interactivos

El agente envía un formulario, el humano responde con datos estructurados:

**Agente envía:**

```json
{
  "type": "form",
  "content": "Necesito los datos del servidor para configurar el deploy",
  "structuredData": {
    "formId": "server-config-001",
    "title": "Configuración del Servidor",
    "fields": [
      {
        "name": "environment",
        "type": "select",
        "label": "Entorno",
        "options": ["staging", "production"],
        "required": true
      },
      {
        "name": "replicas",
        "type": "number",
        "label": "Número de réplicas",
        "required": true,
        "defaultValue": 3
      },
      {
        "name": "notes",
        "type": "textarea",
        "label": "Notas adicionales",
        "required": false
      }
    ],
    "expiresAt": "2026-02-26T18:00:00Z"
  }
}
```

**Humano responde:**

```json
{
  "type": "form_response",
  "structuredData": {
    "formId": "server-config-001",
    "responses": {
      "environment": "production",
      "replicas": 5,
      "notes": "Usar la subnet privada"
    }
  }
}
```

### 6.3 Aprobaciones

Para acciones que requieren permiso humano, con niveles de riesgo:

**Agente solicita:**

```json
{
  "type": "approval",
  "content": "Quiero ejecutar una migración destructiva en la base de datos de producción",
  "structuredData": {
    "approvalId": "migration-drop-table-users",
    "action": "DROP TABLE legacy_users",
    "riskLevel": "critical",
    "details": "Eliminar tabla legacy_users (45,000 registros). Backup creado en s3://backups/legacy_users_20260226.sql",
    "expiresAt": "2026-02-26T20:00:00Z"
  }
}
```

| riskLevel | Descripción | UI sugerida |
|-----------|-------------|-------------|
| `low` | Operación segura y reversible | Badge verde |
| `medium` | Cambios significativos pero reversibles | Badge amarillo |
| `high` | Cambios difíciles de revertir | Badge naranja + confirmación |
| `critical` | Irreversible o altamente sensible | Badge rojo + doble confirmación |

**Humano responde:**

```json
{
  "type": "approval_response",
  "structuredData": {
    "approvalId": "migration-drop-table-users",
    "decision": "approved",
    "reason": "Backup verificado, procede"
  }
}
```

### 6.4 Notificaciones

Mensajes informativos con severidad:

```json
{
  "type": "notification",
  "content": "Deploy completado exitosamente",
  "structuredData": {
    "severity": "success",
    "title": "Deploy v2.0 Complete",
    "details": "3 instancias desplegadas en us-east-1. Tiempo total: 4m 32s",
    "acknowledgeRequired": false
  }
}
```

| severity | Uso |
|----------|-----|
| `info` | Información general |
| `warning` | Algo requiere atención |
| `error` | Algo falló |
| `success` | Operación exitosa |

---

## 7. Invitar Humanos

Los agentes invitan humanos a conversaciones por email:

### Crear invitación

```
POST /agent/conversations/{id}/invitations
```

```json
{
  "email": "carlos@empresa.com",
  "message": "Necesito tu aprobación para el deploy a producción",
  "language": "es",
  "expiresInHours": 48
}
```

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `email` | string | Sí | Email del humano |
| `message` | string | No | Mensaje personalizado dentro del email |
| `language` | enum | No | `en`, `es` o `ca`. Ausente equivale a `en`. Ver [idioma del email](#idioma-del-email) — no traduce `message` |
| `expiresInHours` | number | No | Horas hasta que expira la invitación (default 48) |

El humano recibe un email con un código de verificación:
1. Se autentica vía código de verificación (sin contraseña)
2. Acepta la invitación
3. Se une a la conversación como participante

### Flujo del humano

```bash
# 1. Recibe email con código → envía código:
POST /human/auth/verify  { "email": "...", "code": "123456" }
# → Recibe session token

# 2. Lista invitaciones pendientes
GET /human/invitations
# Authorization: Bearer sess_...

# 3. Acepta
POST /human/invitations/{token}/accept

# 4. Lee mensajes de la conversación
GET /human/conversations/{id}/messages

# 5. Responde
POST /human/conversations/{id}/messages

# 6. Descarga un adjunto de esa conversación
GET /human/conversations/{id}/files/{attachmentId}/download
```

La descarga devuelve el fichero, no una URL de almacenamiento. El adjunto tiene
que colgar de un mensaje de `{id}`: un `attachmentId` solo es válido en la
conversación a la que se subió, y pedirlo bajo cualquier otra responde `404`
aunque seas participante de ambas. La conversación de la ruta es la frontera de
autorización, así que un adjunto ajeno se reporta como inexistente, no como
prohibido.

### Listar invitaciones de una conversación

```
GET /agent/conversations/{id}/invitations
```

### Revocar invitación

```
DELETE /agent/invitations/{invitation-id}
```

---

## 8. Human Queries

Los agentes pueden hacer preguntas directas a humanos. El humano recibe un email de notificación con la pregunta y responde en la web app (`agentdialog.io`) — un código sin contraseña es el inicio de sesión, no hay que crear una cuenta a mano. Hay dos formas de crear la query: las rutas REST de abajo, o el protocolo MCP (Model Context Protocol) si tu cliente ya habla MCP. Ambas comparten el mismo modelo de datos y los mismos seis estados de query.

Una query no es texto libre en ninguna dirección. El agente declara un `subject` (de qué trata, con algo que el humano pueda mirar) y un `answer_space` (la forma cerrada que debe tener la respuesta), y antes de convertirse en query, la petición pasa por una **puerta de admisión**: se rechaza con `422` cualquier pregunta que un humano no pudiera decidir realmente — un `subject` sin referente, un riesgo por encima de `low` sin consecuencias declaradas, una decisión repetida sin `changes`, etc. El campo `remedy` de ese `422` dice exactamente qué añadir.

### REST API

#### Crear query

```
POST /agent/queries
```

```json
{
  "query_type": "validation",
  "risk": "low",
  "subject": {
    "id": "q4-revenue-figure",
    "label": "Cifra de revenue de Q4",
    "body": "Q4 revenue: 2.300.000 EUR (+15% YoY). Fuente: finance.quarterly_revenue, corte del 2026-01-05."
  },
  "answer_space": {
    "kind": "boolean",
    "labels": { "t": "Correcto", "f": "Incorrecto" }
  },
  "question": "¿Los datos de revenue de Q4 son correctos? 2,3M EUR (+15% YoY)",
  "context": "Datos extraídos de BigQuery, tabla finance.quarterly_revenue...",
  "target_human_email": "sarah@example.com",
  "confidence": 0.7,
  "language": "es",
  "timeout_minutes": 30
}
```

El `subject` de arriba lleva el referente en `body`. **Sin referente y sin `self_contained: true` la petición se rechaza con `422 missing_referent`** — a cualquier riesgo. Si la pregunta de verdad no trata sobre ningún artefacto (un juicio, una preferencia), esa es la válvula de escape:

```json
{
  "query_type": "expert_query",
  "subject": {
    "id": "politica-reembolsos-2026",
    "label": "Criterio de reembolso fuera de plazo"
  },
  "self_contained": true,
  "answer_space": {
    "kind": "choice",
    "select": "one",
    "options": [
      { "id": "reembolsar", "label": "Reembolsar igualmente" },
      { "id": "denegar", "label": "Denegar" }
    ]
  },
  "question": "Como criterio general, ¿reembolsamos fuera de plazo cuando el cliente avisó por teléfono?",
  "target_human_email": "sarah@example.com",
  "timeout_minutes": 120
}
```

`self_contained` no es un atajo: si hay algo que mirar, hay que mandarlo.

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `query_type` | enum | Sí | `validation`, `interpretation`, `expert_query`, `labeling` |
| `subject` | object | Sí | De qué trata la pregunta — ver [Subject](#subject) abajo |
| `answer_space` | object | Sí | La forma cerrada que debe tener la respuesta — ver [Answer spaces](#answer-spaces) abajo |
| `question` | string | Sí | La pregunta para el humano (max 10,000 chars) |
| `target_human_email` | string | Sí | Email del humano a quien preguntar |
| `risk` | enum | No | `low` (default), `medium`, `high`, `critical` — un piso; la puerta de admisión puede subirlo, nunca bajarlo |
| `self_contained` | boolean | No | `true` solo si la pregunta de verdad no necesita referente (default `false`) |
| `changes` | array | No | Deltas antes/después que cubre esta decisión — obligatorio por encima de `low` si este humano ya decidió sobre este `subject` |
| `context` | string | No | Contexto adicional: código, datos, etc. (max 100,000 chars) |
| `confidence` | number | No | Confianza del agente en su propia evaluación (0-1) |
| `language` | enum | No | `en`, `es` o `ca`. Ausente equivale a `en`. Ver [idioma del email](#idioma-del-email) — **no traduce** `question`, `context` ni `changes` |
| `timeout_minutes` | number | No | Minutos antes de expirar (default: 60, max: 10080) |
| `metadata` | object | No | Metadata arbitraria asociada a la query |

##### Subject

`subject` es de qué trata la pregunta: un id estable que se reutiliza para la misma cosa, una etiqueta que el humano reconoce, y (salvo que `self_contained` sea `true`) un referente que pueda mirar.

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `id` | string | Sí | Id estable, reutilizado entre queries sobre lo mismo |
| `label` | string | Sí | Etiqueta legible |
| `uri` | string | No | Enlace `http(s)` al referente. Otros esquemas se rechazan |
| `body` | string | No | El referente inline, si no hay una URI estable |
| `sha256` | string | No | Hash del referente — obligatorio por encima de `medium` risk, donde además el referente tiene que ser `body`: no se puede hashear lo que no se tiene |

##### Answer spaces

`answer_space` es una de seis formas cerradas. `kind` es el discriminador.

| Kind | Campos | Forma de la respuesta |
|------|--------|------------------------|
| `boolean` | `labels: { t, f }`, `consequences?: { t, f }` | `{ "kind": "boolean", "value": true \| false }` |
| `choice` | `select: "one" \| "many"`, `options: [{ id, label, consequence? }]` | `{ "kind": "choice", "option_ids": [...] }` |
| `scalar` | `unit`, `min?`, `max?`, `step?`, `effect?` | `{ "kind": "scalar", "value": number }` |
| `date` | `earliest?`, `latest?`, `effect?` | `{ "kind": "date", "value": "YYYY-MM-DD" }` |
| `text` | `max_length` | `{ "kind": "text", "value": string }` — rechazado por encima de `low` risk |
| `fields` | `fields: [Slot]`, `effect?` | `{ "kind": "fields", "values": { [slotId]: ... } }` |

Un slot de `fields` es un único dato — `{ id, label, kind, ... }`, con la misma forma por `kind` que arriba, sin `consequences`/`consequence` (un slot no nunca anida). Por encima de `low` risk, cada rama de un `answer_space` discreto (`boolean`, `choice`) debe declarar su `consequences`/`consequence`.

**Response (201):**

```json
{
  "data": {
    "query_id": "uuid",
    "status": "pending",
    "conversation_id": "uuid",
    "message": "Query created. An invitation email has been sent to the human, who signs in at agentdialog.io to see and answer it.",
    "next_step": "Use get_query with query_id \"uuid\" to poll for the response. Wait at least 10-30 seconds between polls.",
    "expires_at": "2026-08-20T18:30:00.000Z"
  }
}
```

Todas las respuestas REST van envueltas en un objeto `data` de nivel superior.

`status` viene `pending` o `assigned` directamente — ver [auto-trust](#auto-trust) más abajo. `message` describe en texto qué pasa después según el `status`; `next_step` indica qué llamar a continuación.

##### Rechazada: 422

```json
{
  "error": {
    "code": "UNDECIDABLE_QUERY",
    "message": "The subject 'q4-revenue-figure' carries no uri or body, so the human has nothing to look at.",
    "reason": "missing_referent",
    "detail": "The subject 'q4-revenue-figure' carries no uri or body, so the human has nothing to look at.",
    "remedy": "Link the artefact with `uri`, inline it with `body`, or set `self_contained: true` if the question really is about nothing."
  }
}
```

`remedy` dice exactamente qué añadir. No es un error transitorio — corrige la petición y reintenta.

#### Consultar una query

```
GET /agent/queries/{id}
```

**Response cuando `answered`:**

```json
{
  "data": {
    "query_id": "uuid",
    "status": "answered",
    "status_description": "The human has responded. Their answer is in the 'answer' field below. No further polling needed.",
    "query_type": "validation",
    "question": "...",
    "context": "...",
    "confidence": 0.7,
    "answer": { "kind": "boolean", "value": true },
    "comment": "Confirmed against the Finance report.",
    "human_confidence": null,
    "response_time_ms": 45000,
    "insufficient_reason": null,
    "created_at": "2026-08-20T16:30:00.000Z",
    "expires_at": "2026-08-20T18:30:00.000Z"
  }
}
```

`status_description` acompaña siempre a la query (una frase legible sobre qué significa `status` y qué hacer después). `answer`, `comment` y `human_confidence` son `null` hasta que `status` es `answered`. `insufficient_reason` es `null` salvo que `status` sea `needs_context`.

#### Aclarar una query

```
PATCH /agent/queries/{id}
```

Solo válido cuando `status` es `needs_context`. Envía lo que resuelva lo que el humano marcó como faltante:

```json
{
  "context": "Changelog: https://example.test/changelog/2.3"
}
```

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `subject` | object | No | Referente de reemplazo |
| `answer_space` | object | No | Forma de respuesta de reemplazo |
| `changes` | array | No | Delta antes/después |
| `question` | string | No | Pregunta reformulada |
| `context` | string | No | Contexto adicional |
| `language` | enum | No | `en`, `es` o `ca` — reemplaza el idioma declarado en la creación. Ver [idioma del email](#idioma-del-email) |

Al menos un campo es obligatorio — un `PATCH` vacío se rechaza. Los campos que no se envían conservan su valor anterior. La petición pasa por la misma puerta de admisión que la creación y puede volver `422` igual. Si tiene éxito, la query vuelve a `status: "assigned"` con la misma forma que [consultar una query](#consultar-una-query), y su reloj de expiración retoma desde donde se pausó.

#### Cancelar una query

```
POST /agent/queries/{id}/cancel
```

Retira una query antes de que el humano responda. Válido desde `pending`, `assigned`, o `needs_context`.

Devuelve la query con la misma forma que [consultar una query](#consultar-una-query), con `status: "cancelled"`. Si la respuesta del humano ya llegó primero, esto devuelve `409` en su lugar — una respuesta que ya existe nunca se descarta.

#### Listar queries

```
GET /agent/queries
```

| Param | Tipo | Default | Descripción |
|-------|------|---------|-------------|
| `status` | string | — | Filtra por `pending`, `assigned`, `needs_context`, `answered`, `cancelled`, `expired` |
| `limit` | number | 20 | Máximo de items (1-100) |

### MCP

La misma funcionalidad, expuesta como tools MCP para clientes como Claude o GPT.

#### Endpoint MCP

```
POST /mcp
```

AgentDialog expone un servidor MCP compatible con Claude, GPT, y cualquier cliente MCP. Configúralo en tu cliente:

```json
{
  "mcpServers": {
    "agentdialog": {
      "url": "https://api.agentdialog.io/mcp"
    }
  }
}
```

#### Tool: `human_query`

Crea una query para que un humano responda una pregunta que de verdad pueda decidir. Envía un email de notificación con la pregunta completa; el humano responde en la web app, no en su inbox.

```json
{
  "query_type": "validation",
  "risk": "low",
  "subject": {
    "id": "q4-revenue-figure",
    "label": "Cifra de revenue de Q4",
    "body": "Q4 revenue: 2.300.000 EUR (+15% YoY). Fuente: finance.quarterly_revenue, corte del 2026-01-05."
  },
  "answer_space": {
    "kind": "boolean",
    "labels": { "t": "Correcto", "f": "Incorrecto" }
  },
  "question": "¿Los datos de revenue de Q4 son correctos? 2,3M EUR (+15% YoY)",
  "context": "Datos extraídos de BigQuery, tabla finance.quarterly_revenue...",
  "target_human_email": "sarah@example.com",
  "confidence": 0.7,
  "language": "es",
  "timeout_minutes": 30
}
```

El `subject` de arriba lleva el referente en `body`. **Sin referente y sin `self_contained: true` la petición se rechaza con `422 missing_referent`** — a cualquier riesgo. Si la pregunta de verdad no trata sobre ningún artefacto (un juicio, una preferencia), esa es la válvula de escape:

```json
{
  "query_type": "expert_query",
  "subject": {
    "id": "politica-reembolsos-2026",
    "label": "Criterio de reembolso fuera de plazo"
  },
  "self_contained": true,
  "answer_space": {
    "kind": "choice",
    "select": "one",
    "options": [
      { "id": "reembolsar", "label": "Reembolsar igualmente" },
      { "id": "denegar", "label": "Denegar" }
    ]
  },
  "question": "Como criterio general, ¿reembolsamos fuera de plazo cuando el cliente avisó por teléfono?",
  "target_human_email": "sarah@example.com",
  "timeout_minutes": 120
}
```

`self_contained` no es un atajo: si hay algo que mirar, hay que mandarlo.

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `query_type` | enum | Sí | `validation`, `interpretation`, `expert_query`, `labeling` |
| `risk` | enum | No | `low` (default), `medium`, `high`, `critical` — un piso; el servidor puede subirlo, nunca bajarlo |
| `subject` | object | Sí | De qué trata: un id, una label, y un referente (`uri` o `body`) |
| `self_contained` | boolean | No | `true` solo si la pregunta de verdad no necesita referente |
| `answer_space` | object | Sí | La forma cerrada de la respuesta: `boolean`, `choice`, `scalar`, `date`, `text` o `fields` — ver la sección REST arriba para el catálogo completo |
| `question` | string | Sí | La pregunta para el humano (max 10,000 chars) |
| `context` | string | No | Contexto adicional: código, datos, etc. (max 100,000 chars) |
| `changes` | array | No | Deltas antes/después que cubre esta decisión |
| `target_human_email` | string | Sí | Email del humano a quien preguntar |
| `confidence` | number | No | Confianza del agente en su propia evaluación (0-1) |
| `language` | enum | No | `en`, `es` o `ca`. Cambia el envoltorio del email — asunto, etiquetas, fechas — pero **no traduce** `question`, `subject`, `answer_space` ni `changes`: eso viaja tal cual lo escribas, así que escríbelo en el idioma que declares aquí |
| `timeout_minutes` | number | No | Minutos antes de expirar (default: 60, max: 10080) |

**Response:**

```json
{
  "query_id": "uuid",
  "status": "pending",
  "conversation_id": "uuid",
  "message": "Query created. An invitation email has been sent to the human, who answers in the web app.",
  "next_step": "Use get_query with query_id to poll for the response.",
  "expires_at": "2026-03-12T15:30:00.000Z"
}
```

Una pregunta que la puerta de admisión juzga indecidible viene rechazada como error con `reason`, `remedy` y (si aplica) `prior_query_id`:

```json
{
  "error": "The subject 'q4-revenue-figure' carries no uri or body, so the human has nothing to look at.",
  "code": "UNDECIDABLE_QUERY",
  "reason": "missing_referent",
  "remedy": "Link the artefact with `uri`, inline it with `body`, or set `self_contained: true` if the question really is about nothing."
}
```

`remedy` dice exactamente qué añadir — corrige y reintenta.

#### Tool: `clarify_query`

Envía lo que el humano dijo que faltaba, después de que `get_query` reporte `status: "needs_context"`. Solo válido desde ese estado — llamarla en cualquier otro estado se rechaza. Hay un límite de cuántas veces se puede aclarar una misma query; superado ese límite, el `remedy` indica abrir una query nueva en su lugar.

```json
{
  "query_id": "uuid-de-la-query",
  "context": "Changelog: https://example.test/changelog/2.3"
}
```

Envía solo los campos que resuelvan lo que el humano marcó como faltante: `subject` (si el referente necesita arreglo), `changes` (si es un delta sobre una decisión previa), `answer_space`, `question` o `context`. Lo que no envíes conserva su valor anterior, pero hay que enviar al menos un campo — un `query_id` solo se rechaza, igual que en la ruta REST `PATCH`. Si tiene éxito, la query vuelve a `assigned` y el humano puede responder de nuevo.

#### Tool: `cancel_query`

Retira una query cuyo contexto quedó obsoleto, antes de que el humano responda.

```json
{
  "query_id": "uuid-de-la-query"
}
```

Una respuesta que ya llegó gana: si el humano respondió primero, esta llamada devuelve un conflicto en vez de descartar silenciosamente su decisión — revisa el resultado en vez de asumir que la retirada surtió efecto. Una vez cancelada, la query queda cerrada para siempre; crea una nueva si aún necesitas una respuesta.

#### Tool: `get_query`

Consulta el estado de una query. Usa esto para poll después de crear una query.

```json
{
  "query_id": "uuid-de-la-query"
}
```

**Estados:**

| Status | Descripción |
|--------|-------------|
| `pending` | El humano fue invitado pero no ha aceptado aún |
| `assigned` | El humano aceptó (o es trusted) y puede ver la query |
| `needs_context` | El humano no pudo decidir con lo que le diste. Lee `insufficient_reason` y usa `clarify_query` para completar lo que falta. El reloj está pausado mientras tanto |
| `answered` | El humano respondió — la respuesta tipada está en el campo `answer` |
| `cancelled` | Retiraste esta query con `cancel_query` |
| `expired` | Expiró sin respuesta |

**Response cuando answered:**

```json
{
  "query_id": "uuid",
  "status": "answered",
  "status_description": "The human has responded. Their answer is in the 'answer' field below. No further polling needed.",
  "answer": { "kind": "boolean", "value": true },
  "comment": "Confirmed against the Finance report.",
  "human_confidence": null,
  "response_time_ms": 45000,
  "insufficient_reason": null
}
```

#### Tool: `list_queries`

Lista todas las queries del agente con filtros opcionales.

```json
{
  "status": "needs_context",
  "limit": 20
}
```

`status` acepta `pending`, `assigned`, `needs_context`, `answered`, `cancelled` o `expired`. `needs_context` es el filtro útil después de cualquier turno que te devuelva una query pendiente de aclarar: encuentra de una sola vez todas las que están esperando por ti, en vez de consultarlas una por una con `get_query`.

#### Auto-trust

Si el humano ya aceptó una invitación previa del mismo agente, las queries futuras se auto-asignan (status `assigned` directo, sin necesidad de aceptar invitación). Esto permite un flujo aún más rápido para humanos recurrentes.

---

### Responder desde el enlace del email

Una query de riesgo `low` o `medium` genera además un **grant**: una capacidad
acotada a resolver *esa* pregunta, entregada como un enlace en el email de
notificación. No es una sesión — quien tiene el enlace puede responder esa
pregunta y nada más: no lee el hilo, no ve otras queries y no obtiene acceso a
la cuenta.

Las queries `high` y `critical` **no generan grant**. Ahí el humano se
identifica con su código, como siempre.

#### Ver la pregunta

```
GET /api/v1/public/queries/:token
```

Sin autenticación. Devuelve la pregunta, su `subject`, su `answer_space`, su
`risk` y **quién la hace** (`agent.display_name`) — nadie debería decidir por
un desconocido.

**Este `GET` no consume el enlace.** Los escáneres corporativos de correo abren
los enlaces antes que el destinatario; si abrirlo lo gastara, la pregunta
quedaría inutilizable antes de que nadie la leyera.

#### Responder

```
POST /api/v1/public/queries/:token/respond
```

Mismo cuerpo que `POST /api/v1/human/queries/:id/respond`:

```json
{ "outcome": "answer", "answer": { "kind": "choice", "option_ids": ["publish"] } }
```

o, si la persona no puede decidir con lo que se le ha dado:

```json
{ "outcome": "insufficient_context", "reason": "unclear_consequences" }
```

**Solo `outcome: "answer"` consume el enlace.** `insufficient_context` devuelve
el turno al agente, y esa persona tiene que poder volver por el mismo enlace
cuando el agente aclare.

#### Errores

Un token desconocido, uno caducado y uno ya usado devuelven **el mismo `401`
con el mismo mensaje**. Distinguirlos convertiría el endpoint en un oráculo que
confirma a un desconocido qué enlaces existieron.

El enlace caduca **con la query**: cuando la pregunta muere, el enlace muere. No
hay endpoint para revocarlo — `cancel_query` mata la query y con ella el enlace.

---

## 9. Notificaciones por Email

La web app en `agentdialog.io` es la única forma en la que un humano responde
— a una invitación, a un mensaje o a una query. El email cumple dos roles
distintos y ninguno de los dos es "responder":

1. **Notifica** que hay algo esperando (una invitación, una query, un mensaje nuevo).
2. **Lleva el enlace**. Qué enlace depende del riesgo de la query:

   - `low` y `medium`: un enlace a `/q/<token>` que abre **esa** pregunta y
     permite resolverla sin iniciar sesión. Ver «Responder desde el enlace del
     email» en la sección 8.
   - `high` y `critical`: un enlace a la conversación donde vive la pregunta,
     con el email prerrellenado. Ahí sí hace falta el código.

   En el segundo caso el email **autentica**: lleva el código de inicio de
   sesión sin contraseña. No hay formulario de registro — el código *es* el
   login — pero sí hay cuenta y sesión una vez que el humano entra.

### Idioma del email

El catálogo es cerrado: **`en`, `es`, `ca`**. Cualquier otro valor de
`language` se rechaza con `422`. El euskera está fuera a propósito — un
idioma entra en el catálogo cuando hay quien lo valide, no antes.

Qué decide el idioma depende de si hay un navegador delante o no:

- **Si hay un navegador delante, manda el navegador.** El email del código de
  inicio de sesión (`POST /human/auth/send-code`) toma el idioma del header
  `Accept-Language` de quien lo pide — hay una persona con un navegador en ese
  momento, y es mejor fuente que cualquier cosa que pudiéramos inferir de su
  historial. Este email **no** usa el `language` que un agente haya declarado.
- **Si no hay navegador, manda lo que el agente declaró.** El email de una
  query (`POST /agent/queries`, y su PATCH de aclaración) y el de una
  invitación (`POST /agent/conversations/{id}/invitations`) usan el `language`
  que el agente mandó en la petición.
- **Sin ninguno de los dos, inglés.** `language` ausente, o un valor que ya no
  esté soportado (una fila escrita antes de que la columna existiera), cae en
  `en` sin fallar.

**Declarar un idioma no traduce lo que escribe el agente.** Cambia el
envoltorio que el producto pone alrededor de la pregunta — el asunto, las
etiquetas, las fechas — y es una pista para el agente sobre en qué idioma
escribir. La pregunta, el asunto y cuerpo del subject, las opciones y sus
consecuencias, el contexto y los `changes` viajan exactamente como se
escribieron. Un integrador que asuma que traducimos por él lo descubre el día
que un humano recibe un envoltorio en catalán alrededor de una pregunta en
inglés.

### Qué pasa si el humano responde al email

Si el humano hace reply al email de notificación, ese reply llega a un buzón
real (`REPLY_TO_ADDRESS`, ver más abajo) con un autoresponder que lo redirige
de vuelta a la app. Nada lee ese buzón de forma programática — el reply no
llega al agente por ningún camino.

### Webhook inbound (inactivo)

```
POST /api/v1/webhooks/email/inbound
```

Este endpoint existe y sigue verificando la firma del proveedor de email
(Resend/SendGrid), pero **no está conectado a nada en producción hoy**: ni
`agentdialog.io` ni `reply.agentdialog.io` tienen registro MX, así que ningún
proveedor entrega mail entrante ahí, y el correo saliente ya no lleva un
`Reply-To` por query que un webhook pudiera casar contra una query id. No es
una promesa vacía: el día que un proveedor transaccional de email quede
apuntando a un dominio propio, activar este endpoint es configuración —
DNS y las variables de abajo — no construcción.

**Variables de entorno:**

| Variable | Descripción | Default |
|----------|-------------|---------|
| `REPLY_TO_ADDRESS` | Buzón real donde cae la respuesta de un humano al email de notificación. Nada lo lee de forma programática — es un mailbox con autoresponder que redirige a la app. Sin configurar, el email no lleva `Reply-To`. | (opcional) |
| `REPLY_DOMAIN` | Dominio reservado para el webhook inactivo de arriba; no se usa mientras no se envíe un `Reply-To` por query. | `reply.agentdialog.io` |
| `REPLY_LOCAL_PART` | Local-part reservado para ese mismo webhook inactivo. | `reply` |
| `INBOUND_EMAIL_WEBHOOK_SECRET` | Secret para verificar la firma del proveedor. Requerido en producción — sin él, el endpoint rechaza los requests en vez de aceptarlos sin firmar. | (opcional) |
| `INBOUND_EMAIL_PROVIDER` | Proveedor: `resend` o `sendgrid`. | `resend` |

---

## 10. Subida de Archivos

### Upload directo (multipart)

```
POST /agent/conversations/{id}/upload
Content-Type: multipart/form-data
```

```bash
curl -X POST https://api.agentdialog.io/api/v1/agent/conversations/{id}/upload \
  -H "Authorization: Bearer mge_ag_..." \
  -F "file=@report.pdf"
```

Límite: 10MB por archivo.

### Upload con URL pre-firmada (archivos grandes)

```
POST /agent/conversations/{id}/upload/presigned
```

```json
{ "fileName": "large-dataset.csv" }
```

Response:

```json
{
  "data": {
    "url": "https://storage.agentdialog.io/agentdialog-files/abc123/large-dataset.csv?X-Amz-...",
    "storageKey": "abc123/large-dataset.csv",
    "bucket": "agentdialog-files"
  }
}
```

Sube directamente con PUT a la URL pre-firmada (expira en 1 hora).

---

## 11. WebSocket (Tiempo Real)

Conéctate para recibir mensajes y eventos en tiempo real.

### Conexión

```
wss://api.agentdialog.io/ws?token=mge_ag_7xK9mN2pQ...
```

Soporta tanto API keys de agente como session tokens de humano.

### Suscribirse a una conversación

```json
→ { "type": "subscribe", "conversationId": "uuid-de-conversacion" }
← { "type": "subscribed", "data": { "conversationId": "..." } }
```

### Eventos que recibes

```json
← {
    "type": "message.new",
    "data": {
      "id": "msg-uuid",
      "conversationId": "conv-uuid",
      "senderType": "human",
      "senderHumanId": "human-uuid",
      "type": "text",
      "content": "Aprobado, procede con el deploy",
      "createdAt": "2026-02-26T10:15:00Z"
    }
  }

← {
    "type": "typing",
    "data": {
      "conversationId": "conv-uuid",
      "actorType": "human",
      "actorId": "human-uuid"
    }
  }

← {
    "type": "participant.joined",
    "data": { "conversationId": "...", "actorType": "human", "humanId": "..." }
  }
```

### Enviar eventos

```json
→ { "type": "typing", "conversationId": "uuid" }
→ { "type": "read", "conversationId": "uuid", "messageId": "msg-uuid" }
→ { "type": "ping" }
← { "type": "pong" }
```

### Desuscribirse

```json
→ { "type": "unsubscribe", "conversationId": "uuid" }
```

### Ejemplo en TypeScript

```typescript
const ws = new WebSocket("wss://api.agentdialog.io/ws?token=mge_ag_...");

ws.onopen = () => {
  // Suscribirse a una conversación
  ws.send(JSON.stringify({
    type: "subscribe",
    conversationId: "conv-uuid"
  }));
};

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);

  switch (msg.type) {
    case "message.new":
      console.log(`Nuevo mensaje de ${msg.data.senderType}:`, msg.data.content);
      // Procesar respuesta del humano
      if (msg.data.type === "approval_response") {
        const decision = msg.data.structuredData.decision;
        console.log(`Aprobación: ${decision}`);
      }
      break;

    case "typing":
      console.log(`${msg.data.actorType} está escribiendo...`);
      break;

    case "participant.joined":
      console.log("Nuevo participante se unió");
      break;
  }
};

// Heartbeat
setInterval(() => ws.send(JSON.stringify({ type: "ping" })), 30000);
```

---

## 12. Webhooks

Para agentes que operan asíncronamente (cron jobs, event-driven), los webhooks entregan eventos vía HTTP POST.

### Registrar webhook

```
POST /agent/webhooks
```

```json
{
  "url": "https://mi-agente.dev/webhooks/agentdialog",
  "events": ["message.new", "participant.joined", "invitation.updated"]
}
```

Response:

```json
{
  "data": {
    "id": "webhook-uuid",
    "url": "https://mi-agente.dev/webhooks/agentdialog",
    "events": ["message.new", "participant.joined", "invitation.updated"],
    "isActive": true,
    "secret": "whsec_..."
  }
}
```

> **IMPORTANTE**: `secret` solo se retorna una vez. Guárdalo para verificar firmas.

### Destinos que se rechazan

La URL tiene que ser `http` o `https`, sin credenciales incrustadas
(`https://usuario:clave@…`), y su nombre tiene que resolver a una dirección
pública. Se rechaza con `422` todo lo que resuelva a loopback, a los rangos
privados (`10/8`, `172.16/12`, `192.168/16`), a link-local —incluido
`169.254.169.254`, el servicio de metadatos de la nube— o a los rangos
reservados. La comprobación mira **todas** las direcciones que devuelve el DNS,
así que las escrituras equivalentes (`http://2130706433/`, `http://0177.0.0.1/`)
caen igual.

La misma comprobación se repite justo antes de cada entrega, y las
redirecciones **no se siguen**: un `3xx` cuenta como entrega fallida. Un endpoint
que redirige tiene que registrarse en su destino final.

### Eventos disponibles

| Evento | Descripción |
|--------|-------------|
| `*` | Todos los eventos |
| `message.new` | Nuevo mensaje en conversación del agente |
| `message.updated` | Mensaje actualizado |
| `message.deleted` | Mensaje eliminado |
| `participant.joined` | Alguien se unió a conversación |
| `participant.left` | Alguien dejó la conversación |
| `invitation.updated` | Invitación aceptada/rechazada |
| `conversation.updated` | Conversación actualizada |
| `query.answered` | Human query respondida (incluye answer, comment, response_time_ms) |

### Payload del webhook

```http
POST /webhooks/agentdialog HTTP/1.1
Content-Type: application/json
webhook-id: msg_2KWPBgLlAfxdpx2AI54pPJ85f4W
webhook-timestamp: 1674087231
webhook-signature: v1,K5oZfzN95Z9UVu1EsfQmfVNQhnkZ2pj9o9NDN/H/pI4=
X-AgentDialog-Event: query.answered
User-Agent: AgentDialog-Webhook/2.0

{
  "event": "message.new",
  "data": {
    "message": {
      "id": "msg-uuid",
      "conversationId": "conv-uuid",
      "senderType": "human",
      "type": "approval_response",
      "structuredData": {
        "approvalId": "deploy-001",
        "decision": "approved",
        "reason": "Looks good"
      }
    }
  },
  "timestamp": "2026-02-26T10:15:00.000Z"
}
```

> **IMPORTANTE**: el `timestamp` del cuerpo es ISO-8601 y **no** forma parte de
> la firma. La protección contra replay depende únicamente de la cabecera
> `webhook-timestamp` (unix seconds, calculada en el momento del envío). Un
> verificador que compruebe el `timestamp` del body no está protegiendo nada.

### Verificar firma

Las entregas siguen [Standard Webhooks](https://www.standardwebhooks.com), así
que sirve cualquier verificador compatible — el nuestro o uno de terceros como
`svix`. La cadena firmada es `${webhook-id}.${webhook-timestamp}.${body}`,
firmada con los bytes decodificados del secreto `whsec_...` (no el string
literal). `webhook-signature` puede traer más de una firma `v1,<base64>`
separadas por espacio mientras un secreto está en rotación; basta con que una
coincida.

```typescript
import { createHmac, timingSafeEqual } from "crypto";

function verifyWebhook(
  secret: string,
  body: string,
  headers: { "webhook-id"?: string; "webhook-timestamp"?: string; "webhook-signature"?: string },
  toleranceSeconds = 300,
): boolean {
  const { "webhook-id": id, "webhook-timestamp": rawTimestamp, "webhook-signature": signatures } = headers;
  if (!id || !rawTimestamp || !signatures) return false;

  const timestamp = Number(rawTimestamp);
  if (!Number.isFinite(timestamp) || Math.abs(Date.now() / 1000 - timestamp) > toleranceSeconds) {
    return false;
  }

  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", key).update(`${id}.${rawTimestamp}.${body}`).digest();

  return signatures.split(" ").some((entry) => {
    const [version, value] = entry.split(",");
    if (version !== "v1" || !value) return false;
    const received = Buffer.from(value, "base64");
    return received.length === expected.length && timingSafeEqual(received, expected);
  });
}

// En tu handler, con el body en bruto (no re-serializado):
app.post("/webhooks/agentdialog", (req) => {
  if (!verifyWebhook(WEBHOOK_SECRET, req.rawBody, req.headers)) {
    return new Response("Invalid signature", { status: 400 });
  }

  const payload = JSON.parse(req.rawBody);
  // Procesar evento...
});
```

El SDK de TypeScript exporta esto mismo como `verifyWebhook` — ver
`sdks/typescript/README.md`.

### Rotar el secreto de un webhook

```
POST /agent/webhooks/{id}/rotate-secret
```

Response:

```json
{
  "data": {
    "id": "webhook-uuid",
    "url": "https://mi-agente.dev/webhooks/agentdialog",
    "events": ["*"],
    "isActive": true,
    "secret": "whsec_..."
  }
}
```

> **IMPORTANTE**: `secret` solo se retorna una vez, igual que en el registro.

El secreto anterior sigue firmando entregas durante **24 horas** tras la
rotación, así que un verificador desplegado de forma gradual nunca rechaza una
entrega a mitad de la rotación. Una segunda rotación dentro de esa ventana
termina de inmediato el periodo de gracia que aún estuviera abierto — solo el
secreto activo más reciente conserva una ventana de gracia. Es también la
única vía para reactivar un webhook sin ningún secreto vigente — la petición
lo reactiva.

### Auto-desactivación

Después de **10 fallos consecutivos**, el webhook se desactiva automáticamente.
`PATCH /agent/webhooks/{id}` con `{"isActive": true}` lo rechaza si no le queda
ningún secreto vigente; en ese caso, reactívalo con `rotate-secret`.

---

## 13. Rotación de API Key

Si tu key fue comprometida o quieres rotarla preventivamente:

```
POST /agent/key/rotate
Authorization: Bearer mge_ag_CURRENT_KEY
```

Response:

```json
{
  "data": {
    "apiKey": "mge_ag_NEW_KEY...",
    "apiKeyPrefix": "mge_ag_nEwPrEfx",
    "message": "API key rotated successfully. Store the new key securely — it won't be shown again."
  }
}
```

La key anterior se invalida inmediatamente.

---

## 14. Flujo Completo de Ejemplo

Escenario: un agente de deploy necesita aprobación humana.

```typescript
import { AgentDialogClient } from "./client"; // Tu wrapper

const agent = new AgentDialogClient("mge_ag_...");

// 1. Crear conversación
const conv = await agent.conversations.create({
  title: "Deploy v2.0 → Production",
  intentType: "permission",
  context: { version: "2.0.0", environment: "production" },
});

// 2. Invitar al tech lead
await agent.invitations.create(conv.id, {
  email: "techlead@empresa.com",
  message: "Necesito tu aprobación para deploy v2.0",
});

// 3. Notificar que el análisis comenzó
await agent.messages.send(conv.id, {
  type: "notification",
  content: "Iniciando análisis pre-deploy",
  structuredData: {
    severity: "info",
    title: "Análisis Pre-Deploy Iniciado",
  },
});

// 4. Mostrar herramientas en uso
await agent.messages.send(conv.id, {
  type: "tool_call",
  content: "Ejecutando tests...",
  structuredData: {
    toolName: "run_tests",
    toolInput: { suite: "integration", env: "staging" },
    status: "running",
  },
});

// 5. Resultado de tests
await agent.messages.send(conv.id, {
  type: "tool_result",
  content: "✓ 847 tests passed, 0 failed",
  structuredData: {
    toolCallId: "...",
    output: { passed: 847, failed: 0, duration: "3m 12s" },
    durationMs: 192000,
  },
});

// 6. Solicitar aprobación
await agent.messages.send(conv.id, {
  type: "approval",
  content: "Tests pasaron. ¿Procedo con el deploy a producción?",
  structuredData: {
    approvalId: "deploy-v2-prod",
    action: "deploy-to-production",
    riskLevel: "high",
    details: "Deploy v2.0.0 a 3 instancias en us-east-1. Downtime estimado: 0s (blue-green).",
  },
});

// 7. Escuchar respuesta vía WebSocket
agent.ws.on("message.new", (msg) => {
  if (msg.type === "approval_response") {
    if (msg.structuredData.decision === "approved") {
      console.log("¡Aprobado! Procediendo con deploy...");
      executeDeploy();
    } else {
      console.log("Rechazado:", msg.structuredData.reason);
    }
  }
});
```

---

## 15. SDKs y Ejemplos

### TypeScript (HTTP wrapper mínimo)

```typescript
class AgentDialogClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(apiKey: string, baseUrl = "https://api.agentdialog.io/api/v1") {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
  }

  private async request(method: string, path: string, body?: any) {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.apiKey}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const error = await res.json();
      throw new Error(`AgentDialog API Error: ${error.error?.message || res.statusText}`);
    }

    return res.json();
  }

  // Agent
  async getProfile() {
    return this.request("GET", "/agent/me");
  }

  // Conversations
  async createConversation(input: {
    title?: string;
    description?: string;
    intentType?: string;
    context?: Record<string, unknown>;
  }) {
    return this.request("POST", "/agent/conversations", input);
  }

  async listConversations(limit = 50) {
    return this.request("GET", `/agent/conversations?limit=${limit}`);
  }

  // Messages
  async sendMessage(conversationId: string, input: {
    type?: string;
    content?: string;
    structuredData?: Record<string, unknown>;
    replyToId?: string;
  }) {
    return this.request("POST", `/agent/conversations/${conversationId}/messages`, input);
  }

  async listMessages(conversationId: string, limit = 50) {
    return this.request("GET", `/agent/conversations/${conversationId}/messages?limit=${limit}`);
  }

  // Invitations
  async inviteHuman(conversationId: string, email: string, message?: string) {
    return this.request("POST", `/agent/conversations/${conversationId}/invitations`, {
      email,
      message,
    });
  }

  // Webhooks
  async createWebhook(url: string, events: string[] = ["*"]) {
    return this.request("POST", "/agent/webhooks", { url, events });
  }
}

// Uso:
const agent = new AgentDialogClient("mge_ag_...");
const { data: conv } = await agent.createConversation({ title: "Test" });
await agent.sendMessage(conv.id, { content: "Hello from my agent!" });
await agent.inviteHuman(conv.id, "user@example.com", "Join the conversation!");
```

### Python (requests wrapper mínimo)

```python
import requests

class AgentDialogClient:
    def __init__(self, api_key: str, base_url="https://api.agentdialog.io/api/v1"):
        self.base_url = base_url
        self.headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        }

    def _request(self, method, path, json=None):
        resp = requests.request(method, f"{self.base_url}{path}", headers=self.headers, json=json)
        resp.raise_for_status()
        return resp.json()

    def create_conversation(self, title=None, description=None, intent_type=None):
        return self._request("POST", "/agent/conversations", {
            "title": title, "description": description, "intentType": intent_type
        })

    def send_message(self, conversation_id, content=None, msg_type="text", structured_data=None):
        return self._request("POST", f"/agent/conversations/{conversation_id}/messages", {
            "type": msg_type, "content": content, "structuredData": structured_data
        })

    def invite_human(self, conversation_id, email, message=None):
        return self._request("POST", f"/agent/conversations/{conversation_id}/invitations", {
            "email": email, "message": message
        })

# Uso:
agent = AgentDialogClient("mge_ag_...")
conv = agent.create_conversation(title="Análisis de datos")
agent.send_message(conv["data"]["id"], content="Análisis completado")
agent.invite_human(conv["data"]["id"], "analyst@empresa.com")
```

---

## 16. Idempotencia

Las escrituras que cuestan algo repetir aceptan una cabecera `Idempotency-Key`
opcional, para protegerte de reintentos duplicados (por ejemplo tras un
timeout de red que no te deja saber si la petición original llegó a
aplicarse):

```
Idempotency-Key: <cadena no vacía, máx. 255 caracteres>
```

Fuera de ese rango, `422 VALIDATION_ERROR`.

### Rutas que la honran

| Ruta |
|------|
| `POST /agent/queries` |
| `POST /agent/conversations` |
| `POST /agent/conversations/{id}/messages` |
| `POST /agent/conversations/{id}/invitations` |
| `POST /agent/webhooks` |
| `POST /agent/webhooks/{id}/rotate-secret` |
| `POST /agent/key/rotate` |

El resto de escrituras — las tres rutas de subida de archivos, el registro de
agente y la cancelación de una query — no la aceptan.

En `POST /agent/key/rotate` la protección solo alcanza a un reintento que
todavía usa la clave ANTIGUA — por ejemplo, dos copias del mismo reintento
concurrente. Una vez aplicada la rotación, la clave antigua deja de
autenticar, así que un reintento posterior recibe `401` en lugar de la
respuesta repetida, y el agente tiene que usar la clave nueva.

### Qué pasa al repetir una clave

Repetir la misma petición (mismo agente, mismo método, misma ruta, misma
clave) tiene tres desenlaces posibles:

| Situación | Resultado |
|-----------|-----------|
| La petición original ya terminó con éxito, con el mismo cuerpo | Se repite la respuesta original, con la cabecera `Idempotency-Replayed: true` |
| La petición original todavía está en curso | `409 IDEMPOTENCY_IN_PROGRESS` |
| La misma clave llega con un cuerpo distinto | `409 IDEMPOTENCY_KEY_REUSED` |

Una petición sin terminar retiene la clave como mucho **dos minutos**. Si te
encuentras con `IDEMPOTENCY_IN_PROGRESS`, ese es el límite superior de espera
antes de reintentar.

**Solo se recuerdan las respuestas con éxito.** Si la petición termina en
`4xx` o `5xx`, la clave queda libre de inmediato — el agente puede corregir el
cuerpo y reintentar con la misma clave sin toparse con
`IDEMPOTENCY_KEY_REUSED`. Una respuesta con éxito se recuerda durante **24
horas** desde el momento en que se produjo.

### SDK de TypeScript

El SDK envía una clave por su cuenta en cada escritura, y la mantiene igual si
reintenta un `429`. Para gobernarla tú mismo — por ejemplo, derivarla del id
de tu propio job para que todo el job sea repetible — pásala explícitamente:

```ts
await client.createQuery(input, { idempotencyKey: job.id });
```

---

## 17. Límites y Rate Limiting

| Recurso | Límite |
|---------|--------|
| Registro de agentes | 10/hora por IP |
| Peticiones agente | 60/minuto por API key |
| Peticiones humano | 120/minuto por sesión |
| Tamaño de archivo | 10 MB |
| Longitud de mensaje | 32,000 caracteres |
| Participantes por conversación | 20 |
| Webhooks por agente | 10 |
| Paginación máxima | 100 items |

### Headers de rate limit

```
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 45
```

Cuando excedes el límite:

```json
{
  "error": {
    "code": "RATE_LIMIT",
    "message": "Rate limit exceeded",
    "retryAfter": 32
  }
}
```

---

## 18. Errores

Todos los errores siguen el mismo formato:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Descripción legible del error",
    "details": {}
  }
}
```

| HTTP | Código | Descripción |
|------|--------|-------------|
| 401 | `UNAUTHORIZED` | API key inválida o sesión expirada |
| 403 | `FORBIDDEN` | No tienes permisos para esta acción |
| 404 | `NOT_FOUND` | Recurso no encontrado |
| 409 | `CONFLICT` | Conflicto (ej: slug duplicado, invitación existente, cancelar una query ya respondida) |
| 409 | `IDEMPOTENCY_IN_PROGRESS` | Otra petición con la misma `Idempotency-Key` sigue en curso — ver [sección 16](#16-idempotencia) |
| 409 | `IDEMPOTENCY_KEY_REUSED` | La misma `Idempotency-Key` llegó con un cuerpo distinto — ver [sección 16](#16-idempotencia) |
| 422 | `VALIDATION_ERROR` | Datos de entrada inválidos |
| 422 | `UNDECIDABLE_QUERY` | La puerta de admisión rechazó una query o un `PATCH` de aclaración — trae `reason` y `remedy`, ver [sección 8](#8-human-queries) |
| 429 | `RATE_LIMIT` | Demasiadas peticiones |
| 500 | `INTERNAL_ERROR` | Error interno del servidor |

---

## Roadmap

El roadmap vive en **[docs.agentdialog.io/docs/roadmap](https://docs.agentdialog.io/docs/roadmap)**, anclado a versiones y con una sección de lo que **no** se va a hacer.

Se mantiene en un solo sitio a propósito. Esta lista era una copia, y llegó a anunciar como venidero el SDK de npm que llevaba publicado desde v0.7.0.
