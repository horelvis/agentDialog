# Ingesta de correo entrante

**Fecha:** 2026-08-20, revisado el 2026-08-21
**Estado:** **RECHAZADO** el 2026-08-21, después de implementarlo entero. El
andamio se construyó, se revisó y se retiró; el correo entrante no se lee. Lo
que falló y por qué no se arregla con más cuidado está en `docs/operations.md`,
sección «Inbound email: tried, measured, rejected». Este documento se conserva
como registro del intento, no como diseño vigente.

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

## Esto es un andamio, y el spec lo dice a propósito

El proyecto está en fase de prueba, con posibilidad de pasar a producción según
la acogida de la API. Esas dos fases quieren cosas distintas y conviene no
confundirlas.

**La arquitectura de producción ya está escrita.** `POST /api/v1/webhooks/email/inbound`
implementa el patrón proveedor→webhook con verificación de firma. El día que haya
un proveedor transaccional sobre un dominio propio, no hay que construir nada:
hay que configurarlo.

Y ese día llegará por razones que no tienen que ver con la ingesta. Enviar desde
`@gmail.com` en nombre de `agentdialog.io` no alinea SPF ni DKIM, y en un producto
cuyo flujo entero depende de que el humano *vea* el correo, la entregabilidad no
es un detalle. A eso se suma el tope de ~500 envíos diarios de una cuenta
gratuita, y un remitente visible que es una dirección personal.

Lo que este spec construye es **el puente hasta entonces**: leer el buzón de
Gmail directamente, con el mínimo de piezas, y de forma que quitarlo sea borrar
dos ficheros y un job.

### Criterio de salida

Este andamio se retira cuando se cumpla cualquiera de estas condiciones:

- se contrata un proveedor de correo entrante y se apuntan los MX de un dominio
  propio;
- el volumen se acerca al tope diario de Gmail;
- alguien reporta que los emails de query llegan a spam.

Retirarlo es: configurar el webhook del proveedor y su
`INBOUND_EMAIL_WEBHOOK_SECRET`, borrar `src/lib/mailbox.ts`,
`src/services/email-ingest.service.ts` y `src/routes/internal/email-poll.ts`,
borrar el job de Cloud Scheduler, y devolver `REPLY_LOCAL_PART` y `REPLY_DOMAIN`
a los valores del dominio propio. El resto del sistema no se entera, porque ambos
caminos entran por la misma función.

Escrito aquí para que dentro de seis meses no se haya vuelto permanente por
inercia, que es como acaban casi todos los andamios.

## Decisiones tomadas

**Una sola cuenta, `agentdialog.app@gmail.com`, para enviar y recibir.** Separa el
producto del correo personal, que hoy es el remitente visible.

**Direccionamiento con `+` en lugar de un dominio propio.** Gmail entrega
`cuenta+loquesea@gmail.com` en `cuenta@gmail.com` sin configurar nada, así que el
`Reply-To` pasa a ser `agentdialog.app+{queryId}@gmail.com` y **no hace falta
tocar el DNS ni verificar dominios**.

**IMAP con App Password, no la Gmail API con OAuth.** La API obligaría a habilitar
servicios en GCP, crear un cliente OAuth, dar de alta test users y hacer un
consentimiento — y su refresh token **caduca a los 7 días** mientras la app esté
en modo *Testing*. Salir de ahí exige publicar la app, y `gmail.modify` es un
scope restringido, lo que en la práctica significa pasar la verificación de
Google. Desproporcionado para un puente.

Una App Password es un único valor, no caduca, y no requiere ninguna
configuración en GCP. Es además la misma clase de credencial que ya usa el envío:
`SMTP_PASS` es exactamente eso. Se envía por SMTP y se lee por IMAP, con
simetría.

Lo que se acepta a cambio: dos dependencias nuevas, y que Google lleva años
estrechando el cerco a las App Passwords. Hoy funcionan con 2FA activo, que la
cuenta tiene.

**Sondeo programado.** Cloud Scheduler llama a un endpoint cada cinco minutos. Un
humano tarda minutos u horas en responder, así que la latencia es irrelevante, y
cinco minutos en vez de uno reduce a una quinta parte tanto las conexiones IMAP
como la exposición del endpoint.

**Rechazar respuestas de un remitente que no es el destinatario.** Hoy
`email-response.service.ts` registra la respuesta igualmente y solo deja un
`console.warn`, así que cualquiera con acceso al email puede responder en nombre
del destinatario y el agente no se entera. Pasa a rechazarse, y para que el fallo
no sea silencioso se responde al remitente explicando que la pregunta iba
dirigida a otra persona.

## Arquitectura

```
Cloud Scheduler ──cada 5 min──► POST /api/v1/internal/email/poll
                                         │  (secreto en cabecera)
                                         ▼
                              ingestPendingReplies()
                                         │  (bajo cerrojo en Redis)
                         ┌───────────────┴───────────────┐
                         ▼                               ▼
                  MailboxClient                 processEmailReply()
                 (IMAP, imapflow)                (ya existe; solo cambia
              list / fetch / markRead             la comprobación de remitente)
```

### Piezas nuevas

**`src/lib/mailbox.ts`** — interfaz `MailboxClient` y su implementación IMAP con
`imapflow`, más `mailparser` para extraer del mensaje crudo el destinatario, el
remitente y el cuerpo en texto plano. Tres operaciones: listar los no leídos,
descargar uno, marcarlo como leído. Se llama `MailboxClient` y no `GmailClient`
porque nada de lo que hace es específico de Gmail.

**`src/services/email-ingest.service.ts`** — `ingestPendingReplies(client)`:
recorre los no leídos, extrae de cada uno el `queryId`, el remitente y el texto,
llama a `processEmailReply` y marca como leído. Devuelve un recuento por
resultado.

**`src/routes/internal/email-poll.ts`** — `POST /api/v1/internal/email/poll`,
autenticado con un secreto compartido en cabecera comparado en tiempo constante.
Cloud Scheduler no puede firmar como un proveedor de correo, así que un secreto
compartido es lo que hay.

### Cambios en lo que ya existe

**`src/services/query-email.service.ts:45`** — el `Reply-To` se generaliza de
`reply+${queryId}@${REPLY_DOMAIN}` a
`${REPLY_LOCAL_PART}+${queryId}@${REPLY_DOMAIN}`. En producción,
`agentdialog.app` y `gmail.com`. El día que exista un dominio propio se cambian
dos variables, no código.

**`extractQueryId`** pasa de `/reply\+([^@]+)@/` a `/\+([^@]+)@/`, que sirve para
ambos formatos. Con el regex actual una dirección de Gmail devolvería `null` y la
respuesta se descartaría en silencio. Se mueve de
`src/routes/webhooks/email-inbound.ts` a un módulo compartido, porque ahora la
usan dos caminos.

**`src/services/email-response.service.ts`** — la comprobación de remitente pasa
de permisiva a estricta: si no coincide, devuelve `{ sender_mismatch: true }` sin
tocar la query.

El aviso al remitente lo envía **el llamante**, no este servicio: aquí vive la
lógica de dominio y enviar correo es un efecto que corresponde a la capa de
arriba. En la práctica el único llamante que lo envía es la ingesta; el webhook
de proveedor se limita a devolver el resultado.

**`src/env.ts`** — variables nuevas: `REPLY_LOCAL_PART` (por defecto `reply`, para
no cambiar el comportamiento actual), `IMAP_HOST`, `IMAP_PORT`, `IMAP_USER`,
`IMAP_PASSWORD`, `INTERNAL_POLL_SECRET`. Las de IMAP son opcionales: sin ellas la
ingesta no se activa y el endpoint responde 503, igual que hace el webhook
entrante sin su secreto.

### Dependencias nuevas

`imapflow` y `mailparser`, ambas del autor de `nodemailer`, que el proyecto ya
usa para enviar. `node-imap`, la alternativa obvia, lleva sin actualizarse desde
2020.

## Manejo de errores

**Idempotencia: ya resuelta.** `processEmailReply` devuelve `already_answered` si
la query ya tiene respuesta, así que procesar bien un mensaje y fallar al
marcarlo como leído no causa daño: la siguiente pasada lo reprocesa y no pasa
nada.

**Sondeos solapados.** Si una pasada tarda más que el intervalo, la siguiente
podría leer los mismos mensajes. Un cerrojo en Redis —que ya está en la
infraestructura— evita el trabajo duplicado y, más importante, evita abrir
conexiones IMAP de más: Gmail corta alrededor de 15 simultáneas.

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
| La base de datos no responde | **dejar sin leer**, se reintenta en 5 minutos |
| La conexión IMAP falla | abortar la pasada entera, sin marcar nada |

Confundir las dos primeras categorías da o un bucle cada cinco minutos, o una
respuesta perdida para siempre.

**Cuota de Gmail.** El sondeo solo lee, que no consume cuota de envío. Los avisos
de remitente incorrecto sí, pero son excepcionales por definición.

## Pruebas

`MailboxClient` es una interfaz, así que la ingesta se prueba entera con un
doble, sin red y sin credenciales:

- mensaje válido → procesado y marcado como leído
- mensaje sin `queryId` extraíble → marcado como leído, no procesado
- query inexistente → marcado como leído
- remitente distinto del destinatario → rechazado, aviso enviado, marcado
- fallo transitorio de base de datos → **no** marcado como leído
- mensaje ya procesado → `already_answered`, sin efectos
- correo ajeno en el buzón → ignorado y sin marcar
- una segunda pasada concurrente → no hace nada, el cerrojo la descarta

Más unitarios de la extracción del `queryId` con ambos formatos de dirección, y
un test de integración de que el endpoint rechaza sin el secreto.

No hay test contra un servidor IMAP real. La implementación de `imapflow` se
verifica a mano una vez, contra el buzón, durante la puesta en marcha.

## Lo que hay que configurar fuera del código

Mucho más corto que con OAuth. Nada de esto toca GCP salvo el último paso.

1. **Comprobar que IMAP está habilitado** en la cuenta `agentdialog.app@gmail.com`
   — Configuración → Reenvío y correo POP/IMAP.
2. **Generar una App Password** para esa cuenta. Requiere 2FA activo, que ya lo
   está.
3. **Configurar en Cloud Run** `IMAP_HOST=imap.gmail.com`, `IMAP_PORT=993`,
   `IMAP_USER=agentdialog.app@gmail.com`, `IMAP_PASSWORD`,
   `INTERNAL_POLL_SECRET`, `REPLY_LOCAL_PART=agentdialog.app` y
   `REPLY_DOMAIN=gmail.com`, con `--update-env-vars` — nunca `--set-env-vars`,
   que borraría las 19 existentes.
4. **Crear el job de Cloud Scheduler**, cada cinco minutos, con el secreto en
   cabecera.

La `IMAP_PASSWORD` debería ir en Secret Manager y referenciarse como ya hace
`SMTP_PASS`, no como variable plana.

## Criterios de aceptación

1. Un agente crea una query; el humano responde desde su correo y el agente ve la
   respuesta en `getQuery` en menos de seis minutos.
2. Una respuesta desde una dirección distinta del destinatario no modifica la
   query, y el remitente recibe un aviso.
3. Correo ajeno en el buzón no se procesa ni se marca como leído.
4. Un fallo de base de datos no pierde la respuesta: se reintenta y entra.
5. El endpoint de sondeo rechaza peticiones sin el secreto.
6. Sin credenciales de IMAP configuradas, el endpoint responde 503 y nada más del
   sistema cambia de comportamiento.

## Fuera de alcance

- Un dominio de correo propio con un proveedor transaccional. Es el destino, no
  este trabajo, y está descrito arriba como criterio de salida.
- Adjuntos en las respuestas. Solo se procesa el texto.
- Notificaciones push por Pub/Sub. Con el sondeo funcionando y un andamio que se
  va a retirar, no tiene sentido.
