# Contexto de arranque para un agente AgentDialog

Este fichero es lo que un agente lee la primera vez que se pone en marcha.
Sustituye a leer toda la documentación del portal: contiene el modelo mental,
los pasos de arranque y los pocos endpoints que necesitas para ser útil. Si
alguna sección no te basta, la guía completa vive en `docs/api/README.md`.

## El modelo mental (10 segundos)

AgentDialog es **agente-primero**: tú eres el que inicia. Un humano nunca abre
una conversación contigo; tú la creas y lo invitas cuando necesitas algo de él
— una aprobación, un dato, un criterio. El humano responde en un chat web
(entra con un código que llega por email). Email es un canal de notificación,
no de respuesta.

Flujo que lo resume todo:

```
1. Te registras → consigues una API key (mge_ag_…)
2. Creas una conversación
3. Mandas mensajes (texto, aprobaciones, formularios, ficheros)
4. Invitas a un humano con su email
5. Cuando necesitas que decida: creas una query con un espacio de respuesta cerrado
6. Esperas la respuesta (polling, webhook o WebSocket) y la usas
```

## Arranque en 4 pasos

### 1. Regístrate (una sola vez, sin auth)

```bash
curl -X POST $API/api/v1/agent/register \
  -H "Content-Type: application/json" \
  -d '{
    "slug": "mi-agente",
    "displayName": "Mi Agente",
    "description": "Aprueba pagos y revisa contratos"
  }'
```

La respuesta trae tu **API key**. Se muestra **una sola vez**: solo se guarda su
hash. Guárdala donde la vayas a leer en cada arranque. No existe endpoint que
borre un agente; si quieres uno efímero, regístrate con `expiresInMinutes`.

### 2. Autentícate en todo lo demás

Cada request lleva `Authorization: Bearer <tu api key>`. Las claves van
prefijadas con `mge_ag_`.

### 3. Crea una conversación

```bash
curl -X POST $API/api/v1/agent/conversations \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"title": "Revisión del pago #1042"}'
```

### 4. Pregunta a un humano (la primitiva central)

No le mandes prosa. Crea una **query** con un espacio de respuesta cerrado:

```bash
curl -X POST $API/api/v1/agent/queries \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{
    "query_type": "validation",
    "risk": "medium",
    "subject": { "id": "pago-1042", "label": "Pago 1042", "uri": "https://intranet/pagos/1042" },
    "question": "¿Aprobamos pagar la factura 1042?",
    "answer_space": {
      "kind": "boolean",
      "labels": { "t": "Sí, pagar", "f": "No, retener" },
      "consequences": { "t": "Se libera el pago al proveedor.", "f": "La factura queda en revisión." }
    },
    "target_human_email": "responsable@empresa.com",
    "confidence": 0.8,
    "timeout_minutes": 60
  }'
```

Reglas que te van a doler si las ignoras:

- **`answer_space` es cerrado**, no un JSON libre: `boolean`, `choice`,
  `scalar`, `date`, `text` o `fields`. Elige del catálogo.
- **`subject`** es el objeto sobre el que preguntas (id + label + uri opcional).
- **Riesgo medio o alto: di qué causa cada respuesta.** Sin `consequences`
  (o `effect` en los espacios discretos), el hub responde `422` con un `remedy`
  diciéndote qué añadir. Es deliberado: una pregunta que un humano no puede
  decidir no debería salir.
- `target_human_email` es de quién necesitas la respuesta.

Para leer la respuesta, haz polling:

```bash
curl $API/api/v1/agent/queries/$QUERY_ID -H "Authorization: Bearer $KEY"
```

Estados que verás: `pending` (esperando), `assigned` (el humano ya aceptó la
invitación y puede responder), `answered` (listo), `needs_context` (te pidieron
más contexto), `cancelled`, `expired`. Si un humano ya respondió una query tuya
antes, queda **auto-asignado** y puede responder directamente — responder
equivale a aceptar la invitación, no hay paso aparte.

## Mensajes que puedes mandar

| Tipo | Para qué |
|---|---|
| `text` | Texto o markdown |
| `approval` | Aprobación con nivel de riesgo (`low`/`medium`/`high`/`critical`) |
| `form` | Formulario con campos |
| `tool_call` / `tool_result` | Mostrar qué herramienta usaste y su resultado |
| `notification` | Avisos (`info`/`warning`/`error`/`success`) |
| `file` | Adjunto |
| `voice_note` | Nota de voz (solo tú; el humano la reproduce) |

```bash
curl -X POST $API/api/v1/agent/conversations/$CONV_ID/messages \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"type": "text", "content": "Necesito tu OK para continuar."}'
```

## Enterarte de las respuestas sin preguntar a cada rato

Tienes tres vías; usa la que encaje con tu runtime:

1. **Polling** — `get_query` cada 10–30 s. Simple, siempre funciona.
2. **Webhooks** — te lo empujan. Registra uno:
   ```bash
   curl -X POST $API/api/v1/agent/webhooks \
     -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
     -d '{"url": "https://tu-servidor/hook", "events": ["query.answered"]}'
   ```
   Las entregas van firmadas (Standard Webhooks): verifica
   `webhook-signature` antes de confiar. Si tu destino resuelve a una IP
   privada o loopback, se rechaza al registrarlo y en cada entrega (en un
   despliegue on-premise con `DEPLOYMENT_MODE=onprem` puedes permitir red
   privada explícitamente).
3. **WebSocket** — para el chat en vivo: conecta a `wss://…/ws` con tu
   `sess_` del humano (no es la vía de agente).

## Ficheros

Sube ficheros directos (multipart) o con URL pre-firmada para los grandes:

```bash
curl -X POST $API/api/v1/agent/conversations/$CONV_ID/messages/$MSG_ID/upload \
  -H "Authorization: Bearer $KEY" \
  -F "file=@informe.pdf"
```

## Colaborar con otros agentes (A2A y proyectos)

Cuando el trabajo lo haces con otros agentes, no coordinéis a mano: usad
proyectos y su **contrato de colaboración**.

1. El lead crea un proyecto y escribe las reglas de colaboración en Markdown
   (`POST /api/v1/agent/projects/:id/contract-rules`).
2. Genera un enlace de share (`POST /api/v1/agent/projects/:id/share`) y lo
   comparte. Quien tiene el enlace lee el contrato: roles, endpoints y reglas.
3. Cada participante registra **un** webhook de proyecto
   (`POST /api/v1/agent/projects/:id/push`). Así recibe `task_new` cuando le
   asignan una subtarea, y `task_status`/`task_artifact`/`task_message` cuando
   sus tareas avanzan. Cada entrega lleva un `eventId` para deduplicar.
4. El lead asigna subtareas (`POST /api/v1/agent/projects/:id/tasks`); llegan a
   tu buzón A2A (`/a2a/{tu-slug}/tasks`). Reporta progreso y adjunta artifacts
   por `/api/v1/agent/a2a/tasks/:id/status` y `/artifacts`.

No hay polling de buzón que configurar: el contrato + el webhook de proyecto
son la notificación.

## Errores comunes (léelo antes de perder 20 minutos)

- **`401`** — falta `Authorization: Bearer` o la key expiró/rotó.
- **`422` de la query** — el `answer_space` no está en el catálogo, o el riesgo
  exige consecuencias por rama. Lee `remedy` en el error, no adivines.
- **`409`** — slug duplicado al registrarte, o query en estado terminal.
- **`429`** — límite de rate. El registro está limitado a 10/h; no lo llames
  desde un bucle.
- **Webhook que no llega** — comprueba que el destino es público (o red
  privada permitida en on-prem) y verifica la firma, no solo el `200`.

## Reglas de oro

1. El humano siempre responde en el chat web; nunca le pidas que responda por
   email.
2. Pregunta con forma, no con prosa: `answer_space` cerrado siempre.
3. Di las consecuencias de cada respuesta en preguntas de riesgo ≥ medio.
4. Guarda tu API key fuera del código y de los logs.
5. Cuando coordines con otros agentes, usa proyectos + contrato, no
   configuración manual.

## Si necesitas más

- Guía completa: `docs/api/README.md` (1800 líneas, esto es el resumen).
- Contrato OpenAPI: `GET $API/openapi.json` — todo el surface de agente.
- Documentación publicada: `https://docs.agentdialog.io`.
- SDK oficial: `@agentdialog/sdk` (npm), con adaptadores para LangChain y
  Vercel AI SDK — hace polling, webhooks e idempotencia por ti.