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
    {
        "id": "approve",
        "label": "Aprobar",
        "consequence": "Acepta 129.600 €/año durante 12 meses.",
    },
    {
        "id": "renegotiate",
        "label": "Renegociar",
        "consequence": "Propone un máximo de 126.000 €/año antes del 20 de septiembre.",
    },
    {
        "id": "cancel",
        "label": "Cancelar",
        "consequence": "Detiene la renovación y requiere preparar la migración del servicio.",
    },
)
SELECTED_OPTION_ID = "renegotiate"
CODE_TAB_LABEL = "agentdialog-request"
QUERY_SUBJECT_BODY = (
    "CLÁUSULA 12 · RENOVACIÓN: renovación automática por 12 meses "
    "salvo cancelación con 10 días de antelación."
)
QUERY_CONTEXT_LINES = (
    "Proveedor: CloudDesk",
    "Precio actual: 120.000 €/año",
    "Renovación propuesta: 129.600 €/año (+8 %)",
    "Límite interno: 126.000 €/año (+5 %)",
    "Fecha de renovación: 30 de septiembre",
    "Fecha límite de cancelación: 20 de septiembre",
    "Recomendación del agente: renegociar hasta un máximo de 126.000 €/año.",
)
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


def draw_use_case(canvas: Image.Image, draw: ImageDraw.ImageDraw, scene: dict) -> None:
    """Show the business inputs that force LangGraph to pause for judgment."""
    contract = (150, 410, 585, 650)
    policy = (150, 690, 585, 850)
    graph = (750, 515, 1170, 745)
    decision = (1335, 470, 1745, 790)

    panel(draw, contract, fill=(247, 244, 255), outline=BRAND_LIGHT, radius=28, width=3)
    draw.text((190, 445), "CONTRATO", font=font(19, True), fill=(91, 64, 136))
    draw.text((190, 495), "Renovación", font=font(35, True), fill=(40, 31, 56))
    draw.text((190, 548), "Cláusulas · fechas", font=font(24), fill=(91, 80, 108))
    draw.rounded_rectangle((190, 595, 515, 620), 12, fill=(224, 203, 255))

    panel(draw, policy, fill=(28, 50, 40), outline=SUCCESS, radius=28, width=3)
    draw.text((190, 722), "POLÍTICA INTERNA", font=font(18, True), fill=(185, 255, 211))
    draw.text((190, 765), "Límite autorizado", font=font(27, True), fill=INK)
    draw.text((190, 808), "máximo 5 %", font=font(24), fill=(185, 255, 211))

    panel(draw, graph, fill=(35, 27, 49), outline=BRAND_LIGHT, radius=40, width=4)
    draw.text((800, 560), "AGENTE", font=font(19, True), fill=MUTED)
    draw.text((800, 605), "LangGraph", font=font(45, True), fill=INK)
    draw.text((800, 673), "analiza y compara", font=font(24), fill=BRAND_LIGHT)

    draw_arrow(draw, (585, 535), (715, 605), BRAND_LIGHT)
    draw_arrow(draw, (585, 765), (715, 675), SUCCESS)
    draw_arrow(draw, (1170, 630), (1300, 630), WARNING)

    panel(draw, decision, fill=(52, 35, 42), outline=WARNING, radius=36, width=4)
    centered_text(draw, (1380, 500, 1700, 635), "?", font(96, True), (255, 225, 145))
    centered_text(draw, (1370, 635, 1710, 690), "FUERA DEL LÍMITE", font(20, True), WARNING)
    centered_text(draw, (1370, 695, 1710, 760), "Requiere criterio humano", font(22, True), INK)


def draw_agentdialog_intro(canvas: Image.Image, draw: ImageDraw.ImageDraw, scene: dict) -> None:
    """Show AgentDialog bridging the paused graph and the responsible human."""
    agent = (125, 455, 545, 745)
    bridge = (705, 390, 1215, 810)
    human = (1375, 455, 1795, 745)

    panel(draw, agent, fill=(32, 27, 45), outline=BORDER, radius=34, width=3)
    draw.text((175, 500), "AGENTE", font=font(19, True), fill=MUTED)
    draw.text((175, 552), "LangGraph", font=font(39, True), fill=INK)
    draw.rounded_rectangle((175, 635, 490, 685), 18, fill=(65, 48, 87))
    centered_text(draw, (175, 635, 490, 685), "flujo en pausa", font(21, True), BRAND_LIGHT)

    panel(draw, bridge, fill=(46, 29, 67), outline=BRAND_LIGHT, radius=42, width=4)
    draw.rounded_rectangle((810, 430, 1110, 484), 24, fill=BRAND)
    centered_text(draw, (810, 430, 1110, 484), "AgentDialog", font(25, True), INK)
    steps = [
        ("1", "Pregunta estructurada"),
        ("2", "Notificación"),
        ("3", "Respuesta trazable"),
    ]
    y = 535
    for number, label in steps:
        draw.ellipse((785, y - 5, 837, y + 47), fill=(80, 49, 112), outline=BRAND_LIGHT, width=2)
        centered_text(draw, (785, y - 5, 837, y + 47), number, font(19, True), INK)
        draw.text((865, y + 4), label, font=font(24, True), fill=INK)
        y += 78

    panel(draw, human, fill=(247, 244, 255), outline=BRAND_LIGHT, radius=34, width=3)
    draw.text((1425, 500), "RESPONSABLE", font=font(19, True), fill=(96, 76, 123))
    draw.ellipse((1520, 555, 1650, 685), fill=(222, 208, 244))
    draw.ellipse((1557, 573, 1613, 629), fill=(88, 61, 131))
    draw.pieslice((1538, 620, 1632, 704), 180, 360, fill=(88, 61, 131))

    draw_arrow(draw, (545, 585), (670, 585), BRAND_LIGHT)
    draw_arrow(draw, (1215, 585), (1340, 585), BRAND_LIGHT)
    draw_arrow(draw, (1375, 705), (1245, 705), SUCCESS)
    draw_arrow(draw, (705, 705), (575, 705), SUCCESS)
    draw.text((780, 842), "La decisión vuelve al grafo y el proceso continúa", font=font(23, True), fill=(190, 255, 213))


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


def query_payload() -> dict:
    """Return the complete decision-grade request shown by the tutorial."""
    return {
        "query_type": "expert_query",
        "risk": "medium",
        "subject": {
            "id": "clouddesk-contract",
            "label": "Contrato CloudDesk",
            "body": QUERY_SUBJECT_BODY,
        },
        "context": "\n".join(QUERY_CONTEXT_LINES),
        "changes": [{
            "path": "precio_anual",
            "before": "120.000 €/año",
            "after": "129.600 €/año",
            "materiality": "material",
        }],
        "answer_space": {
            "kind": "choice",
            "select": "one",
            "options": decision_options(),
        },
        "question": "¿Aprobamos, renegociamos o cancelamos la renovación de CloudDesk?",
        "target_human_email": "responsable@example.com",
    }


def context_fields(payload: dict) -> dict[str, str]:
    """Index the newline-delimited context sent to AgentDialog."""
    return {
        label: value
        for line in payload["context"].splitlines()
        for label, value in [line.split(": ", 1)]
    }


def compact_date(value: str) -> str:
    """Shorten Spanish September dates for the decision-card layout."""
    return value.replace(" de septiembre", " sep")


def decision_card_text(payload: dict | None = None) -> dict[str, list[str] | dict[str, str]]:
    """Derive the reviewer's visible context and outcomes from the request."""
    request = payload or query_payload()
    fields = context_fields(request)
    change = request["changes"][0]
    return {
        "facts": [
            f"Actual · {change['before']}",
            f"Propuesta · {fields['Renovación propuesta']}",
            f"Límite · {fields['Límite interno']}",
            (
                f"Renueva {compact_date(fields['Fecha de renovación'])} · "
                f"cancelar antes del "
                f"{compact_date(fields['Fecha límite de cancelación'])}"
            ),
        ],
        "consequences": {
            option["id"]: option["consequence"]
            for option in request["answer_space"]["options"]
        },
    }


def context_fact_rows(
    payload: dict | None = None,
) -> list[tuple[str, str, tuple[int, int, int]]]:
    """Derive the visible context panel from the exact AgentDialog request."""
    request = payload or query_payload()
    fields = context_fields(request)
    change = request["changes"][0]
    renewal = compact_date(fields["Fecha de renovación"])
    cancellation = compact_date(fields["Fecha límite de cancelación"])
    return [
        ("PRECIO ACTUAL", change["before"], MUTED),
        ("PROPUESTA", fields["Renovación propuesta"].replace(" (", " · ").rstrip(")"), WARNING),
        ("LÍMITE INTERNO", fields["Límite interno"].replace(" (", " · ").rstrip(")"), SUCCESS),
        ("FECHAS", f"Renueva {renewal} · cancelar {cancellation}", BRAND_LIGHT),
    ]


def recommendation_label(payload: dict | None = None) -> str:
    """Derive the compact recommendation badge from the request context."""
    request = payload or query_payload()
    recommendation = context_fields(request)["Recomendación del agente"]
    action = recommendation.split(maxsplit=1)[0].rstrip(".")
    return f"Recomendación · {action}"


def code_tab_label() -> str:
    """Return the accurate filename displayed above the REST request."""
    return CODE_TAB_LABEL


def code_lines() -> list[tuple[str, tuple[int, int, int]]]:
    lines = json.dumps(query_payload(), ensure_ascii=False, indent=2).splitlines()
    return [("POST https://api.agentdialog.io/api/v1/agent/queries", BRAND_LIGHT)] + [
        (line, BRAND_LIGHT if '"consequence"' in line else INK)
        for line in lines
    ]


def code_preview_lines(
    payload: dict | None = None,
) -> list[tuple[str, tuple[int, int, int]]]:
    """Derive a legible on-screen summary from the exact request payload."""
    request = payload or query_payload()
    body = request["subject"]["body"]
    body_preview = body.split(":", 1)[0] + "…" if ":" in body else body
    change = request["changes"][0]
    space = request["answer_space"]
    labels = " · ".join(option["label"] for option in space["options"])
    return [
        ("POST https://api.agentdialog.io/api/v1/agent/queries", BRAND_LIGHT),
        (f'"risk": "{request["risk"]}"', INK),
        (f'"subject.body": "{body_preview}"', INK),
        (
            f'"changes": "{change["before"]} → {change["after"]} · '
            f'{change["materiality"]}"',
            WARNING,
        ),
        (f'"answer_space": "{space["kind"]} · select {space["select"]}"', INK),
        (f'"options": "{labels}"', BRAND_LIGHT),
        (f'  "target_human_email": "{request["target_human_email"]}"', INK),
    ]

def draw_code(canvas: Image.Image, draw: ImageDraw.ImageDraw, scene: dict) -> None:
    payload = query_payload()
    code_box = (120, 365, 1065, 850)
    panel(draw, code_box, fill=(19, 19, 25), outline=(106, 87, 151), radius=28, width=3)
    draw.rounded_rectangle((120, 365, 1065, 423), 28, fill=(41, 34, 55))
    for x, color in ((157, (245, 113, 113)), (187, WARNING), (217, SUCCESS)):
        draw.ellipse((x, 384, x + 16, 400), fill=color)
    draw.text((270, 378), code_tab_label(), font=font(20, True), fill=MUTED)
    y = 450
    for line, color in code_preview_lines(payload):
        draw.text((160, y), line, font=font(20), fill=color)
        y += 49

    context_box = (1105, 365, 1780, 850)
    panel(draw, context_box, fill=(33, 25, 47), outline=BRAND_LIGHT, radius=28, width=3)
    draw.text((1150, 405), "Contexto enviado", font=font(28, True), fill=INK)
    fact_rows = context_fact_rows(payload)
    y = 475
    for label, value, color in fact_rows:
        draw.text((1150, y), label, font=font(17, True), fill=MUTED)
        draw.text((1150, y + 25), value, font=font(23, True), fill=color)
        y += 77
    draw.rounded_rectangle((1140, 785, 1740, 827), 16, fill=(65, 39, 93))
    centered_text(
        draw,
        (1140, 785, 1740, 827),
        recommendation_label(payload),
        font(19, True),
        INK,
    )


def draw_decision(canvas: Image.Image, draw: ImageDraw.ImageDraw, scene: dict) -> None:
    payload = query_payload()
    visible = decision_card_text(payload)
    card = (240, 335, 1680, 855)
    panel(draw, card, fill=(250, 248, 255), outline=BRAND_LIGHT, radius=34, width=4)
    draw.text((295, 370), "Renovación CloudDesk", font=font(36, True), fill=(40, 31, 56))
    draw.text((295, 418), "Cláusula 12 · decisión antes del 20 de septiembre", font=font(23), fill=(82, 72, 99))
    fact_boxes = [
        (280, 465, 935, 525),
        (985, 465, 1640, 525),
        (280, 540, 935, 600),
        (985, 540, 1640, 600),
    ]
    for box, fact in zip(fact_boxes, visible["facts"], strict=True):
        draw.rounded_rectangle(box, 15, fill=(238, 233, 247), outline=(210, 199, 224), width=2)
        centered_text(draw, box, fact, font(20, True), (64, 52, 82))
    boxes = {
        "approve": (280, 625, 700, 760),
        "renegotiate": (750, 625, 1170, 760),
        "cancel": (1220, 625, 1640, 760),
    }
    for option in payload["answer_space"]["options"]:
        option_id = option["id"]
        selected = option_id == SELECTED_OPTION_ID
        box = boxes[option_id]
        fill = BRAND if selected else ((239, 224, 228) if option_id == "cancel" else (231, 226, 239))
        text_fill = INK if selected else ((139, 49, 61) if option_id == "cancel" else (66, 56, 82))
        outline = (76, 43, 132) if selected else (207, 197, 220)
        label = f"✓  {option['label']}" if selected else option["label"]
        draw.rounded_rectangle(box, 22, fill=fill, outline=outline, width=4 if selected else 2)
        centered_text(draw, (box[0], box[1] + 10, box[2], box[1] + 66), label, font(25, True), text_fill)
        consequence = visible["consequences"][option_id]
        consequence_font = font(14, True)
        consequence_lines = wrapped_lines(
            draw,
            consequence,
            consequence_font,
            box[2] - box[0] - 36,
        )
        for index, line in enumerate(consequence_lines[:3]):
            centered_text(
                draw,
                (
                    box[0] + 14,
                    box[1] + 66 + index * 20,
                    box[2] - 14,
                    box[1] + 88 + index * 20,
                ),
                line,
                consequence_font,
                text_fill,
            )
    draw.text((797, 785), "✓ Seleccionado por la responsable", font=font(19, True), fill=(82, 47, 138))


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
    "use_case": draw_use_case,
    "agentdialog": draw_agentdialog_intro,
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
    if not 105 <= cursor <= 125:
        raise RuntimeError(f"Video duration {cursor:.1f}s is outside the 105–125 second target")
    GENERATED.mkdir(parents=True, exist_ok=True)
    (GENERATED / "timeline.json").write_text(json.dumps(timeline, indent=2) + "\n")
    (GENERATED / "langgraph-contract-renewal.srt").write_text("\n".join(subtitles))
    with Image.open(SLIDES / f"{scenes[0]['id']}.png") as first_slide:
        first_slide.save(POSTER)
    return cursor


def main() -> None:
    total = build()
    scene_count = len(json.loads((ROOT / "scenes.json").read_text()))
    print(f"Built {scene_count} slides; duration {total:.1f}s")


if __name__ == "__main__":
    main()
