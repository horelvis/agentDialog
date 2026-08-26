# El idioma declarado y el correo — diseño

**Fecha:** 2026-08-26
**Estado:** aprobado, pendiente de plan de implementación
**Origen:** petición del usuario el 2026-08-25. El catálogo se redujo a español y
catalán el 2026-08-26: el euskera queda fuera. Las decisiones de fuente son de
aquel día; este documento cierra las que quedaban.

Este spec cubre **la primera y la segunda pieza** de las cuatro en que se
descompuso el trabajo: el idioma como dato, y los correos traducidos. Las
superficies con navegador —selector, landing y `/q/:token`— y el chat con sesión
van en documentos aparte.

## El problema

Un agente puede nombrar a una persona que no lee inglés, y hoy no tiene forma de
decirlo. No hay `language` en el esquema de queries, ni `Accept-Language`, ni
`locale`, ni librería de i18n: **no hay nada** en `src/` ni en `web/src/`.

El correo es la superficie que más duele, porque es la primera que esa persona
ve y llega sin navegador donde elegir nada. Son 193 líneas de HTML en inglés a
mano en `query-email.service.ts` y otras 36 en `email.service.ts`.

## Lo que ya estaba decidido

De la sesión del 2026-08-25, y no se reabre aquí:

| Superficie | Quién está delante | El idioma sale de |
|---|---|---|
| Landing | cualquiera, sin sesión ni query | el navegador |
| **Correo** | el humano invitado, sin navegador | **lo declarado en la query** |
| `/q/:token` | ese humano, ya con navegador | el idioma de la query, con selector |
| Chat | humano con sesión | su preferencia guardada |
| `docs-site`, errores de API | integradores y agentes | inglés, no se traduce |

Y el defecto es `en` cuando nadie declara nada.

## El catálogo es cerrado

`language` es un enum de tres valores —`en`, `es`, `ca`— y no una cadena BCP-47
libre.

Es el mismo argumento que sostiene `answer_space`: **el catálogo lo declara el
producto, no el agente**. Una cadena libre nos dejaría con `pt-BR`, `gl` y `zh`
en la base de datos, todos ellos correos en inglés, y sin forma de distinguir un
idioma que no soportamos de una errata. Con un enum, declarar algo que no
existe es un `422` inmediato con el catálogo dentro del mensaje, que es
accionable.

Ampliar el catálogo será añadir un valor y un fichero de mensajes. Ese es el
coste, y es el correcto: **soportar un idioma significa tenerlo escrito y
revisado por alguien que lo hable**. Por eso el euskera, que estaba en la
petición original, queda fuera: no se sostiene añadirlo sin quien lo valide.

## Lo que el idioma gobierna, y lo que no

**Gobierna el envoltorio**: el asunto del correo, las etiquetas (`ABOUT`,
`WHAT CHANGED`, `Answer this question`, `Expires`), el nombre del nivel de
riesgo, el nombre del tipo de query, el pie que avisa de que responder al correo
no llega a nadie, y el formato de la fecha de caducidad.

**No traduce lo que escribe el agente**: la pregunta, la etiqueta y el cuerpo del
sujeto, las opciones, sus consecuencias, el contexto y los cambios. Eso sigue
llegando tal cual lo mandó.

Declarar `ca` es, por tanto, dos cosas: una instrucción sobre cómo pintamos el
envoltorio, y **una pista al agente sobre en qué idioma escribir su contenido**.
Esto tiene que estar documentado con estas palabras en `docs/api/README.md` y en
la descripción de la herramienta MCP, o el integrador supondrá que traducimos por
él y lo descubrirá cuando una persona reciba un correo en catalán con una
pregunta en inglés dentro.

## El dato

**En el cable**: `language`, opcional, enum de tres valores, ausente significa
`en`. Aparece en tres cuerpos, que son los tres que un agente escribe sin nadie
delante:

- `POST /agent/queries`
- el `PATCH` de clarificación de una query
- `POST /agent/conversations/:id/invitations`

**En la base de datos**: columna `language` en `human_queries` **y en
`invitations`**, no nula, con defecto `'en'`. Migración `0010`, las dos tablas en
el mismo fichero.

El tipo es `varchar(8)` y no `varchar(2)` aunque los cuatro valores de hoy midan
dos: el día que el catálogo admita algo como `pt-BR` o `zh-Hans`, el enum lo
resuelve en una línea y la columna no obliga a otra migración. Quien guarda la
integridad aquí es el enum del validador, no el ancho de la columna.

> **Trampa conocida, y esta migración la pisa entera.** `bun run db:migrate` lee
> `migrations/meta/_journal.json`, no el sistema de ficheros: un `.sql` sin su
> entrada en el diario se salta en silencio, el comando imprime
> `Migrations complete` y sale con 0. La entrada —`idx`, `tag` igual al nombre
> del fichero, `when` posterior a la anterior— va **en el mismo commit** que el
> `.sql`.

**En las respuestas**: `shapeHumanQuery` incluye `language`, porque la tercera
pieza —la página de respuesta— lo necesita para decidir en qué idioma se pinta.

## Los tres correos, y de dónde saca cada uno su idioma

Salen tres correos del sistema y **cada uno tiene un contexto distinto**. Esto es
lo que más fácil se hace mal, y la regla que lo resuelve es una sola:

> Si hay un navegador delante, manda el navegador. Si no lo hay, manda lo que
> declaró el agente. Y si nadie dijo nada, `en`.

| Correo | Qué lo dispara | Idioma |
|---|---|---|
| `sendQueryEmail` | un agente crea una query | `query.language` |
| `sendVerificationCodeEmail` | **una persona pide entrar, desde el navegador** | `Accept-Language` de esa petición |
| `sendInvitationEmail` | un agente invita | `invitation.language`, declarado igual que en la query |

El caso del código es el que parecía difícil y no lo es. `POST /human/auth/send-code`
lo dispara alguien que **acaba de escribir su dirección en una pantalla**: hay un
navegador, y su `Accept-Language` dice en qué idioma lee esa persona ahora mismo.
Es mejor fuente que cualquier deducción nuestra, porque no hay que resolver qué
pasa cuando dos agentes usaron idiomas distintos con la misma persona: no hay que
resolverlo, se le pregunta al navegador.

La cabecera se negocia contra el catálogo: se recorre por orden de preferencia y
se toma el primer valor soportado, ignorando la región —`ca-ES` cuenta como
`ca`, y `es-MX` como `es`—, y `en` si ninguno encaja.

Esto cierra un agujero que de otro modo sería visible: en riesgo `high` o
`critical` no se acuña enlace de un clic, así que un catalanoparlante recibiría
la notificación en catalán y el código para entrar en inglés.

La invitación explícita —la de `POST /agent/conversations/:id/invitations`— la
dispara un agente sin nadie delante, así que sigue la otra mitad de la regla:
declara su `language` con el mismo enum y el mismo defecto. No se deduce del
historial de la persona.

## Cómo se guardan los mensajes

Catálogos tipados en `src/i18n/`, **sin librería**.

- `src/i18n/types.ts` — el tipo `Language` y una interfaz `Messages` con todas
  las claves.
- `src/i18n/en.ts`, `es.ts`, `ca.ts` — cada uno exporta un `Messages`.
- `src/i18n/index.ts` — `messagesFor(language: Language): Messages`.

La completitud la garantiza el tipo: un idioma al que le falte una clave **no
compila**. Eso es lo que hace mantenible tener varios idiomas sin un runtime que
resuelva claves y falle en producción con la clave cruda pintada en pantalla.

Nada de interpolación con plantillas de terceros: donde haga falta un valor, la
clave es una función —`expiresAt: (fecha: string) => string`— y el tipo obliga a
pasarlo.

**Las fechas también se traducen.** El correo imprime hoy la caducidad con
`toLocaleString("en-US", …)`; pasa a usar la etiqueta del idioma. Una fecha en
formato estadounidense dentro de un correo en catalán es la clase de detalle que
delata que la traducción es cosmética.

## Sobre la calidad de las traducciones

Redactar el castellano y el catalán es asumible aquí, y el catalán conviene que
lo lea alguien que lo hable antes de publicarlo — no por corrección gramatical,
sino porque este producto le pide a una persona que decida algo con
consecuencias, y un envoltorio que suena a traducción automática resta autoridad
a la pregunta que envuelve.

**El euskera se descarta por esa misma regla**, no por dificultad técnica: sin
alguien que lo valide, añadirlo sería publicar cuatro pantallas que nadie ha
leído.

## Lo que este spec no cubre

- **La landing, `/q/:token` y el selector.** Tercera pieza.
- **El chat con sesión y `humans.preferences`.** Cuarta.
- **Traducir el contenido del agente.** No se hará: no somos un traductor
  automático dentro de una decisión con consecuencias.
- **`docs-site` y los mensajes de error de la API.** Se quedan en inglés por
  decisión previa: su lector es un integrador o un agente.
- **Negociar `Accept-Language` en las rutas de agente.** Un agente no es un
  navegador y no tiene idioma; ahí manda siempre lo declarado. La cabecera se lee
  en una sola ruta, `POST /human/auth/send-code`, por la razón de arriba.

## Documentación que arrastra

Por la regla del repositorio, tocar el SDK obliga a actualizar en el mismo
cambio: `docs/api/README.md`, `docs-site`, el README del SDK y los ejemplos de la
landing, más la regeneración de `web/public/agentdialog-integration-guide.md` al
construir `web/`. La descripción de la herramienta MCP `human_query` es
documentación de producto para un agente y cuenta como uno de esos sitios.

## Pruebas

- **Unitarias**: que los cuatro catálogos exponen las mismas claves (lo garantiza
  el tipo, pero un test lo hace visible al revisar); que `messagesFor` cae a `en`
  ante un valor desconocido leído de una fila antigua; que la fecha de caducidad
  se formatea con la etiqueta correcta.
- **De integración**: crear una query con `language: "eu"` y comprobar que el
  correo capturado trae el asunto en euskera y **la pregunta del agente intacta**;
  crear una sin `language` y comprobar que sale en inglés; y que
  `languageForEmail` devuelve el idioma de la query más reciente. Cuidado con el
  presupuesto de diez altas por hora: un agente por fichero, en `beforeAll`.

## Decisiones, y por qué

| Decisión | Por qué |
|---|---|
| Enum cerrado, no BCP-47 | El catálogo es del producto, igual que en `answer_space`; una cadena libre acepta idiomas que no existen aquí |
| Tres idiomas y no cuatro | Soportar un idioma es tenerlo escrito **y revisado**; el euskera sale del catálogo hasta que haya quien lo lea |
| Columna propia, no dentro de un JSON | La tercera pieza y cualquier informe futuro la van a filtrar |
| `varchar(8)` para códigos de dos letras | Ampliar el catálogo a `pt-BR` no debería costar una migración; la integridad la da el enum |
| Catálogos tipados sin librería | Cuatro idiomas y un servidor; la completitud la da el compilador en vez de un fallo en producción |
| El envoltorio sí, el contenido no | Traducir la pregunta de un agente sería inventar en una decisión con consecuencias |
| El código lo decide el navegador de quien lo pide | Esa persona está delante de una pantalla cuando lo pide; preguntarle al navegador es más fiable que deducirlo de su historial, y evita decidir qué pasa cuando dos agentes usaron idiomas distintos con ella |
| La invitación la declara el agente | La dispara un agente sin nadie delante, que es la otra mitad de la misma regla |
| Defecto `en` | Ya decidido el 2026-08-25 |
