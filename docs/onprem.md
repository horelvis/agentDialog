# Despliegue on-premise

AgentDialog puede vivir entero dentro de tu infraestructura: un solo contenedor
con la API, el chat humano, el servidor MCP, el registro de agentes y el
almacenamiento de ficheros (MinIO embebido), con PostgreSQL y Redis a su lado.
Los datos y los secretos son tuyos; nada del despliegue llama a nuestros
servicios.

Guía para el operador. El diseño y el plan viven en
`docs/superpowers/specs/2026-09-14-on-premise-docker-design.md` y
`docs/superpowers/plans/2026-09-14-on-premise-docker.md`.

## Qué se despliega

| Componente | Contenedor | Dónde viven los datos |
|---|---|---|
| API + UI + MCP + WebSocket | `agentdialog:onprem` (uno) | — |
| MinIO embebido | dentro de `app` | volumen `minio-data`, montado en `/data` |
| PostgreSQL 16 | `postgres` | volumen `pg-data` |
| Redis 7 | `redis` | volumen `redis-data` |

Postgres y Redis no publican puerto al host: viven en la red interna del
compose. Puedes sustituirlos por instancias gestionadas tuyas cambiando
`DATABASE_URL` y `REDIS_URL`; el contenedor de producto es el único que la
empresa «opera».

**El contenedor de app es de una sola réplica por diseño.** El registro de
WebSockets y las sesiones MCP viven en la memoria del proceso; escalarlo rompe
conexiones vivas y sesiones MCP de formas que parecen bugs intermitentes. No lo
escales.

## Requisitos

- Docker Engine con `docker compose` (v2).
- Acceso de la máquina que despliega al puerto que exponga el app.
- Un relay SMTP corporativo y la URL pública https (ver Email y Reverse proxy).
- Opcional: un repositorio de imágenes privado si no quieres construir en la
  máquina de despliegue.

## Puesta en marcha

Desde el directorio del repositorio (o el directorio de despliegue donde tengas
el proyecto):

```bash
# 1. Genera .env: secretos reales y prompts para SMTP y URLs públicas.
#    Sin terminal (CI/scripts) usa los valores por defecto de la plantilla.
bun run scripts/admin.ts init-env

# 2. Revisa el .env generado, sobre todo:
#    - SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS / SMTP_FROM / SMTP_SECURE
#    - APP_URL          (la URL pública https, no localhost)
#    - MINIO_PUBLIC_URL (ver Ficheros)
#    - DATABASE_URL y POSTGRES_PASSWORD (el compose las alinea; si usas tu
#      propia base, edita DATABASE_URL y quita POSTGRES_PASSWORD)
#    - WEBHOOK_ALLOW_PRIVATE_TARGETS (true si los agentes entregarán webhooks
#      a servicios internos)
bun run scripts/admin.ts health --url http://localhost:3000   # antes de subir, no

# 3. Levanta el stack.
docker compose -f docker-compose.onprem.yml up -d --build

# 4. Comprueba que está sano.
curl http://localhost:3000/health
# → {"status":"healthy","checks":{"database":"ok","redis":"ok"},...}

# 5. Crea el primer agente dentro del contenedor. La key se imprime una sola vez.
docker compose -f docker-compose.onprem.yml exec app \
  bun run scripts/admin.ts create-agent --slug asistente --name "Asistente"
```

Ese agente se autentica con `Authorization: Bearer <key>` y es el único agente
que existe hasta que registres más. No hay endpoint que borre agentes; la
caducidad (`expiresInMinutes`) es la vía prevista para que un agente efímero se
vaya.

### Si prefieres una imagen prefabricada

La imagen se publica etiquetada en cada release. Apunta el `image:` del compose
a tu registro (o al público) y usa `up -d` sin `--build`.

## Email

**El correo es obligatorio en on-premise.** Los humanos entran con un código
que llega por email; sin relay, nadie puede autenticarse, y el app se niega a
arrancar con `SMTP_HOST` local (`localhost`, `127.0.0.1`, `::1`).

- `SMTP_HOST`/`SMTP_PORT`: tu relay. `SMTP_SECURE=true` para SMTPS (puerto 465).
- `SMTP_FROM`: la dirección remitente. El app envía solo correo saliente; nada
  lee correo entrante, así que no necesitas DNS de recepción (MX).
- Pon un auto-responder en `REPLY_TO_ADDRESS` (o en `SMTP_FROM`) que avise de
  que las respuestas se contestan en el chat; sin él, una respuesta a una
  notificación desaparece en silencio.

## Reverse proxy y TLS

El contenedor expone HTTP en `:3000`. Pon delante un reverse proxy que termine
TLS (Caddy, nginx, tu balanceador). El proxy debe:

- reenviar `X-Forwarded-*` al app;
- enrutar `APP_URL` (ej. `https://agentdialog.empresa.com`) al puerto del app;
- enrutar `MINIO_PUBLIC_URL` (ej. `https://files.empresa.com`) al puerto 9000
  del contenedor de app.

`APP_URL` y `MINIO_PUBLIC_URL` deben ser `https://`: los enlaces de respuesta de
un solo uso y los códigos viajan por email, y apuntarlos a una URL en claro
regala la credencial en tránsito. El app no arranca en producción con `APP_URL`
http.

## Ficheros

Los ficheros se suben y descargan con URLs firmadas (presignadas). Con MinIO
embebido esas URLs apuntan a `127.0.0.1:9000` dentro del contenedor, que un
navegador no alcanza. `MINIO_PUBLIC_URL` reescribe el origen de esas URLs para
que apunten a tu proxy:

```env
MINIO_PUBLIC_URL=https://files.empresa.com
```

El proxy enruta `files.empresa.com` → puerto 9000 del contenedor de app. La
firma cubre ruta y query, no el host, así que la URL sigue siendo válida. Sin
`MINIO_PUBLIC_URL` no se reescribe nada.

Para usar tu propio almacenamiento S3 en vez del embebido: `MINIO_EMBEDDED=false`
y apunta `MINIO_ENDPOINT`, `MINIO_PORT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`,
`MINIO_USE_SSL` a tu store.

## Webhooks a servicios internos

Los agentes entregan webhooks. El guard por defecto rechaza destinos que
resuelven a loopback, rangos privados o metadata de cloud — lo correcto en un
servicio público. En on-premise el caso de uso principal es lo contrario: un
agente que notifica a un servicio interno. Para activarlo:

```env
DEPLOYMENT_MODE=onprem
WEBHOOK_ALLOW_PRIVATE_TARGETS=true
```

Sin `true`, el guard sigue cerrado aunque estés en on-premise. El guard de
formato (http/https, sin credenciales en la URL, destino que resuelve) se
mantiene siempre. En el SaaS (cloud) el valor sigue prohibido en producción.

## Backup y restauración

Tres volúmenes guardan todo: `pg-data`, `redis-data` (solo sesiones/caché,
recuperable) y `minio-data` (los ficheros).

```bash
docker compose -f docker-compose.onprem.yml exec postgres \
  pg_dump -U agentdialog agentdialog > agentdialog-backup.sql

# Volumen de ficheros (MinIO embebido):
docker run --rm -v agentdialog-onprem_minio-data:/data -v "$PWD":/backup alpine \
  tar czf /backup/minio-data.tar.gz -C /data .
```

Restaurar: levanta postgres vacío, `psql` el dump, y descomprime `minio-data`
en su volumen antes de arrancar `app`. Redis no se restaura: sus datos son
estado transitorio.

## Upgrade y rollback

- **Upgrade:** `docker compose -f docker-compose.onprem.yml pull` (o
  `up -d --build`) y `up -d`. El contenedor nuevo corre las migraciones en el
  arranque antes de servir.
- **Rollback:** las migraciones no se deshacen. Una versión anterior arranca
  contra el esquema nuevo; escribe migraciones compatibles hacia atrás o acepta
  que el rollback necesita una down-migration escrita a mano. Es la misma regla
  que el despliegue cloud.

## Secretos

`init-env` genera e inserta en `.env`:

- `SESSION_SECRET` — firma las sesiones humanas. Rotarlo desloguea a todos.
- `WEBHOOK_ENCRYPTION_KEY` — cifra los secretos de firma de webhooks. Llegar a
  perderlo pierde todos los secretos de webhook.
- `INBOUND_EMAIL_WEBHOOK_SECRET` — verifica el webhook de email entrante
  (dormido; exigido por el app en producción).
- `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY` — credenciales del MinIO embebido.
- `POSTGRES_PASSWORD` — la contraseña de postgres, alineada con `DATABASE_URL`.

El `.env` no se versiona; guárdalo aparte (vault de la empresa). El app valida
el entorno al arrancar y se niega a servir si falta algo o está malformado.

## Solución de problemas

- `/health` responde `status:"degraded"`: revisa `checks` — suele ser la base
  (`DATABASE_URL` mal) o Redis.
- El app no arranca: el `entrypoint` imprime qué variable falló la validación
  (zod). Lo más común tras `init-env` sin revisar son `SMTP_HOST` local o
  `APP_URL` http.
- Los webhooks no llegan a un servicio interno: comprueba
  `WEBHOOK_ALLOW_PRIVATE_TARGETS=true` y que el destino resuelva desde el
  contenedor de app.
- Los ficheros no se abren desde el navegador: revisa `MINIO_PUBLIC_URL` y el
  enrutado del proxy al puerto 9000.
- Ver logs: `docker compose -f docker-compose.onprem.yml logs -f app`.