"""Generate cached ElevenLabs narration files for the contract-renewal video."""

import argparse
import json
import os
import urllib.error
import urllib.request
from pathlib import Path
from urllib.parse import quote


API_ROOT = "https://api.elevenlabs.io/v1"
MODEL_ID = "eleven_multilingual_v2"
OUTPUT_FORMAT = "mp3_44100_128"
ROOT = Path(__file__).resolve().parent
SCENES = ROOT / "scenes.json"
VOICEOVER = ROOT / "voiceover"


def load_scenes() -> list[dict[str, str]]:
    return json.loads(SCENES.read_text(encoding="utf-8"))


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


def required_environment(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(f"Missing {name}")
    return value


def http_error_message(error: urllib.error.HTTPError) -> str:
    prefix = f"ElevenLabs HTTP {error.code}"
    try:
        body = error.read(4096)
        payload = json.loads(body.decode("utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError):
        return prefix
    finally:
        error.close()

    detail = payload.get("detail") if isinstance(payload, dict) else None
    if not isinstance(detail, dict):
        return prefix

    status = detail.get("status")
    message = detail.get("message")
    if not isinstance(message, str):
        return prefix

    parts = [prefix]
    if isinstance(status, str):
        parts.append(status)
    parts.append(message)
    diagnostic = ": ".join(parts)
    for name in ("ELEVENLABS_API_KEY", "ELEVENLABS_VOICE_ID"):
        value = os.environ.get(name)
        if value:
            diagnostic = diagnostic.replace(value, "[redacted]")
    return diagnostic


def generate(force: bool = False, scene_id: str | None = None) -> list[Path]:
    required_environment("ELEVENLABS_API_KEY")
    voice_id = required_environment("ELEVENLABS_VOICE_ID")
    scenes = load_scenes()
    if scene_id is not None:
        scenes = [scene for scene in scenes if scene["id"] == scene_id]
        if not scenes:
            raise ValueError(f"Unknown scene ID: {scene_id}")

    VOICEOVER.mkdir(parents=True, exist_ok=True)
    written: list[Path] = []
    for scene in scenes:
        output = VOICEOVER / f'{scene["id"]}.mp3'
        if output.exists() and not force:
            continue

        request = synthesis_request(voice_id, scene["narration"])
        temporary = output.with_suffix(".tmp")
        try:
            with urllib.request.urlopen(request, timeout=90) as response:
                audio = response.read()
        except urllib.error.HTTPError as error:
            temporary.unlink(missing_ok=True)
            raise RuntimeError(http_error_message(error)) from None

        try:
            temporary.write_bytes(audio)
            temporary.replace(output)
        except Exception:
            temporary.unlink(missing_ok=True)
            raise
        written.append(output)
    return written


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--scene")
    arguments = parser.parse_args()
    for output in generate(force=arguments.force, scene_id=arguments.scene):
        print(output)


if __name__ == "__main__":
    main()
