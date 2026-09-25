"""Render the Striv mark into favicon assets.

The mark is drawn directly rather than rasterising the SVG so the file has no
external dependency. Anti-aliasing is done by drawing at 8x and downsampling,
which gives clean edges on the rounded corners at every size.
"""

from PIL import Image, ImageDraw

INK = (28, 27, 27, 255)       # near-black tile
WHITE = (255, 255, 255, 255)
ACCENT = (96, 99, 238, 255)   # secondary/indigo

SCALE = 8
BASE = 40  # design grid, matches the SVG viewBox


def render(size: int) -> Image.Image:
    px = size * SCALE
    u = px / BASE  # one design unit in device pixels

    img = Image.new("RGBA", (px, px), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Rounded tile
    draw.rounded_rectangle([0, 0, px - 1, px - 1], radius=11 * u, fill=INK)

    def bar(x, y, w, h, colour):
        draw.rounded_rectangle(
            [x * u, y * u, (x + w) * u, (y + h) * u],
            radius=(w / 2) * u,
            fill=colour,
        )

    # Three ascending bars
    bar(10, 22, 4.5, 8, (255, 255, 255, 140))
    bar(17.75, 17, 4.5, 13, (255, 255, 255, 204))
    bar(25.5, 11, 4.5, 19, WHITE)

    # Forward chevron
    stroke = max(int(2.6 * u), 2)
    draw.line(
        [(14.5 * u, 14.5 * u), (20 * u, 9.5 * u), (25.5 * u, 14.5 * u)],
        fill=ACCENT,
        width=stroke,
        joint="curve",
    )
    # Round the chevron ends to match the SVG's round linecaps.
    r = stroke / 2
    for cx, cy in ((14.5, 14.5), (20, 9.5), (25.5, 14.5)):
        draw.ellipse([cx * u - r, cy * u - r, cx * u + r, cy * u + r], fill=ACCENT)

    return img.resize((size, size), Image.LANCZOS)


# favicon.ico with the sizes browsers actually pick from.
sizes = [16, 32, 48, 64]
base = render(256)
base.save("public/favicon.ico", format="ICO", sizes=[(s, s) for s in sizes])

# PNG icons for app-icon / PWA usage.
render(192).save("public/icon-192.png")
render(512).save("public/icon-512.png")
render(180).save("public/apple-icon.png")

print("wrote favicon.ico, icon-192.png, icon-512.png, apple-icon.png")
