# El contrato OpenAPI de la superficie de agente — diseño

**Fecha:** 2026-08-27
**Estado:** aprobado, pendiente de plan de implementación
**Origen:** petición del usuario el 2026-08-27. «Sin OpenAPI en ningún sitio» era el
primer punto por riesgo de la cola de pendientes, verificado el 2026-08-26: ni
`openapi` ni `swagger` aparecen en `src/` ni en `docs/`.

## El problema

Un integrador que quiera conectar su agente tiene hoy exactamente una vía: leer
`docs/api/README.md`, 1.794 líneas y 67 secciones. No hay nada que pueda meter en
un generador de clientes, en Postman, ni pegarle a un modelo para que escriba la
integración. La forma exacta de cada respuesta se descubre provocándola.

El catálogo de errores es el caso más claro. `src/lib/errors.ts` define nueve
códigos —`NOT_FOUND`, `UNAUTHORIZED`, `FORBIDDEN`, `CONFLICT`, `VALIDATION_ERROR`,
`RATE_LIMIT`, `IDEMPOTENCY_IN_PROGRESS`, `IDEMPOTENCY_KEY_REUSED`,
`UNDECIDABLE_QUERY`— y la única forma de conocerlos es leer prosa o encontrárselos.

## Para qué es, y por qué eso decide el resto

**Decidido por el usuario: es un contrato para integradores y agentes**, no una
página de documentación navegable. Manda la exactitud de los esquemas —respuestas
incluidas— por encima de la prosa.

Esa elección tiene una consecuencia que gobierna todo el diseño: **un contrato que
miente es peor que no tener contrato.** Alguien que lee prosa desactualizada
sospecha; alguien cuyo cliente generado compila y luego falla en producción, no.
Por eso la mitad de este spec trata de qué impide que mienta.

## Alcance

**Decidido: `agent/*` y los webhooks salientes.** Son 26 endpoints:

| Recurso | Endpoints |
|---|---|
| `conversations` | 4 |
| `invitations` | 3 |
| `key` | 1 |
| `messages` | 2 |
| `profile` | 2 |
| `queries` | 5 |
| `register` | 1 |
| `upload` | 3 |
| `webhooks` | 5 |

Todo bajo `/api/v1/agent`, salvo `POST /api/v1/agent/register`, que vive fuera del
muro de autenticación.

**Fuera, y por qué:**

- **`human/*`**: su único cliente es `web/`, y la cambiamos cuando nos conviene.
  Publicarla es prometer no romperla, y esa es una decisión de producto que nadie
  ha tomado.
- **`public/queries`**: la sirve un grant acotado a responder una pregunta. No es
  una superficie de integración.
- **MCP**: no es REST. OpenAPI no puede describirla y fingir que sí sería peor que
  omitirla.
- **`health`**: sin valor para un integrador.

## Dónde vive la verdad

**Decidido: metadatos junto a cada ruta.** Un middleware que no hace nada en tiempo
de petición —registra y sigue— acompaña a cada `app.post(...)`:

```ts
app.post(
  "/queries",
  describeRoute({
    summary: "Ask a human a question",
    body: createQuerySchema,          // el mismo zod que ya valida
    responses: { 201: queryResponse, 422: admissionRefusal },
  }),
  idempotency(),
  validateBody(createQuerySchema),
  async (c) => { /* sin tocar */ },
);
```

El esquema de entrada **es el mismo objeto** que valida la petición, así que ahí no
cabe la deriva. Lo que se añade es la respuesta, que hoy no existe en ninguna forma
comprobable.

### Una dependencia, no una pila

`zod-openapi@5` y nada más, con un `describeRoute` propio de unas cuarenta líneas.

La alternativa evidente era `hono-openapi`, y se descarta por dos razones
concretas. Arrastra cuatro peers (`@hono/standard-validator`, dos
`@standard-community/*`, `openapi-types`) y **cambió su juego de peers entero entre
1.0 y 1.3**, que es exactamente el tipo de dependencia que este repo ya ha pagado
caro. Y trae su propio middleware de validación, que aquí o duplica o sustituye a
`validateBody` — el mismo que produce los mensajes de error que la guía documenta.

Lo que ganaría a cambio, sobre todo el `describeRoute` ya escrito, son cuarenta
líneas.

**Las versiones encajan sin tocar nada, y esto se comprobó antes de decidir.** Todas
las librerías OpenAPI actuales piden zod `^4`, y este repo está fijado a zod 3 por
el `overrides` que `CLAUDE.md` prohíbe tocar, porque el SDK de MCP importa `zod/v3`
y `zod/v4-mini`. Pero `zod-openapi@5.4.6` declara `^3.25.74 || ^4.0.0`, y el zod
resuelto aquí es **3.25.76**. Entra por 0.0.2. Conviene dejarlo escrito: si alguien
baja zod por debajo de 3.25.74, esta dependencia deja de instalarse.

## Las respuestas son el trabajo

`src/types/api.ts` tiene `ApiResponse`, `ApiError` y `PaginatedResponse` como
interfaces de TypeScript. Se borran al compilar: no describen nada en tiempo de
ejecución y no pueden generar nada.

Hay que escribir zod para el sobre y para el contenido de los 26 endpoints. Van en
`src/validators/*.responses.ts`, junto a los de entrada, con tres ayudantes que
evitan repetir el sobre veintiséis veces:

- `ok(schema)` → `{ data }`
- `paginated(schema)` → `{ data, pagination }`
- `apiError` → `{ error: { code, message, details?, retryAfter? } }`, con `code`
  como enum de los nueve.

## Qué contiene el documento

- **`info.version` sale de `appVersion()`** (`src/lib/app-version.ts`), la misma
  función que estampa la raíz, alimentada por el `APP_VERSION` que el despliegue
  pasa desde la etiqueta de la release. No de una constante: una constante sería una
  segunda cosa que puede mentir, y ya hubo un PR (#22) para quitar exactamente esa
  clase de deriva. Un build sin etiquetar dirá `dev` en los dos sitios, que es lo
  correcto.
- **`servers`**: `https://api.agentdialog.io`.
- **Seguridad**: un esquema `bearer` con el prefijo `mge_ag_` documentado, aplicado
  globalmente **salvo en `POST /agent/register`**.
- **`Idempotency-Key`** como parámetro de cabecera en **las siete** rutas POST que
  lo honran —`conversations`, `queries`, `messages`, `invitations`, `key/rotate`,
  `webhooks` y `webhooks/:id/rotate-secret`— y en ninguna otra. Documentarlo donde
  no se respeta sería peor que omitirlo.
- **`webhooks`**, la sección de OpenAPI 3.1 para lo que enviamos nosotros: el cuerpo
  `{ event, data, timestamp }` (`webhook.service.ts:233`) y las tres cabeceras de
  Standard Webhooks —`webhook-id`, `webhook-timestamp`, `webhook-signature`— sin las
  cuales la firma no se puede verificar.
- **`tags`** por recurso, para que un generador produzca clientes agrupados de forma
  reconocible.

## Cómo se sirve

**`GET /openapi.json`**, público y sin autenticar, desde la propia API. Así el
contrato que alguien lee es el de la versión que le está respondiendo, y no el de
`main`.

**Y una copia commiteada**, que CI regenera y compara. No es redundancia: es lo que
convierte un cambio de contrato en un diff visible durante la revisión del PR, en
vez de algo que se descubre cuando a un integrador se le rompe el cliente generado.

## Qué impide que mienta

Cuatro cosas, de más a menos fuerte:

1. **Los esquemas de respuesta se usan en los tests de integración que ya existen.**
   Si una respuesta real cambia de forma, falla un test, no solo un documento. Esta
   es la que de verdad sostiene el contrato; las otras tres son red.
2. **Un test recorre el router de Hono** y falla si alguna ruta bajo
   `/api/v1/agent` no está descrita. Un endpoint nuevo no puede entrar sin contrato.
3. **El documento se valida contra el meta-esquema de OpenAPI 3.1**, para no
   publicar algo que un generador rechace.
4. **El diff de la copia commiteada** en CI.

## Lo que este spec no cubre

- **Pintarlo en `docs-site`** con Scalar o equivalente. Es el segundo propósito, y
  llega cuando el documento exista.
- **Generar clientes** desde él. El SDK de TypeScript se sigue escribiendo a mano.
- **`human/*`, `public/queries`, MCP y `health`.**
- **`docs/api/README.md` sigue siendo la fuente de verdad narrativa.** Uno dice qué
  forma tiene; el otro, por qué y cuándo. El OpenAPI no lo sustituye ni lo reduce.

## Decisiones, y por qué

| Decisión | Por qué | Qué se paga |
|---|---|---|
| Contrato, no página navegable | Elección del usuario: que se pueda generar un cliente | La prosa sigue viviendo en la guía, en otro sitio |
| Solo `agent/*` + webhooks salientes | Publicar una superficie es prometer no romperla | `human/*` sigue sin documentar, y así se queda |
| Metadatos junto a la ruta | El zod de entrada ya está ahí y no puede divergir | Hay que tocar las 26 rutas, sin cambiar cómo validan |
| `zod-openapi` + 40 líneas propias | Una dependencia en vez de cuatro peers que ya se movieron una vez | Mantener cuarenta líneas nuestras |
| Esquemas de respuesta en los tests de integración | Es lo único que hace fallar algo cuando el contrato deja de ser cierto | Escribir 26 esquemas que hoy no existen |
| `info.version` desde la etiqueta de la release | Una constante sería una segunda fuente que puede mentir | Nada |
| Copia commiteada además del endpoint | Un cambio de contrato se ve en la revisión del PR | Un paso más en CI |
