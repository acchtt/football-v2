#!/usr/bin/env python3
r"""Build the four finished IVE editorial artwork assets.

The source photographs are real, local photographs. This script performs only
deterministic layout, masking, colour grading, typography, and texture work.
It never generates, reconstructs, or replaces a face.

Run with the bundled Codex Python runtime (Pillow is preinstalled there):

    C:\Users\<user>\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe scripts\build-ive-artwork.py
"""

from __future__ import annotations

import math
import random
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageFilter, ImageFont, ImageOps


ROOT = Path(__file__).resolve().parents[1]
MEDIA = ROOT / "pages" / "media" / "ive"
SOURCES = MEDIA / "sources"
FONTS = Path("C:/Windows/Fonts")
RNG = random.Random(1106)

FONT_SERIF = FONTS / "georgia.ttf"
FONT_SERIF_BOLD = FONTS / "georgiab.ttf"
FONT_SERIF_ITALIC = FONTS / "georgiai.ttf"
FONT_SANS = FONTS / "arial.ttf"
FONT_SANS_BOLD = FONTS / "arialbd.ttf"
FONT_SCRIPT = FONTS / "segoesc.ttf"
FONT_SCRIPT_BOLD = FONTS / "segoescb.ttf"


def font(path: Path, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(path), size=size)


def rgba(hex_value: str, alpha: int = 255) -> tuple[int, int, int, int]:
    value = hex_value.lstrip("#")
    return tuple(int(value[i : i + 2], 16) for i in (0, 2, 4)) + (alpha,)


def vertical_gradient(size: tuple[int, int], stops: list[tuple[float, str]]) -> Image.Image:
    width, height = size
    out = Image.new("RGBA", size)
    px = out.load()
    stops = sorted(stops)
    for y in range(height):
        t = y / max(1, height - 1)
        left = stops[0]
        right = stops[-1]
        for index in range(len(stops) - 1):
            if stops[index][0] <= t <= stops[index + 1][0]:
                left, right = stops[index], stops[index + 1]
                break
        span = max(0.0001, right[0] - left[0])
        local = (t - left[0]) / span
        ca, cb = rgba(left[1]), rgba(right[1])
        color = tuple(round(ca[i] * (1 - local) + cb[i] * local) for i in range(4))
        for x in range(width):
            px[x, y] = color
    return out


def add_glow(canvas: Image.Image, box: tuple[int, int, int, int], color: str, alpha: int, blur: int) -> None:
    layer = Image.new("RGBA", canvas.size)
    ImageDraw.Draw(layer).ellipse(box, fill=rgba(color, alpha))
    canvas.alpha_composite(layer.filter(ImageFilter.GaussianBlur(blur)))


def add_grain(canvas: Image.Image, opacity: float = 0.045, sigma: float = 26.0) -> None:
    noise = Image.effect_noise(canvas.size, sigma).convert("L")
    grain = ImageOps.colorize(noise, black="#1a101c", white="#fff4fb").convert("RGBA")
    grain.putalpha(round(255 * opacity))
    canvas.alpha_composite(grain)


def cover(image: Image.Image, size: tuple[int, int], centering: tuple[float, float] = (0.5, 0.5)) -> Image.Image:
    return ImageOps.fit(image.convert("RGB"), size, Image.Resampling.LANCZOS, centering=centering).convert("RGBA")


def contain(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    copy = image.copy().convert("RGBA")
    copy.thumbnail(size, Image.Resampling.LANCZOS)
    return copy


def grade(image: Image.Image, color: float = 0.94, contrast: float = 1.06, brightness: float = 0.96) -> Image.Image:
    rgb = image.convert("RGB")
    rgb = ImageEnhance.Color(rgb).enhance(color)
    rgb = ImageEnhance.Contrast(rgb).enhance(contrast)
    rgb = ImageEnhance.Brightness(rgb).enhance(brightness)
    return rgb.convert("RGBA")


def soft_polygon_mask(size: tuple[int, int], points: list[tuple[int, int]], blur: int = 18) -> Image.Image:
    mask = Image.new("L", size)
    ImageDraw.Draw(mask).polygon(points, fill=255)
    return mask.filter(ImageFilter.GaussianBlur(blur))


def arch_mask(size: tuple[int, int], inset: int = 80, top: int = 90, bottom: int | None = None) -> Image.Image:
    width, height = size
    bottom = bottom or height - 80
    mask = Image.new("L", size)
    draw = ImageDraw.Draw(mask)
    draw.rounded_rectangle((inset, top, width - inset, bottom), radius=(width - inset * 2) // 2, fill=255)
    draw.rectangle((inset, top + (width - inset * 2) // 2, width - inset, bottom), fill=255)
    return mask.filter(ImageFilter.GaussianBlur(10))


def paste_masked(canvas: Image.Image, image: Image.Image, mask: Image.Image, xy: tuple[int, int] = (0, 0)) -> None:
    layer = Image.new("RGBA", canvas.size)
    if image.size == canvas.size and xy == (0, 0):
        layer = image.copy()
    else:
        layer.alpha_composite(image, xy)
    alpha = Image.new("L", canvas.size)
    alpha.paste(mask, xy if mask.size != canvas.size else (0, 0))
    layer.putalpha(ImageChops.multiply(layer.getchannel("A"), alpha))
    canvas.alpha_composite(layer)


def text_tracking(
    draw: ImageDraw.ImageDraw,
    xy: tuple[int, int],
    value: str,
    face: ImageFont.FreeTypeFont,
    fill: tuple[int, int, int, int],
    spacing: int,
    anchor: str = "la",
) -> None:
    x, y = xy
    lengths = [draw.textlength(char, font=face) for char in value]
    total = sum(lengths) + spacing * max(0, len(value) - 1)
    if anchor.startswith("m"):
        x -= total / 2
    elif anchor.startswith("r"):
        x -= total
    for char, length in zip(value, lengths):
        draw.text((round(x), y), char, font=face, fill=fill, anchor="la")
        x += length + spacing


def star(draw: ImageDraw.ImageDraw, center: tuple[int, int], radius: int, color: tuple[int, int, int, int], points: int = 4) -> None:
    cx, cy = center
    coords: list[tuple[float, float]] = []
    for i in range(points * 2):
        angle = -math.pi / 2 + i * math.pi / points
        r = radius if i % 2 == 0 else max(1, radius * 0.13)
        coords.append((cx + math.cos(angle) * r, cy + math.sin(angle) * r))
    draw.polygon(coords, fill=color)


def heart(draw: ImageDraw.ImageDraw, center: tuple[int, int], scale: int, color: tuple[int, int, int, int], width: int = 3) -> None:
    cx, cy = center
    pts = []
    for i in range(101):
        t = math.pi * 2 * i / 100
        x = 16 * math.sin(t) ** 3
        y = 13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)
        pts.append((cx + x * scale / 32, cy - y * scale / 32))
    draw.line(pts, fill=color, width=width, joint="curve")


def halftone(draw: ImageDraw.ImageDraw, origin: tuple[int, int], cols: int, rows: int, step: int, color: str, max_alpha: int = 100) -> None:
    ox, oy = origin
    for row in range(rows):
        for col in range(cols):
            falloff = 1 - ((row / max(1, rows - 1)) * 0.55 + (col / max(1, cols - 1)) * 0.35)
            radius = max(1, round(step * 0.15 * falloff))
            alpha = max(8, round(max_alpha * falloff))
            x = ox + col * step
            y = oy + row * step
            draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=rgba(color, alpha))


def frame_marks(draw: ImageDraw.ImageDraw, size: tuple[int, int], color: tuple[int, int, int, int], margin: int = 58, arm: int = 88, width: int = 3) -> None:
    w, h = size
    for sx, sy in ((margin, margin), (w - margin, margin), (margin, h - margin), (w - margin, h - margin)):
        dx = arm if sx < w / 2 else -arm
        dy = arm if sy < h / 2 else -arm
        draw.line((sx, sy, sx + dx, sy), fill=color, width=width)
        draw.line((sx, sy, sx, sy + dy), fill=color, width=width)


def save_webp(canvas: Image.Image, filename: str, quality: int = 94) -> None:
    target = MEDIA / filename
    canvas.convert("RGB").save(target, "WEBP", quality=quality, method=6)
    print(f"wrote {target.relative_to(ROOT)} {canvas.width}x{canvas.height} ({target.stat().st_size:,} bytes)")


def build_wonyoung() -> None:
    size = (1400, 2100)
    canvas = vertical_gradient(size, [(0, "#10080f"), (0.42, "#321326"), (0.74, "#160b16"), (1, "#07080d")])
    add_glow(canvas, (-330, 50, 820, 1300), "#b7377b", 120, 150)
    add_glow(canvas, (780, 980, 1730, 2230), "#6d3e8e", 110, 165)
    back = Image.new("RGBA", size)
    bd = ImageDraw.Draw(back)
    bd.polygon([(0, 270), (1060, 0), (1400, 0), (1400, 235), (0, 650)], fill=rgba("#f09ac6", 22))
    bd.polygon([(0, 1530), (1400, 1110), (1400, 1480), (0, 1890)], fill=rgba("#7b2d65", 64))
    bd.ellipse((810, 180, 1490, 860), outline=rgba("#f6b5d5", 68), width=5)
    bd.ellipse((890, 265, 1550, 925), outline=rgba("#8f699d", 48), width=2)
    for x in (92, 112, 132):
        bd.line((x, 250, x, 1290), fill=rgba("#f7c4dd", 44), width=2)
    halftone(bd, (1010, 90), 10, 17, 27, "#f8c0dc", 62)
    canvas.alpha_composite(back)

    photo_source = Image.open(MEDIA / "portraits" / "wonyoung.webp")
    photo = cover(photo_source, size, (0.5, 0.43))
    photo = grade(photo, color=0.86, contrast=1.08, brightness=0.89)
    tint = Image.new("RGBA", size, rgba("#9b295f", 25))
    photo = Image.alpha_composite(photo, tint)
    mask = soft_polygon_mask(size, [(90, 300), (1180, 165), (1370, 460), (1328, 1805), (1080, 2000), (80, 1720)], 28)
    edge_fade = Image.new("L", size)
    ed = ImageDraw.Draw(edge_fade)
    ed.rectangle((0, 0, 1400, 1810), fill=255)
    edge_fade = edge_fade.filter(ImageFilter.GaussianBlur(80))
    mask = ImageChops.multiply(mask, edge_fade)
    paste_masked(canvas, photo, mask)

    foreground = Image.new("RGBA", size)
    d = ImageDraw.Draw(foreground)
    d.rectangle((0, 0, 1400, 208), fill=rgba("#09070b", 164))
    d.line((72, 209, 1328, 209), fill=rgba("#f4b3d3", 145), width=2)
    d.polygon([(0, 1660), (1400, 1375), (1400, 2100), (0, 2100)], fill=rgba("#100912", 218))
    d.polygon([(1020, 0), (1400, 0), (1400, 820), (1270, 930)], fill=rgba("#100912", 80))
    d.line((1120, 290, 1300, 1380), fill=rgba("#f6bed9", 92), width=3)
    d.line((1140, 290, 1320, 1380), fill=rgba("#f6bed9", 36), width=1)
    frame_marks(d, size, rgba("#f7d9e8", 120), margin=48, arm=70, width=2)
    for center, radius in [((112, 400), 15), ((1230, 1090), 25), ((1178, 1160), 9), ((210, 1450), 18), ((1260, 1530), 13)]:
        star(d, center, radius, rgba("#fff0f8", 210))
    d.ellipse((109, 397, 115, 403), fill=rgba("#ffffff"))

    text_tracking(d, (700, 74), "IVE", font(FONT_SERIF_BOLD, 112), rgba("#fff4f8"), 9, anchor="ma")
    text_tracking(d, (1324, 85), "VOL. 11 / MATCH CULTURE", font(FONT_SANS_BOLD, 18), rgba("#eab2cf", 220), 4, anchor="ra")
    text_tracking(d, (1324, 140), "REAL FACES · ORIGINAL GAME", font(FONT_SANS, 15), rgba("#d99ab9", 190), 3, anchor="ra")

    vertical_layer = Image.new("RGBA", (250, 1120))
    vd = ImageDraw.Draw(vertical_layer)
    vd.text((10, 0), "W\nO\nN\nY\nO\nU\nN\nG", font=font(FONT_SANS_BOLD, 116), fill=rgba("#ffd3e7", 52), spacing=-5)
    canvas.alpha_composite(vertical_layer, (1136, 255))

    d = ImageDraw.Draw(foreground)
    d.text((700, 1575), "Wonyoung", font=font(FONT_SCRIPT, 52), fill=rgba("#ffe8f3", 235), anchor="mm", stroke_width=1, stroke_fill=rgba("#6d264d", 150))
    d.line((335, 1633, 965, 1633), fill=rgba("#f8c4dc", 90), width=2)
    text_tracking(d, (700, 1778), "FOR A", font(FONT_SANS_BOLD, 28), rgba("#e7a7c6"), 7, anchor="ma")
    d.text((700, 1820), "BIGGER", font=font(FONT_SERIF_BOLD, 76), fill=rgba("#fff5fa"), anchor="ma")
    d.text((700, 1902), "TOMORROW", font=font(FONT_SERIF_BOLD, 58), fill=rgba("#fff5fa"), anchor="ma")
    text_tracking(d, (1324, 1810), "FOOTBALL / ART / IVE", font(FONT_SANS_BOLD, 16), rgba("#e6b2cc"), 4, anchor="ra")
    text_tracking(d, (1324, 1870), "A BRIGHTER GAME", font(FONT_SANS, 16), rgba("#b97799"), 4, anchor="ra")
    d.line((1080, 1925, 1324, 1925), fill=rgba("#f2b6d2", 100), width=2)
    text_tracking(d, (1324, 1956), "SEOUL — 20:26", font(FONT_SANS, 14), rgba("#c990ab"), 3, anchor="ra")
    heart(d, (1228, 1690), 84, rgba("#fbd2e5", 150), width=4)
    canvas.alpha_composite(foreground)
    add_grain(canvas, 0.055, 24)
    save_webp(canvas, "wonyoung-left-art.webp")


def build_right() -> None:
    size = (1400, 2100)
    canvas = vertical_gradient(size, [(0, "#cfd7f6"), (0.33, "#aa91c7"), (0.67, "#8d659d"), (1, "#1a1734")])
    source = Image.open(SOURCES / "ive-group-portrait.jpg")
    blurred = cover(source, size, (0.5, 0.48)).filter(ImageFilter.GaussianBlur(46))
    blurred = grade(blurred, color=0.72, contrast=0.78, brightness=0.78)
    blurred.putalpha(110)
    canvas.alpha_composite(blurred)
    add_glow(canvas, (-230, -220, 950, 960), "#fff8ff", 180, 150)
    add_glow(canvas, (700, 980, 1680, 2100), "#8e7fff", 100, 160)

    back = Image.new("RGBA", size)
    bd = ImageDraw.Draw(back)
    bd.text((700, 40), "IVE", font=font(FONT_SERIF_BOLD, 360), fill=rgba("#ffffff", 48), anchor="ma")
    bd.ellipse((110, 260, 1290, 1480), outline=rgba("#f9f2ff", 100), width=5)
    bd.ellipse((168, 318, 1232, 1422), outline=rgba("#d7c1ff", 62), width=2)
    bd.polygon([(0, 470), (1400, 140), (1400, 450), (0, 790)], fill=rgba("#ffffff", 34))
    bd.polygon([(0, 1420), (1400, 1120), (1400, 1410), (0, 1710)], fill=rgba("#bcd4ff", 30))
    halftone(bd, (80, 740), 9, 18, 28, "#ffffff", 82)
    canvas.alpha_composite(back)

    photo = cover(source, size, (0.5, 0.49))
    photo = grade(photo, color=0.9, contrast=1.05, brightness=0.96)
    mask = arch_mask(size, inset=110, top=225, bottom=1785)
    paste_masked(canvas, photo, mask)

    fg = Image.new("RGBA", size)
    d = ImageDraw.Draw(fg)
    d.rectangle((0, 0, 1400, 184), fill=rgba("#20172f", 105))
    d.line((62, 185, 1338, 185), fill=rgba("#ffffff", 150), width=2)
    d.polygon([(0, 1490), (1400, 1270), (1400, 2100), (0, 2100)], fill=rgba("#17132c", 210))
    d.polygon([(0, 1840), (1400, 1590), (1400, 1760), (0, 2015)], fill=rgba("#dd9cd4", 42))
    frame_marks(d, size, rgba("#ffffff", 160), margin=48, arm=68, width=2)
    text_tracking(d, (70, 62), "IVE / SIX VOICES", font(FONT_SANS_BOLD, 22), rgba("#ffffff"), 6)
    text_tracking(d, (1330, 72), "FOOTBALL CULTURE  /  02", font(FONT_SANS, 17), rgba("#f4e9ff", 220), 4, anchor="ra")
    d.text((700, 1555), "Always more", font=font(FONT_SCRIPT_BOLD, 58), fill=rgba("#fffaff"), anchor="mm")
    d.text((700, 1630), "than a game", font=font(FONT_SCRIPT_BOLD, 58), fill=rgba("#fffaff"), anchor="mm")
    heart(d, (955, 1596), 64, rgba("#ffd8ef", 230), width=4)
    text_tracking(d, (700, 1762), "IVE × FOOTBALL", font(FONT_SERIF_BOLD, 33), rgba("#f6e8ff"), 5, anchor="ma")
    d.line((330, 1844, 1070, 1844), fill=rgba("#e7cfff", 125), width=2)
    text_tracking(d, (700, 1890), "GOOD PEOPLE · GREAT MATCHES · BRIGHTER DAYS", font(FONT_SANS_BOLD, 16), rgba("#ccbfe0"), 4, anchor="ma")
    for center, radius in [((124, 320), 24), ((1232, 430), 14), ((1170, 1040), 23), ((250, 1390), 11), ((1280, 1360), 18)]:
        star(d, center, radius, rgba("#ffffff", 210))
    d.arc((80, 1080, 620, 1680), 220, 32, fill=rgba("#f6d7f0", 110), width=5)
    d.arc((820, 730, 1360, 1330), 42, 210, fill=rgba("#cbd9ff", 100), width=4)
    canvas.alpha_composite(fg)
    add_grain(canvas, 0.045, 20)
    save_webp(canvas, "ive-right-art.webp")


def build_hero() -> None:
    size = (2400, 900)
    canvas = vertical_gradient(size, [(0, "#100c14"), (0.58, "#28142b"), (1, "#090b12")])
    add_glow(canvas, (1020, -440, 2520, 1050), "#b44689", 100, 180)
    add_glow(canvas, (1500, 180, 2600, 1220), "#705bb4", 75, 170)

    back = Image.new("RGBA", size)
    bd = ImageDraw.Draw(back)
    bd.text((1040, 120), "XI", font=font(FONT_SERIF_BOLD, 650), fill=rgba("#eda6c9", 30), anchor="ma")
    bd.ellipse((1010, -220, 2240, 1010), outline=rgba("#f3b0d0", 62), width=4)
    bd.ellipse((1120, -110, 2130, 900), outline=rgba("#bba0d9", 48), width=2)
    bd.polygon([(0, 640), (1510, 50), (1680, 210), (210, 900), (0, 900)], fill=rgba("#9b3d76", 28))
    halftone(bd, (95, 90), 15, 18, 26, "#e69abc", 58)
    canvas.alpha_composite(back)

    source = Image.open(SOURCES / "ive-group-wide.jpg")
    photo = cover(source, (1650, 930), (0.5, 0.47))
    photo = grade(photo, color=0.86, contrast=1.08, brightness=0.88)
    photo_layer = Image.new("RGBA", size)
    photo_layer.alpha_composite(photo, (790, -15))
    mask = Image.new("L", size)
    md = ImageDraw.Draw(mask)
    md.polygon([(710, 0), (2400, 0), (2400, 900), (620, 900), (860, 675), (690, 440)], fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(20))
    fade = Image.linear_gradient("L").resize((650, 900)).rotate(90, expand=True).crop((0, 0, 650, 900))
    mask.paste(ImageChops.multiply(mask.crop((620, 0, 1270, 900)), fade), (620, 0))
    photo_layer.putalpha(mask)
    canvas.alpha_composite(photo_layer)

    fg = Image.new("RGBA", size)
    d = ImageDraw.Draw(fg)
    d.polygon([(0, 0), (1030, 0), (755, 900), (0, 900)], fill=rgba("#0b0910", 190))
    d.line((1030, 0, 755, 900), fill=rgba("#f5bad6", 112), width=3)
    d.line((1065, 0, 790, 900), fill=rgba("#f5bad6", 35), width=1)
    d.rectangle((0, 0, 2400, 56), fill=rgba("#07080c", 150))
    d.rectangle((0, 844, 2400, 900), fill=rgba("#07080c", 185))
    text_tracking(d, (65, 17), "SLATE XI  /  IVE  /  MATCHDAY EDITION", font(FONT_SANS_BOLD, 17), rgba("#f7d8e7"), 5)
    text_tracking(d, (2335, 18), "REAL-TIME FOOTBALL CULTURE", font(FONT_SANS, 15), rgba("#d39db9"), 4, anchor="ra")
    d.text((77, 144), "MATCHDAY", font=font(FONT_SERIF_BOLD, 108), fill=rgba("#fff6fa", 92))
    d.text((77, 245), "BOARD", font=font(FONT_SERIF_BOLD, 108), fill=rgba("#fff6fa", 92))
    text_tracking(d, (84, 385), "LIVE DATA · HUMAN JUDGEMENT", font(FONT_SANS_BOLD, 18), rgba("#e6a9c6", 176), 5)
    d.line((80, 432, 590, 432), fill=rgba("#e5a3c3", 90), width=2)
    d.text((2060, 650), "Football", font=font(FONT_SCRIPT_BOLD, 58), fill=rgba("#fff3fa", 218), anchor="ma")
    text_tracking(d, (2060, 723), "V2 / MATCH CULTURE", font(FONT_SANS_BOLD, 18), rgba("#f0bad4", 220), 6, anchor="ma")
    for center, radius in [((720, 120), 14), ((1110, 100), 20), ((2260, 165), 15), ((2170, 760), 9), ((1580, 805), 13)]:
        star(d, center, radius, rgba("#fff0f8", 205))
    d.arc((1720, 70, 2340, 690), 275, 92, fill=rgba("#ffc8df", 120), width=4)
    frame_marks(d, size, rgba("#f5d4e3", 105), margin=30, arm=48, width=2)
    canvas.alpha_composite(fg)
    add_grain(canvas, 0.045, 22)
    save_webp(canvas, "matchday-hero-art.webp", 93)


def build_feature() -> None:
    size = (1200, 800)
    canvas = vertical_gradient(size, [(0, "#120c16"), (0.58, "#322039"), (1, "#0b0d14")])
    source = Image.open(SOURCES / "ive-group-black.jpeg")
    blurred = cover(source, size, (0.5, 0.46)).filter(ImageFilter.GaussianBlur(32))
    blurred = grade(blurred, color=0.8, contrast=0.9, brightness=0.66)
    blurred.putalpha(145)
    canvas.alpha_composite(blurred)
    add_glow(canvas, (600, -260, 1350, 620), "#d36ca8", 105, 115)

    back = Image.new("RGBA", size)
    bd = ImageDraw.Draw(back)
    bd.text((1160, -30), "IVE", font=font(FONT_SERIF_BOLD, 270), fill=rgba("#f2aacb", 42), anchor="ra")
    bd.polygon([(0, 110), (1200, 0), (1200, 175), (0, 285)], fill=rgba("#f1a8cc", 32))
    halftone(bd, (60, 300), 9, 12, 22, "#f8d4e5", 65)
    canvas.alpha_composite(back)

    photo = cover(source, (900, 600), (0.5, 0.45))
    photo = grade(photo, color=0.9, contrast=1.12, brightness=0.94)
    mask = soft_polygon_mask((900, 600), [(25, 10), (900, 0), (850, 600), (0, 580)], 12)
    shadow = Image.new("RGBA", size)
    sd = ImageDraw.Draw(shadow)
    sd.polygon([(230, 102), (1150, 66), (1070, 692), (168, 704)], fill=rgba("#000000", 150))
    shadow = shadow.filter(ImageFilter.GaussianBlur(24))
    canvas.alpha_composite(shadow)
    paste_masked(canvas, photo, mask, (190, 80))

    fg = Image.new("RGBA", size)
    d = ImageDraw.Draw(fg)
    d.rectangle((0, 0, 165, 800), fill=rgba("#110b14", 235))
    d.rectangle((0, 0, 1200, 72), fill=rgba("#0a0910", 190))
    d.rectangle((0, 665, 1200, 800), fill=rgba("#0b0911", 230))
    d.polygon([(870, 0), (1200, 0), (1200, 800), (1080, 800)], fill=rgba("#9d4777", 48))
    frame_marks(d, size, rgba("#f2c5d9", 145), margin=28, arm=50, width=2)
    text_tracking(d, (38, 30), "FEATURED / 06", font(FONT_SANS_BOLD, 18), rgba("#fff1f8"), 5)
    d.text((80, 150), "I\nV\nE", font=font(FONT_SERIF_BOLD, 70), fill=rgba("#f5c2da"), spacing=-10, anchor="ma")
    d.text((80, 420), "F\nO\nO\nT\nB\nA\nL\nL", font=font(FONT_SANS_BOLD, 18), fill=rgba("#bca4b5", 210), spacing=6, anchor="ma")
    d.text((205, 675), "IVE × FOOTBALL", font=font(FONT_SERIF_BOLD, 48), fill=rgba("#fff5fa"))
    text_tracking(d, (1145, 735), "DIFFERENT STAGES · SAME WINNING MINDSET", font(FONT_SANS_BOLD, 15), rgba("#dfaac5"), 4, anchor="ra")
    d.line((210, 775, 1145, 775), fill=rgba("#e9b7cf", 88), width=2)
    for center, radius in [((195, 105), 10), ((1060, 110), 15), ((1110, 600), 10), ((255, 620), 12)]:
        star(d, center, radius, rgba("#fff0f8", 220))
    canvas.alpha_composite(fg)
    add_grain(canvas, 0.055, 23)
    save_webp(canvas, "ive-feature-art.webp", 94)


def main() -> None:
    required = [
        MEDIA / "portraits" / "wonyoung.webp",
        SOURCES / "ive-group-wide.jpg",
        SOURCES / "ive-group-portrait.jpg",
        SOURCES / "ive-group-black.jpeg",
    ]
    missing = [str(path) for path in required if not path.exists()]
    if missing:
        raise SystemExit("Missing source assets:\n" + "\n".join(missing))
    for path in (FONT_SERIF, FONT_SERIF_BOLD, FONT_SANS, FONT_SANS_BOLD, FONT_SCRIPT_BOLD):
        if not path.exists():
            raise SystemExit(f"Missing required font: {path}")

    build_wonyoung()
    build_right()
    build_hero()
    build_feature()


if __name__ == "__main__":
    main()
