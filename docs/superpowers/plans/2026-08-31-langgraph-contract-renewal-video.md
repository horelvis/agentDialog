# LangGraph Contract Renewal Video Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a finished 1920 × 1080 Spanish video showing LangGraph delegating a contract-renewal decision to AgentDialog and continuing through the `renegotiate` branch.

**Architecture:** A scene manifest is the single source of truth for narration and visual content. Python generates ElevenLabs MP3 files, branded slides, subtitles, a poster, and a timeline; a small AVFoundation renderer turns those assets into the final MP4. Unit tests validate the story, API payloads, generated assets, and timing before the expensive audio and video steps run.

**Tech Stack:** Python 3.12, Pillow, Python `unittest`, ElevenLabs HTTP API, Swift, AppKit, AVFoundation, CoreImage, macOS `afinfo`

**Spec:** `docs/superpowers/specs/2026-08-31-langgraph-contract-renewal-video-design.md`

## Global Constraints

- Deliver a horizontal 1920 × 1080 MP4 with an 80–90 second target duration.
- Narration is Spanish and uses ElevenLabs voice **David Martin — Clear, Calm and Elegant** with model `eleven_multilingual_v2`.
- Read `ELEVENLABS_API_KEY` and `ELEVENLABS_VOICE_ID` from the environment; never persist or print either value.
- Use `mp3_44100_128` output and one MP3 per scene.
- Do not overwrite existing MP3 files unless the operator passes `--force`.
- Keep the REST request fields in `snake_case`, use `https://api.agentdialog.io/api/v1`, and show only the placeholder key `mge_ag_...`.
- Use fictional contract data: CloudDesk, 12-month renewal, 8% increase, 10 days remaining, and a 5% human-review threshold.
- The human response is `{"kind": "choice", "option_ids": ["renegotiate"]}`.
- Do not modify or rename files under `docs-site/video-src/hola-mundo-claude-mcp/`.
- Stage and commit only the files named by each task because the worktree already contains unrelated changes.

---

## File Map

- `docs-site/video-src/langgraph-contract-renewal/scenes.json`: ordered scene content, narration, captions, and visual type.
- `docs-site/video-src/langgraph-contract-renewal/generate_voiceover.py`: authenticated ElevenLabs synthesis with safe overwrite behavior.
- `docs-site/video-src/langgraph-contract-renewal/render_slides.py`: branded 1080p slide, timeline, SRT, and poster generation.
- `docs-site/video-src/langgraph-contract-renewal/render_video.swift`: silent H.264 rendering and narration-track composition.
- `docs-site/video-src/langgraph-contract-renewal/render.sh`: reproducible local build entry point.
- `docs-site/video-src/langgraph-contract-renewal/test_video_source.py`: manifest, ElevenLabs client, timeline, subtitle, and asset tests.
- `docs-site/video-src/langgraph-contract-renewal/README.md`: credentials, generation, regeneration, and output instructions.
- `docs-site/public/videos/langgraph-contract-renewal.mp4`: final video.
- `docs-site/public/videos/langgraph-contract-renewal-poster.png`: poster.
- `docs-site/public/videos/langgraph-contract-renewal.srt`: Spanish subtitles.

### Task 1: Lock the Story and Scene Contract

**Files:**
- Create: `docs-site/video-src/langgraph-contract-renewal/scenes.json`
- Create: `docs-site/video-src/langgraph-contract-renewal/test_video_source.py`

**Interfaces:**
- Produces: a JSON array of exactly eight scene objects with string fields `id`, `eyebrow`, `title`, `caption`, `narration`, and `visual`.
- Consumed by: `generate_voiceover.py` and `render_slides.py`.

- [ ] **Step 1: Write the failing manifest tests**

Create `test_video_source.py` with:

```python
import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent


class SceneManifestTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.scenes = json.loads((ROOT / "scenes.json").read_text())

    def test_has_eight_unique_ordered_scenes(self) -> None:
        self.assertEqual(len(self.scenes), 8)
        ids = [scene["id"] for scene in self.scenes]
        self.assertEqual(len(ids), len(set(ids)))
        self.assertEqual(ids[0], "00-contract")
        self.assertEqual(ids[-1], "07-outro")

    def test_each_scene_has_the_render_contract(self) -> None:
        required = {"id", "eyebrow", "title", "caption", "narration", "visual"}
        for scene in self.scenes:
            self.assertEqual(set(scene), required)
            self.assertTrue(all(scene[field].strip() for field in required))

    def test_story_contains_the_approved_facts(self) -> None:
        story = json.dumps(self.scenes, ensure_ascii=False)
        for fact in ("CloudDesk", "8 %", "5 %", "diez días", "Renegociar"):
            self.assertIn(fact, story)
        self.assertIn("renegotiate", story)
        self.assertIn("Automatiza las reglas. Consulta las decisiones.", story)

    def test_rest_copy_uses_the_real_domain_and_snake_case(self) -> None:
        story = json.dumps(self.scenes, ensure_ascii=False)
        self.assertIn("https://api.agentdialog.io/api/v1", story)
        self.assertIn("option_ids", story)
        self.assertNotIn("agentdialog.com", story)
        self.assertNotIn("agentdialog.dev", story)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run the tests and confirm the manifest is missing**

Run:

```bash
python3 -m unittest docs-site/video-src/langgraph-contract-renewal/test_video_source.py -v
```

Expected: ERROR opening `scenes.json`.

- [ ] **Step 3: Write the eight-scene manifest**

Create `scenes.json` with these scene decisions:

1. `00-contract`, visual `contract`: automatic renewal in ten days.
2. `01-extract`, visual `extraction`: 12 months, 8%, ten days.
3. `02-policy`, visual `threshold`: compare policy 5% against detected 8%.
4. `03-query`, visual `code`: compact AgentDialog REST payload with `subject.body`, three choice options, and `target_human_email`.
5. `04-human`, visual `decision`: AgentDialog card with Approve, Renegotiate, Cancel; Renegotiate selected.
6. `05-answer`, visual `json`: `{"kind":"choice","option_ids":["renegotiate"]}`.
7. `06-continue`, visual `graph`: highlight the renegotiation branch, draft capped at 5%, and deadline task.
8. `07-outro`, visual `outro`: “Automatiza las reglas. Consulta las decisiones.” and `docs.agentdialog.io`.

Use short Spanish narration totaling 175–205 spoken words. Spell out percentages and numbers naturally in narration while keeping numeric forms in on-screen captions.

- [ ] **Step 4: Run the manifest tests**

Run:

```bash
python3 -m unittest docs-site/video-src/langgraph-contract-renewal/test_video_source.py -v
```

Expected: all four tests PASS.

- [ ] **Step 5: Commit the story contract**

```bash
git add docs-site/video-src/langgraph-contract-renewal/scenes.json \
  docs-site/video-src/langgraph-contract-renewal/test_video_source.py
git commit -m "Add contract renewal video story"
```

### Task 2: Generate Narration with ElevenLabs

**Files:**
- Create: `docs-site/video-src/langgraph-contract-renewal/generate_voiceover.py`
- Modify: `docs-site/video-src/langgraph-contract-renewal/test_video_source.py`
- Create: `docs-site/video-src/langgraph-contract-renewal/README.md`

**Interfaces:**
- Consumes: `scenes.json`, `ELEVENLABS_API_KEY`, and `ELEVENLABS_VOICE_ID`.
- Produces: `voiceover/<scene-id>.mp3` for every scene.
- Produces functions: `synthesis_request(voice_id: str, text: str) -> urllib.request.Request` and `generate(force: bool = False) -> list[Path]`.

- [ ] **Step 1: Add failing client tests**

Add these imports, the local-module loader, and the complete tests:

```python
import importlib.util
import os
import tempfile
from unittest.mock import patch


def load_local_module(name: str, filename: str):
    spec = importlib.util.spec_from_file_location(name, ROOT / filename)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


voiceover = load_local_module("contract_voiceover", "generate_voiceover.py")


class VoiceoverTests(unittest.TestCase):
    @patch.dict(
        os.environ,
        {
            "ELEVENLABS_API_KEY": "test-key",
            "ELEVENLABS_VOICE_ID": "voice-123",
        },
        clear=True,
    )
    def test_synthesis_request_uses_approved_contract(self) -> None:
        request = voiceover.synthesis_request("voice-123", "Hola")
        self.assertEqual(
            request.full_url,
            "https://api.elevenlabs.io/v1/text-to-speech/"
            "voice-123?output_format=mp3_44100_128",
        )
        self.assertEqual(request.get_header("Content-type"), "application/json")
        payload = json.loads(request.data)
        self.assertEqual(payload["text"], "Hola")
        self.assertEqual(payload["model_id"], "eleven_multilingual_v2")
        self.assertNotIn("language_code", payload)

    @patch.dict(
        os.environ,
        {
            "ELEVENLABS_API_KEY": "test-key",
            "ELEVENLABS_VOICE_ID": "voice-123",
        },
        clear=True,
    )
    def test_generation_skips_existing_audio_without_force(self) -> None:
        scenes = [
            {"id": "00-contract", "narration": "Primera escena."},
            {"id": "01-extract", "narration": "Segunda escena."},
        ]
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp) / "voiceover"
            output.mkdir()
            existing = output / "00-contract.mp3"
            existing.write_bytes(b"existing")
            response = unittest.mock.MagicMock()
            response.__enter__.return_value.read.return_value = b"ID3new"
            with (
                patch.object(voiceover, "VOICEOVER", output),
                patch.object(voiceover, "load_scenes", return_value=scenes),
                patch.object(
                    voiceover.urllib.request,
                    "urlopen",
                    return_value=response,
                ) as urlopen,
            ):
                written = voiceover.generate(force=False)

            self.assertEqual(existing.read_bytes(), b"existing")
            self.assertEqual((output / "01-extract.mp3").read_bytes(), b"ID3new")
            self.assertEqual(written, [output / "01-extract.mp3"])
            urlopen.assert_called_once()

    @patch.dict(os.environ, {}, clear=True)
    def test_generation_requires_api_key_without_exposing_values(self) -> None:
        with self.assertRaisesRegex(RuntimeError, "^Missing ELEVENLABS_API_KEY$"):
            voiceover.generate()

    @patch.dict(
        os.environ,
        {"ELEVENLABS_API_KEY": "secret-that-must-not-appear"},
        clear=True,
    )
    def test_generation_requires_voice_id_without_exposing_key(self) -> None:
        with self.assertRaisesRegex(RuntimeError, "^Missing ELEVENLABS_VOICE_ID$"):
            voiceover.generate()
```

- [ ] **Step 2: Run the new tests and confirm the module is missing**

Run:

```bash
python3 -m unittest docs-site/video-src/langgraph-contract-renewal/test_video_source.py -v
```

Expected: ERROR loading `generate_voiceover.py`.

- [ ] **Step 3: Implement the minimal ElevenLabs generator**

Implement with Python standard-library `urllib.request`:

```python
API_ROOT = "https://api.elevenlabs.io/v1"
MODEL_ID = "eleven_multilingual_v2"
OUTPUT_FORMAT = "mp3_44100_128"

def synthesis_request(voice_id: str, text: str) -> urllib.request.Request:
    payload = json.dumps({"text": text, "model_id": MODEL_ID}).encode()
    return urllib.request.Request(
        f"{API_ROOT}/text-to-speech/{quote(voice_id)}"
        f"?output_format={OUTPUT_FORMAT}",
        data=payload,
        headers={
            "Content-Type": "application/json",
            "xi-api-key": os.environ["ELEVENLABS_API_KEY"],
        },
        method="POST",
    )
```

`generate()` must create `voiceover/`, skip existing MP3s unless `force=True`, call `urlopen(request, timeout=90)`, write each response to a sibling `.tmp` file, and atomically replace the final MP3 only after a successful response. The CLI accepts only `--force`.

- [ ] **Step 4: Run the tests**

Run:

```bash
python3 -m unittest docs-site/video-src/langgraph-contract-renewal/test_video_source.py -v
```

Expected: all manifest and voiceover tests PASS without network access.

- [ ] **Step 5: Document safe audio generation**

In `README.md`, document:

```bash
export ELEVENLABS_API_KEY="..."
export ELEVENLABS_VOICE_ID="<David Martin voice ID>"
python3 docs-site/video-src/langgraph-contract-renewal/generate_voiceover.py
```

Explain that `--force` consumes credits again, the voice ID must refer to David Martin, `--scene <scene-id>` limits regeneration to one clip, and ordinary video regeneration uses existing MP3s without contacting ElevenLabs.

- [ ] **Step 6: Generate and inspect the eight MP3 files**

First check for the variables without printing them:

```bash
test -n "${ELEVENLABS_API_KEY:-}" && test -n "${ELEVENLABS_VOICE_ID:-}"
```

Then run:

```bash
python3 docs-site/video-src/langgraph-contract-renewal/generate_voiceover.py
afinfo docs-site/video-src/langgraph-contract-renewal/voiceover/00-contract.mp3
```

Expected: eight non-empty MP3 files; `afinfo` reports an MPEG audio track with positive duration. Listen to all clips before continuing and regenerate only a specific rejected clip through a temporary one-scene manifest or a targeted CLI option added with its own test.

- [ ] **Step 7: Commit the narration tooling and approved audio**

```bash
git add docs-site/video-src/langgraph-contract-renewal/generate_voiceover.py \
  docs-site/video-src/langgraph-contract-renewal/test_video_source.py \
  docs-site/video-src/langgraph-contract-renewal/README.md \
  docs-site/video-src/langgraph-contract-renewal/voiceover
git commit -m "Generate ElevenLabs narration for contract video"
```

### Task 3: Generate Branded Slides, Timeline, Poster, and Subtitles

**Files:**
- Create: `docs-site/video-src/langgraph-contract-renewal/render_slides.py`
- Modify: `docs-site/video-src/langgraph-contract-renewal/test_video_source.py`

**Interfaces:**
- Consumes: the scene manifest and eight MP3 files.
- Produces: `generated/slides/*.png`, `generated/timeline.json`, `generated/langgraph-contract-renewal.srt`, and `poster.png`.
- Produces functions: `draw_scene(scene: dict, output: Path) -> None`, `audio_duration(path: Path) -> float`, `srt_time(seconds: float) -> str`, and `build() -> float`.

- [ ] **Step 1: Add failing rendering tests**

Add `from PIL import Image`, load `render_slides.py` through `load_local_module`, and add:

```python
render_slides = load_local_module("contract_slides", "render_slides.py")


class RenderTests(unittest.TestCase):
    def test_srt_time_formats_milliseconds(self) -> None:
        self.assertEqual(render_slides.srt_time(65.432), "00:01:05,432")

    def test_every_visual_type_has_a_renderer(self) -> None:
        expected = {
            "contract", "extraction", "threshold", "code",
            "decision", "json", "graph", "outro",
        }
        self.assertEqual(set(render_slides.VISUAL_RENDERERS), expected)

    def test_generated_slides_are_full_hd(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp)
            for scene in SceneManifestTests.scenes:
                slide = output / f"{scene['id']}.png"
                render_slides.draw_scene(scene, slide)
                with Image.open(slide) as image:
                    self.assertEqual(image.size, (1920, 1080))

    def test_timeline_matches_audio_and_target_duration(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            generated = root / "generated"
            slides = generated / "slides"
            audio = root / "voiceover"
            audio.mkdir()
            for scene in SceneManifestTests.scenes:
                (audio / f"{scene['id']}.mp3").write_bytes(b"ID3test")

            with (
                patch.object(render_slides, "GENERATED", generated),
                patch.object(render_slides, "SLIDES", slides),
                patch.object(render_slides, "VOICEOVER", audio),
                patch.object(render_slides, "POSTER", root / "poster.png"),
                patch.object(render_slides, "audio_duration", return_value=9.5),
            ):
                total = render_slides.build()

            self.assertEqual(total, 84.0)
            timeline = json.loads((generated / "timeline.json").read_text())
            self.assertEqual(len(timeline), 8)
            self.assertTrue(all(item["audioOffset"] == 0.45 for item in timeline))
            self.assertTrue(all(item["duration"] == 10.5 for item in timeline))
            srt = (generated / "langgraph-contract-renewal.srt").read_text()
            self.assertEqual(srt.count("-->"), 8)
            self.assertIn(SceneManifestTests.scenes[-1]["narration"], srt)
```

- [ ] **Step 2: Run the tests and confirm the renderer is missing**

Run:

```bash
python3 -m unittest docs-site/video-src/langgraph-contract-renewal/test_video_source.py -v
```

Expected: ERROR loading `render_slides.py`.

- [ ] **Step 3: Implement the shared visual system**

Reuse the established colors and typography from the first video without modifying it:

```python
WIDTH, HEIGHT = 1920, 1080
BRAND = (126, 66, 196)
BRAND_LIGHT = (184, 128, 245)
SURFACE = (15, 15, 19)
SUCCESS = (34, 197, 94)
WARNING = (234, 179, 8)
```

Implement one focused renderer per `visual` value. The contract scene draws a highlighted renewal clause; extraction draws three labeled fact cards; threshold draws two accessible labeled bars; code shows only the REST payload fields needed for the decision; decision draws three buttons and marks “Renegociar” with both a check icon and color; JSON shows the exact approved response; graph shows three labeled branches and emphasizes `renegotiate`; outro shows the message and docs domain.

- [ ] **Step 4: Implement timeline and subtitle generation**

For each scene:

```python
spoken = audio_duration(audio)
duration = spoken + 1.0
timeline.append({
    "slide": str(slide),
    "audio": str(audio),
    "duration": duration,
    "audioOffset": 0.45,
})
```

Use the narration text—not the shorter caption—as SRT content. Save the first scene as `poster.png`. Fail with a descriptive exception if any MP3 is absent or total duration is outside 80–90 seconds; adjust narration text and regenerate affected audio rather than silently stretching audio.

- [ ] **Step 5: Run tests and build the still assets**

```bash
python3 -m unittest docs-site/video-src/langgraph-contract-renewal/test_video_source.py -v
python3 docs-site/video-src/langgraph-contract-renewal/render_slides.py
```

Expected: tests PASS; eight 1920 × 1080 slides, timeline, SRT, and poster are generated; reported duration is 80–90 seconds.

- [ ] **Step 6: Inspect representative slides**

Open and inspect `00-contract.png`, `03-query.png`, `04-human.png`, and `06-continue.png`. Confirm safe margins, readable code, no clipping, correct accents, and that selection state is understandable without color.

- [ ] **Step 7: Commit the visual source**

```bash
git add docs-site/video-src/langgraph-contract-renewal/render_slides.py \
  docs-site/video-src/langgraph-contract-renewal/test_video_source.py \
  docs-site/video-src/langgraph-contract-renewal/poster.png
git commit -m "Render contract renewal video scenes"
```

Do not commit `generated/render_video` or intermediate slides; add those paths to the new directory’s `.gitignore`.

### Task 4: Render and Verify the Finished MP4

**Files:**
- Create: `docs-site/video-src/langgraph-contract-renewal/render_video.swift`
- Create: `docs-site/video-src/langgraph-contract-renewal/render.sh`
- Create: `docs-site/video-src/langgraph-contract-renewal/.gitignore`
- Modify: `docs-site/video-src/langgraph-contract-renewal/README.md`
- Create: `docs-site/public/videos/langgraph-contract-renewal.mp4`
- Create: `docs-site/public/videos/langgraph-contract-renewal-poster.png`
- Create: `docs-site/public/videos/langgraph-contract-renewal.srt`

**Interfaces:**
- Consumes: `generated/timeline.json`, slides, and MP3 narration.
- Produces: network-optimized H.264 MP4 with a narration track plus public poster and subtitles.

- [ ] **Step 1: Copy and specialize the proven AVFoundation renderer**

Start from `docs-site/video-src/hola-mundo-claude-mcp/render_video.swift`. Keep 1920 × 1080, 30 fps, H.264 High Auto Level, 8 Mbps, half-second dissolve transitions, and `AVAssetExportPresetHighestQuality`. Change only the temporary silent filename to `.langgraph-contract-renewal-silent.mp4`.

- [ ] **Step 2: Add the deterministic build script**

`render.sh` must use `set -euo pipefail`, resolve paths with `pwd -P`, run unit tests before rendering, run `render_slides.py`, compile Swift with `swiftc -parse-as-library`, render the MP4, and copy the poster and SRT to `docs-site/public/videos/`. It must not call ElevenLabs; narration generation remains an explicit separate command.

- [ ] **Step 3: Ignore only reproducible intermediates**

Create `.gitignore` containing:

```gitignore
generated/
```

Keep `voiceover/*.mp3` trackable because regenerating them costs credits and requires external access.

- [ ] **Step 4: Render the final video**

Run:

```bash
docs-site/video-src/langgraph-contract-renewal/render.sh
```

Expected: exit 0 and a final line pointing to `docs-site/public/videos/langgraph-contract-renewal.mp4`.

- [ ] **Step 5: Verify technical media properties**

Run:

```bash
afinfo docs-site/public/videos/langgraph-contract-renewal.mp4
sips -g pixelWidth -g pixelHeight \
  docs-site/public/videos/langgraph-contract-renewal-poster.png
```

Expected: MP4 has H.264 video and an audio track, positive duration between 80 and 90 seconds, and poster dimensions 1920 × 1080. Confirm the SRT has eight ordered cues and its final timestamp does not exceed video duration.

- [ ] **Step 6: Review the complete video**

Watch from beginning to end with sound and once muted. Confirm narration pronunciation, transitions, code legibility, subtitle timing, the selected “Renegociar” state, and the final message. If audio changes, regenerate only the affected MP3 and rerun `render.sh`.

- [ ] **Step 7: Run final regression checks**

```bash
python3 -m unittest docs-site/video-src/langgraph-contract-renewal/test_video_source.py -v
git diff --check
git status --short
```

Expected: all video-source tests PASS and no whitespace errors. Review `git status` carefully so unrelated pre-existing changes are not staged.

- [ ] **Step 8: Commit the renderer and final artifacts**

```bash
git add docs-site/video-src/langgraph-contract-renewal/.gitignore \
  docs-site/video-src/langgraph-contract-renewal/render_video.swift \
  docs-site/video-src/langgraph-contract-renewal/render.sh \
  docs-site/video-src/langgraph-contract-renewal/README.md \
  docs-site/public/videos/langgraph-contract-renewal.mp4 \
  docs-site/public/videos/langgraph-contract-renewal-poster.png \
  docs-site/public/videos/langgraph-contract-renewal.srt
git commit -m "Produce LangGraph contract renewal video"
```
