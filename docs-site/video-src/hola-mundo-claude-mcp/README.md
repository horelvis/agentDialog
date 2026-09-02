# Vídeo: Hola mundo con Claude Web y MCP

Las capturas de `screens/` proceden de un flujo real realizado el 27 de agosto
de 2026. Antes de guardarlas aquí se sustituyeron el email, el nombre, el avatar
y los identificadores por valores de demostración. No contienen credenciales,
cookies ni el token del enlace de respuesta.

## Regenerar

Desde la raíz del repositorio:

```bash
docs-site/video-src/hola-mundo-claude-mcp/render.sh
```

Requisitos de macOS: Python con Pillow, `afinfo`, Swift y AVFoundation.
El script genera las diapositivas, los subtítulos SRT, el póster y el MP4
final. Usa las diez locuciones MP3 de `voiceover/`, generadas con la voz
**David Martin — Clear, Calm and Elegant** y Eleven Multilingual v2.

La regeneración es local y no llama a ElevenLabs ni necesita una API key. Para
cambiar la voz, sustituye los MP3 manteniendo los nombres de las escenas.
