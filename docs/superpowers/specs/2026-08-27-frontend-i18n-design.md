# La interfaz en tres idiomas — diseño

**Fecha:** 2026-08-27
**Estado:** aprobado, pendiente de plan de implementación
**Origen:** el usuario abrió agentdialog.io el 2026-08-27 y lo dio por roto —
«el i18n no funciona, sigo viendo en inglés». No era una regresión: la landing
nunca se tradujo. Lo desplegado en la v0.8.9 fueron las piezas primera y
segunda, y esta es la tercera. La cuarta se absorbe aquí, por la decisión de
alcance que abre el documento.

Este spec cubre **todo el frontend**: la landing, `/q/:token` y el chat con
sesión. Cierra el trabajo de i18n salvo lo que queda listado en «Lo que este
spec no cubre».

## El problema

Lo que entró en la v0.8.9 traduce **los correos**. `src/i18n/` lo consumen seis
ficheros, todos de servidor: los dos servicios de correo, la ruta del código de
acceso, dos validadores y el servidor MCP.

En `web/` no hay nada. Ni una referencia a i18n, ni a `Accept-Language`, ni a
`navigator.language`; `web/index.html:2` declara `lang="en"` a fuego. Son unas
350–400 cadenas visibles repartidas por la landing, `/q/:token`, el chat, el
login, las invitaciones, los ajustes y los agentes de confianza.

El resultado es el que motivó la queja, y es peor que no haber empezado: una
persona recibe hoy un correo en catalán, pulsa el enlace, y aterriza en una
página en inglés. El producto ya sabe qué lee y deja de usarlo justo al abrir el
navegador.

## Alcance: la tercera pieza se traga la cuarta

La descomposición original dejaba el chat con sesión para una cuarta pieza. Se
fusionan, por una razón que apareció al mirar el código: `/q/:token` no es una
página aislada. `src/pages/PublicQueryPage.tsx` pinta `QueryContextHeader` y
`AnswerSpaceInput`, y esos dos componentes los pinta también `QueryCard` dentro
del chat. Traducir la tercera pieza los traduce, y el chat queda mitad y mitad:
la pregunta y sus botones en español, la lista de conversaciones y la barra
lateral en inglés.

Se descartó la alternativa de que los compartidos sirvieran `en` dentro del chat
—coherente consigo misma, y la más barata— porque deja al producto hablándole
**a la misma persona** en dos idiomas: catalán en el correo y en el enlace,
inglés en cuanto entra en su cuenta. La coherencia que importa es la de la
persona, no la de la pantalla.

Lo que la fusión **no** arrastra es la decisión de backend que la cuarta pieza
tenía dentro. Ver la sección del selector.

## Lo que ya estaba decidido, y la única corrección

De la sesión del 2026-08-25, y no se reabre:

| Superficie | Quién está delante | El idioma sale de |
|---|---|---|
| Landing | cualquiera, sin sesión ni query | el navegador |
| Correo | el humano invitado, sin navegador | lo declarado en la query |
| `/q/:token` | ese humano, ya con navegador | el idioma de la query, con selector |
| Chat | humano con sesión | ~~su preferencia guardada~~ **el selector, guardado en el navegador** |
| `docs-site`, errores de API | integradores y agentes | inglés, no se traduce |

**La corrección es la fila del chat.** No hay `humans.preferences`, ni migración,
ni endpoint de escritura: el chat usa el mismo selector que las otras dos
superficies, guardado en `localStorage`. Con eso, este spec no toca el backend
en absoluto.

El precio se acepta con los ojos abiertos: **la elección es por dispositivo y no
viaja**. Quien elija catalán en el portátil lo elige otra vez en el móvil. A
cambio, no existe el estado en que el perfil dice una cosa, el dispositivo otra
y nadie sabe cuál gana — que es el estado en el que un usuario sí nota que algo
está mal. Guardar la preferencia en el perfil sigue siendo posible más adelante:
llega con su propia decisión de precedencia, no de tapadillo.

Y el defecto sigue siendo `en` cuando no hay nada.

## La precedencia

Tres fuentes pueden hablar a la vez, y solo en `/q/:token` coinciden las tres:
lo que la persona eligió a mano, lo que el agente declaró en la query, y lo que
dice el navegador.

**selector > declarado > navegador > `en`.**

- **El selector primero** porque es la única señal que alguien dio a propósito.
  Es además la red de seguridad de una declaración equivocada, y las
  declaraciones se van a equivocar.
- **Lo declarado por delante del navegador** porque es la decisión ya tomada el
  2026-08-25, y el caso que la motivó no ha cambiado: el ordenador compartido o
  de oficina en inglés, donde el navegador es del dispositivo y no de la
  persona. El agente nombró a alguien y dijo qué lee; eso vale más que el
  idioma en que arrancó Chrome.
- **El navegador al final**, que es donde la web lo pone cuando no sabe nada
  más.

En la landing no hay `declarado` —no hay agente ni query— así que la cadena se
queda en selector > navegador.

En el chat tampoco lo hay, y eso decide un caso que conviene escribir: **una
query declarada en catalán, abierta dentro de un chat en español, pinta su
envoltorio en español.** Hay una persona delante que ya dijo qué lee. La
declaración del agente existe para cuando no la hay.

## El dato ya viaja

`/q/:token` no necesita nada del servidor: `shapeHumanQuery` ya devuelve
`language` (`src/services/query.service.ts:610`), así que la respuesta de
`GET /public/queries/:token` lo lleva desde la v0.8.9. Lo que falta es que el
frontend lo declare y lo lea — la interfaz `PublicQuery` de `PublicQueryPage.tsx`
no lo menciona.

Es exactamente el mismo descuido que esa página ya tuvo con `changes`, y que
está anotado en su propio código: *«la ruta ya envía ambos; la página no
declaraba ninguno»*. Segunda vez que el campo existe en el JSON y la página lo
ignora, y merece la pena decirlo aquí para que a la tercera alguien sospeche del
patrón y no del backend.

## El mecanismo: react-i18next

**Decidido por el usuario**, sobre la alternativa que este documento recomendaba
(un catálogo tipado propio, espejo de `src/i18n/`, sin dependencias). Se registra
la discrepancia porque el motivo de la recomendación no desaparece con la
elección, y el diseño tiene que responder por él.

Lo que se gana: plurales y géneros por ICU, que a 400 cadenas en tres idiomas
dejan de ser anecdóticos; interpolación resuelta; y la forma que cualquiera que
llegue al repo ya conoce.

Lo que costaba, y cómo se paga:

1. **Las claves son cadenas que TypeScript no comprueba.** Se cierra declarando
   los recursos:

   ```ts
   declare module "i18next" {
     interface CustomTypeOptions {
       defaultNS: "common";
       resources: typeof en;
     }
   }
   ```

   Con eso, una clave inventada o un namespace equivocado no compilan.

2. **~20 kB en la landing.** Se paga con namespaces y carga perezosa: cuatro
   —`common`, `landing`, `query`, `chat`—, un fichero por idioma y namespace, y
   `import()` dinámico. La landing no baja el chat ni los dos idiomas que no
   pinta.

3. **Dos mecanismos conviviendo con el del backend.** Se acepta: son procesos
   distintos, con bundlers distintos, y `src/i18n/` seguirá siendo lo que
   traduce los correos.

Los catálogos **no se comparten** con el backend. Solapan cuatro o cinco cadenas
—`ABOUT`, `WHAT CHANGED`, `CONTEXT`, los nombres de `query_type`— y compartirlas
obligaría a que `web/` importara de `src/` cruzando dos `tsconfig` y dos
bundlers para ahorrar cinco líneas. Se duplican a propósito; que este párrafo
exista es lo que evita que dentro de un año alguien las encuentre y crea que una
de las dos está de sobra.

## El selector

Un componente y **dos puntos de montaje**, no tres, porque `BareLayout` —lo que
envuelve `/q/:token`— ya reutiliza el mismo `Footer` de la landing con
`minimal`:

- **`Footer`**: cubre landing y `/q/:token` de una vez. Va ahí y no en la
  `Navbar` porque la barra es la llamada a la acción y ya compite consigo misma.
  El selector **se queda también en modo `minimal`**: ese modo existe para quitar
  enlaces que invitan a abandonar la página —GitHub, Docs—, y un selector de
  idioma no lleva a nadie fuera; es lo contrario, es lo que permite entender lo
  que hay dentro. Y `/q/:token` es justo la superficie donde tiene que verse sin
  buscarlo, por ser la única donde el idioma lo eligió un tercero.
- **`Sidebar`**: el chat, con el resto de lo que es del usuario.

Guarda en `localStorage` y en ningún otro sitio. No escribe en
`humans.preferences` ni desde el chat, donde sí habría sesión — ver la
corrección de la tabla.

**La escritura va en `try/catch`.** En Safari con almacenamiento bloqueado
`setItem` lanza, y perder la elección de idioma no puede tumbar la página que
alguien abrió para responder una pregunta. Falla en silencio y esa visita se
queda con el idioma que ya estaba.

## El resolutor

Una función pura, sin React ni `i18next` dentro, que es lo que la hace
comprobable desde la suite de la raíz:

```ts
resolveLanguage({ stored, declared, navigator }): Language
```

Aplica la precedencia de arriba y normaliza como el backend: se cae la región
—`ca-ES` es catalán, `es-MX` es español— y lo que no está en el catálogo se
ignora en vez de reventar. `declared` solo llega con valor desde
`PublicQueryPage`.

El mismo resolutor estampa `<html lang>` al arrancar y en cada cambio de idioma,
que hoy es el `lang="en"` fijo de `web/index.html:2`.

## La segunda fuente de idioma: `formatters.ts`

`web/src/lib/formatters.ts` es un catálogo en inglés que nadie llamó catálogo:
`"just now"`, `` `${minutes}m ago` ``, `` `${days}d ago` ``. Y remata con un
`toLocaleDateString()` **sin locale**, que se lleva el del navegador.

Si no se toca, quien elija catalán en un navegador en inglés verá `3d ago` y
`8/27/2026` dentro de una página en catalán, y el fallo será nuestro. Los
cuatro se corrigen:

- `formatRelativeTime` pasa a `Intl.RelativeTimeFormat` con el locale activo.
  De paso desaparecen los plurales a mano, que es el argumento que ganó
  react-i18next aplicado en el sitio donde más se nota.
- `formatTime` y la fecha reciben el `localeTag` del idioma activo — `en-US`,
  `es-ES`, `ca-ES`, el mismo mapa que ya tiene `src/i18n/index.ts`.
- `formatFileSize` conserva `KB` y `MB`, que son unidades y no palabras, y pasa
  el número por `Intl.NumberFormat` para que la coma decimal caiga donde toca.

No son componentes y no pueden usar un hook, así que **reciben el idioma como
argumento explícito**. Cada llamada se actualiza.

## Lo que no se traduce

- **Lo que escribe el agente**: la pregunta, el `subject`, las opciones, sus
  consecuencias, el contexto. Es la línea que sostiene todo lo demás y no se
  moverá nunca.
- **El código de `CodeExamples.tsx`**: se traduce la prosa alrededor, no el
  `curl` ni el TypeScript.
- **`IntegrationGuide.tsx`**, que pinta `web/public/agentdialog-integration-guide.md`
  — un fichero **generado** desde `docs/api/README.md`. Traducirlo obligaría a
  generar tres, y ya está decidido que los integradores leen inglés.
- **`docs-site` y los mensajes de error de la API**, por lo mismo.
- **URLs por idioma (`/es`, `hreflang`, sitemap)**: la landing es una SPA de
  Vite sin prerender, así que un rastreador ve solo inglés. Cambiarlo exige
  rutas por idioma o prerenderizado, y es un proyecto aparte. Queda escrito para
  que no parezca un olvido.

## Pruebas, y el agujero de CI

Dos pruebas puras, y van en **`tests/unit/` de la raíz**, no en `web/`, por un
motivo concreto: es lo único que CI ejecuta. `web/src/lib/attribution.test.ts`
existe y no lo corre nadie — ponerlas ahí sería escribirlas para que no se
ejecuten.

1. **Precedencia**: la tabla entera de `resolveLanguage`. El selector gana a lo
   declarado, lo declarado gana al navegador, `ca-ES` cae a `ca`, un valor fuera
   de catálogo se ignora, y sin nada, `en`.
2. **Paridad de claves**: `es` y `ca` tienen exactamente las claves de `en` en
   los cuatro namespaces, recorriendo el objeto a fondo. Con 400 cadenas por
   idioma es lo único que impide que una traducción se quede a medias en
   silencio.

**Restricción al escribirlas**: importan el resolutor y los ficheros de catálogo
por ruta relativa, y **nunca el `index.ts` de `web/src/i18n/`**, que es donde
vive el `declare module "i18next"`. Arrastrarlo metería los tipos de i18next y
el JSX de `web/` dentro del `bunx tsc --noEmit` de la raíz.

**Un job `web` en CI**, que este trabajo abre y por tanto le toca cerrar:
`bun install` en `web/`, `tsc -b`, y nada más. Hoy un error de tipos en `web/`
lo descubre Cloudflare Pages **después** de fusionar —es Pages quien publica la
landing al entrar en `main`, sin esperar a una release— y este cambio toca del
orden de cuarenta ficheros de `web/` a la vez.

**Lo que no se hace**: meter Vitest y Testing Library en `web/` para comprobar
que un componente pinta la traducción. Serían dos dependencias y un runner nuevo
para cubrir lo que ya cubren el tipado de las claves y la paridad. Si hace falta
un runner en `web/`, que llegue con un caso que lo pida.

**Verificación a mano**, que aquí sí hace falta: `bun run dev` en `web/`, cambiar
el selector en las tres superficies, y para `/q/:token` el camino ya documentado
— MailHog en el 8025, `APP_URL` apuntando al 5173 y no al 3000, y una query de
riesgo `low` o `medium`, que son las únicas que acuñan enlace.

## Documentación que arrastra

- **`docs-site/content/docs/roadmap.mdx`**: la entrada «Emails in the language
  you declare» pasa a decir que la interfaz también. Es lo único que hoy le
  cuenta a un integrador que el producto habla tres idiomas.
- **La convención del repo cambia, y hay que escribirlo en `CLAUDE.md`.** Hoy
  dice «código, comentarios y mensajes de commit en inglés». El código sigue en
  inglés; lo que deja de estar en inglés es **el texto visible de `web/`**, que
  a partir de aquí no se escribe en el JSX sino en un catálogo. Una cadena
  nueva puesta a mano en un componente es, desde este cambio, un fallo.
- **No arrastra nada del SDK**: no hay cambio de superficie de API, así que la
  regla de los cuatro sitios no aplica.

## Lo que este spec no cubre

- **El euskera**, fuera del catálogo hasta que haya quien lo revise. Sigue igual
  que en la primera pieza.
- **`humans.preferences`** y que la elección viaje entre dispositivos.
- **La revisión del catalán por alguien que lo hable**, que sigue pendiente de
  la primera pieza para `src/i18n/ca.ts` y que aquí crece con los catálogos del
  frontend. Es bloqueante para decir en público que el producto está en catalán;
  no lo es para fusionar.
- **SEO multilingüe**, por lo dicho arriba.

## Decisiones, y por qué

| Decisión | Por qué | Qué se paga |
|---|---|---|
| Fusionar la tercera pieza con la cuarta | Dos componentes compartidos entre `/q/:token` y el chat; separarlas deja al producto hablándole a la misma persona en dos idiomas | El doble de superficie en un solo cambio |
| El chat usa el selector, no el perfil | Cero backend, y no existe el estado de perfil y dispositivo en desacuerdo | La elección no viaja entre dispositivos |
| selector > declarado > navegador | La elección explícita es la única señal deliberada; lo declarado vence al navegador porque el navegador es del dispositivo | Nada relevante |
| react-i18next | Decisión del usuario: ICU y una forma conocida | ~20 kB, y claves que hay que tipar a mano con `CustomTypeOptions` |
| Catálogos duplicados, no compartidos con el backend | Cruzar dos tsconfig y dos bundlers por cinco cadenas | Cinco cadenas en dos sitios |
| Las pruebas en `tests/unit/` de la raíz | Es lo único que CI ejecuta | El resolutor no puede importar el `index.ts` de i18n |
| Un job `web` en CI | Cuarenta ficheros tocados y hoy los tipos de `web/` los valida Cloudflare después de fusionar | ~15 líneas de YAML |
