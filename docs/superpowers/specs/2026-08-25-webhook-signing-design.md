# Firma de webhooks verificable — diseño

**Fecha:** 2026-08-25
**Estado:** aprobado, pendiente de plan de implementación
**Origen:** auditoría externa de la API, 2026-08-25

## El fallo

`createWebhook` genera 32 bytes aleatorios, los pasa por bcrypt y guarda solo el
hash (`src/services/webhook.service.ts:25-26`). La entrega usa **ese hash** como
clave HMAC (`webhook.service.ts:98` → `src/lib/webhook-delivery.ts:16`). El
consumidor recibió el secreto original, que no interviene en la firma, así que no
puede reproducirla. Los webhooks se despachan desde seis rutas, incluida
`query.answered` (`src/services/query.service.ts:484`): el evento central del
producto llega con una firma que nadie puede validar.

No es solo inverificable. Las cuatro operaciones de `routes/agent/webhooks.ts`
devuelven la fila entera —el bug es un `db.select()` sin proyección
(`webhook.service.ts:43`)— y esa fila contiene la clave con la que se firma.
Cualquiera que obtenga una respuesta de listado puede **falsificar** entregas.

Dos defectos más del mismo esquema:

- `X-AgentDialog-Timestamp` viaja fuera de la firma, que cubre solo el cuerpo. Una
  entrega capturada se puede reproducir indefinidamente.
- No hay forma de rotar un secreto sin cortar el servicio.

## Lo que hace la industria

Ninguna implementación seria hashea el secreto de firma: Stripe lo revela de nuevo
desde su panel, luego lo guarda de forma reversible; Svix cifra en reposo con
AES-256 y claves en HSM. Ninguna firma solo el cuerpo: Stripe firma
`timestamp.payload` con tolerancia de cinco minutos, y Standard Webhooks firma
`msg_id.timestamp.payload`. La rotación se resuelve emitiendo **varias firmas a la
vez**, una por secreto vivo, y dejando que el consumidor pruebe hasta que una
valide.

Adoptamos **Standard Webhooks** en vez de arreglar el esquema propio. El
argumento decisivo: la firma actual no la puede validar nadie, así que hoy no hay
un solo consumidor funcionando al que romper. Es el único momento del ciclo de
vida del producto en el que cambiar las cabeceras cuesta cero, y a cambio el
integrador verifica con librerías ya escritas en vez de con un snippet nuestro.

## Objetivo

Que el consumidor de un webhook pueda demostrar, con una librería estándar y sin
código nuestro, que la entrega la emitimos nosotros, que no la han manipulado y
que no es una repetición.

## Alcance

Dentro: almacenamiento del secreto, esquema de firma, rotación, higiene de las
respuestas de la API, y la documentación que va con ello.

**Fuera, y a un trabajo posterior:** reintentos con backoff y cola duradera. Es la
otra mitad del hallazgo de la auditoría y merece su propio diseño. Este deja el
terreno preparado: `webhook-id` identifica el **mensaje**, no el intento, para que
los reintentos futuros lo reutilicen y el consumidor deduplique.

**Fuera, y a su propio trabajo:** la guardia SSRF sobre la URL de destino. Es un
hallazgo distinto de la misma auditoría, no depende de este cambio y este no lo
resuelve; que quede escrito para que nadie lo dé por hecho al leer este spec.

## 1. Almacenamiento del secreto

Se elimina `webhooks.secret_hash`. Entra:

```sql
secrets jsonb NOT NULL DEFAULT '[]'
```

Una lista, no un valor, porque la rotación exige varios secretos vivos a la vez:

```ts
interface StoredSecret {
  id: string;           // para diagnosticar sin revelar nada
  ciphertext: string;   // base64
  iv: string;           // base64, 96 bits, nuevo por secreto
  tag: string;          // base64, tag de autenticación GCM
  createdAt: string;
  expiresAt: string | null;  // null = activo indefinidamente
}
```

Cifrado **AES-256-GCM** con `WEBHOOK_ENCRYPTION_KEY`: 32 bytes, entregado como
referencia de Secret Manager igual que `SMTP_PASS` (`docs/operations.md`).
Obligatorio en producción, con el mismo patrón de validación que ya usa
`INBOUND_EMAIL_WEBHOOK_SECRET` en `src/env.ts:70-76`.

Helper nuevo `src/lib/secret-box.ts`, con `seal()` y `open()`. No se toca
`src/lib/crypto.ts`: ese módulo es de hashing unidireccional y debe seguir
siéndolo, para que nadie repita la confusión que causó este fallo.

Formato del secreto entregado al consumidor: `whsec_` + base64 de 32 bytes
aleatorios.

## 2. Esquema de firma

Por mensaje se genera un `msg_id` —el prefijo `msg_` seguido de `nanoid(27)`,
como el resto de identificadores opacos del repo— y un timestamp unix en
segundos. La cadena firmada:

```
${msg_id}.${timestamp}.${body}
```

Se emite una firma por secreto vivo, separadas por espacio:

```
webhook-id: msg_2KWPBgLlAfxdpx2AI54pPJ85f4W
webhook-timestamp: 1674087231
webhook-signature: v1,K5oZfzN95Z9UVu1... v1,7Hs2mQ0pLxT4gRw...
```

**El HMAC usa los bytes crudos del secreto**, es decir base64-decodificado tras
quitar el prefijo `whsec_`. Firmar sobre la cadena literal produce firmas que las
librerías de terceros rechazan sin decir por qué; es el detalle que hay que clavar.

Las cabeceras `X-AgentDialog-Signature` y `X-AgentDialog-Timestamp` desaparecen.
`X-AgentDialog-Event` se mantiene por comodidad de enrutado: es informativa y no
entra en la firma.

## 3. Superficie de la API

`listWebhooks`, `updateWebhook` y `deleteWebhook` pasan a una **proyección
explícita de columnas**. Ninguna respuesta vuelve a contener material de firma,
ni en claro ni cifrado. La creación devuelve `secret` una vez y nunca más.

Endpoint nuevo:

```
POST /api/v1/agent/webhooks/:id/rotate-secret
```

Devuelve el secreto nuevo una sola vez y marca el anterior con `expiresAt` a 24
horas — el valor por defecto, en `src/config/limits.ts` como el resto de límites.
Durante la ventana se envían ambas firmas y el consumidor migra cuando quiera.

Un secreto caducado deja de producir firma en cuanto pasa su `expiresAt`; la fila
se limpia de secretos caducados en la siguiente rotación, no en un barrido aparte.

**`rotate-secret` funciona sobre un webhook inactivo y lo reactiva.** Es la vía
por la que se recupera un webhook desactivado por la migración, y sin eso no
habría ninguna.

## 4. Contrato con el consumidor

La documentación debe indicar, y el SDK ofrecer:

- tolerancia de **5 minutos** sobre `webhook-timestamp`;
- comparación en **tiempo constante** de la firma;
- deduplicación por `webhook-id`, que es además media respuesta a la falta de
  idempotencia que señaló la auditoría.

Se actualizan `docs-site/content/docs/realtime/webhooks.mdx` —que hoy documenta
una cabecera `X-Webhook-Signature` que no existe— y `docs/api/README.md:1181`.

## 5. Migración

`secret_hash` se elimina sin pérdida: esos hashes no sirven para nada.

**En producción no hay ningún webhook** — cero filas, comprobado el 2026-08-25.
Así que este cambio no rompe a nadie y no hay nada que comunicar. Conviene
saberlo al leer lo que sigue: no es una migración delicada, es una tabla vacía.

Aun así la migración deja los webhooks existentes en `isActive = false`, y la
cláusula se escribe igualmente. Cuesta nada, y cubre el caso de que alguien cree
uno entre hoy y el despliegue: su secreto original sería igual de irrecuperable
que los de antes, porque hasta que este trabajo esté desplegado se sigue
guardando un hash bcrypt. Revivirlo exige llamar a `rotate-secret` y adoptar el
secreto que devuelve.

Que la tabla esté vacía no vuelve opcional el endpoint de rotación: su razón de
ser es responder a un secreto comprometido, no migrar estas filas.

## 6. Verificación

**Unitarias**, sin base de datos:

- `seal`/`open` de ida y vuelta; `open` falla si se manipula el ciphertext, el iv
  o el tag;
- construcción de la cadena base `msg_id.timestamp.body`;
- una firma por secreto vivo, en el orden esperado y separadas por espacio;
- los secretos caducados no producen firma;
- una firma emitida por nosotros valida contra una implementación independiente
  escrita en el propio test a partir de la especificación, no reutilizando
  nuestro código.

**De integración**, con Postgres y Redis:

- crear un webhook, capturar la entrega contra un servidor HTTP local y validar
  la firma con el secreto que devolvió la creación — la prueba que hoy no existe
  y que habría cazado este fallo el primer día;
- rotar y comprobar que llegan dos firmas y que ambas validan;
- regresión explícita: listado, actualización y borrado no contienen `whsec_` ni
  ningún campo de `secrets`.

## Consecuencias

- Un secreto más que aprovisionar en Cloud Run y documentar en
  `docs/operations.md`.
- Perder `WEBHOOK_ENCRYPTION_KEY` equivale a perder todos los secretos de firma;
  la recuperación es rotar. Debe decirlo la documentación de operaciones.
- Ningún consumidor se ve afectado: no hay webhooks en producción. La única
  ruptura teórica es la de un webhook creado entre hoy y el despliegue.
