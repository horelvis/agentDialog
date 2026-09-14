# Modo on-premise con contenedores Docker — diseño

**Fecha:** 2026-09-14
**Estado:** aprobado, en diseño

AgentDialog debe poder desplegarse dentro de la infraestructura de una empresa:
sin depender de nuestros servicios, con los datos y secretos bajo su control, y
con un despliegue y un upgrade que no requieran llamarnos. Este diseño hace que
eso sea real, no una promesa de la landing.

## Objetivo

Que una empresa levante AgentDialog completo — API, chat humano, MCP, agentes,
almacenamiento de ficheros — en su propio entorno con **un solo contenedor de
producto** más sus dos almacenes de datos, sin contacto con internet salvo el
que la propia empresa decida.

Criterios de éxito:

1. `docker compose -f docker-compose.onprem.yml up -d` levanta el producto.
2. El operador crea el primer agente con un comando (CLI), no por la API pública.
3. Los webhooks pueden entregarse a servicios internos de la empresa.
4. El correo sale por el SMTP corporativo; sin relay configurado, no arranca.
5. El upgrade es «cambiar la etiqueta de imagen, `docker compose up -d`»; las
   migraciones corren solas en el arranque (ya es el patrón del entrypoint).

## Decisiones tomadas

| Decisión | Opción elegida | Por qué |
|---|---|---|
| Forma de entrega | **Imagen todo-en-uno** | El producto es UN contenedor: API + UI + MinIO embebido. Postgres y Redis quedan fuera, como contenedores del compose o gestionados por la empresa. Un solo artefacto que operar. |
| Bootstrap del operador | **CLI de operador** | `scripts/admin.ts` genera el `.env` validado y crea el primer agente imprimiendo la API key. Sin CLI, el primer agente pasa por el registro abierto rate-limited, que es feo y suena a inseguro. |
| Webhooks a red privada | **`DEPLOYMENT_MODE=onprem`** | El guard SSRF sigue duro en cloud; en on-prem se permite explícitamente. Entregar webhooks a servicios internos es el caso de uso principal de on-prem. |
| Email | **SMTP corporativo obligatorio** | Sin relay, nadie recibe códigos y ningún humano entra. Un despliegue que no puede loguearse no es un despliegue. |
| Escalado | **1 réplica, documentado** | El registry de WebSockets y las sesiones MCP viven en memoria. On-prem v1 es un solo proceso; escalar requiere Redis para eso y queda fuera. |
| Entregable | **Spec + plan en `docs/superpowers/`** | Igual que el resto de diseños del repo. |

## Arquitectura

```
┌────────────────────────────────────────────────────┐
│  Empresa (Docker)                                  │
│                                                    │
│  ┌─────────────────────────────┐                   │
│  │  agentdialog (1 contenedor) │                   │
│  │  ┌───────────────────────┐  │                   │
│  │  │  Bun/Hono API         │  │                   │
│  │  │  + MCP + WebSocket    │  │                   │
│  │  ├───────────────────────┤  │                   │
│  │  │  web/dist (UI)        │  │                   │
│  │  ├───────────────────────┤  │                   │
│  │  │  minio embebido       │──┼── 127.0.0.1:9000  │
│  │  │  (datos en /data)     │  │                   │
│  │  └───────────────────────┘  │                   │
│  └──────────────┬──────────────┘                   │
│                 │ :3000                            │
│  ┌──────────────▼──────────────┐                   │
│  │  reverse proxy de la        │  TLS, dominio     │
│  │  empresa (Caddy/nginx/…)    │                   │
│  └──────────────┬──────────────┘                   │
│                 │                                  │
│  ┌──────────────▼─────┐  ┌───────────▼──────────┐  │
│  │ postgres:16-alpine │  │ redis:7-alpine       │  │
│  │ (volumen)          │  │ (volumen)            │  │
│  └────────────────────┘  └──────────────────────┘  │
│                                                    │
│  agentes y humanos de la empresa ──► reverse proxy  │
└────────────────────────────────────────────────────┘
```

- El contenedor de producto expone **solo `:3000`**. Postgres y Redis no
  publican puerto al host; viven en la red interna del compose.
- MinIO corre embebido en `127.0.0.1:9000` dentro del contenedor, datos en el
  volumen `minio-data` montado en `/data`. La API le habla por la red interna.
- El operador puede sustituir Postgres y Redis por instancias gestionadas suyas:
  basta cambiar `DATABASE_URL` y `REDIS_URL`.

## Por qué Postgres y Redis NO van dentro del contenedor de producto

La opción «todo en uno» se tomó con ese matiz a propósito: los datos de
Postgres y Redis son estado y deben sobrevivir al contenedor. Embeberlos
significaría que el ciclo de vida del proceso principal (restart, upgrade,
crash) arrastre a la base de datos, y que un `docker compose up` para actualizar
el producto reinicie el estado con él. MinIO embebido no tiene ese problema: su
directorio `/data` es un volumen, y perder el proceso MinIO no pierde los
ficheros. Postgres y Redis siguen siendo contenedores separados, gestionados por
la misma cadena de mando.

## Cambios por componente

### 1. `Dockerfile` — build de UI + target `onprem`

Hoy el `Dockerfile` raíz solo construye el backend, así que `docker-compose.yml`
levanta un producto sin chat humano. Cambios:

- Añadir al `Dockerfile` la construcción de `web/` (lo que ya hace
  `Dockerfile.cloudrun`) en el target `production`, de modo que **tanto** el
  compose raíz como el on-prem sirvan la UI. La API ya sirve `./web/dist`
  (`src/app.ts:193`).
- Añadir un target `onprem` que herede `production` y copie el binario de MinIO:

  ```dockerfile
  FROM minio/minio:latest AS minio-source
  # ...
  FROM production AS onprem
  COPY --from=minio-source /usr/bin/minio /usr/local/bin/minio
  COPY docker-entrypoint-onprem.sh ./
  CMD ["./docker-entrypoint-onprem.sh"]
  ```

- `Dockerfile.cloudrun` se mantiene tal cual para el cloud; la unificación de
  ambos es trabajo de otro momento y no bloquea on-prem.

### 2. Entrypoint on-prem — MinIO embebido + migraciones

`docker-entrypoint-onprem.sh`, en este orden:

1. Si `MINIO_EMBEDDED=true` (por defecto en on-prem): arranca
   `minio server /data --address 127.0.0.1:9000 --console-address :9001` en
   segundo plano.
2. Espera a que MinIO responda (`mc ready local` o `curl` a `:9000`).
3. Ejecuta las migraciones (`bun run db:migrate`), igual que el entrypoint actual.
4. `exec bun run src/index.ts`.

El bucket se crea solo: `src/index.ts:14` ya lo hace en el arranque.

### 3. `src/env.ts` — `DEPLOYMENT_MODE` y reglas por modo

Añadir:

```ts
DEPLOYMENT_MODE: z.enum(["cloud", "onprem"]).default("cloud"),
```

Y en el `superRefine`:

- **Webhooks privados:** el rechazo actual (`WEBHOOK_ALLOW_PRIVATE_TARGETS=true`
  en producción, `src/env.ts:112`) pasa a aplicarse solo cuando
  `DEPLOYMENT_MODE === "cloud"`. En `onprem` se permite, explícitamente:
  es la vía para que un agente entregue webhooks a servicios internos.
- **Email obligatorio en on-prem:** en `onprem` + `NODE_ENV=production`,
  `SMTP_HOST` no puede ser `localhost` ni quedar en el valor por defecto
  (`127.0.0.1`, `::1` tampoco). Un despliegue on-prem sin relay corporativo
  arranca y nadie puede entrar.
- **`APP_URL` https en on-prem:** en `onprem` + producción, `APP_URL` debe ser
  `https://`. Los enlaces de respuesta de un solo uso (`/q/<token>`) y los
  códigos de acceso viajan por email; mandarlos a una URL en claro es
  regalar la credencial en tránsito.
- Sin cambios en lo ya exigido en producción para ambos modos:
  `SESSION_SECRET`, `INBOUND_EMAIL_WEBHOOK_SECRET` y `WEBHOOK_ENCRYPTION_KEY`.

### 4. `src/lib/webhook-url-guard.ts` — permitir red privada en on-prem

`privateTargetsAllowed` (línea 16) decide hoy con `NODE_ENV`. Pasa a:

```ts
return config.WEBHOOK_ALLOW_PRIVATE_TARGETS ?? config.NODE_ENV !== "production";
```

se mantiene para cloud, y en on-prem el operador activa
`WEBHOOK_ALLOW_PRIVATE_TARGETS=true`. La función ya no es consultada con la
regla «nunca en producción» por delante: es `env.ts` quien decide por modo.

Nota de seguridad que va a la doc: en on-prem no existe metadata de cloud que
proteger, así que «permitir privados» permite todo el rango privado y loopback.
El guard de resolución y las URL inválidas/credenciales embebidas se mantienen
siempre (`inspectWebhookTarget`).

### 5. `src/lib/storage.ts` — URLs presignadas alcanzables

Hallazgo del análisis: los ficheros se suben y descargan con URLs presignadas
(`presignedGetObject` / `presignedPutObject`). Con MinIO embebido esas URLs
apuntan a `127.0.0.1:9000`, que el navegador del humano no puede alcanzar.

`MINIO_PUBLIC_URL` ya existe en `src/env.ts:18` pero no se usa en ningún sitio.
Implementar en `src/lib/storage.ts`:

- Tras generar una URL presignada, si `MINIO_PUBLIC_URL` está definida,
  reescribir el origen de la URL (esquema + host + puerto) por el público. La
  firma es sobre la ruta y la query, no sobre el host, así que la URL sigue
  siendo válida.
- Función pura `rewritePresignedOrigin(url, publicUrl)` para poder testearla.
- El operador apunta `MINIO_PUBLIC_URL` a su reverse proxy (p. ej.
  `https://files.empresa.com`), que enruta a `:9000` del contenedor.

### 6. `scripts/admin.ts` — CLI de operador

Nuevo comando Bun que habla con la BD directamente (usa los servicios
existentes, no HTTP), pensado para ejecutarse dentro del contenedor o contra el
`.env` del despliegue:

| Subcomando | Qué hace |
|---|---|
| `admin init-env` | Escribe `.env` a partir de la plantilla `.env.onprem.example`, rellenando `SESSION_SECRET`, `WEBHOOK_ENCRYPTION_KEY` (32 bytes base64), `DEPLOYMENT_MODE=onprem`, credenciales de MinIO y SMTP (prompt). Valida el resultado con `envSchema`. |
| `admin create-agent --slug <s> [--name <n>] [--description <d>] [--provider <p>] [--model <m>]` | Registra un agente vía `registerAgent` (`src/services/agent.service.ts`) e imprime la API key **una sola vez**. Es el reemplazo del registro abierto para el operador. |
| `admin health` | Pide `/health` de la URL configurada y resumen de dependencias. |

`init-env` se puede ejecutar en el host (no necesita la BD): solo valida y
genera el `.env`.

### 7. `docker-compose.onprem.yml` — el despliegue

Nuevo fichero, la cara que ve la empresa:

- `app`: imagen `agentdialog:onprem` (o `ghcr.io/...:vX.Y.Z`), puerto
  `3000`, `env_file: .env`, volumen `minio-data:/data`, `restart: unless-stopped`,
  y **un solo réplica** (el compose no escala; WebSocket y MCP son de memoria).
- `postgres:16-alpine` y `redis:7-alpine` **sin puerto publicado al host**, con
  healthchecks y volúmenes propios.
- Sin servicio MinIO: va embebido en `app`.

No hay TLS en el contenedor: la empresa pone su reverse proxy delante (Caddy,
nginx, su propio load balancer). La doc explica el `X-Forwarded-*` y que
`APP_URL` debe ser la URL pública https.

### 8. Distribución y versiones

- La imagen on-prem se publica en el registro de contenedores de GitHub en cada
  release, etiquetada con `vX.Y.Z` y `onprem` (el pipeline de release ya
  construye; se añade el target). También puede construirse local:
  `docker build --target onprem -t agentdialog:onprem .`.
- `APP_VERSION` se inyecta igual que en cloud (build arg) y responde en `/health`.
- Migraciones: corren en el arranque del contenedor (entrypoint). El upgrade es
  `docker compose pull && docker compose up -d`. El rollback sigue la misma
  regla que cloud: migraciones no se deshacen, escribe migraciones compatibles
  hacia atrás.

### 9. Documentación

- `docs/onprem.md` — guía de despliegue (español): requisitos, `admin init-env`,
  `admin create-agent`, SMTP corporativo, reverse proxy/TLS, backup
  (`pg_dump` + volumen MinIO), upgrade y rollback, y la nota de «1 réplica, no
  escales el contenedor de app».
- `.env.onprem.example` — plantilla comentada con los valores on-prem.
- `docs-site/content/docs/roadmap.mdx` — el modo on-prem entra en «Available now»
  cuando se implemente.
- `AGENTS.md` — sección corta sobre los dos despliegues.

## Seguridad

- **Webhooks a red privada:** solo en `DEPLOYMENT_MODE=onprem` y con
  `WEBHOOK_ALLOW_PRIVATE_TARGETS=true` explícito. En cloud, el guard sigue
  cerrado por defecto y `env.ts` se niega a arrancar con él activo.
- **Credenciales por defecto fuera:** el compose raíz usa
  `agentdialog/agentdialog` y `minioadmin/minioadmin`; el on-prem genera
  secretos aleatorios con `admin init-env`. `SESSION_SECRET` y
  `WEBHOOK_ENCRYPTION_KEY` son obligatorios en producción en ambos modos.
- **Email obligatorio:** sin relay corporativo no arranca (ver §3), porque sin
  email nadie entra.
- **No hay secrets del operador en el repo:** los genera `admin init-env` y se
  guardan solo en el `.env` del despliegue.
- El guard de URL de webhook (resolución de DNS, protocolo, credenciales
  embebidas) sigue aplicando siempre; en on-prem solo cambia el rango permitido.

## Fuera de alcance (v1)

- **Multi-réplica:** WebSocket registry y MCP sessions en memoria → 1 proceso.
  Mover eso a Redis es un cambio arquitectónico que también afecta al cloud.
- **Helm/Kubernetes:** target a k8s propio, se puede construir encima del mismo
  contenedor más adelante.
- **Licencias y telemetría opt-out:** sin decisión de producto; no bloquea el
  despliegue.
- **Inbound email:** sigue dormido; on-prem es outbound-only por diseño.
- **Terraform/Infra-as-code del cloud:** listado como deuda en
  `docs/operations.md`, no depende de esto.

## Tests

- **Unitarios:**
  - `src/env.ts`: combinaciones `DEPLOYMENT_MODE` × `WEBHOOK_ALLOW_PRIVATE_TARGETS`
    × producción; SMTP localhost rechazado en on-prem; `APP_URL` http rechazada.
  - `src/lib/webhook-url-guard.ts`: `privateTargetsAllowed` con `DEPLOYMENT_MODE`.
  - `src/lib/storage.ts`: `rewritePresignedOrigin` (URL con query/firma,
    minio path-style, IPv6 en el origen).
- **Integración:** un smoke script `scripts/onprem-smoke.sh` que construye el
  target `onprem`, levanta `docker-compose.onprem.yml`, espera `/health` verde,
  crea un agente con `admin create-agent` y ejecuta un `createQuery` con esa key.
  Corre en CI con docker disponible, como un job aparte.
- `bunx tsc --noEmit` sigue en 0; la suite completa local (unit + integration)
  sigue verde.

## Impacto en cloud

Ninguno: `DEPLOYMENT_MODE` por defecto es `cloud` y las reglas de producción
actuales se conservan. Los cambios de `storage.ts` solo activan la reescritura
cuando `MINIO_PUBLIC_URL` está definida, que en cloud no lo está.