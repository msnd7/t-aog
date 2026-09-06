"""Generate PWA icons from the academy logo (public/img/logo.jpg)."""
import os
from PIL import Image, ImageChops

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "public", "img", "logo.jpg")
OUT = os.path.join(ROOT, "public", "img")

def trimmed():
    im = Image.open(SRC).convert("RGB")
    bg = Image.new("RGB", im.size, (255, 255, 255))
    diff = ImageChops.difference(im, bg)
    box = diff.getbbox()
    return im.crop(box) if box else im

def square(im, size, pad_ratio, bg):
    inner = int(size * (1 - 2 * pad_ratio))
    w, h = im.size
    scale = min(inner / w, inner / h)
    r = im.resize((max(1, int(w * scale)), max(1, int(h * scale))), Image.LANCZOS)
    canvas = Image.new("RGB", (size, size), bg)
    canvas.paste(r, ((size - r.size[0]) // 2, (size - r.size[1]) // 2))
    return canvas

logo = trimmed()
logo.save(os.path.join(OUT, "logo.png"))
for size in (64, 128, 180, 192, 256, 384, 512):
    square(logo, size, 0.06, (255, 255, 255)).save(os.path.join(OUT, f"icon-{size}.png"))
# maskable icons keep a safe zone (icon content inside the middle 80%)
for size in (192, 512):
    square(logo, size, 0.16, (255, 255, 255)).save(os.path.join(OUT, f"maskable-{size}.png"))
square(logo, 32, 0.02, (255, 255, 255)).save(os.path.join(OUT, "favicon.png"))
print("icons written to", OUT)
