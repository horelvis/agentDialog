# Bootstrap prompt para agentes nuevos — diseño

**Fecha:** 2026-09-14
**Estado:** aprobado, en diseño

Hoy, un cliente que quiere usar AgentDialog con su IA tiene que saber demasiado:
registrarse por API, guardar la API key, conocer la URL del portal y construir
el prompt que se le pega al agente. Para un cliente final, «integración» debería
ser **pegar una cosa y empezar a hablar**.

## Problema

El prompt de arranque que un humano escribe a mano («fetch esta URL, regístrate
contra este host, usa este email de sandbox…») está lleno de jerga que solo tiene
sentido para un ingeniero probando el stack. El cliente final no debería conocer
endpoints, ni bases URL, ni tener que construir nada.

## Solución

El producto entrega un **bootstrap prompt listo para copiar**, generado con las
credenciales del agente ya dentro. El cliente lo pega en su IA (Claude Code,
Claude web, Cursor…) y luego solo conversa.

### 1. `bootstrap_prompt` en la respuesta de registro

`POST /api/v1/agent/register` devuelve, junto a la API key (que solo se muestra
una vez), un campo `bootstrapPrompt`:

```
You are a brand-new AgentDialog agent. Your API key is `mge_ag_…` and the
AgentDialog API is at `https://api.agentdialog.io`. Read your onboarding
documentation at `https://api.agentdialog.io/agent-context.md` — it is the only
thing you need to know about how AgentDialog works. Set yourself up, then tell
me you are ready. From now on, whenever you need a human's approval, a fact or
a judgement, ask them through AgentDialog and report the answer back to me.
```

- La **API key** es la que acaba de acuñar el registro: el único momento en que
  existe en claro, y el único momento en que el prompt puede llevarla.
- La **base URL** se deriva del request (`x-forwarded-host`/`host` + proto),
  igual que la Agent Card. Funciona en cloud, on-prem y local (`localhost:3000`).
- El **contexto** se sirve desde la propia API en `/agent-context.md`, de modo
  que el prompt referencia una URL que siempre existe donde corra el agente —
  incluye on-prem, que no tiene acceso a `docs.agentdialog.io`.

### 2. `GET /agent-context.md`

La API sirve el fichero `docs/agent-context.md` (la orientación de arranque) en
`text/markdown`. El fichero viaja en la imagen (`COPY` en el Dockerfile y
excepción en `.dockerignore`). No requiere auth: es documentación pública.

### 3. La web lo muestra para copiar

El formulario de la landing (`web/src/components/landing/GetKeyForm.tsx`) ya
registra un agente y muestra la key. Tras el registro muestra además el
`bootstrapPrompt` con botón de copiar — el paso «pega esto en tu IA» justo
después de la key.

## Cambios por componente

### Backend

- `src/lib/bootstrap.ts` — `buildBootstrapPrompt({ apiKey, apiBaseUrl }): string`.
  Función pura, testeable.
- `src/routes/agent/register.ts` — añade `bootstrapPrompt` a la respuesta,
  derivando `apiBaseUrl` del request.
- `src/validators/agent.responses.ts` — `agentRegisterResponse` gana
  `bootstrapPrompt: z.string()`.
- `src/app.ts` — ruta pública `GET /agent-context.md` que sirve
  `./docs/agent-context.md` (Bun.file).
- `Dockerfile` (target `production`) — `COPY docs/agent-context.md …`.
- `.dockerignore` — excepción para no excluir `docs/agent-context.md`.

### Web

- `web/src/components/landing/GetKeyForm.tsx` — `KeyIssued` muestra el
  `bootstrapPrompt` (o lo construye si el backend no lo trae) con botón copiar,
  antes del bloque de config MCP.
- Catálogos i18n `en`/`es`/`ca` (landing) — etiquetas del bloque nuevo.

### Docker on-prem

El target `onprem` hereda de `production`, así que el fichero y la ruta llegan
solos. `bootstrap_prompt` de un despliegue on-prem apunta a
`{app_url}/agent-context.md`, que es el propio despliegue.

## Seguridad

- El prompt solo existe en claro en la respuesta del registro, igual que la key.
  No se guarda; se reconstruye por request.
- `GET /agent-context.md` es documentación pública; no expone nada sensible.
- La base URL viene del host del request; un proxy mal configurado podría hacer
  que apunte a una URL interna, pero es el mismo supuesto que ya usa la Agent
  Card (`x-forwarded-host`).

## Fuera de alcance (v1)

- **Traducción del fichero servido**: `/agent-context.md` sirve la versión en
  español del repo (`docs/agent-context.md`); la página en inglés vive en el
  portal. Unir ambos (idioma por `?lang=`) es trabajo aparte.
- **Dashboard de agentes**: el prompt se muestra en la landing tras registrar;
  no hay un panel de gestión de agentes aún.

## Tests

- Unit: `buildBootstrapPrompt` (key y base embebidas, formato estable).
- Integración: `POST /register` devuelve `bootstrapPrompt` que contiene la key
  y apunta a `/agent-context.md`; `GET /agent-context.md` responde 200 con
  `text/markdown`.
- `bunx tsc --noEmit` en 0; suite completa verde; web build + lint.