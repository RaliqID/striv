"""Generate the Expo app icon assets from the Striv mark.

The Expo template ships placeholder images under different names than app.json
references, and the mark should be ours anyway. Generating them here keeps the
app icon identical to the web favicon and the (now removed) launcher art.

Run from the striv-mobile directory:  python scripts/make-icons.py
"""

import os
from PIL import Image, ImageDraw

INK = (28, 27, 27, 255)
WHITE = (255, 255, 255, 255)
ACCENT = (96, 99, 238, 255)

SCALE = 8
BASE = 40
OUT = "assets"


def draw_mark(draw, px, u, *, tile=True, tile_radius_ratio=0.275):
    if tile:
        draw.rounded_rectangle(
            [0, 0, px - 1, px - 1], radius=px * tile_radius_ratio, fill=INK
        )

    def bar(x, y, w, h, colour):
        draw.rounded_rectangle(
            [x * u, y * u, (x + w) * u, (y + h) * u],
            radius=(w / 2) * u,
            fill=colour,
        )

    bar(10, 22, 4.5, 8, (255, 255, 255, 140))
    bar(17.75, 17, 4.5, 13, (255, 255, 255, 204))
    bar(25.5, 11, 4.5, 19, WHITE)

    stroke = max(int(2.6 * u), 2)
    draw.line(
        [(14.5 * u, 14.5 * u), (20 * u, 9.5 * u), (25.5 * u, 14.5 * u)],
        fill=ACCENT,
        width=stroke,
        joint="curve",
    )
    r = stroke / 2
    for cx, cy in ((14.5, 14.5), (20, 9.5), (25.5, 14.5)):
        draw.ellipse([cx * u - r, cy * u - r, cx * u + r, cy * u + r], fill=ACCENT)


def render(size, *, tile=True, pad_ratio=0.0):
    """Render the mark, optionally inset for Android's adaptive safe zone."""
    px = size * SCALE
    img = Image.new("RGBA", (px, px), (0, 0, 0, 0))

    if pad_ratio > 0:
        inner = 1.0 - 2 * pad_ratio
        tmp_size = int(px * inner)
        tmp = Image.new("RGBA", (tmp_size, tmp_size), (0, 0, 0, 0))
        draw_mark(ImageDraw.Draw(tmp), tmp_size, tmp_size / BASE, tile=tile)
        offset = int(px * pad_ratio)
        img.paste(tmp, (offset, offset), tmp)
    else:
        draw_mark(ImageDraw.Draw(img), px, px / BASE, tile=tile)

    return img.resize((size, size), Image.LANCZOS)


def solid(size, colour):
    return Image.new("RGBA", (size, size), colour)


def main():
    os.makedirs(OUT, exist_ok=True)

    # App icon: the full mark, launcher-masked on older devices.
    render(1024).save(os.path.join(OUT, "icon.png"))

    # Adaptive icon layers. Foreground is inset so a circular mask cannot clip
    # the bars; background is a flat fill behind it.
    render(1024, tile=False, pad_ratio=0.26).save(
        os.path.join(OUT, "adaptive-icon.png")
    )
    solid(1024, INK).save(os.path.join(OUT, "android-icon-background.png"))
    render(1024, tile=False, pad_ratio=0.26).save(
        os.path.join(OUT, "android-icon-foreground.png")
    )

    # Monochrome layer for themed icons (Android 13+): shape only, no colour.
    mono = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
    draw_mark(ImageDraw.Draw(mono), 1024, 1024 / BASE, tile=False)
    mono.save(os.path.join(OUT, "android-icon-monochrome.png"))

    # Splash: mark centred on the app surface colour, matching the web splash.
    splash = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
    mark = render(420)
    offset = (1024 - mark.size[0]) // 2
    splash.paste(mark, (offset, offset), mark)
    splash.save(os.path.join(OUT, "splash.png"))
    # Expo also reads this name for the non-plugin splash path.
    splash.save(os.path.join(OUT, "splash-icon.png"))

    render(48).save(os.path.join(OUT, "favicon.png"))

    print("assets:", ", ".join(sorted(f for f in os.listdir(OUT) if f.endswith(".png"))))


if __name__ == "__main__":
    main()
