# Publicación del SDK de TypeScript en npm

**Fecha:** 2026-08-20
**Estado:** aprobado, pendiente de plan de implementación

## Objetivo

Publicar `@agentdialog/sdk` en npm para que un integrador pueda pasar de cero a
"mi agente pregunta a un humano" con un `npm install` y unas pocas líneas, sin
leer la referencia REST ni implementar polling a mano.

El paquete incluye adaptadores para Vercel AI SDK y LangChain.js distribuidos
como subpath exports del mismo paquete.

Fuera de alcance: paquete MCP instalable, CLI, publicación del SDK de Python.

## Punto de partida

`sdks/typescript/` ya contiene un cliente de 625 líneas, cero dependencias,
`fetch` nativo. Nunca se ha compilado ni publicado. Los nombres `agentdialog`,
`@agentdialog/sdk` y `@agentdialog/mcp` están libres en npm.

Tres defectos en el código actual:

1. `src/client.ts:32` — `DEFAULT_BASE_URL` es `https://agentdialog.com`. El
   dominio real es `agentdialog.io` y la API vive en `api.agentdialog.io`.
2. `README.md` del SDK repite ese dominio equivocado.
3. `README.md` del SDK documenta el prefijo de clave `ad_ag_`. El real, en
   `src/config/auth.ts:11`, es `mge_ag_`.

## Bloqueo de partida: las human queries no tienen API REST

`src/services/query.service.ts` expone las funciones del lado agente
(`createQuery`, `getQuery`, `listAgentQueries`), pero solo se alcanzan desde
`src/mcp/server.ts`. En `src/app.ts` las rutas de agente son profile, key,
conversations, messages, upload, invitations y webhooks. Ninguna de queries.

Consecuencia: hoy un agente solo puede preguntar a un humano si habla MCP. Un
integrador con `fetch`, o con este SDK, no puede.

Como human queries es el flujo que la landing vende y el que los adaptadores de
framework tienen que envolver, este trabajo incluye añadir la API REST que falta.

## Arquitectura

### Backend — rutas nuevas

`src/routes/agent/queries.ts`, montado en `agentApi` de `src/app.ts`:

| Método | Ruta | Servicio |
|---|---|---|
| POST | `/api/v1/agent/queries` | `createQuery(agentId, input)` |
| GET | `/api/v1/agent/queries/:id` | `getQuery(queryId, agentId)` |
| GET | `/api/v1/agent/queries` | `listAgentQueries(agentId, ...)` |

Reutiliza `createQuerySchema` y `listQueriesSchema` de
`src/validators/query.validators.ts`. Las funciones de servicio ya reciben
`agentId` y ya comprueban pertenencia, así que las rutas son envoltorios finos.

Ajuste necesario: `listQueriesSchema` valida hoy un cuerpo de petición. En un GET
los filtros `status` y `limit` viajan en query string, que llega siempre como
texto. Hace falta una variante que haga coerción de `limit` a número antes de
validar. No se modifica el esquema existente, porque lo usa la tool MCP
`list_queries`.

Sigue el patrón de manejo de errores de las demás rutas de agente: los errores
del servicio suben al `errorHandler` global.

### SDK — estructura

```
sdks/typescript/src/
  index.ts             export raíz
  client.ts            clase AgentDialog, ampliada con queries
  queries.ts           tipos de query
  errors.ts            sin cambios
  types.ts             tipos existentes
  ai/index.ts          subpath "@agentdialog/sdk/ai"
  langchain/index.ts   subpath "@agentdialog/sdk/langchain"
```

`package.json`:

```json
{
  "exports": {
    ".":           { "types": "./dist/index.d.ts",           "import": "./dist/index.js" },
    "./ai":        { "types": "./dist/ai/index.d.ts",        "import": "./dist/ai/index.js" },
    "./langchain": { "types": "./dist/langchain/index.d.ts", "import": "./dist/langchain/index.js" }
  },
  "peerDependencies":     { "ai": "*", "@langchain/core": "*" },
  "peerDependenciesMeta": { "ai": { "optional": true }, "@langchain/core": { "optional": true } }
}
```

El paquete raíz mantiene cero dependencias en runtime. Quien no importe un
subpath no instala nada extra. Quien importe `/ai` sin tener `ai` instalado
recibe un fallo de resolución de módulo explícito, no un error opaco en runtime.

Se corrigen de paso los tres defectos: `DEFAULT_BASE_URL` pasa a
`https://api.agentdialog.io`, y README y docs pasan a decir `mge_ag_`.

### SDK — superficie de queries

Sobre la clase `AgentDialog`, siguiendo el estilo de los métodos existentes:

- `createQuery(input): Promise<Query>`
- `getQuery(queryId): Promise<Query>`
- `listQueries(params?): Promise<Query[]>`
- `waitForAnswer(queryId, options?): Promise<Query>`

`waitForAnswer` hace polling con backoff exponencial acotado, acepta
`pollIntervalMs`, `timeoutMs` y un `AbortSignal`, y resuelve cuando el estado
llega a `answered` o `expired`. Es para scripts y workers, donde bloquear sí
tiene sentido.

Los nombres de campo de la API (`query_type`, `target_human_email`,
`timeout_minutes`) son snake_case, mientras que el resto del SDK usa camelCase.
El SDK expone camelCase y traduce en el borde, para que la superficie pública sea
coherente.

### Adaptadores — dos tools, no uno bloqueante

Un humano tarda minutos u horas en responder por email. Un tool de Vercel AI SDK
se ejecuta dentro de una petición en streaming. Bloquear ahí no es viable.

Cada adaptador exporta dos tools:

- `askHumanTool(client)` — crea la query y devuelve el `query_id` de inmediato.
- `checkAnswerTool(client)` — consulta estado y respuesta.

El modelo pregunta y vuelve más tarde. Es el mismo patrón que ya describen las
descripciones de las tools MCP en `src/mcp/server.ts`, así que el comportamiento
es consistente entre MCP y SDK.

Los adaptadores son envoltorios finos: definen esquema y descripción del tool y
delegan en el cliente. Nada de estado propio.

## Documentación

Restricción del proyecto: cualquier cambio en el SDK actualiza documentación y
ejemplos de la web en el mismo cambio, no en un commit posterior.

Tres problemas encontrados en la documentación actual:

1. `docs/api/README.md` y `web/public/agentdialog-integration-guide.md` son
   idénticos byte a byte (1271 líneas), mantenidos a mano por duplicado.
2. Las human queries solo aparecen en esa guía duplicada.
   `docs.agentdialog.io` no las menciona en ningún sitio: ni concepto, ni
   referencia de API, ni quickstart.
3. Los dos enlaces del nav de `docs-site/src/app/docs/layout.tsx:23-24` están
   rotos: `Home` apunta a `https://agentdialog.dev`, un dominio que no resuelve
   (el real es `.io`), y `GitHub` apunta a `#`. La landing, por su parte, no
   tiene ningún enlace a GitHub: `web/src/components/layout/Footer.tsx` no
   contiene enlaces de ningún tipo.

Ficheros a tocar:

| Fichero | Cambio |
|---|---|
| `docs-site/content/docs/sdks/typescript.mdx` | install real, ejemplos con queries y subpaths |
| `docs-site/content/docs/api-reference/agent/queries.mdx` | nuevo: las tres rutas REST |
| `docs-site/content/docs/concepts/queries.mdx` | nuevo: flujo pregunta → email → respuesta |
| `docs-site/content/docs/quickstart.mdx` | camino con SDK junto al de cURL |
| `docs-site/content/docs/api-reference/agent/meta.json` | alta de `queries` en la navegación |
| `docs-site/content/docs/concepts/meta.json` | alta de `queries` en la navegación |
| `web/src/components/landing/CodeExamples.tsx` | pestaña TypeScript nueva |
| `docs/api/README.md` | rutas REST de queries |
| `web/public/agentdialog-integration-guide.md` | pasa a generarse desde `docs/api/README.md` |
| `sdks/typescript/README.md` | página de npm: dominio, prefijo, adaptadores |
| `README.md` | tabla de paquetes con su versión publicada, más badges de npm |
| `docs-site/src/app/docs/layout.tsx` | arreglo del nav: Home a `.io`, GitHub al repo real |
| `web/src/components/layout/Footer.tsx` | enlace a GitHub, hoy inexistente |

### Versiones en el README

El `README.md` raíz gana una tabla de paquetes con la versión publicada de cada
uno y un badge de npm que la refleja automáticamente:

```markdown
| Paquete | Versión | Descripción |
|---|---|---|
| [`@agentdialog/sdk`](https://www.npmjs.com/package/@agentdialog/sdk) | ![npm](https://img.shields.io/npm/v/@agentdialog/sdk) | SDK de TypeScript + adaptadores |
```

El badge se sirve desde shields.io y lee npm en vivo, así que no hay que
actualizar el README en cada release. La columna de descripción y la tabla en sí
sí se mantienen a mano, pero solo cambian al añadir un paquete.

El mismo tratamiento en `sdks/typescript/README.md`, donde además el badge da
señal de vida del proyecto a quien llega desde npm.

La copia duplicada se resuelve con un script en el build de la web que copia
`docs/api/README.md` a `web/public/agentdialog-integration-guide.md`. La copia
generada deja de editarse a mano.

La pestaña de Python de `CodeExamples.tsx` muestra `from agentdialog import
AgentDialogClient`, un paquete que no está publicado en PyPI. Queda anotado como
deuda; no se resuelve aquí porque el alcance es npm.

## Publicación

`.github/workflows/publish-sdk.yml`, disparado por tags `sdk-v*`:

1. checkout, instalar Bun
2. `bun run typecheck` y `bun test`
3. build del SDK (`tsc`)
4. `npm publish --provenance --access public` con Trusted Publishing (OIDC)

Sin `NPM_TOKEN`: `permissions: { id-token: write }` y el trusted publisher dado
de alta en npm. La provenance queda verificable desde la página del paquete.

Versión inicial: `0.1.0`, la que ya declara el `package.json`.

### Pasos manuales previos

Los hace el usuario desde la cuenta `agentdialog.app@gmail.com`. Sin ellos el
workflow falla en el primer intento:

1. Crear la organización / scope `@agentdialog` en npmjs.com.
2. Dar de alta el trusted publisher: repositorio `horelvis/agentDialog`,
   workflow `publish-sdk.yml`.

## Prerequisito: abrir el repositorio

`horelvis/agentDialog` es privado hoy. Con la provenance de npm, la página del
paquete enlaza al commit y al workflow que lo construyeron; apuntando a un repo
privado esos enlaces dan 404. Y un SDK con licencia MIT que no se puede leer
resta credibilidad a quien evalúa integrarlo.

Auditoría de secretos hecha el 2026-08-20 sobre todo el historial (claves de API,
tokens de GitHub/Slack/Resend/SendGrid, claves privadas, URLs de conexión con
contraseña): **limpio**. Ningún `.env` se ha versionado nunca; solo los
`.env.example`.

Antes de cambiar la visibilidad, tres limpiezas:

1. `scripts/cleanup-secrets.sh` imprime `hcastillo.mendoza@gmail.com` como
   `SMTP_USER` y `SMTP_FROM`. Sustituir por un placeholder: al abrir el repo
   queda indexable para scrapers y revela la cuenta que envía el correo de
   producción.
2. `docs-site/.next/` y `docs-site/out/` están versionados: 289 ficheros de
   build regenerables que engordan el `.git` a 81 MB. Añadirlos al `.gitignore`
   y sacarlos del índice.
3. Decidir qué pasa con `MARKETING-AUDIT.md`, un documento interno que puntúa el
   propio sitio con un 37/100 y lista sus debilidades.

El cambio de visibilidad lo ejecuta el usuario. Es irreversible en la práctica:
una vez indexado, el código ya está fuera.

### Orden de despliegue

El SDK publicado no funciona hasta que las rutas REST estén vivas en Cloud Run.
El orden es: backend y deploy primero, `npm publish` después.

## Tests

TDD: los tests van antes que la implementación.

- Unitarios: la variante de `listQueriesSchema` con coerción desde query string;
  la traducción camelCase ↔ snake_case; `waitForAnswer` (resolución, timeout,
  cancelación por `AbortSignal`) con `fetch` mockeado.
- Integración: ciclo crear → consultar → listar contra las rutas nuevas,
  siguiendo el patrón de `tests/integration/conversation-flow.test.ts`. Incluye
  el caso de aislamiento: un agente no puede leer la query de otro.
- Adaptadores: que cada tool tenga el esquema esperado y delegue en el método
  correcto del cliente. Sin llamar a los frameworks de verdad.
- Build: que `tsc` emita los tres puntos de entrada con sus `.d.ts`, y que el
  `exports` resuelva. Verificado con `npm pack` y revisión del contenido del
  tarball antes de publicar.

## Criterios de aceptación

1. `POST/GET /api/v1/agent/queries` funcionando en producción.
2. `npm install @agentdialog/sdk` instala un paquete que compila contra un
   proyecto TypeScript en ESM, con tipos.
3. Un script de ejemplo crea una query, espera con `waitForAnswer` y recibe la
   respuesta que un humano envía contestando al email.
4. `askHumanTool` funciona dentro de un `generateText` de Vercel AI SDK.
5. Ningún ejemplo publicado en docs.agentdialog.io ni en la landing referencia
   `agentdialog.com` ni el prefijo `ad_ag_`.
6. El paquete aparece en npm con provenance verificada.
7. Ningún enlace del nav de docs ni del footer de la landing lleva a `#` ni a un
   dominio que no resuelve.
8. El `README.md` raíz lista el paquete con un badge de versión que refleja lo
   publicado en npm.

## Orden de trabajo

Cuatro tramos, en este orden. Cada uno deja el repositorio en un estado
coherente, y los tres primeros son independientes de que el repo sea público.

1. **Backend**: rutas REST de queries, tests, despliegue a Cloud Run.
2. **SDK**: arreglo de los tres defectos, métodos de queries, `waitForAnswer`,
   subpaths de adaptadores, build verificado con `npm pack`.
3. **Documentación**: las páginas nuevas y actualizadas, la pestaña TypeScript de
   la landing, la deduplicación de la guía, los enlaces rotos, los badges.
4. **Publicación**: limpiezas previas, apertura del repositorio, alta del scope y
   del trusted publisher, workflow y primer tag `sdk-v0.1.0`.
