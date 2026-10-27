#!/usr/bin/env python3
"""Generate the WhatToCook brand assets.

The mark is a chef hat on a warm orange gradient, matching the web navbar
brand tile. Everything is drawn deterministically here so the icons, splash
screen and PWA assets can be regenerated without a design tool.

Usage: python3 scripts/generate-logo.py
"""

from __future__ import annotations

import math
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
MOBILE = ROOT / "apps/mobile/assets/images"
WEB = ROOT / "apps/web/public"

# Warm kitchen palette (orange-500 → orange-800).
GRADIENT_TOP = (251, 146, 60)
GRADIENT_BOTTOM = (154, 52, 18)
GLOW = (253, 186, 116)
WHITE = (255, 255, 255)

SS = 4  # supersampling factor for the mark


def gradient(size: int) -> Image.Image:
    """Diagonal orange gradient with a soft top-left glow."""
    y, x = np.mgrid[0:size, 0:size]
    t = ((x / (size - 1)) * 0.42 + (y / (size - 1)) * 0.58)[..., None]
    base = np.array(GRADIENT_TOP) * (1 - t) + np.array(GRADIENT_BOTTOM) * t

    distance = np.sqrt((x - size * 0.26) ** 2 + (y - size * 0.2) ** 2) / (size * 0.9)
    glow = np.clip(1 - distance, 0, 1)[..., None] * 0.22
    base = base * (1 - glow) + np.array(GLOW) * glow

    return Image.fromarray(np.clip(base, 0, 255).astype(np.uint8), "RGB")


def draw_hat(size: int, width_fraction: float) -> Image.Image:
    """Chef-hat mark on a transparent canvas.

    Drawn in a canonical 1000-unit space, then scaled so the hat's bounding
    box is `width_fraction` of the canvas.
    """
    canvas = size * SS
    image = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)

    # Canonical bounding box is x 180..820 (640 wide), y 170..795.
    scale = (width_fraction * canvas) / 640
    offset_x = canvas / 2 - 500 * scale
    offset_y = canvas / 2 - 482 * scale

    def box(x0: float, y0: float, x1: float, y1: float) -> tuple[float, float, float, float]:
        return (
            offset_x + x0 * scale,
            offset_y + y0 * scale,
            offset_x + x1 * scale,
            offset_y + y1 * scale,
        )

    def circle(cx: float, cy: float, radius: float, fill) -> None:
        draw.ellipse(box(cx - radius, cy - radius, cx + radius, cy + radius), fill=fill)

    # Three puffs form the classic toque silhouette.
    circle(330, 430, 150, WHITE)
    circle(500, 352, 182, WHITE)
    circle(670, 430, 150, WHITE)

    # Hat body.
    draw.rounded_rectangle(box(330, 470, 670, 742), radius=66 * scale, fill=WHITE)

    # Band with a soft crease so the hat keeps depth at large sizes while
    # still reading as one clean silhouette when small.
    draw.rounded_rectangle(box(372, 704, 628, 795), radius=30 * scale, fill=WHITE)
    draw.rectangle(box(372, 712, 628, 726), fill=(254, 215, 170))

    return image.resize((size, size), Image.LANCZOS)


def with_rounded_mask(image: Image.Image, radius_fraction: float) -> Image.Image:
    """Round the corners of a square asset (used for favicons)."""
    size = image.width
    mask = Image.new("L", (size * SS, size * SS), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        (0, 0, size * SS - 1, size * SS - 1),
        radius=int(size * SS * radius_fraction),
        fill=255,
    )
    mask = mask.resize((size, size), Image.LANCZOS)
    rounded = image.convert("RGBA")
    rounded.putalpha(mask)
    return rounded


def write(image: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, optimize=True)
    print(f"wrote {path.relative_to(ROOT)} ({image.width}x{image.height})")


def main() -> None:
    # Full-bleed app icon.
    icon = gradient(1024)
    hat = draw_hat(1024, 0.62)
    icon.paste(hat, (0, 0), hat)
    write(icon, MOBILE / "icon.png")

    # Android adaptive icon: background gradient, foreground inside the safe
    # zone, monochrome silhouette for themed icons.
    write(gradient(1024), MOBILE / "android-icon-background.png")
    foreground = draw_hat(1024, 0.46)
    write(foreground, MOBILE / "android-icon-foreground.png")

    monochrome = Image.new("RGBA", foreground.size, WHITE)
    monochrome.putalpha(foreground.getchannel("A"))
    write(monochrome, MOBILE / "android-icon-monochrome.png")

    # Splash mark is cream on the orange splash background.
    splash = draw_hat(512, 0.72)
    write(splash, MOBILE / "splash-icon.png")

    # Favicons and PWA icons.
    favicon = with_rounded_mask(icon.resize((64, 64), Image.LANCZOS), 0.22)
    write(favicon, MOBILE / "favicon.png")
    write(favicon, WEB / "favicon-32.png")
    write(with_rounded_mask(icon.resize((192, 192), Image.LANCZOS), 0.22), WEB / "icon-192.png")
    write(with_rounded_mask(icon.resize((512, 512), Image.LANCZOS), 0.22), WEB / "icon-512.png")
    # iOS masks its own corners; ship a full square instead.
    write(icon.resize((180, 180), Image.LANCZOS), WEB / "apple-touch-icon.png")

    # Vector wordmark for the web navbar.
    (WEB / "logo.svg").write_text(VECTOR_MARK, encoding="utf-8")
    print(f"wrote {(WEB / 'logo.svg').relative_to(ROOT)}")


VECTOR_MARK = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" role="img" aria-label="WhatToCook">
  <defs>
    <linearGradient id="wtc-gradient" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#fb923c"/>
      <stop offset="100%" stop-color="#9a3412"/>
    </linearGradient>
  </defs>
  <rect width="1000" height="1000" rx="220" fill="url(#wtc-gradient)"/>
  <g fill="#ffffff">
    <circle cx="330" cy="430" r="150"/>
    <circle cx="500" cy="352" r="182"/>
    <circle cx="670" cy="430" r="150"/>
    <rect x="330" y="470" width="340" height="272" rx="66"/>
  </g>
  <rect x="372" y="704" width="256" height="91" rx="30" fill="#ffffff"/>
  <rect x="372" y="712" width="256" height="14" fill="#fed7aa"/>
</svg>
"""


if __name__ == "__main__":
    main()
