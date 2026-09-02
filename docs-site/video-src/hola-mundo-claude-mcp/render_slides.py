#!/usr/bin/env python3
"""Build branded slides, Spanish narration, timeline, poster and subtitles."""

from __future__ import annotations

import json
import re
import subprocess
import textwrap
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent
SCREENS = ROOT / "screens"
GENERATED = ROOT / "generated"
SLIDES = GENERATED / "slides"
VOICEOVER = ROOT / "voiceover"
WIDTH, HEIGHT = 1920, 1080

FONT_REGULAR = "/System/Library/Fonts/SFNS.ttf"
FONT_ROUNDED = "/System/Library/Fonts/SFNSRounded.ttf"


def font(size: int, rounded: bool = False) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(FONT_ROUNDED if rounded else FONT_REGULAR, size)


def rounded_mask(size: tuple[int, int], radius: int) -> Image.Image:
    mask = Image.new("L", size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, size[0], size[1]), radius, fill=255)
    return mask


def fit_screen(path: Path, max_size: tuple[int, int]) -> Image.Image:
    shot = Image.open(path).convert("RGB")
    shot.thumbnail(max_size, Image.Resampling.LANCZOS)
    return shot


def draw_background() -> Image.Image:
    canvas = Image.new("RGB", (WIDTH, HEIGHT))
    px = canvas.load()
    for y in range(HEIGHT):
        t = y / (HEIGHT - 1)
        color = (
            int(13 + 7 * t),
            int(11 + 4 * t),
            int(22 + 17 * t),
        )
        for x in range(WIDTH):
            px[x, y] = color

    glow = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.ellipse((-260, -360, 800, 700), fill=(124, 58, 237, 90))
    gd.ellipse((1450, 650, 2200, 1400), fill=(37, 99, 235, 65))
    glow = glow.filter(ImageFilter.GaussianBlur(150))
    return Image.alpha_composite(canvas.convert("RGBA"), glow)


def draw_brand(draw: ImageDraw.ImageDraw) -> None:
    x, y = 96, 70
    draw.rounded_rectangle((x, y, x + 58, y + 48), 20, outline=(167, 139, 250), width=4)
    draw.ellipse((x + 15, y + 20, x + 21, y + 26), fill=(167, 139, 250))
    draw.ellipse((x + 27, y + 20, x + 33, y + 26), fill=(167, 139, 250))
    draw.ellipse((x + 39, y + 20, x + 45, y + 26), fill=(167, 139, 250))
    draw.text((174, 76), "AgentDialog", font=font(34, True), fill=(244, 240, 255))


def draw_scene(scene: dict, output: Path) -> None:
    canvas = draw_background()
    draw = ImageDraw.Draw(canvas)
    draw_brand(draw)

    pill_x, pill_y = 96, 154
    pill_text = scene["eyebrow"]
    pill_font = font(22, True)
    pill_box = draw.textbbox((0, 0), pill_text, font=pill_font)
    pill_w = pill_box[2] - pill_box[0] + 42
    draw.rounded_rectangle((pill_x, pill_y, pill_x + pill_w, pill_y + 42), 21, fill=(124, 58, 237, 170))
    draw.text((pill_x + 21, pill_y + 8), pill_text, font=pill_font, fill=(255, 255, 255))

    title_font = font(56, True)
    title_lines = textwrap.wrap(scene["title"], width=34)
    title_y = 214
    for line in title_lines:
        draw.text((96, title_y), line, font=title_font, fill=(250, 248, 255))
        title_y += 64

    screen_name = scene.get("screen")
    if screen_name:
        shot = fit_screen(SCREENS / screen_name, (1600, 650))
        shot_w, shot_h = shot.size
        shot_x = (WIDTH - shot_w) // 2
        shot_y = max(330, 570 - shot_h // 2)

        shadow = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
        sd = ImageDraw.Draw(shadow)
        sd.rounded_rectangle(
            (shot_x - 20, shot_y - 20, shot_x + shot_w + 20, shot_y + shot_h + 20),
            34,
            fill=(0, 0, 0, 155),
        )
        shadow = shadow.filter(ImageFilter.GaussianBlur(28))
        canvas = Image.alpha_composite(canvas, shadow)

        border = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
        bd = ImageDraw.Draw(border)
        bd.rounded_rectangle(
            (shot_x - 7, shot_y - 7, shot_x + shot_w + 7, shot_y + shot_h + 7),
            28,
            fill=(167, 139, 250, 85),
        )
        canvas = Image.alpha_composite(canvas, border)
        canvas.paste(shot, (shot_x, shot_y), rounded_mask(shot.size, 22))
    else:
        big_font = font(92, True)
        lines = textwrap.wrap(scene["title"], width=27)
        total = len(lines) * 108
        yy = (HEIGHT - total) // 2
        for line in lines:
            box = ImageDraw.Draw(canvas).textbbox((0, 0), line, font=big_font)
            xx = (WIDTH - (box[2] - box[0])) // 2
            ImageDraw.Draw(canvas).text((xx, yy), line, font=big_font, fill=(250, 248, 255))
            yy += 108

    caption = scene["caption"]
    caption_font = font(31)
    caption_lines = textwrap.wrap(caption, width=86)
    cap_h = max(98, 38 * len(caption_lines) + 40)
    cap_y = HEIGHT - cap_h - 42
    overlay = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    od.rounded_rectangle((150, cap_y, WIDTH - 150, HEIGHT - 42), 28, fill=(20, 17, 31, 232), outline=(93, 74, 137, 210), width=2)
    for i, line in enumerate(caption_lines):
        box = od.textbbox((0, 0), line, font=caption_font)
        xx = (WIDTH - (box[2] - box[0])) // 2
        od.text((xx, cap_y + 20 + i * 38), line, font=caption_font, fill=(239, 233, 255))
    canvas = Image.alpha_composite(canvas, overlay)
    canvas.convert("RGB").save(output, quality=94)


def audio_duration(path: Path) -> float:
    info = subprocess.check_output(["afinfo", str(path)], text=True)
    match = re.search(r"estimated duration: ([0-9.]+) sec", info)
    if not match:
        raise RuntimeError(f"Could not read duration for {path}")
    return float(match.group(1))


def save_poster(slide: Path, output: Path) -> None:
    with Image.open(slide) as image:
        image.save(output)


def voiceover_audio(scene_id: str, voiceover_dir: Path = VOICEOVER) -> Path:
    audio = voiceover_dir / f"{scene_id}.mp3"
    if not audio.is_file():
        raise FileNotFoundError(f"Missing ElevenLabs voiceover: {audio}")
    return audio


def srt_time(seconds: float) -> str:
    millis = round(seconds * 1000)
    hours, millis = divmod(millis, 3_600_000)
    minutes, millis = divmod(millis, 60_000)
    secs, millis = divmod(millis, 1000)
    return f"{hours:02}:{minutes:02}:{secs:02},{millis:03}"


def main() -> None:
    scenes = json.loads((ROOT / "scenes.json").read_text())
    SLIDES.mkdir(parents=True, exist_ok=True)

    timeline = []
    cursor = 0.0
    srt = []

    for index, scene in enumerate(scenes, start=1):
        slide = SLIDES / f"{scene['id']}.png"
        audio = voiceover_audio(scene["id"])
        draw_scene(scene, slide)

        spoken = audio_duration(audio)
        duration = spoken + 1.0
        timeline.append({
            "slide": str(slide),
            "audio": str(audio),
            "duration": duration,
            "audioOffset": 0.45,
        })
        srt.append(
            f"{index}\n{srt_time(cursor + 0.25)} --> {srt_time(cursor + spoken + 0.45)}\n{scene['caption']}\n"
        )
        cursor += duration

    (GENERATED / "timeline.json").write_text(json.dumps(timeline, indent=2))
    (GENERATED / "hola-mundo-claude-mcp.srt").write_text("\n".join(srt))
    save_poster(SLIDES / "00-intro.png", ROOT / "poster.png")
    print(f"Built {len(scenes)} slides; duration {cursor:.1f}s")


if __name__ == "__main__":
    main()
