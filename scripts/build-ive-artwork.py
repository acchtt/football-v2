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
    """Build the left rail at the rail's real tall/narrow aspect ratio.

    The previous asset was 1400x2100, so CSS object-fit:cover had to crop most
    of the portrait horizontally. That produced the giant-face/blurry look.
    This canvas intentionally matches the actual desktop rail instead.
    """
    size = (560, 2100)
    canvas = vertical_gradient(
        size,
        [(0, "#10080f"), (0.34, "#29111f"), (0.69, "#1b0c18"), (1, "#08080d")],
    )
    add_glow(canvas, (-250, 40, 650, 980), "#b94783", 92, 125)
    add_glow(canvas, (170, 1080, 860, 1990), "#65458d", 70, 145)

    back = Image.new("RGBA", size)
    bd = ImageDraw.Draw(back)
    bd.text((280, 10), "IVE", font=font(FONT_SERIF_BOLD, 186), fill=rgba("#f9e9f1", 28), anchor="ma")
    bd.polygon([(0, 250), (560, 100), (560, 270), (0, 430)], fill=rgba("#f0a5c8", 20))
    bd.polygon([(0, 1410), (560, 1240), (560, 1540), (0, 1710)], fill=rgba("#7b315e", 38))
    bd.line((34, 220, 526, 220), fill=rgba("#efb0ce", 92), width=2)
    bd.line((34, 1508, 526, 1508), fill=rgba("#efb0ce", 76), width=2)
    for center, radius in [((54, 330), 12), ((500, 390), 8), ((485, 1160), 15), ((72, 1320), 9)]:
        star(bd, center, radius, rgba("#fff0f8", 185))
    canvas.alpha_composite(back)

    # Keep the real portrait near native resolution. 720x1280 -> 520x1210
    # requires essentially no enlargement, so facial detail stays sharp.
    source = Image.open(MEDIA / "portraits" / "wonyoung.webp")
    photo = cover(source, (520, 1210), (0.50, 0.39))
    photo = grade(photo, color=0.94, contrast=1.04, brightness=0.96)

    mask = Image.new("L", photo.size, 0)
    md = ImageDraw.Draw(mask)
    md.rounded_rectangle((0, 0, photo.width, photo.height), radius=26, fill=255)
    # Feather only the bottom edge into the poster, never the face.
    fade = Image.new("L", photo.size, 255)
    fd = ImageDraw.Draw(fade)
    fade_start = 1010
    for y in range(fade_start, photo.height):
        a = round(255 * (1 - (y - fade_start) / max(1, photo.height - fade_start)))
        fd.line((0, y, photo.width, y), fill=max(0, a))
    mask = ImageChops.multiply(mask, fade)

    shadow = Image.new("RGBA", size)
    sd = ImageDraw.Draw(shadow)
    sd.rounded_rectangle((28, 262, 548, 1480), radius=30, fill=rgba("#000000", 120))
    shadow = shadow.filter(ImageFilter.GaussianBlur(28))
    canvas.alpha_composite(shadow)
    paste_masked(canvas, photo, mask, (20, 250))

    fg = Image.new("RGBA", size)
    d = ImageDraw.Draw(fg)

    # Edge grading keeps text readable without painting over the face.
    side = Image.new("RGBA", size)
    sp = side.load()
    for x in range(size[0]):
        edge = min(x, size[0] - 1 - x)
        a = int(max(0, 78 * (1 - edge / 125)))
        for y in range(235, 1480):
            sp[x, y] = (10, 7, 12, a)
    fg = Image.alpha_composite(fg, side)
    d = ImageDraw.Draw(fg)

    # Top identity area.
    text_tracking(d, (280, 50), "IVE", font(FONT_SERIF_BOLD, 98), rgba("#fff2f8"), 7, anchor="ma")
    d.text((34, 155), "Same Passion,", font=font(FONT_SERIF_ITALIC, 28), fill=rgba("#f8d7e6"))
    d.text((34, 188), "Different Stadiums.", font=font(FONT_SERIF_ITALIC, 28), fill=rgba("#f8d7e6"))
    text_tracking(d, (526, 168), "FOOTBALL V2", font(FONT_SANS_BOLD, 12), rgba("#d894b5", 215), 3, anchor="ra")

    # Editorial labels around, not across, the portrait.
    text_tracking(d, (36, 292), "MUSIC CONNECTS PEOPLE", font(FONT_SANS_BOLD, 11), rgba("#f0b6d1", 190), 3)
    text_tracking(d, (36, 317), "FOOTBALL DOES TOO", font(FONT_SANS, 11), rgba("#c887a7", 180), 3)
    d.text((529, 470), "W\nO\nN\nY\nO\nU\nN\nG", font=font(FONT_SANS_BOLD, 16), fill=rgba("#f4bad5", 135), spacing=4, anchor="ra")

    # Signature and clean lower poster block.
    d.text((280, 1432), "Wonyoung", font=font(FONT_SCRIPT_BOLD, 44), fill=rgba("#ffe7f3"), anchor="mm")
    d.line((118, 1492, 442, 1492), fill=rgba("#f3b4d1", 92), width=2)
    d.polygon([(0, 1535), (560, 1440), (560, 2100), (0, 2100)], fill=rgba("#0b0910", 228))
    d.polygon([(0, 1705), (560, 1600), (560, 1735), (0, 1840)], fill=rgba("#a34c7b", 28))

    text_tracking(d, (280, 1608), "IVE / FOOTBALL", font(FONT_SANS_BOLD, 13), rgba("#d9a4be", 215), 4, anchor="ma")
    text_tracking(d, (280, 1700), "FOR A", font(FONT_SANS_BOLD, 23), rgba("#e6a9c5"), 7, anchor="ma")
    d.text((280, 1754), "BIGGER", font=font(FONT_SERIF_BOLD, 56), fill=rgba("#fff5fa"), anchor="ma")
    d.text((280, 1824), "TOMORROW", font=font(FONT_SERIF_BOLD, 45), fill=rgba("#fff5fa"), anchor="ma")
    text_tracking(d, (280, 1940), "A BRIGHTER GAME", font(FONT_SANS_BOLD, 12), rgba("#ba809d", 220), 4, anchor="ma")
    d.line((150, 1990, 410, 1990), fill=rgba("#e5a7c3", 72), width=2)
    heart(d, (472, 1650), 55, rgba("#f5c8dc", 175), width=3)

    frame_marks(d, size, rgba("#f3c6da", 80), margin=24, arm=38, width=2)
    canvas.alpha_composite(fg)
    add_grain(canvas, 0.032, 18)
    save_webp(canvas, "wonyoung-left-art.webp", 96)

def build_right() -> None:
    """Build the right rail without zooming/cutting the real group photo."""
    size = (560, 2100)
    canvas = vertical_gradient(
        size,
        [(0, "#cfd8f2"), (0.30, "#a89bc7"), (0.62, "#7b6a9b"), (1, "#17162d")],
    )
    add_glow(canvas, (-180, -180, 620, 760), "#fff8ff", 165, 120)
    add_glow(canvas, (160, 860, 780, 1650), "#7b78c9", 88, 135)

    source = Image.open(SOURCES / "ive-group-portrait.jpg")
    back = Image.new("RGBA", size)
    bd = ImageDraw.Draw(back)
    bd.text((280, 28), "IVE", font=font(FONT_SERIF_BOLD, 150), fill=rgba("#ffffff", 35), anchor="ma")
    bd.ellipse((28, 240, 532, 1000), outline=rgba("#fbf5ff", 92), width=3)
    bd.ellipse((54, 272, 506, 972), outline=rgba("#d8c5f2", 58), width=2)
    bd.polygon([(0, 330), (560, 210), (560, 390), (0, 520)], fill=rgba("#ffffff", 28))
    bd.polygon([(0, 1365), (560, 1245), (560, 1485), (0, 1605)], fill=rgba("#d6b6e6", 30))
    for center, radius in [((70, 295), 12), ((498, 350), 9), ((490, 1120), 13), ((78, 1290), 8)]:
        star(bd, center, radius, rgba("#ffffff", 200))
    canvas.alpha_composite(back)

    # Use a moderate crop and keep the complete group composition visible.
    # The original 1365x2048 file has ample detail at this rendered size.
    photo = cover(source, (520, 1110), (0.50, 0.45))
    photo = grade(photo, color=0.94, contrast=1.03, brightness=0.98)
    mask = Image.new("L", photo.size, 0)
    md = ImageDraw.Draw(mask)
    md.rounded_rectangle((0, 0, photo.width, photo.height), radius=30, fill=255)

    shadow = Image.new("RGBA", size)
    sd = ImageDraw.Draw(shadow)
    sd.rounded_rectangle((27, 265, 547, 1382), radius=34, fill=rgba("#161020", 105))
    shadow = shadow.filter(ImageFilter.GaussianBlur(28))
    canvas.alpha_composite(shadow)
    paste_masked(canvas, photo, mask, (20, 255))

    fg = Image.new("RGBA", size)
    d = ImageDraw.Draw(fg)
    d.rectangle((0, 0, 560, 155), fill=rgba("#1a1427", 92))
    d.line((28, 155, 532, 155), fill=rgba("#ffffff", 115), width=2)

    text_tracking(d, (30, 52), "IVE / SIX VOICES", font(FONT_SANS_BOLD, 12), rgba("#ffffff"), 4)
    text_tracking(d, (530, 54), "MATCH CULTURE", font(FONT_SANS, 11), rgba("#f2e8fb", 215), 3, anchor="ra")

    # Dark lower panel holds the slogan instead of covering members.
    d.polygon([(0, 1385), (560, 1295), (560, 2100), (0, 2100)], fill=rgba("#151327", 224))
    d.polygon([(0, 1590), (560, 1490), (560, 1645), (0, 1750)], fill=rgba("#cc8dc8", 32))
    d.text((280, 1508), "Always more", font=font(FONT_SCRIPT_BOLD, 42), fill=rgba("#fffaff"), anchor="mm")
    d.text((280, 1563), "than a game", font=font(FONT_SCRIPT_BOLD, 42), fill=rgba("#fffaff"), anchor="mm")
    heart(d, (467, 1540), 53, rgba("#ffd9ef", 220), width=3)
    text_tracking(d, (280, 1695), "IVE × FOOTBALL", font(FONT_SERIF_BOLD, 22), rgba("#f5eaff"), 4, anchor="ma")
    d.line((115, 1760, 445, 1760), fill=rgba("#e7d2f3", 100), width=2)
    text_tracking(d, (280, 1815), "GOOD PEOPLE", font(FONT_SANS_BOLD, 11), rgba("#cfc1dc"), 4, anchor="ma")
    text_tracking(d, (280, 1843), "GREAT MATCHES", font(FONT_SANS_BOLD, 11), rgba("#cfc1dc"), 4, anchor="ma")
    text_tracking(d, (280, 1871), "BRIGHTER DAYS", font(FONT_SANS_BOLD, 11), rgba("#cfc1dc"), 4, anchor="ma")
    d.arc((55, 1620, 505, 2070), 205, 340, fill=rgba("#f5d8ed", 75), width=3)
    frame_marks(d, size, rgba("#ffffff", 105), margin=24, arm=38, width=2)

    canvas.alpha_composite(fg)
    add_grain(canvas, 0.028, 17)
    save_webp(canvas, "ive-right-art.webp", 96)

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
