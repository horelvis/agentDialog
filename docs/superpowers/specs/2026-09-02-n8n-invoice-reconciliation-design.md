# Demo n8n: conciliación de facturas con excepciones humanas

## Objetivo

Crear un caso de uso ejecutable y una pieza audiovisual que muestren cómo n8n
automatiza una tarea financiera repetitiva y recurre a AgentDialog únicamente
cuando hace falta criterio humano.

La demo procesará un lote ficticio de facturas y órdenes de compra. Las
coincidencias exactas se conciliarán mediante reglas deterministas; las
discrepancias se resumirán con un modelo Qwen remoto y se enviarán a un
responsable financiero mediante AgentDialog. El resultado cuantificará el
tiempo humano y el coste operativo evitados.

El paquete debe poder ejecutarse con una instancia local de n8n levantada con
`docker compose`. AgentDialog utilizará la API pública y el modelo estará
disponible en otra máquina de la red local.

## Audiencia y mensaje

La audiencia principal son desarrolladores y responsables de automatización
que conocen n8n, pero aún no han integrado decisiones humanas estructuradas en
sus workflows.

El mensaje central es:

> Automatiza lo repetitivo. Consulta las excepciones.

La demo no pretende simular un sistema contable completo. Su propósito es
mostrar un patrón reutilizable: resolver automáticamente los casos claros,
presentar evidencia suficiente en los casos dudosos y reanudar la
automatización con una respuesta tipada.

## Alcance

La primera versión incluye:

- n8n local mediante Docker Compose;
- datos ficticios montados desde el repositorio;
- un workflow JSON importable;
- registro autónomo del agente en AgentDialog;
- conexión con la API pública de AgentDialog;
- análisis consultivo mediante un servidor Qwen compatible con la API de
  OpenAI;
- conciliación de doce facturas;
- tratamiento independiente de errores por factura;
- un informe JSON con resultados y ahorro estimado;
- una guía ejecutable en español;
- una página equivalente en el sitio de documentación;
- un vídeo híbrido en español, su póster y subtítulos SRT.

Quedan fuera de alcance:

- OCR y lectura de PDF;
- Gmail, Google Drive, Slack, hojas de cálculo o software contable;
- pagos o movimientos de dinero reales;
- datos financieros reales;
- despliegue de n8n en producción;
- promesas comerciales o extrapolaciones anuales del ahorro;
- persistencia de la identidad del agente como solución de producción.

## Arquitectura

El ejemplo vivirá en un directorio nuevo e independiente:

```text
examples/n8n-invoice-reconciliation/
├── compose.yaml
├── .env.example
├── README.md
├── workflows/
│   └── invoice-reconciliation.json
├── fixtures/
│   ├── invoices.json
│   └── purchase-orders.json
├── output/
│   └── .gitkeep
└── tests/
```

El servicio de n8n se publicará solamente en `127.0.0.1:5678`, conservará su
estado en un volumen con nombre y montará `fixtures/` en modo lectura. El
directorio `output/` tendrá escritura para guardar el informe final sin
depender del historial de ejecuciones de n8n.

El workflow se iniciará desde un formulario local de n8n. El formulario pedirá
el correo del responsable financiero y lanzará el lote completo; no permitirá
cargar documentos ni requerirá editar nodos.

## Configuración del modelo

El modelo actual se sirve desde:

```text
http://192.168.100.58:8000/v1
```

El endpoint expone una API compatible con OpenAI mediante `llama.cpp`, no la
API nativa de Ollama. El identificador detectado es:

```text
/home/nexus/.samantha/models/Qwen3.8-27B-Heretic-GGUF/RVN-IQ4_XS-multilingual.gguf
```

La URL y el identificador se declararán como variables configurables. No se
fijarán dentro del workflow exportado, de modo que otro desarrollador pueda
apuntar el ejemplo a cualquier servidor compatible.

Las variables públicas del ejemplo serán:

- `AGENTDIALOG_BASE_URL`, con valor inicial
  `https://api.agentdialog.io/api/v1`;
- `LLM_BASE_URL`, con la URL del servidor compatible con OpenAI;
- `LLM_MODEL`, con el identificador servido por `llama.cpp`;
- `QUERY_TIMEOUT_MINUTES`, para la espera de la respuesta humana;
- `MANUAL_REVIEW_MINUTES`, con valor inicial `5`;
- `EXCEPTION_REVIEW_MINUTES`, con valor inicial `2`;
- `HOURLY_COST_EUR`, con valor inicial `30`.

El correo del responsable no será una variable persistente: llegará desde el
formulario de inicio de cada ejecución.

Qwen solo intervendrá sobre las excepciones. Recibirá los registros ficticios
relevantes y deberá devolver un objeto JSON con:

- resumen de la discrepancia;
- causa probable;
- recomendación no vinculante;
- nivel de confianza.

El workflow validará esa forma antes de utilizarla. El modelo nunca aprobará o
rechazará facturas y nunca será un requisito para continuar: si no responde o
su salida es inválida, AgentDialog recibirá la evidencia determinada por las
reglas.

## Datos de demostración

`purchase-orders.json` contendrá, como mínimo:

- identificador del pedido;
- proveedor;
- líneas y conceptos;
- moneda;
- subtotal, impuestos e importe autorizado.

`invoices.json` contendrá, como mínimo:

- identificador de factura;
- pedido asociado;
- proveedor;
- concepto;
- moneda;
- subtotal, impuestos y total;
- fecha de emisión y vencimiento.

El lote tendrá doce facturas:

- diez coincidencias exactas, conciliables sin intervención;
- una factura que añade 60 EUR de transporte no contemplado en el pedido;
- una factura cuyo proveedor y concepto parecen coincidir con el pedido, pero
  presentan una variación ambigua.

Todos los nombres, importes, referencias y fechas serán ficticios.

## Flujo del workflow

### 1. Inicio

El responsable abre el formulario de n8n, introduce su correo y envía la
ejecución. El workflow carga los dos archivos de datos y valida que cumplen el
esquema esperado.

### 2. Registro autónomo

Antes de crear consultas, el workflow llama sin autenticación a:

```text
POST https://api.agentdialog.io/api/v1/agent/register
```

Registrará un agente con:

- nombre visible `Conciliador de facturas n8n`;
- proveedor `custom`;
- modelo Qwen configurado;
- capacidades relacionadas con conciliación y consulta humana;
- un slug que incluya un identificador único de la ejecución.

La API key `mge_ag_...` devuelta se usará en memoria durante esa ejecución y no
aparecerá en el informe ni en archivos versionados. Como n8n puede conservar
las entradas y salidas de sus nodos, la composición desactivará la persistencia
de datos de ejecuciones exitosas, fallidas y manuales. El informe útil se
guardará explícitamente sin la clave.

La composición lo expresará con:

```text
EXECUTIONS_DATA_SAVE_ON_SUCCESS=none
EXECUTIONS_DATA_SAVE_ON_ERROR=none
EXECUTIONS_DATA_SAVE_ON_PROGRESS=false
EXECUTIONS_DATA_SAVE_MANUAL_EXECUTIONS=false
```

Cada ejecución demostrativa registra un agente nuevo. Esto respeta el registro
autónomo y elimina cualquier credencial previa, pero está sujeto al límite
público de diez registros por hora e IP. La guía lo advertirá y explicará que
una integración persistente debe registrar su agente una sola vez y almacenar
la clave resultante en un gestor de secretos o una credencial cifrada de n8n.

### 3. Conciliación determinista

n8n recorrerá las facturas y comprobará:

- existencia del pedido;
- coincidencia de proveedor y moneda;
- coincidencia de subtotal, impuestos y total;
- duplicados;
- coherencia de líneas y conceptos.

Las diez coincidencias exactas quedarán `auto_reconciled`. Cada registro
conservará las reglas que superó para que el resultado sea explicable.

### 4. Explicación de excepciones

Las dos excepciones se enviarán individualmente al endpoint compatible con
OpenAI. La salida estructurada de Qwen se combinará con la evidencia objetiva,
pero se distinguirá siempre entre hechos calculados y recomendación del
modelo.

### 5. Consulta humana

Por cada excepción, n8n creará una query REST de AgentDialog con:

- `query_type: "expert_query"`;
- `risk: "medium"`;
- `language: "es"`;
- un `subject.id` estable dentro de la ejecución;
- un `subject.body` con la factura, el pedido y la discrepancia;
- `confidence` procedente del análisis, cuando exista;
- metadata con el id de ejecución y el id de factura;
- un `answer_space` de tipo `choice` y selección única.

Las opciones serán:

1. `approve`: conciliar usando el importe de la factura;
2. `reject`: excluir la factura del lote;
3. `keep_pending`: dejarla sin conciliar hasta obtener más información.

Cada opción declarará su consecuencia explícita. El texto recordará que se
trata de una simulación y que ninguna rama genera un pago.

### 6. Espera y reanudación

n8n consultará `GET /agent/queries/{id}` cada quince segundos. Tratará los seis
estados del contrato:

- `pending` y `assigned`: seguir esperando;
- `answered`: aplicar la respuesta tipada;
- `needs_context`: dejar la factura pendiente y reflejar el motivo de contexto
  insuficiente;
- `expired`: dejar la factura pendiente;
- `cancelled`: dejar la factura pendiente y registrar la cancelación.

Un fallo de una factura no cancelará las demás. Al terminar, el workflow
agregará conciliadas automáticas, aprobadas por una persona, rechazadas,
pendientes y errores.

### 7. Informe

El informe final se guardará como JSON en `output/` e incluirá:

- recuento total;
- resultado por factura y evidencia relevante;
- recuentos por estado;
- número de intervenciones humanas;
- tiempo humano estimado;
- ahorro de tiempo y coste estimados;
- parámetros usados para el cálculo.

Nunca incluirá la API key del agente.

## Cálculo del ahorro

Los parámetros iniciales serán explícitos y configurables:

- revisión manual completa: 5 minutos por factura;
- revisión de una excepción ya explicada: 2 minutos;
- coste operativo: 30 EUR por hora.

Para el lote de doce facturas:

```text
tiempo_manual = 12 × 5 = 60 minutos
tiempo_con_demo = 2 × 2 = 4 minutos
tiempo_ahorrado = 60 - 4 = 56 minutos
ahorro_estimado = 56 / 60 × 30 = 28 EUR
```

Son métricas de la demo, no estadísticas de mercado. No se presentarán como
garantía ni se extrapolarán a un año.

## Manejo de errores

- Si falta un archivo o no cumple el esquema, el workflow terminará antes de
  registrar el agente y describirá el problema.
- Si el registro devuelve `409`, se generará un slug nuevo y se hará un único
  reintento.
- Si el registro alcanza el límite o falla, el workflow terminará sin procesar
  consultas.
- Si Qwen no responde, agota el tiempo o devuelve JSON inválido, la excepción
  continuará sin recomendación del modelo.
- Si AgentDialog devuelve `401` o `403` después del registro, el workflow
  detendrá las consultas y registrará el error de autenticación.
- Si AgentDialog devuelve `422`, el informe conservará `reason` y `remedy`.
- Si una query expira, se cancela o necesita contexto, nunca se convertirá en
  aprobación implícita.
- Si una factura falla, las demás continuarán y el informe conservará el error
  individual.

## Seguridad y privacidad

- n8n escuchará solo en loopback.
- Los fixtures serán ficticios y estarán montados en modo lectura.
- El workflow enviará a Qwen y AgentDialog solo los campos necesarios.
- Ninguna clave se guardará en Git, `.env.example`, el informe o el vídeo.
- La persistencia del historial de ejecución se desactivará para que la clave
  devuelta durante el registro no quede almacenada por n8n.
- El vídeo no mostrará claves, correos reales ni información de ejecución
  sensible.
- La guía diferenciará la simplificación de la demo del almacenamiento seguro
  que exige una integración duradera.

## Guía y documentación

`examples/n8n-invoice-reconciliation/README.md` será la guía operativa en
español e incluirá:

1. requisitos;
2. copia de `.env.example` a `.env`;
3. arranque mediante `docker compose`;
4. importación del workflow;
5. activación y apertura del formulario;
6. respuesta en AgentDialog;
7. lectura del informe;
8. parada y limpieza recuperable;
9. resolución de errores frecuentes;
10. advertencias sobre registro, límites y credenciales de producción.

El sitio público añadirá una página superior equivalente bajo
`docs-site/content/docs/`, enlazada desde su navegación. La página explicará el
patrón y enlazará el ejemplo reproducible sin duplicar todos los detalles de
operación.

## Vídeo

El vídeo será horizontal, 1920 × 1080, narrado en español y con una duración
objetivo de 80 a 90 segundos. Incluirá subtítulos SRT en español.

Será una pieza híbrida:

- capturas o grabaciones breves del workflow real de n8n;
- una consulta real en la web de AgentDialog;
- visualizaciones animadas para el lote, las excepciones y el ahorro;
- la identidad visual oscura y morada de los vídeos existentes.

La estructura narrativa será:

1. **Problema.** Doce facturas requieren una hora de revisión manual.
2. **Orquestación.** n8n local carga el lote y registra su agente.
3. **Automatización.** Diez facturas se concilian sin intervención.
4. **Excepciones.** Qwen explica dos discrepancias.
5. **Consulta.** AgentDialog presenta evidencia y opciones al responsable.
6. **Decisión.** La persona responde a una de las excepciones.
7. **Reanudación.** n8n aplica la decisión y termina el lote.
8. **Resultado.** Se muestran 56 minutos y 28 EUR estimados de ahorro.
9. **Cierre.** `Automatiza lo repetitivo. Consulta las excepciones.`

Las fuentes vivirán en un directorio nuevo bajo
`docs-site/video-src/n8n-invoice-reconciliation/`, sin renombrar ni modificar
los del vídeo existente. Los entregables serán:

- `docs-site/public/videos/n8n-invoice-reconciliation.mp4`;
- `docs-site/public/videos/n8n-invoice-reconciliation-poster.png`;
- `docs-site/public/videos/n8n-invoice-reconciliation.srt`.

## Verificación

La comprobación automatizada cubrirá:

- validez de `docker compose config`;
- validez y posibilidad de importar el workflow JSON;
- esquema y referencias cruzadas de los fixtures;
- clasificación esperada de diez coincidencias y dos excepciones;
- cálculo exacto de 56 minutos y 28 EUR;
- fallback ante timeout y JSON inválido de Qwen;
- tratamiento de respuestas simuladas de AgentDialog para los seis estados;
- ausencia de claves y datos reales en archivos versionados.

La comprobación manual de extremo a extremo cubrirá:

- acceso de n8n al modelo remoto;
- registro real en la API pública de AgentDialog;
- recepción de la consulta por el correo configurado;
- respuesta en la web de AgentDialog;
- reanudación del workflow y generación del informe.

La verificación audiovisual comprobará:

- que todas las escenas tienen audio y recursos visuales;
- que los números mostrados coinciden con el informe;
- que el MP4 contiene audio y vídeo, tiene resolución 1920 × 1080 y dura entre
  80 y 90 segundos;
- que los subtítulos cubren toda la narración con tiempos crecientes;
- que el póster y el primer fotograma representan el caso de uso;
- que no aparecen credenciales, correos ni datos personales reales.

## Criterios de aceptación

El caso se considerará terminado cuando un desarrollador pueda, siguiendo la
guía en español:

1. levantar n8n con `docker compose`;
2. importar y activar el workflow;
3. iniciar el lote desde el formulario;
4. observar diez conciliaciones automáticas y dos excepciones;
5. contestar al menos una consulta real en AgentDialog;
6. obtener un informe sin secretos con resultados y ahorro estimado;
7. entender, mediante la página y el vídeo, qué partes se automatizan y por qué
   las excepciones siguen bajo control humano.
