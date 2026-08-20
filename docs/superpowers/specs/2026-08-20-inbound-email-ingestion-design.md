# Ingesta de correo entrante por Gmail

**Fecha:** 2026-08-20
**Estado:** aprobado, pendiente de plan de implementación

## Objetivo

Hacer que funcione la funcionalidad que la landing anuncia: que la respuesta de
un humano por email llegue al agente que preguntó.

Hoy no funciona. El código que la procesa está completo y probado, pero la
infraestructura de correo entrante nunca se construyó.

## El estado real, verificado

- Los emails de query salen por **SMTP de Gmail** (`smtp.gmail.com:465`) con
  `Reply-To: reply+{queryId}@reply.agentdialog.io`.
- Ni `agentdialog.io` ni `reply.agentdialog.io` tienen registro MX —comprobado
  contra dos resolutores—, así que **la respuesta del humano rebota**. No llega a
  ningún buzón.
- `POST /api/v1/webhooks/email/inbound` está desplegado y accesible, pero ningún
  proveedor lo llama. Resend aparece solo como valor por defecto de
  `INBOUND_EMAIL_PROVIDER` en el código; no hay cuenta contratada.

## Decisiones tomadas

**Una sola cuenta, `agentdialog.app@gmail.com`, para enviar y recibir.** Separa el
producto del correo personal, que hoy es el remitente visible.

**Direccionamiento con `+` en lugar de un dominio propio.** Gmail entrega
`cuenta+loquesea@gmail.com` en `cuenta@gmail.com` sin configurar nada, así que el
`Reply-To` pasa a ser `agentdialog.app+{queryId}@gmail.com` y **no hace falta
tocar el DNS ni verificar dominios**.

**Sondeo programado, no Pub/Sub.** Gmail puede notificar por Pub/Sub, pero lo que
envía es un aviso con un `historyId`, no el mensaje: obliga a mantener un cursor
persistente, a manejar el caso de que el cursor caduque, a deduplicar reintentos
y a renovar el `watch` cada 7 días o deja de notificar en silencio. El sondeo no
necesita nada de eso: el estado vive en Gmail, leído o no leído. A cambio, un
minuto de latencia en un flujo donde el humano tarda minutos u horas.

La ingesta queda aislada detrás de una función para que migrar a Pub/Sub más
adelante sea escribir un disparador distinto, no reescribir el procesamiento.

**Rechazar respuestas de un remitente que no es el destinatario.** Hoy
`email-response.service.ts` registra la respuesta igualmente y solo deja un
`console.warn`, así que cualquiera con acceso al email puede responder en nombre
del destinatario y el agente no se entera. Pasa a rechazarse, y para que el fallo
no sea silencioso se responde al remitente explicando que la pregunta iba
dirigida a otra persona.

## Arquitectura

```
Cloud Scheduler ──cada minuto──► POST /api/v1/internal/email/poll
                                          │  (secreto en cabecera)
                                          ▼
                            ingestPendingReplies()
                                          │
                          ┌───────────────┴───────────────┐
                          ▼                               ▼
                  GmailClient                    processEmailReply()
              (REST de Gmail, fetch)              (ya existe, sin cambios
               list / get / markRead               salvo el remitente)
```

### Piezas

**`src/lib/gmail.ts`** — cliente contra la API REST de Gmail con `fetch`, sin el
SDK de Google. Cuatro operaciones: canjear el refresh token por un access token,
listar mensajes sin leer, descargar uno, marcarlo como leído. Se define como
interfaz para poder inyectar un doble en los tests.

**`src/services/email-ingest.service.ts`** — `ingestPendingReplies(client)`:
recorre los mensajes sin leer, extrae de cada uno el `queryId`, el remitente y el
texto, llama a `processEmailReply` y marca como leído. Devuelve un recuento por
resultado. **Esta función es la costura**: el disparador de Pub/Sub del futuro
llamará a `processEmailReply` igual, con un mensaje concreto en vez de una lista.

**`src/routes/internal/email-poll.ts`** — `POST /api/v1/internal/email/poll`,
autenticado con un secreto compartido en cabecera comparado en tiempo constante.
Devuelve el recuento. Cloud Scheduler no puede firmar como un proveedor de
correo, así que un secreto compartido es lo que hay.

### Cambios en lo que ya existe

**`src/services/query-email.service.ts:45`** — el `Reply-To` se generaliza de
`reply+${queryId}@${REPLY_DOMAIN}` a
`${REPLY_LOCAL_PART}+${queryId}@${REPLY_DOMAIN}`. En producción,
`agentdialog.app` y `gmail.com`. El día que exista un dominio propio se cambian
dos variables, no código.

**`src/routes/webhooks/email-inbound.ts`** — `extractQueryId` pasa de
`/reply\+([^@]+)@/` a `/\+([^@]+)@/`, que sirve para ambos formatos. Con el regex
actual una dirección de Gmail devolvería `null` y la respuesta se descartaría en
silencio. La función se mueve a un módulo compartido, porque ahora la usan dos
caminos.

**`src/services/email-response.service.ts`** — la comprobación de remitente pasa
de permisiva a estricta: si no coincide, devuelve `{ sender_mismatch: true }` sin
tocar la query.

El aviso al remitente lo envía **el llamante**, no este servicio: aquí vive la
lógica de dominio y enviar correo es un efecto que corresponde a la capa de
arriba. En la práctica el único llamante que lo envía es la ingesta; el webhook
de proveedor se limita a devolver el resultado, y hoy nadie lo invoca.

**`src/env.ts`** — variables nuevas: `REPLY_LOCAL_PART` (por defecto `reply`, para
no romper el comportamiento actual), `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`,
`GMAIL_REFRESH_TOKEN`, `INTERNAL_POLL_SECRET`. Las de Gmail son opcionales: sin
ellas la ingesta no se activa y el endpoint responde 503, igual que el webhook
entrante hace ahora sin su secreto.

## Manejo de errores

**Idempotencia: ya resuelta.** `processEmailReply` devuelve `already_answered` si
la query ya tiene respuesta, así que procesar bien un mensaje y fallar al
marcarlo como leído no causa daño: la siguiente pasada lo reprocesa y no pasa
nada.

**Correo que no es una respuesta.** Solo se procesan los mensajes cuyo
destinatario encaja con `+{uuid}@`. El resto **no se toca ni se marca como
leído**, para que el buzón siga siendo usable por una persona.

**Permanente frente a transitorio.** Cada mensaje va en su propio `try`, y el
tratamiento depende del tipo de fallo:

| Situación | Qué se hace |
|---|---|
| No se puede extraer el `queryId` | marcar leído — reintentar no lo arregla |
| La query no existe | marcar leído |
| La query ya estaba respondida o expiró | marcar leído |
| El remitente no coincide | marcar leído y avisar al remitente |
| La base de datos no responde | **dejar sin leer**, se reintenta al minuto |

Confundir las dos categorías da o un bucle infinito cada minuto, o una respuesta
perdida para siempre.

**Cuota de Gmail.** Una cuenta gratuita ronda los 500 envíos diarios. El sondeo
solo lee, que consume unidades distintas y muy inferiores, pero los avisos de
remitente incorrecto sí cuentan como envío.

## Pruebas

El cliente de Gmail se inyecta, así que la ingesta se prueba entera con un doble,
sin red y sin credenciales:

- mensaje válido → procesado y marcado como leído
- mensaje sin `queryId` extraíble → marcado como leído, no procesado
- query inexistente → marcado como leído
- remitente distinto del destinatario → rechazado, aviso enviado, marcado
- fallo transitorio de base de datos → **no** marcado como leído
- mensaje ya procesado → `already_answered`, sin efectos
- correo ajeno en el buzón → ignorado y sin marcar

Más unitarios de la extracción del `queryId` con ambos formatos de dirección, y
un test de integración de que el endpoint rechaza sin el secreto.

## Lo que hay que configurar fuera del código

Ninguno de estos pasos lo puede hacer el código. Van en este orden.

1. **Habilitar la Gmail API** en el proyecto `agentdialog`.
2. **Crear un cliente OAuth** de tipo Desktop en ese proyecto.
3. **Añadir `agentdialog.app@gmail.com` como test user** en la pantalla de
   consentimiento. Sin esto el consentimiento falla con un error poco
   descriptivo, y es el paso que más se olvida.
4. **Dar el consentimiento** con la cuenta `agentdialog.app@gmail.com` y guardar
   el refresh token. Scope `gmail.modify`, no `readonly`: hay que marcar como
   leído.
5. **Configurar en Cloud Run** `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`,
   `GMAIL_REFRESH_TOKEN`, `INTERNAL_POLL_SECRET`, `REPLY_LOCAL_PART=agentdialog.app`
   y `REPLY_DOMAIN=gmail.com`, con `--update-env-vars` — nunca `--set-env-vars`,
   que borraría las 19 existentes.
6. **Crear el job de Cloud Scheduler**, cada minuto, con el secreto en cabecera.

El proyecto de GCP pertenece a una cuenta distinta de la del buzón. No es un
obstáculo: el cliente OAuth vive en el proyecto y el consentimiento lo da la
cuenta del buzón. Solo el paso 4 requiere la segunda cuenta.

**Aviso sobre el refresh token:** con la app OAuth en modo *Testing*, el token
caduca a los 7 días. Para que dure hay que publicarla, lo que con un scope
sensible de Gmail normalmente implica verificación de Google. Con un único
usuario que además es el dueño se puede publicar sin verificar, a cambio de que
la pantalla de consentimiento avise de que la app no está verificada. Es feo una
vez y funcional después.

## Criterios de aceptación

1. Un agente crea una query; el humano responde desde su correo y el agente ve la
   respuesta en `getQuery` en menos de dos minutos.
2. Una respuesta desde una dirección distinta del destinatario no modifica la
   query, y el remitente recibe un aviso.
3. Correo ajeno en el buzón no se procesa ni se marca como leído.
4. Un fallo de base de datos no pierde la respuesta: se reintenta y entra.
5. El endpoint de sondeo rechaza peticiones sin el secreto.
6. Sin credenciales de Gmail configuradas, el endpoint responde 503 y nada más
   del sistema cambia de comportamiento.

## Fuera de alcance

- Migrar a Pub/Sub. El diseño lo deja preparado; hacerlo es otro trabajo.
- Un dominio de correo propio con SPF y DKIM alineados. Es lo correcto a medio
  plazo para la entregabilidad, y no bloquea esto.
- Adjuntos en las respuestas. Solo se procesa el texto.
