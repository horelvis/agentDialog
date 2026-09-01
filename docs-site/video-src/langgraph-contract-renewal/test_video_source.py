import copy
import importlib.util
import io
import json
import os
import subprocess
import sys
import urllib.error
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from PIL import Image

ROOT = Path(__file__).resolve().parent


def load_local_module(name: str, filename: str):
    spec = importlib.util.spec_from_file_location(name, ROOT / filename)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


voiceover = load_local_module("contract_voiceover", "generate_voiceover.py")

render_slides = load_local_module("contract_slides", "render_slides.py")

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
            _, keyword_arguments = urlopen.call_args
            self.assertEqual(keyword_arguments["timeout"], 90)

    @patch.dict(
        os.environ,
        {
            "ELEVENLABS_API_KEY": "test-key",
            "ELEVENLABS_VOICE_ID": "voice-123",
        },
        clear=True,
    )
    def test_generation_reports_structured_http_errors_without_secrets(self) -> None:
        error = urllib.error.HTTPError(
            "https://api.elevenlabs.io/v1/text-to-speech/voice-123",
            400,
            "Bad Request",
            hdrs=None,
            fp=io.BytesIO(
                b'{"detail":{"status":"invalid_voice_id",'
                b'"message":"Voice ID voice-123 rejected with test-key"}}'
            ),
        )
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp) / "voiceover"
            output.mkdir()
            temporary = output / "00-contract.tmp"
            temporary.write_bytes(b"partial")
            with (
                patch.object(voiceover, "VOICEOVER", output),
                patch.object(
                    voiceover,
                    "load_scenes",
                    return_value=[{"id": "00-contract", "narration": "Primera."}],
                ),
                patch.object(
                    voiceover.urllib.request,
                    "urlopen",
                    side_effect=error,
                ),
            ):
                with self.assertRaises(RuntimeError) as raised:
                    voiceover.generate()

            message = str(raised.exception)
            self.assertEqual(
                message,
                "ElevenLabs HTTP 400: invalid_voice_id: "
                "Voice ID [redacted] rejected with [redacted]",
            )
            self.assertNotIn("test-key", message)
            self.assertNotIn("xi-api-key", message)
            self.assertFalse(temporary.exists())

    @patch.dict(
        os.environ,
        {
            "ELEVENLABS_API_KEY": "test-key",
            "ELEVENLABS_VOICE_ID": "voice-123",
        },
        clear=True,
    )
    def test_generation_reports_generic_message_for_non_json_http_errors(self) -> None:
        error = urllib.error.HTTPError(
            "https://api.elevenlabs.io/v1/text-to-speech/voice-123",
            400,
            "Bad Request",
            hdrs=None,
            fp=io.BytesIO(b"not-json"),
        )
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp) / "voiceover"
            with (
                patch.object(voiceover, "VOICEOVER", output),
                patch.object(
                    voiceover,
                    "load_scenes",
                    return_value=[{"id": "00-contract", "narration": "Primera."}],
                ),
                patch.object(
                    voiceover.urllib.request,
                    "urlopen",
                    side_effect=error,
                ),
            ):
                with self.assertRaises(RuntimeError) as raised:
                    voiceover.generate()

        self.assertEqual(str(raised.exception), "ElevenLabs HTTP 400")


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


    @patch.dict(
        os.environ,
        {
            "ELEVENLABS_API_KEY": "test-key",
            "ELEVENLABS_VOICE_ID": "voice-123",
        },
        clear=True,
    )
    def test_generation_force_overwrites_existing_audio(self) -> None:
        scenes = [{"id": "00-contract", "narration": "Actualizada."}]
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp) / "voiceover"
            output.mkdir()
            existing = output / "00-contract.mp3"
            existing.write_bytes(b"old")
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
                written = voiceover.generate(force=True)

            self.assertEqual(existing.read_bytes(), b"ID3new")
            self.assertEqual(written, [existing])
            urlopen.assert_called_once()

    @patch.dict(
        os.environ,
        {
            "ELEVENLABS_API_KEY": "test-key",
            "ELEVENLABS_VOICE_ID": "voice-123",
        },
        clear=True,
    )
    def test_generation_http_error_keeps_existing_audio_and_removes_temp(self) -> None:
        error = urllib.error.HTTPError(
            "https://api.elevenlabs.io/v1/text-to-speech/voice-123",
            400,
            "Bad Request",
            hdrs=None,
            fp=io.BytesIO(b"not-json"),
        )
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp) / "voiceover"
            output.mkdir()
            existing = output / "00-contract.mp3"
            existing.write_bytes(b"existing")
            temporary = output / "00-contract.tmp"
            temporary.write_bytes(b"partial")
            with (
                patch.object(voiceover, "VOICEOVER", output),
                patch.object(
                    voiceover,
                    "load_scenes",
                    return_value=[{"id": "00-contract", "narration": "Actualizada."}],
                ),
                patch.object(
                    voiceover.urllib.request,
                    "urlopen",
                    side_effect=error,
                ),
            ):
                with self.assertRaisesRegex(RuntimeError, "^ElevenLabs HTTP 400$"):
                    voiceover.generate(force=True)

            self.assertEqual(existing.read_bytes(), b"existing")
            self.assertFalse(temporary.exists())

    @patch.dict(
        os.environ,
        {
            "ELEVENLABS_API_KEY": "test-key",
            "ELEVENLABS_VOICE_ID": "voice-123",
        },
        clear=True,
    )
    def test_generation_filters_to_the_selected_scene(self) -> None:
        scenes = [
            {"id": "00-contract", "narration": "Seleccionada."},
            {"id": "01-extract", "narration": "No seleccionada."},
        ]
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp) / "voiceover"
            response = unittest.mock.MagicMock()
            response.__enter__.return_value.read.return_value = b"ID3selected"
            with (
                patch.object(voiceover, "VOICEOVER", output),
                patch.object(voiceover, "load_scenes", return_value=scenes),
                patch.object(
                    voiceover.urllib.request,
                    "urlopen",
                    return_value=response,
                ) as urlopen,
            ):
                written = voiceover.generate(scene_id="00-contract")

            selected = output / "00-contract.mp3"
            self.assertEqual(written, [selected])
            self.assertEqual(selected.read_bytes(), b"ID3selected")
            self.assertFalse((output / "01-extract.mp3").exists())
            request = urlopen.call_args.args[0]
            self.assertEqual(json.loads(request.data)["text"], "Seleccionada.")
            self.assertEqual(urlopen.call_args.kwargs["timeout"], 90)

    @patch.dict(
        os.environ,
        {
            "ELEVENLABS_API_KEY": "test-key",
            "ELEVENLABS_VOICE_ID": "voice-123",
        },
        clear=True,
    )
    def test_selected_scene_keeps_cached_audio_without_force(self) -> None:
        scenes = [
            {"id": "00-contract", "narration": "Seleccionada."},
            {"id": "01-extract", "narration": "No seleccionada."},
        ]
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp) / "voiceover"
            output.mkdir()
            selected = output / "00-contract.mp3"
            selected.write_bytes(b"cached")
            with (
                patch.object(voiceover, "VOICEOVER", output),
                patch.object(voiceover, "load_scenes", return_value=scenes),
                patch.object(voiceover.urllib.request, "urlopen") as urlopen,
            ):
                written = voiceover.generate(scene_id="00-contract")

            self.assertEqual(written, [])
            self.assertEqual(selected.read_bytes(), b"cached")
            self.assertFalse((output / "01-extract.mp3").exists())
            urlopen.assert_not_called()

    @patch.dict(
        os.environ,
        {
            "ELEVENLABS_API_KEY": "test-key",
            "ELEVENLABS_VOICE_ID": "voice-123",
        },
        clear=True,
    )
    def test_generation_rejects_unknown_scene_before_network_access(self) -> None:
        with (
            patch.object(
                voiceover,
                "load_scenes",
                return_value=[{"id": "00-contract", "narration": "Primera."}],
            ),
            patch.object(voiceover.urllib.request, "urlopen") as urlopen,
        ):
            with self.assertRaisesRegex(ValueError, "^Unknown scene ID: missing$"):
                voiceover.generate(scene_id="missing")

        urlopen.assert_not_called()

    def test_cli_passes_selected_scene_to_generator(self) -> None:
        with (
            patch.object(voiceover, "generate", return_value=[]) as generate,
            patch.object(
                sys,
                "argv",
                ["generate_voiceover.py", "--force", "--scene", "00-contract"],
            ),
        ):
            voiceover.main()

        generate.assert_called_once_with(force=True, scene_id="00-contract")


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


    def test_rest_scene_shows_a_valid_choice_query_request(self) -> None:
        query_scene = next(scene for scene in self.scenes if scene["id"] == "03-query")
        method, endpoint, body = query_scene["caption"].split(" ", 2)
        payload = json.loads(body)

        self.assertEqual(method, "POST")
        self.assertEqual(endpoint, "https://api.agentdialog.io/api/v1/agent/queries")
        self.assertEqual(
            set(payload),
            {
                "query_type", "risk", "subject", "context", "changes",
                "answer_space", "question", "target_human_email",
            },
        )
        self.assertEqual(payload["query_type"], "expert_query")
        self.assertEqual(
            [option["id"] for option in payload["answer_space"]["options"]],
            ["approve", "renegotiate", "cancel"],
        )
        self.assertEqual(
            [option["label"] for option in payload["answer_space"]["options"]],
            ["Aprobar", "Renegociar", "Cancelar"],
        )
        self.assertEqual(payload["target_human_email"], "responsable@example.com")
        self.assertNotIn("options", payload)

    def test_rest_scene_gives_the_reviewer_decision_grade_context(self) -> None:
        query_scene = next(scene for scene in self.scenes if scene["id"] == "03-query")
        payload = json.loads(query_scene["caption"].split(" ", 2)[2])

        self.assertIn("risk", payload)
        self.assertEqual(payload["risk"], "medium")
        self.assertEqual(
            payload["subject"]["body"],
            "CLÁUSULA 12 · RENOVACIÓN: renovación automática por 12 meses "
            "salvo cancelación con 10 días de antelación.",
        )
        self.assertEqual(
            payload["context"].splitlines(),
            [
                "Proveedor: CloudDesk",
                "Precio actual: 120.000 €/año",
                "Renovación propuesta: 129.600 €/año (+8 %)",
                "Límite interno: 126.000 €/año (+5 %)",
                "Fecha de renovación: 30 de septiembre",
                "Fecha límite de cancelación: 20 de septiembre",
                "Recomendación del agente: renegociar hasta un máximo de 126.000 €/año.",
            ],
        )
        self.assertEqual(
            payload["changes"],
            [{
                "path": "precio_anual",
                "before": "120.000 €/año",
                "after": "129.600 €/año",
                "materiality": "material",
            }],
        )
        self.assertTrue(all(
            option.get("consequence")
            for option in payload["answer_space"]["options"]
        ))

    def test_decision_scene_caption_matches_the_rendered_choices(self) -> None:
        decision_scene = next(
            scene for scene in self.scenes if scene["id"] == "04-human"
        )

        self.assertEqual(
            decision_scene["caption"],
            "Aprobar · Renegociar · Cancelar · Renegociar seleccionado",
        )

    def test_narration_budget_leaves_room_for_eight_one_second_holds(self) -> None:
        words = sum(len(scene["narration"].split()) for scene in self.scenes)
        estimated_runtime = words * 0.47 + len(self.scenes)
        self.assertGreaterEqual(estimated_runtime, 87)
        self.assertLessEqual(estimated_runtime, 88)


class RenderTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        # unittest orders classes alphabetically, before SceneManifestTests runs.
        SceneManifestTests.setUpClass()

    def test_srt_time_formats_milliseconds(self) -> None:
        self.assertEqual(render_slides.srt_time(65.432), "00:01:05,432")

    def test_render_instructions_cover_fresh_macos_setup_and_outputs(self) -> None:
        render_script = (ROOT / "render.sh").read_text()
        readme = (ROOT / "README.md").read_text()

        self.assertIn('PYTHON_BIN="${PYTHON_BIN:-python3}"', render_script)
        self.assertNotIn("/Users/horelvis/", render_script)
        self.assertNotIn("/Users/horelvis/", readme)
        self.assertIn("python3 -m pip install -r", readme)
        self.assertIn("requirements.txt", readme)
        self.assertIn("macOS", readme)
        self.assertIn("Swift", readme)
        self.assertIn("AVFoundation", readme)
        self.assertIn("`python3`", readme)
        self.assertIn("PYTHON_BIN=/path/to/python3", readme)
        self.assertIn("docs-site/public/videos/langgraph-contract-renewal.srt", readme)

    def test_readme_explains_the_measured_narration_exception(self) -> None:
        readme = (ROOT / "README.md").read_text()

        self.assertIn("169", readme)
        self.assertIn("175–205", readme)
        self.assertIn("88.013062", readme)
        self.assertIn("90", readme)

    def test_pillow_dependency_is_pinned_to_the_rendered_asset_version(self) -> None:
        requirements = (ROOT / "requirements.txt").read_text().splitlines()

        self.assertEqual(requirements, ["Pillow==12.3.0"])

    def test_render_preflight_explains_how_to_install_missing_pillow(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            missing_pillow_python = Path(tmp) / "python-without-pillow"
            missing_pillow_python.write_text("#!/bin/sh\nexit 1\n")
            missing_pillow_python.chmod(0o755)
            result = subprocess.run(
                [str(ROOT / "render.sh")],
                cwd=ROOT,
                env={**os.environ, "PYTHON_BIN": str(missing_pillow_python)},
                capture_output=True,
                text=True,
                check=False,
            )

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Pillow is required", result.stderr)
        self.assertIn(
            f"'{missing_pillow_python}' -m pip install -r '{ROOT / 'requirements.txt'}'",
            result.stderr,
        )

    def test_every_visual_type_has_a_renderer(self) -> None:
        expected = {
            "contract", "extraction", "threshold", "code",
            "decision", "json", "graph", "outro",
        }
        self.assertEqual(set(render_slides.VISUAL_RENDERERS), expected)

    def test_code_visual_renders_the_exact_valid_request(self) -> None:
        lines = [line for line, _ in render_slides.code_lines()]
        method, endpoint = lines[0].split(" ", 1)
        payload = json.loads("\n".join(lines[1:]))

        self.assertEqual(method, "POST")
        self.assertEqual(endpoint, "https://api.agentdialog.io/api/v1/agent/queries")
        query_scene = next(
            scene for scene in SceneManifestTests.scenes if scene["id"] == "03-query"
        )
        manifest_payload = json.loads(query_scene["caption"].split(" ", 2)[2])
        self.assertEqual(payload, manifest_payload)
        self.assertEqual(render_slides.code_tab_label(), "agentdialog-request")

    def test_code_choices_match_the_decision_card(self) -> None:
        payload = json.loads(
            "\n".join(line for line, _ in render_slides.code_lines()[1:])
        )

        self.assertEqual(
            render_slides.decision_options(),
            payload["answer_space"]["options"],
        )
        self.assertEqual(render_slides.SELECTED_OPTION_ID, "renegotiate")

    def test_decision_card_shows_the_context_and_consequences_sent_by_the_agent(self) -> None:
        query_payload = render_slides.query_payload()
        visible = render_slides.decision_card_text(query_payload)

        self.assertEqual(
            visible["facts"],
            [
                "Actual · 120.000 €/año",
                "Propuesta · 129.600 €/año (+8 %)",
                "Límite · 126.000 €/año (+5 %)",
                "Renueva 30 sep · cancelar antes del 20 sep",
            ],
        )
        self.assertEqual(
            visible["consequences"],
            {
                option["id"]: option["consequence"]
                for option in query_payload["answer_space"]["options"]
            },
        )

        self.assertEqual(
            render_slides.decision_options(),
            query_payload["answer_space"]["options"],
        )
        self.assertEqual(
            query_payload["context"].splitlines()[1],
            "Precio actual: 120.000 €/año",
        )

    def test_visible_request_summary_is_derived_from_the_payload(self) -> None:
        payload = copy.deepcopy(render_slides.query_payload())
        payload["risk"] = "high"
        payload["subject"]["body"] = "CLÁUSULA DE PRUEBA"
        payload["changes"][0]["before"] = "111 €/año"
        payload["changes"][0]["after"] = "222 €/año"
        payload["answer_space"]["options"][0]["label"] = "Aceptar prueba"
        payload["target_human_email"] = "test@example.com"

        preview = "\n".join(
            line for line, _ in render_slides.code_preview_lines(payload)
        )

        self.assertIn('"risk": "high"', preview)
        self.assertIn("CLÁUSULA DE PRUEBA", preview)
        self.assertIn("111 €/año → 222 €/año", preview)
        self.assertIn("Aceptar prueba", preview)
        self.assertIn("test@example.com", preview)

        payload["context"] = payload["context"].replace(
            "Renovación propuesta: 129.600 €/año (+8 %)",
            "Renovación propuesta: 222 €/año (+99 %)",
        )
        rows = render_slides.context_fact_rows(payload)
        self.assertIn(("PRECIO ACTUAL", "111 €/año", render_slides.MUTED), rows)
        self.assertIn(("PROPUESTA", "222 €/año · +99 %", render_slides.WARNING), rows)

    def test_decision_card_text_is_derived_from_the_payload(self) -> None:
        payload = copy.deepcopy(render_slides.query_payload())
        payload["changes"][0]["before"] = "111 €/año"
        payload["changes"][0]["after"] = "222 €/año"
        payload["context"] = payload["context"].replace(
            "Renovación propuesta: 129.600 €/año (+8 %)",
            "Renovación propuesta: 222 €/año (+99 %)",
        )
        payload["answer_space"]["options"][0]["consequence"] = (
            "Consecuencia de prueba."
        )

        visible = render_slides.decision_card_text(payload)

        self.assertIn("Actual · 111 €/año", visible["facts"])
        self.assertIn("Propuesta · 222 €/año (+99 %)", visible["facts"])
        self.assertEqual(
            visible["consequences"]["approve"],
            "Consecuencia de prueba.",
        )

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

if __name__ == "__main__":
    unittest.main()
