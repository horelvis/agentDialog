#!/usr/bin/env python3
"""Render the branded still assets for the LangGraph contract-renewal video."""

from __future__ import annotations

import json
import re
import subprocess
import textwrap
from pathlib import Path
from typing import Callable

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent
GENERATED = ROOT / "generated"
SLIDES = GENERATED / "slides"
VOICEOVER = ROOT / "voiceover"
POSTER = ROOT / "poster.png"

WIDTH, HEIGHT = 1920, 1080
BRAND = (126, 66, 196)
BRAND_LIGHT = (184, 128, 245)
SURFACE = (15, 15, 19)
SUCCESS = (34, 197, 94)
WARNING = (234, 179, 8)
INK = (245, 243, 255)
MUTED = (188, 181, 207)
PANEL = (29, 25, 39)
BORDER = (90, 76, 122)
FONT_REGULAR = "/System/Library/Fonts/SFNS.ttf"
FONT_ROUNDED = "/System/Library/Fonts/SFNSRounded.ttf"

CHOICE_OPTIONS = (
    {"id": "approve", "label": "Aprobar"},
    {"id": "renegotiate", "label": "Renegociar"},
    {"id": "cancel", "label": "Cancelar"},
)
SELECTED_OPTION_ID = "renegotiate"
CODE_TAB_LABEL = "agentdialog-request.json"


def font(size: int, rounded: bool = False) -> ImageFont.FreeTypeFont:
    """Load the macOS system face used by the first AgentDialog video."""
    return ImageFont.truetype(FONT_ROUNDED if rounded else FONT_REGULAR, size)


def draw_background() -> Image.Image:
    """Create the shared dark-purple AgentDialog backdrop."""
    canvas = Image.new("RGB", (WIDTH, HEIGHT), SURFACE).convert("RGBA")
    pixels = canvas.load()
    for y in range(HEIGHT):
        blend = y / (HEIGHT - 1)
        tone = (15 + int(8 * blend), 15 + int(3 * blend), 19 + int(17 * blend), 255)
        for x in range(WIDTH):
            pixels[x, y] = tone

    glow = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    draw = ImageDraw.Draw(glow)
    draw.ellipse((-260, -320, 730, 650), fill=(*BRAND, 110))
    draw.ellipse((1450, 680, 2230, 1430), fill=(54, 102, 235, 70))
    return Image.alpha_composite(canvas, glow.filter(ImageFilter.GaussianBlur(150)))


def panel(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], *, fill: tuple[int, int, int] = PANEL, outline: tuple[int, int, int] = BORDER, radius: int = 28, width: int = 2) -> None:
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def centered_text(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], text: str, text_font: ImageFont.FreeTypeFont, fill: tuple[int, int, int] = INK) -> None:
    left, top, right, bottom = box
    bounds = draw.textbbox((0, 0), text, font=text_font)
    x = left + (right - left - (bounds[2] - bounds[0])) / 2
    y = top + (bottom - top - (bounds[3] - bounds[1])) / 2 - bounds[1]
    draw.text((x, y), text, font=text_font, fill=fill)


def wrapped_lines(draw: ImageDraw.ImageDraw, text: str, text_font: ImageFont.FreeTypeFont, max_width: int) -> list[str]:
    """Wrap to measured pixels rather than a character estimate."""
    words = text.split()
    lines: list[str] = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if current and draw.textlength(candidate, font=text_font) > max_width:
            lines.append(current)
            current = word
        else:
            current = candidate
    if current:
        lines.append(current)
    return lines or [""]


def draw_brand(draw: ImageDraw.ImageDraw) -> None:
    x, y = 96, 70
    draw.rounded_rectangle((x, y, x + 58, y + 48), 20, outline=BRAND_LIGHT, width=4)
    for dot_x in (x + 18, x + 30, x + 42):
        draw.ellipse((dot_x - 3, y + 21, dot_x + 3, y + 27), fill=BRAND_LIGHT)
    draw.text((174, 76), "AgentDialog", font=font(34, True), fill=INK)


def draw_header(draw: ImageDraw.ImageDraw, scene: dict) -> None:
    draw_brand(draw)
    eyebrow_font = font(22, True)
    eyebrow = scene["eyebrow"]
    eyebrow_width = int(draw.textlength(eyebrow, font=eyebrow_font)) + 42
    draw.rounded_rectangle((96, 154, 96 + eyebrow_width, 196), 21, fill=(*BRAND, 190))
    draw.text((117, 162), eyebrow, font=eyebrow_font, fill=INK)

    title_font = font(56, True)
    title_lines = wrapped_lines(draw, scene["title"], title_font, 1330)
    y = 220
    for line in title_lines:
        draw.text((96, y), line, font=title_font, fill=INK)
        y += 64


def draw_caption(canvas: Image.Image, scene: dict) -> None:
    """Keep the literal scene caption visible where it is short, then condense REST copy."""
    draw = ImageDraw.Draw(canvas)
    caption = scene["caption"]
    if scene["visual"] == "code":
        caption = "POST · expert_query · tres alternativas · decisión humana"
    caption_font = font(27)
    lines = wrapped_lines(draw, caption, caption_font, 1450)
    height = max(90, len(lines) * 36 + 36)
    box = (150, HEIGHT - height - 42, WIDTH - 150, HEIGHT - 42)
    overlay = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    panel(od, box, fill=(20, 17, 31, 235), outline=(93, 74, 137, 220), radius=28)
    for index, line in enumerate(lines):
        bounds = od.textbbox((0, 0), line, font=caption_font)
        x = (WIDTH - (bounds[2] - bounds[0])) / 2
        od.text((x, box[1] + 18 + index * 36), line, font=caption_font, fill=(238, 232, 255))
    canvas.alpha_composite(overlay)


def draw_contract(canvas: Image.Image, draw: ImageDraw.ImageDraw, scene: dict) -> None:
    doc_box = (190, 370, 1210, 848)
    panel(draw, doc_box, fill=(247, 244, 255), outline=BRAND_LIGHT, radius=32, width=3)
    draw.rounded_rectangle((225, 412, 510, 456), 16, fill=(231, 222, 252))
    draw.text((248, 421), "CLÁUSULA 12 · RENOVACIÓN", font=font(19, True), fill=(82, 57, 129))
    draw.text((245, 494), "El acuerdo se renovará", font=font(42, True), fill=(35, 28, 50))
    draw.rounded_rectangle((236, 550, 905, 616), 14, fill=(224, 203, 255))
    draw.text((254, 560), "automáticamente por 12 meses", font=font(38, True), fill=(69, 39, 117))
    draw.text((245, 658), "salvo cancelación antes del plazo acordado.", font=font(34), fill=(75, 65, 91))
    draw.line((245, 735, 1070, 735), fill=(211, 201, 223), width=2)
    draw.text((245, 760), "CloudDesk · contrato operativo", font=font(24), fill=(105, 92, 123))

    alert_box = (1270, 410, 1725, 760)
    panel(draw, alert_box, fill=(44, 29, 66), outline=BRAND_LIGHT, radius=30, width=3)
    draw.text((1314, 454), "VENTANA", font=font(22, True), fill=BRAND_LIGHT)
    draw.text((1312, 500), "10", font=font(115, True), fill=INK)
    draw.text((1460, 554), "días", font=font(42, True), fill=INK)
    draw.line((1314, 645, 1678, 645), fill=(114, 83, 159), width=2)
    draw.text((1314, 677), "Antes de renovar", font=font(28), fill=MUTED)


def draw_fact_card(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], label: str, value: str, accent: tuple[int, int, int]) -> None:
    panel(draw, box, fill=(32, 27, 45), outline=accent, radius=28, width=3)
    draw.text((box[0] + 34, box[1] + 34), label.upper(), font=font(20, True), fill=MUTED)
    draw.text((box[0] + 34, box[1] + 90), value, font=font(55, True), fill=INK)


def draw_extraction(canvas: Image.Image, draw: ImageDraw.ImageDraw, scene: dict) -> None:
    draw.text((200, 398), "Agente", font=font(26, True), fill=BRAND_LIGHT)
    draw.line((310, 420, 540, 420), fill=BRAND_LIGHT, width=4)
    draw.rounded_rectangle((520, 395, 558, 433), 19, fill=BRAND_LIGHT)
    cards = [
        ((190, 510, 680, 765), "Duración", "12 meses", BRAND_LIGHT),
        ((715, 510, 1205, 765), "Aumento", "8 %", WARNING),
        ((1240, 510, 1730, 765), "Plazo para actuar", "10 días", SUCCESS),
    ]
    for card in cards:
        draw_fact_card(draw, *card)


def draw_threshold(canvas: Image.Image, draw: ImageDraw.ImageDraw, scene: dict) -> None:
    left, top, right = 250, 435, 1670
    draw.text((left, top), "Aumento permitido", font=font(30, True), fill=INK)
    draw.text((left, top + 70), "Política comercial", font=font(25), fill=MUTED)
    draw.rounded_rectangle((left, top + 126, right, top + 174), 24, fill=(47, 42, 58))
    draw.rounded_rectangle((left, top + 126, left + 700, top + 174), 24, fill=SUCCESS)
    draw.text((left + 730, top + 130), "5 % máximo", font=font(28, True), fill=(196, 250, 215))

    second = top + 300
    draw.text((left, second), "Aumento detectado", font=font(30, True), fill=INK)
    draw.text((left, second + 70), "Renovación CloudDesk", font=font(25), fill=MUTED)
    draw.rounded_rectangle((left, second + 126, right, second + 174), 24, fill=(47, 42, 58))
    draw.rounded_rectangle((left, second + 126, left + 1120, second + 174), 24, fill=WARNING)
    draw.line((left + 700, second + 102, left + 700, second + 200), fill=INK, width=4)
    draw.text((left + 1150, second + 130), "8 %", font=font(28, True), fill=(255, 230, 157))
    draw.rounded_rectangle((1125, 360, 1670, 415), 17, fill=(76, 52, 19))
    centered_text(draw, (1125, 360, 1670, 415), "Supera el límite en 3 puntos", font(24, True), (255, 228, 151))


def decision_options() -> list[dict[str, str]]:
    """Return the choices shared by the request and decision card."""
    return [dict(option) for option in CHOICE_OPTIONS]


def code_tab_label() -> str:
    """Return the accurate filename displayed above the REST request."""
    return CODE_TAB_LABEL


def code_lines() -> list[tuple[str, tuple[int, int, int]]]:
    options = decision_options()
    return [
        ("POST https://api.agentdialog.io/api/v1/agent/queries", BRAND_LIGHT),
        ("{", INK),
        ('  "query_type": "expert_query",', INK),
        ('  "subject": { "id": "clouddesk-contract",', INK),
        ('               "label": "Contrato CloudDesk",', INK),
        ('               "body": "12 meses; aumento 8 %" },', INK),
        ('  "answer_space": {', INK),
        ('    "kind": "choice", "select": "one",', INK),
        ('    "options": [', INK),
        (f"      {json.dumps(options[0], ensure_ascii=False)},", BRAND_LIGHT),
        (f"      {json.dumps(options[1], ensure_ascii=False)},", BRAND_LIGHT),
        (f"      {json.dumps(options[2], ensure_ascii=False)}", BRAND_LIGHT),
        ('    ]', INK),
        ("  },", INK),
        ('  "question": "¿Cómo procedemos?",', INK),
        ('  "target_human_email": "responsable@example.com"', INK),
        ("}", INK),
    ]


def draw_code(canvas: Image.Image, draw: ImageDraw.ImageDraw, scene: dict) -> None:
    box = (185, 365, 1735, 860)
    panel(draw, box, fill=(19, 19, 25), outline=(106, 87, 151), radius=28, width=3)
    draw.rounded_rectangle((185, 365, 1735, 423), 28, fill=(41, 34, 55))
    for x, color in ((222, (245, 113, 113)), (252, WARNING), (282, SUCCESS)):
        draw.ellipse((x, 384, x + 16, 400), fill=color)
    draw.text((336, 378), code_tab_label(), font=font(21, True), fill=MUTED)
    y = 431
    for line, color in code_lines():
        draw.text((238, y), line, font=font(21), fill=color)
        y += 24
    draw.rounded_rectangle((1265, 695, 1658, 772), 19, fill=(53, 38, 75), outline=BRAND_LIGHT, width=2)
    centered_text(draw, (1265, 695, 1658, 772), "consulta a una persona", font(23, True), BRAND_LIGHT)


def draw_decision(canvas: Image.Image, draw: ImageDraw.ImageDraw, scene: dict) -> None:
    card = (390, 350, 1530, 840)
    panel(draw, card, fill=(250, 248, 255), outline=BRAND_LIGHT, radius=34, width=4)
    draw.text((455, 408), "Renovación CloudDesk", font=font(38, True), fill=(40, 31, 56))
    draw.text((455, 465), "El aumento del 8 % supera nuestra política.", font=font(27), fill=(82, 72, 99))
    draw.text((455, 508), "¿Cómo quieres proceder?", font=font(27), fill=(82, 72, 99))
    boxes = {
        "approve": (455, 600, 760, 702),
        "renegotiate": (807, 600, 1178, 702),
        "cancel": (1225, 600, 1465, 702),
    }
    for option in decision_options():
        option_id = option["id"]
        selected = option_id == SELECTED_OPTION_ID
        box = boxes[option_id]
        fill = BRAND if selected else ((239, 224, 228) if option_id == "cancel" else (231, 226, 239))
        text_fill = INK if selected else ((139, 49, 61) if option_id == "cancel" else (66, 56, 82))
        outline = (76, 43, 132) if selected else (207, 197, 220)
        label = f"✓  {option['label']}" if selected else option["label"]
        draw.rounded_rectangle(box, 22, fill=fill, outline=outline, width=4 if selected else 2)
        centered_text(draw, box, label, font(28, True), text_fill)
    draw.text((810, 736), "Seleccionado", font=font(22, True), fill=(82, 47, 138))


def draw_json(canvas: Image.Image, draw: ImageDraw.ImageDraw, scene: dict) -> None:
    box = (425, 365, 1495, 810)
    panel(draw, box, fill=(18, 21, 27), outline=SUCCESS, radius=32, width=3)
    draw.text((485, 425), "Respuesta de AgentDialog", font=font(26, True), fill=(185, 255, 211))
    lines = ["{", '  "kind": "choice",', '  "option_ids": ["renegotiate"]', "}"]
    y = 510
    for line in lines:
        draw.text((510, y), line, font=font(41), fill=INK if "renegotiate" not in line else BRAND_LIGHT)
        y += 64
    draw.rounded_rectangle((515, 730, 1340, 780), 16, fill=(21, 67, 42))
    draw.text((540, 741), "Estructurada · sin interpretación manual", font=font(22, True), fill=(187, 255, 211))


def draw_arrow(draw: ImageDraw.ImageDraw, start: tuple[int, int], end: tuple[int, int], color: tuple[int, int, int]) -> None:
    draw.line((start, end), fill=color, width=6)
    x, y = end
    draw.polygon([(x, y), (x - 20, y - 12), (x - 20, y + 12)], fill=color)


def draw_graph(canvas: Image.Image, draw: ImageDraw.ImageDraw, scene: dict) -> None:
    nodes = {
        "policy": (225, 490, 570, 615),
        "approve": (760, 370, 1130, 485),
        "renegotiate": (760, 535, 1190, 660),
        "cancel": (760, 700, 1130, 815),
        "draft": (1370, 535, 1710, 660),
    }
    for key, box in nodes.items():
        selected = key == "renegotiate"
        final = key == "draft"
        fill = BRAND if selected else ((25, 71, 46) if final else PANEL)
        outline = BRAND_LIGHT if selected else (SUCCESS if final else BORDER)
        panel(draw, box, fill=fill, outline=outline, radius=24, width=4 if selected else 2)
    centered_text(draw, nodes["policy"], "Política", font(30, True))
    centered_text(draw, nodes["approve"], "approve", font(27, True), MUTED)
    centered_text(draw, nodes["renegotiate"], "✓  renegotiate", font(28, True), INK)
    centered_text(draw, nodes["cancel"], "cancel", font(27, True), MUTED)
    centered_text(draw, nodes["draft"], "Borrador ≤ 5 %", font(27, True), (188, 255, 211))
    draw_arrow(draw, (570, 552), (720, 427), (122, 103, 154))
    draw_arrow(draw, (570, 552), (720, 597), BRAND_LIGHT)
    draw_arrow(draw, (570, 552), (720, 757), (122, 103, 154))
    draw_arrow(draw, (1190, 597), (1330, 597), SUCCESS)
    draw.text((765, 685), "rama activa", font=font(22, True), fill=BRAND_LIGHT)


def draw_outro(canvas: Image.Image, draw: ImageDraw.ImageDraw, scene: dict) -> None:
    lines = ["Automatiza las reglas.", "Consulta las decisiones."]
    y = 410
    for index, line in enumerate(lines):
        text_font = font(66, True)
        bounds = draw.textbbox((0, 0), line, font=text_font)
        x = (WIDTH - (bounds[2] - bounds[0])) / 2
        draw.text((x, y), line, font=text_font, fill=INK if index == 0 else BRAND_LIGHT)
        y += 92
    draw.rounded_rectangle((604, 655, 1316, 718), 31, fill=(55, 37, 81), outline=BRAND_LIGHT, width=2)
    centered_text(draw, (604, 655, 1316, 718), "docs.agentdialog.io", font(28, True), INK)


VISUAL_RENDERERS: dict[str, Callable[[Image.Image, ImageDraw.ImageDraw, dict], None]] = {
    "contract": draw_contract,
    "extraction": draw_extraction,
    "threshold": draw_threshold,
    "code": draw_code,
    "decision": draw_decision,
    "json": draw_json,
    "graph": draw_graph,
    "outro": draw_outro,
}


def draw_scene(scene: dict, output: Path) -> None:
    """Render one scene to a 1920 × 1080 PNG."""
    try:
        renderer = VISUAL_RENDERERS[scene["visual"]]
    except KeyError as error:
        raise ValueError(f"No renderer for visual type: {scene.get('visual')}") from error
    canvas = draw_background()
    draw = ImageDraw.Draw(canvas)
    draw_header(draw, scene)
    renderer(canvas, draw, scene)
    draw_caption(canvas, scene)
    output.parent.mkdir(parents=True, exist_ok=True)
    canvas.convert("RGB").save(output, "PNG")


def audio_duration(path: Path) -> float:
    """Read an MP3 duration through macOS afinfo."""
    info = subprocess.check_output(["afinfo", str(path)], text=True)
    match = re.search(r"estimated duration: ([0-9.]+) sec", info)
    if not match:
        raise RuntimeError(f"Could not read duration for {path}")
    return float(match.group(1))


def srt_time(seconds: float) -> str:
    millis = round(seconds * 1000)
    hours, millis = divmod(millis, 3_600_000)
    minutes, millis = divmod(millis, 60_000)
    secs, millis = divmod(millis, 1000)
    return f"{hours:02}:{minutes:02}:{secs:02},{millis:03}"


def voiceover_audio(scene_id: str) -> Path:
    audio = VOICEOVER / f"{scene_id}.mp3"
    if not audio.is_file():
        raise FileNotFoundError(f"Missing ElevenLabs voiceover: {audio}")
    return audio


def build() -> float:
    """Build all slides, subtitles, timeline and poster; return total duration."""
    scenes = json.loads((ROOT / "scenes.json").read_text())
    SLIDES.mkdir(parents=True, exist_ok=True)
    timeline: list[dict] = []
    subtitles: list[str] = []
    cursor = 0.0
    for index, scene in enumerate(scenes, start=1):
        slide = SLIDES / f"{scene['id']}.png"
        audio = voiceover_audio(scene["id"])
        draw_scene(scene, slide)
        spoken = audio_duration(audio)
        duration = spoken + 1.0
        timeline.append({"slide": str(slide), "audio": str(audio), "duration": duration, "audioOffset": 0.45})
        subtitles.append(
            f"{index}\n{srt_time(cursor + 0.45)} --> {srt_time(cursor + spoken + 0.45)}\n{scene['narration']}\n"
        )
        cursor += duration
    if not 80 <= cursor <= 90:
        raise RuntimeError(f"Video duration {cursor:.1f}s is outside the 80–90 second target")
    GENERATED.mkdir(parents=True, exist_ok=True)
    (GENERATED / "timeline.json").write_text(json.dumps(timeline, indent=2) + "\n")
    (GENERATED / "langgraph-contract-renewal.srt").write_text("\n".join(subtitles))
    with Image.open(SLIDES / "00-contract.png") as first_slide:
        first_slide.save(POSTER)
    return cursor


def main() -> None:
    total = build()
    print(f"Built 8 slides; duration {total:.1f}s")


if __name__ == "__main__":
    main()
