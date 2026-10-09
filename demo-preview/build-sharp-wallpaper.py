#!/usr/bin/env python3
"""Upscale existing authoritative ARC XI cosmic wallpaper without redesigning it.

Source is the *embedded exact image* from the real schedule stylesheet.
Only interpolation and restrained unsharp-mask edge enhancement are used;
no new figures, limbs, stars, or planetary features are generated.
"""
from __future__ import annotations
import base64
import io
import re
from pathlib import Path
from PIL import Image, ImageFilter

CSS = Path("pages/cosmic-schedule-background.css")
HTML = Path("pages/index.html")
OUTPUT = Path("pages/media/arcxi/cosmic-wallpaper-3840.webp")
IMAGE_PATTERN = re.compile(r'--arcxi-cosmic-image:url\("data:image/webp;base64,([A-Za-z0-9+/=]+)"\)')
TARGET = '--arcxi-cosmic-image:url("./media/arcxi/cosmic-wallpaper-3840.webp")'

css = CSS.read_text(encoding="utf-8")
match = IMAGE_PATTERN.search(css)
if not match:
    if TARGET in css and OUTPUT.exists():
        print("Wallpaper was already extracted. No repeat enhancement.")
        raise SystemExit(0)
    raise SystemExit("Expected original embedded WebP not found; refusing to change styling.")

original = base64.b64decode(match.group(1), validate=True)
with Image.open(io.BytesIO(original)) as img:
    img.load()
    if img.size != (1672, 941):
        raise SystemExit(f"Unexpected wallpaper dimensions {img.size}; refusing blind edit")
    src = img.convert("RGB")
    # Gentle source-level sharpening prevents amplified softness at large desktop sizes.
    refined = src.filter(ImageFilter.UnsharpMask(radius=0.9, percent=115, threshold=3))
    width = 3840
    height = round(src.height * width / src.width)  # Keep original figures and planets in place.
    enlarged = refined.resize((width, height), Image.Resampling.LANCZOS)
    enlarged = enlarged.filter(ImageFilter.UnsharpMask(radius=1.55, percent=95, threshold=4))
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    enlarged.save(OUTPUT, format="WEBP", quality=93, method=6)
    print(f"Cosmic wallpaper {src.width}x{src.height} -> {width}x{height}, {OUTPUT.stat().st_size} bytes")

updated = css[:match.start()] + TARGET + css[match.end():]
# Slightly reveal contrast without touching glass panel opacity, legibility, or design layout.
updated = updated.replace('  opacity: .79;\n  filter: none;','  opacity: .86;\n  filter: none;',1)
if updated == css or TARGET not in updated:
    raise SystemExit("Wallpaper stylesheet replacement failed")
CSS.write_text(updated, encoding="utf-8")

html = HTML.read_text(encoding="utf-8")
before = './cosmic-schedule-background.css?v=7'
after = './cosmic-schedule-background.css?v=8'
if html.count(before) != 1:
    raise SystemExit("Unexpected stylesheet cache version; check before deploying")
HTML.write_text(html.replace(before, after), encoding="utf-8")
print("External high-resolution image linked, new CSS revision activated.")
