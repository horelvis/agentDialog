# Responder una query desde el enlace del correo — diseño

**Fecha:** 2026-08-25
**Estado:** aprobado, pendiente de plan de implementación

## El problema

Un agente pregunta algo a una persona. Esa persona recibe un correo y, para
contestar, hoy recorre ocho pasos: abre el correo, pulsa un botón que la deja en
una pantalla de acceso —no en su pregunta—, teclea su email, vuelve al correo a
por el código de seis dígitos, lo teclea, aterriza en una lista de invitaciones,
acepta la invitación y por fin entra en la conversación a responder.

Dos cambios de aplicación y dos cosas que teclear para contestar "sí" o "no".

El enlace del correo apunta a `${APP_URL}/app/invitations`
(`src/services/email.service.ts:17`): una lista genérica, **sin token y sin
contexto**. Así que el coste no está solo en la autenticación. Buena parte está
en que el enlace no sabe a qué pregunta viene.

Para una persona con soltura técnica es un incordio. Para el resto es el motivo
por el que la pregunta se queda sin responder, y una query sin respuesta no le
dice al agente si la persona **no pudo** o **no quiso**.

## Objetivo

Que responder una pregunta de bajo riesgo cueste un clic desde el correo, sin
que el enlace conceda nada más que responder esa pregunta.

## Dos cambios independientes

Se diseñan juntos y se pueden construir por separado.

**(a) El enlace lleva contexto.** No toca la autenticación. El correo enlaza a la
pregunta concreta; si no hay sesión, el formulario de acceso sale en esa misma
página con el email ya relleno, y al verificar se aterriza en la pregunta. De
ocho pasos a tres. Sirve para **todos** los niveles de riesgo.

**(b) El enlace concede responder.** Sí toca la autenticación, y es el grueso de
este documento.

## La decisión de fondo: capacidad, no sesión

El enlace concede **la capacidad de resolver una query**, no una sesión como esa
persona.

La diferencia es el radio de un correo reenviado. Con una sesión, quien reciba
el reenvío entra al historial completo de esa persona con todos sus agentes. Con
una capacidad acotada, lo peor que puede hacer es responder esa pregunta.

Hay además un argumento de producto: la persona a la que esto va dirigida **no
quiere una cuenta**. Quiere contestar y volver a lo suyo. Darle una sesión es
resolver su problema con la herramienta equivocada.

## Lo que la capacidad permite

Responder, o **devolver la pregunta** con un motivo — que es el `outcome`
`insufficient_context` de la misma operación, no una operación aparte.

Devolverla no es un extra: sin ella, una persona que no entiende la pregunta solo
puede no hacer nada, y el agente no distingue eso de un rechazo. `needs_context`
ya existe, pausa el reloj de la query y devuelve la pelota al agente.

Fuera, deliberadamente: leer el hilo de la conversación y adjuntar ficheros. Eso
daría al enlace un radio de lectura sobre lo que el agente dijo antes.

## El riesgo decide si el enlace existe

Para `risk` en `high` o `critical` **no se acuña ningún grant**. No un grant que
además pida el código: eso serían dos modelos de autenticación conviviendo en la
misma ruta y un estado a medio autenticar. Simplemente no hay enlace mágico —
el correo lleva el enlace profundo de (a) y la persona se identifica como hoy.

Un solo camino por nivel de riesgo. El producto ya obliga al agente a declarar
`risk` y lo eleva solo cuando ve dinero o una decisión previa, así que la
palanca ya existe y no inventamos una dimensión nueva.

## 1. Modelo de datos

Tabla nueva `query_grants`, una fila por (query, invitado):

```
id            uuid pk
query_id      uuid → human_queries(id) on delete cascade
human_email   varchar(256)
token_prefix  varchar(15)   -- indexado, único
token_hash    varchar(256)
consumed_at   timestamptz null
expires_at    timestamptz not null
created_at    timestamptz not null
updated_at    timestamptz not null
```

Token: `qgr_` + `nanoid(48)`, con prefijo indexado y hash bcrypt — el mismo
patrón que `humans.sessionTokenPrefix` / `sessionTokenHash`.

**No se copia el patrón de `invitations.token`, que se guarda en claro.** Ese es
un problema conocido y aparte; heredarlo en código nuevo sería importarlo.

## 2. Ciclo de vida

**Se acuña** al invitar al humano de una query cuyo riesgo sea `low` o `medium`.

**Caduca con la query**: `expires_at` se copia de `human_queries.expires_at`, no
es un TTL inventado. Cuando la pregunta muere, el enlace muere.

**Se consume al responder, y solo entonces.** Ni el `GET`, ni `needs_context`,
ni un intento fallido lo queman. Que `needs_context` no lo queme es
imprescindible: el agente aclarará y esa persona tiene que poder volver por el
mismo enlace. Quemarlo ahí dejaría fuera a quien pidió ayuda.

## 3. Rutas y middleware

Tres rutas públicas bajo `/api/v1/public/queries/:token`, sin `humanAuth`, tras
un middleware `queryGrantAuth` que resuelve el token a un par (query, email) y
**no emite sesión nunca**:

| Ruta | Efecto |
|---|---|
| `GET /` | Devuelve `subject`, `question`, `answer_space`, `risk`, `context` y si ya está respondida. Nada del hilo, nada de otras queries. |
| `POST /respond` | Resuelve la query. Consume el grant **solo si** el `outcome` es una respuesta de verdad. |

**Una sola ruta de escritura, no dos.** Devolver la pregunta no es una operación
distinta: `respondQuery` ya la modela como un `outcome` de la misma llamada
(`input.outcome === "insufficient_context"`,
`src/services/query.service.ts:381`). Partirla en dos endpoints inventaría una
frontera que el servicio no tiene y obligaría a mantener dos caminos hacia la
misma transacción.

De ahí sale la regla de consumo: **se mira el `outcome`, no el endpoint**. Una
respuesta consume el grant; `insufficient_context` no.

Con límite de peticiones propio, por prefijo de token y por IP.

La página pública que abre el humano vive en `/q/:token` y es la única del web
que funciona sin sesión. El enlace del correo apunta ahí.

## 4. Cómo encaja sin tocar la seguridad existente

**`respondQuery` no se modifica.**

Ese servicio ya resuelve dos cosas: responder una query `pending` **es**
aceptarla, no hay paso de aceptación aparte (`src/services/query.service.ts:326`);
y su comprobación de derecho para una query pendiente es que el email del humano
coincida con el destinatario (`:304-308`).

El flujo es: resolver el grant → `(queryId, email)` → buscar o crear el humano
por ese email → `respondQuery(queryId, humanId, input)` sin cambios.

Crear el humano si no existe es correcto y no concede nada: la fila queda sin
`sessionTokenHash`, así que no hay sesión que usar. Es la misma fila que se
habría creado la primera vez que esa persona pidiera un código.

Quedan **dos comprobaciones independientes**: el grant prueba control del buzón
—se envió ahí— y `respondQuery` verifica por su cuenta que ese email es el
destinatario. No es redundancia: ninguna de las dos confía en la otra, así que un
fallo al resolver el grant no basta para responder en nombre de nadie.

## 5. Las defensas, y lo que aceptamos

**El `GET` es seguro en el sentido HTTP: no muta nada.** Los escáneres
corporativos de correo hacen prefetch de los enlaces; con esto, un antivirus que
abra el enlace no gasta el token ni envía nada. Responder exige un `POST` con
cuerpo, que un prefetch no hace. Un `GET` que consumiera sería explotable por
accidente.

**El correo ya era la frontera de seguridad**: hoy el código de acceso viaja por
email, así que quien controla el buzón ya puede entrar. Esto no rompe una
garantía que existiera; la hace explícita.

**Riesgo residual aceptado:** un correo reenviado es una credencial reenviada.
Acotado a que un tercero responda esa pregunta — no lee el hilo, no ve otras
queries, no obtiene sesión, y queda registrado qué grant se usó.

**Revocación:** no hay endpoint propio. La caducidad y el consumo cubren el caso
normal, y un agente que se dé cuenta de haber preguntado a quien no debía tiene
`cancel_query`, que mata la query y con ella el grant.

## 6. Verificación

**Unitario:** reglas de acuñación, caducidad y consumo; que `high` y `critical`
no acuñan grant.

**Integración, sobre HTTP real:**

- el `GET` no consume el token;
- responder consume, y un segundo intento con el mismo enlace se rechaza;
- `needs_context` **no** consume y el enlace sigue vivo después;
- una query cancelada, caducada o ya respondida se rechaza;
- el grant de una query no sirve para otra;
- ninguna respuesta de estas rutas contiene un token de sesión.

## Fuera de alcance

- Leer el hilo o adjuntar ficheros desde el enlace.
- Un formulario que varias personas rellenan. Una query tiene un
  `target_human_email` en singular; preguntar a tres personas son tres queries y
  tres enlaces. Cómo agrega el agente esas respuestas es asunto suyo.
- Arreglar que `invitations.token` se guarde en claro.
