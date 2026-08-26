# Claves de idempotencia — diseño

**Fecha:** 2026-08-26
**Estado:** aprobado, pendiente de plan de implementación
**Origen:** auditoría externa de la API (2026-08-25), donde figuraba junto a la
falta de OpenAPI. Priorizado el 2026-08-26.

## El problema

`Idempotency` no aparece en ninguna parte de `src/`. La superficie de agente
tiene doce POST y ninguno distingue una petición nueva de la repetición de una
que ya se ejecutó.

Un reintento, por tanto, duplica. Y en este producto un duplicado no es una fila
de más: `POST /agent/queries` crea una conversación, acuña un grant y **envía un
correo a una persona**. Reintentar esa llamada le pregunta dos veces lo mismo al
mismo humano, con dos enlaces distintos que resuelven dos queries distintas. El
agente recibirá dos respuestas para una sola decisión y no tiene forma de saber
cuál obedecer.

El duplicado no requiere que nadie se equivoque. El SDK **ya reintenta** ante un
`429` (`sdks/typescript/src/client.ts:362-365`) repitiendo la operación a ciegas;
un fallo de red o un `timeout` no se reintentan hoy en absoluto, así que el
integrador que quiera robustez lo hará por su cuenta, sin nada que se lo haga
seguro. Un proxy o un balanceador pueden reintentar sin preguntar a nadie.

Las rotaciones son un caso peor que el duplicado. `POST /agent/webhooks/:id/rotate-secret`
y `POST /agent/key/rotate` devuelven un valor que **solo se enseña una vez**. Si
la respuesta se pierde de camino al cliente y este reintenta, la segunda rotación
invalida el secreto que el cliente nunca llegó a leer: el agente se queda sin
credencial utilizable y la única salida es volver a rotar y acertar a leerla.

## Lo que hace la industria

Stripe fijó la forma que todos copian: una cabecera `Idempotency-Key` que el
cliente elige, ámbito por cuenta, veinticuatro horas de memoria, y la **respuesta
original** —no un `409`— cuando la clave se repite con el mismo cuerpo. Square,
Adyen y PayPal implementan lo mismo con nombres parecidos. Dos reglas del diseño
de Stripe son las que evitan los fallos sutiles y las adoptamos tal cual: una
petición en vuelo responde conflicto en vez de ejecutarse dos veces, y la misma
clave con un cuerpo distinto es un error del cliente que hay que decirle en voz
alta, no una petición nueva.

## Alcance

Siete rutas, elegidas porque en ellas repetir cuesta algo que no se puede
deshacer:

| Ruta | Qué duplica |
|---|---|
| `POST /agent/queries` | Una pregunta a un humano, con su correo y su enlace |
| `POST /agent/conversations` | Una conversación vacía por cada reintento |
| `POST /agent/conversations/:id/messages` | Un mensaje repetido en el hilo que la persona lee |
| `POST /agent/conversations/:id/invitations` | Una segunda invitación a la misma persona |
| `POST /agent/webhooks` | Un webhook de más, y el secreto del primero perdido |
| `POST /agent/webhooks/:id/rotate-secret` | Deja al consumidor sin el secreto que no leyó |
| `POST /agent/key/rotate` | Deja al agente sin clave utilizable |

`POST /agent/webhooks` no estaba en la conversación previa y lo añado aquí: crea
un recurso **y** revela un secreto una sola vez, así que pertenece a la misma
familia que las rotaciones.

Quedan fuera, a propósito:

- **Las tres rutas de subida.** El cuerpo es multipart y el resumen que detecta
  el reuso de clave exigiría digerir el fichero entero en memoria. Es otro
  problema, con otro riesgo, y merece su propia decisión.
- **`POST /agent/register`.** No hay agente todavía, así que no hay ámbito al que
  atar la clave; su protección hoy es el límite de diez altas por hora.
- **`POST /agent/queries/:id/cancel`.** Cancelar dos veces deja la query
  cancelada: ya es idempotente por naturaleza.

## El contrato

`Idempotency-Key` es **opcional**. Exigirla rompería a cualquier integrador que
ya esté en producción, y la protección real llega igualmente porque el SDK la
envía sola.

El valor es una cadena no vacía de hasta 255 caracteres. Fuera de eso, `422`: una
clave vacía sería indistinguible de no mandar ninguna, y no queremos que un
cliente crea estar protegido sin estarlo.

El ámbito de una clave es **el agente, el método y la ruta**. Dos agentes pueden
elegir la misma cadena sin verse; el mismo agente reusando su clave en otra ruta
tampoco colisiona. Junto a la clave se guarda un **SHA-256 del cuerpo** de la
petición.

Ante una clave ya vista:

| Situación | Respuesta |
|---|---|
| La primera petición sigue en vuelo | `409`, código `IDEMPOTENCY_IN_PROGRESS` |
| Terminó con éxito y el cuerpo coincide | La respuesta original, con `Idempotency-Replayed: true` |
| Terminó con éxito y el cuerpo difiere | `409`, código `IDEMPOTENCY_KEY_REUSED` |

Los dos conflictos comparten código HTTP y se distinguen por `code`, que es lo
que un agente puede ramificar sin leer prosa.

**Solo se recuerdan las respuestas con éxito.** Si el handler lanza o responde
4xx o 5xx, la reserva se libera. La razón es concreta: un `422` de la puerta de
admisión le dice al agente qué añadir, y el agente corregirá el cuerpo y
reintentará —probablemente con la misma clave—. Si hubiéramos recordado el
fracaso, ese reintento correcto chocaría contra `IDEMPOTENCY_KEY_REUSED` y el
agente quedaría atrapado sin entender por qué.

## Almacenamiento

Redis, con la forma que ya usa `src/middleware/rate-limit.ts`.

- Clave: `idem:<agentId>:<sha256(method + path + idempotencyKey)>`
- Reserva: `SET … NX EX 120` (`IDEMPOTENCY_RESERVATION_TTL_SECONDS`) con
  `{ state: "in_progress", bodyHash }`
- Al terminar con éxito: `SET … EX 86400` (`IDEMPOTENCY_TTL_SECONDS`), explícito
  y no `KEEPTTL`, con `{ state: "completed", status, body, bodyHash }`. La
  ventana de memoria de veinticuatro horas arranca cuando la respuesta se
  produjo, no cuando llegó la petición original
- Al terminar con error: `DEL`

Esto difiere de lo planteado al principio: la reserva iba a llevar la misma TTL
de veinticuatro horas que la respuesta completada, con `KEEPTTL` para no
reiniciarla. Una ronda de implementación lo cambió: una reserva que sobrevive
un proceso caído bloquearía la clave un día entero en vez de dos minutos, así
que la reserva usa su propia TTL corta (`IDEMPOTENCY_RESERVATION_TTL_SECONDS`,
120 segundos) y la respuesta completada fija la suya de manera explícita en vez
de heredar la de la reserva.

Veinticuatro horas de memoria para la respuesta completada, que es lo que hace
la industria y bastante más que cualquier ventana de reintento razonable.

La reserva y la lectura ocurren en una sola operación atómica (`SET NX` devuelve
si escribió), así que dos peticiones simultáneas no pueden entrar ambas: la
segunda ve la reserva y responde `IDEMPOTENCY_IN_PROGRESS`.

## Lo que este diseño no cubre

- **Redis es efímero.** Si se vacía, una clave deja de reconocerse y un reintento
  tardío duplicaría. Es el mismo nivel de confianza que ya damos al límite de
  altas, cuyo contador vive ahí. Una tabla en Postgres lo cerraría, a cambio de
  una migración, una escritura más en el camino caliente y un barrido; no lo vale
  para una ventana de veinticuatro horas.
- **Un cuerpo idéntico enviado a propósito dos veces** con la misma clave se
  considera el mismo intento. Es la definición de idempotencia, no un fallo, pero
  conviene decirlo porque alguien preguntará.
- **Las subidas siguen sin protección**, y con ellas el mensaje de tipo `file` que
  crean.
- **La respuesta completada se recuerda entera, secretos incluidos, durante 24
  horas en Redis.** `POST /agent/webhooks`, `POST /agent/webhooks/:id/rotate-secret`
  y `POST /agent/key/rotate` devuelven un valor que el sistema enseña
  deliberadamente una sola vez, y ese valor queda legible en el registro de
  reserva mientras dure la ventana de repetición. Es una decisión consciente —la
  misma que toma Stripe— y es el precio de poder repetir la respuesta que el
  cliente perdió, pero hasta ahora no estaba escrita en ninguna parte, y esto lo
  hace en un producto que por lo demás cifra esos mismos secretos en reposo en
  Postgres.

## El SDK

El SDK de TypeScript genera una clave por cada llamada a las siete rutas y **la
reutiliza en su reintento del `429`**, que hoy repite la operación sin ninguna
red debajo. La cabecera se puede sobrescribir desde fuera para quien quiera
gobernarla, por ejemplo derivándola de su propio identificador de trabajo.

Eso es lo que hace que esto proteja a alguien: el integrador medio no va a
implementar una cabecera que no sabe que existe.

Queda apuntado, y **fuera de este trabajo**: una vez exista idempotencia, el SDK
podría reintentar también los fallos de red, que hoy no reintenta precisamente
porque no era seguro hacerlo.

## Documentación

Por la regla del repositorio, tocar el SDK arrastra en el mismo cambio:

- `docs/api/README.md` — la cabecera, las siete rutas, los dos códigos de
  conflicto y la regla de que solo se recuerdan los éxitos
- `docs-site` — lo mismo, para el integrador que lee la web
- El README del SDK, que es lo que npm renderiza
- Los ejemplos de la landing, si alguno muestra una creación

Y `web/public/agentdialog-integration-guide.md` se regenera al construir `web/`,
según la trampa ya documentada en `CLAUDE.md`.

## Pruebas

**Unitarias**, sobre la máquina de estados aislada de Redis y de Hono: reserva,
repetición con el mismo cuerpo, repetición con cuerpo distinto, petición en
vuelo, liberación tras error, validación del valor de la cabecera.

**De integración**, por HTTP real, que es donde este repositorio ya aprendió que
se descubren las cosas: dos `POST /agent/queries` idénticos con la misma clave
crean **una** query, devuelven la misma respuesta y la segunda trae
`Idempotency-Replayed: true`; la misma clave con otro cuerpo responde
`IDEMPOTENCY_KEY_REUSED`; una creación que falla con `422` deja la clave libre
para el reintento corregido.

Cuidado con la trampa conocida: el presupuesto de diez altas de agente por hora es
compartido por toda la suite y vive en Redis entre ejecuciones. Un agente por
fichero, en `beforeAll`, reutilizado.

## Decisiones, y por qué

| Decisión | Por qué |
|---|---|
| Opcional, no obligatoria | Exigirla rompe a todo integrador existente el día que se despliega |
| Redis y no Postgres | Misma durabilidad que el limitador; una migración y un barrido no se pagan solos para 24 horas |
| Solo se recuerdan los éxitos | Un `422` con `remedy` existe para que el agente corrija y reintente; recordar el fracaso lo dejaría atrapado |
| `409` con dos códigos | Un agente ramifica por `code`, no por prosa |
| Ámbito por agente, método y ruta | La misma cadena en otra ruta o de otro agente no colisiona; el ámbito lo garantiza en vez de confiar en que nadie repita |
| El SDK la manda solo | Sin eso, la funcionalidad existe y no protege a nadie |
