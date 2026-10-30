# Abaco Zuzzurellone - builds the web images from the square logo: header logo, browser icons
# and the preview picture shown when the link is shared.
# Needs Pillow:   python tools/make-web-logo.py     (run from the project root)
# The source has a cream background: here it is made transparent (so the logo sits on any
# page color), the empty margin is cropped away and the result is scaled down for the web.
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
# Background color of the source, removed from the picture
CREAM = (253, 248, 235)
# Height of the output in pixels: about 3x the size it is shown at, for sharp phone screens
OUTPUT_HEIGHT = 420
# Largest channel distance from CREAM still treated as background, and smallest treated as solid
NOISE = 14
SOLID = 60


def color_to_alpha(pixel):
    """Remove CREAM from one pixel: fully transparent where the color is (nearly) the background,
    opaque where it is clearly drawing, and a smooth ramp in between for the soft edges.
    Edge colors are "un-mixed" from the cream, so no pale halo shows on other backgrounds."""
    distance = max(abs(value - back) for value, back in zip(pixel[:3], CREAM))
    # The source background is slightly grainy: anything this close to cream is background
    if distance <= NOISE:
        return (0, 0, 0, 0)
    alpha = min(1.0, (distance - NOISE) / (SOLID - NOISE))
    color = tuple(max(0, min(255, round(back + (value - back) / alpha))) for value, back in zip(pixel[:3], CREAM))
    return color + (round(alpha * 255),)


def abacus_only(logo):
    """Keep only the abacus drawing: the "abaco zuzzurellone" lettering was too small to read in
    the header. The abacus is the shape holding the topmost drawn pixel; everything not touching
    it (lettering, sparks) is made transparent."""
    mask = logo.getchannel('A').point(lambda alpha: 255 if alpha else 0)
    width = mask.width
    top = next(index for index, alpha in enumerate(mask.getdata()) if alpha)
    ImageDraw.floodfill(mask, (top % width, top // width), 128)
    keep = mask.point(lambda value: 255 if value == 128 else 0)
    abacus = Image.new('RGBA', logo.size)
    abacus.paste(logo, mask=keep)
    return abacus


def main():
    source = Image.open(ROOT / 'resources' / 'icon-source.png').convert('RGB')
    logo = Image.new('RGBA', source.size)
    logo.putdata([color_to_alpha(pixel) for pixel in source.getdata()])
    logo = abacus_only(logo)
    # Crop to the drawing, then scale down
    logo = logo.crop(logo.getbbox())
    width = round(logo.width * OUTPUT_HEIGHT / logo.height)
    logo = logo.resize((width, OUTPUT_HEIGHT), Image.LANCZOS)
    target = ROOT / 'web' / 'img' / 'logo.png'
    # 256-color palette (alpha kept, dithered): a flat drawing shows no difference, and the file drops
    # from about 165 KB to about 30 KB, the first picture the home loads
    logo = logo.quantize(colors=256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.FLOYDSTEINBERG)
    logo.save(target, optimize=True)
    print(f'{target} written: {width}x{OUTPUT_HEIGHT}')

    # Browser tab icon, phone home-screen icon (Apple wants it square and opaque) and
    # link-preview picture: the full square logo on its cream background, just scaled.
    square = Image.open(ROOT / 'resources' / 'icon-source.png').convert('RGB')
    for name, size in (('favicon-32.png', 32), ('icon-192.png', 192), ('apple-touch-icon.png', 180), ('share.png', 600)):
        square.resize((size, size), Image.LANCZOS).save(ROOT / 'web' / 'img' / name, optimize=True)
        print(f'web/img/{name} written: {size}x{size}')

    # Classic favicon.ico at the site root: Google (and old browsers / tools) look for it there,
    # and Google only accepts icon sizes that are multiples of 48px
    square.save(ROOT / 'web' / 'favicon.ico', sizes=[(16, 16), (32, 32), (48, 48)])
    print('web/favicon.ico written: 16x16, 32x32, 48x48')


if __name__ == '__main__':
    main()
