import tempfile
import unittest
from pathlib import Path

from PIL import Image

import render_slides


class SavePosterTest(unittest.TestCase):
    def test_saves_the_intro_slide_as_a_png(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            slide = root / "slide.png"
            poster = root / "poster.png"
            Image.new("RGB", (8, 6), (124, 58, 237)).save(slide)

            render_slides.save_poster(slide, poster)

            self.assertTrue(poster.exists())
            with Image.open(poster) as saved:
                self.assertEqual(saved.size, (8, 6))
                self.assertEqual(saved.getpixel((0, 0)), (124, 58, 237))


class VoiceoverAudioTest(unittest.TestCase):
    def test_uses_an_existing_elevenlabs_voiceover(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            voiceover_dir = Path(directory)
            audio = voiceover_dir / "00-intro.mp3"
            audio.write_bytes(b"mp3")

            self.assertEqual(render_slides.voiceover_audio("00-intro", voiceover_dir), audio)

    def test_rejects_a_missing_voiceover(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            voiceover_dir = Path(directory)
            with self.assertRaisesRegex(FileNotFoundError, "Missing ElevenLabs voiceover"):
                render_slides.voiceover_audio("missing", voiceover_dir)


if __name__ == "__main__":
    unittest.main()
