# LangGraph contract-renewal video

`scenes.json` is the approved source for the ten scenes.

## Fresh setup

Rendering requires macOS and the Xcode Command Line Tools. The Swift compiler
must be able to link the macOS AVFoundation, AppKit and CoreImage frameworks
used by `render_video.swift`.

Install the pinned Python dependency from the repository root:

```bash
python3 -m pip install -r docs-site/video-src/langgraph-contract-renewal/requirements.txt
```

The scripts use `python3` by default. If Pillow is installed for another Python
interpreter, select it explicitly:

```bash
PYTHON_BIN=/path/to/python3 docs-site/video-src/langgraph-contract-renewal/render.sh
```

## Generate narration

Generate narration once the ElevenLabs credentials have been configured:

```bash
export ELEVENLABS_API_KEY="..."
export ELEVENLABS_VOICE_ID="<David Martin voice ID>"
python3 docs-site/video-src/langgraph-contract-renewal/generate_voiceover.py
```

The approved voice is **David Martin — Clear, Calm and Elegant**. Set its ID only
through `ELEVENLABS_VOICE_ID`; the generator writes `voiceover/<scene-id>.mp3`
and leaves an existing MP3 unchanged, so ordinary video regeneration does not
contact ElevenLabs.

To regenerate one scene, use `--scene <scene-id>`; it leaves unrelated clips and
cached audio untouched. Add `--force` only when that selected MP3 must be
regenerated, because it consumes ElevenLabs credits again.

The expanded narration contains 234 words across ten scenes. The measured
ElevenLabs clips total 108.852246 seconds; adding the ten one-second holds
produces a 118.852246-second timeline, inside the approved 105–125-second
target. Keep the approved narration and cached audio unchanged unless the
whole timing budget is reviewed again.

## Render the finished video

Once all ten MP3 clips exist — including `intro-use-case.mp3` and
`intro-agentdialog.mp3` — render the final video without contacting ElevenLabs:

```bash
docs-site/video-src/langgraph-contract-renewal/render.sh
```

The script checks for Pillow, runs the video-source tests, rebuilds the slides,
subtitles and timeline, then writes the H.264 video and its public companion
assets to:

- `docs-site/public/videos/langgraph-contract-renewal.mp4`
- `docs-site/public/videos/langgraph-contract-renewal-poster.png`
- `docs-site/public/videos/langgraph-contract-renewal.srt`
