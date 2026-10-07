"""Prepare optimized React Native images for the three-level prototype.

The foreground UI sprites in assets/ui-source/runtime and the original art in
assets/ui-source are the sources. This script prepares portrait backgrounds,
character crops, and compressed WebP assets for the React Native client, then
builds review contact sheets. Requires Pillow 11+.
Run with: python3 tools/generate_ui_assets.py
"""

from pathlib import Path
from PIL import Image, ImageDraw, ImageEnhance, ImageFont, ImageOps


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets/ui-source"
OUT = ROOT / "client/app-assets/ui"
OUT.mkdir(parents=True, exist_ok=True)
RUNTIME = SOURCE / "runtime"
RUNTIME.mkdir(parents=True, exist_ok=True)


def save(im, name):
    im.save(OUT / (name + ".webp"), "WEBP", quality=90, method=6)


def portrait_background(kind):
    world = Image.open(SOURCE / "world.png").convert("RGB")
    # Crop is fixed so four screens share the same world and the gate stays central.
    crop = ImageOps.fit(world, (1080, 1920), method=Image.Resampling.LANCZOS,
                        centering=(0.5, 0.36 if kind == "map" else 0.48)).convert("RGBA")
    if kind == "boss":
        crop = ImageEnhance.Color(crop).enhance(0.72)
    tint = Image.new("RGBA", crop.size)
    p = tint.load()
    for y in range(1920):
        edge = max(0, (y - 1470) / 450)
        top = max(0, (420 - y) / 420)
        if kind == "boss":
            color = (84, 13, 26, int(105 + 65 * top + 55 * edge))
        elif kind == "realm":
            color = (12, 59, 61, int(27 + 50 * top + 22 * edge))
        else:
            color = (4, 43, 52, int(28 + 87 * top + 66 * edge))
        for x in range(1080):
            p[x, y] = color
    crop = Image.alpha_composite(crop, tint)
    if kind == "realm":
        glow = Image.new("RGBA", crop.size)
        d = ImageDraw.Draw(glow)
        for radius in range(470, 170, -18):
            a = int(18 * (470 - radius) / 300)
            d.ellipse((540-radius, 1030-radius, 540+radius, 1030+radius),
                      outline=(255, 234, 157, a), width=8)
        crop = Image.alpha_composite(crop, glow)
    save(crop.convert("RGB"), f"bg_{kind}")


def cutout(name, target, max_size):
    image = Image.open(SOURCE / f"{name}.png").convert("RGBA")
    alpha = image.getchannel("A")
    bbox = alpha.getbbox()
    if bbox:
        image = image.crop(bbox)
    image.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)
    save(image, target)
    return image


def build_runtime_previews():
    groups = {
        "runtime-preview-shop.png": ("Shop surfaces", [
            "shop-card", "shop-dialog", "shop-button",
            "shop-button-disabled", "shop-close-button"]),
        "runtime-preview-inventory.png": ("Inventory surfaces", [
            "inventory-card", "inventory-tab-idle", "inventory-tab-active",
            "inventory-button", "inventory-button-disabled", "inventory-dialog"]),
        "runtime-preview-hud-v2.png": ("HUD and equipment sockets", [
            "hud-tray-v2", "icon-linh-thach", "icon-tien-ngoc",
            "slot-sword", "slot-skill", "slot-skill-empty", "slot-skill-locked"]),
        "runtime-preview-surfaces.png": ("UI surfaces", [
            "panel-base", "panel-light", "banner", "hud-chip", "hud-tray", "nav",
            "chapter-card", "dialog-panel", "button-primary", "button-secondary",
            "button-disabled", "bar-track", "bar-blue", "bar-red", "stage-current",
            "stage-done", "stage-locked", "skill-idle", "skill-ready", "avatar-frame"]),
        "runtime-preview-icons.png": ("UI icons", [
            "icon-map", "icon-person", "icon-bag", "icon-shop", "icon-menu", "icon-skill",
            "icon-herb", "icon-bolt", "icon-coin", "icon-jade", "star-bright", "star-gray"]),
        "runtime-preview-character-icons.png": ("Character equipment icons", [
            "icon-sword-thanh-phong", "icon-sword-trong-nhac", "icon-sword-hoa-van", "icon-sword-loi-minh", "icon-sword-tu-linh", "icon-sword-lien-tinh", "icon-sword-pha-quan", "icon-sword-huyen-co", "icon-skill-nhat-kiem", "icon-skill-ngu-kiem", "icon-skill-hoa-lien", "icon-skill-dan-loi", "icon-skill-pha-chuong", "icon-skill-lien-kiem", "icon-skill-hoi-linh", "icon-skill-van-kiem", "icon-slot-locked", "icon-slot-empty"]),
        "runtime-preview-tiles.png": ("Gameplay tiles", [
            "tile-sword", "tile-fire", "tile-lightning", "tile-spirit-orb", "tile-stone", "tile-herb", "tile-rock"]),
        "runtime-preview-overlays.png": ("Tile overlays", [
            "overlay-seal", "overlay-slash", "overlay-omni"]),
    }
    cell_w, cell_h, margin, title_h = 250, 200, 20, 62
    font = ImageFont.load_default()
    for filename, (title, names) in groups.items():
        columns = 4 if len(names) > 6 else 3
        rows = (len(names) + columns - 1) // columns
        width = margin + columns * (cell_w + margin)
        height = title_h + margin + rows * (cell_h + margin)
        sheet = Image.new("RGB", (width, height), (13, 34, 37))
        d = ImageDraw.Draw(sheet)
        d.text((margin, 20), title, fill=(246, 230, 190), font=font)
        for index, name in enumerate(names):
            x = margin + (index % columns) * (cell_w + margin)
            y = title_h + margin + (index // columns) * (cell_h + margin)
            d.rounded_rectangle((x, y, x+cell_w, y+cell_h), 12,
                                fill=(17, 48, 50), outline=(149, 121, 75), width=1)
            art = Image.open(RUNTIME / f"{name}.png").convert("RGBA")
            art.thumbnail((cell_w-30, cell_h-52), Image.Resampling.LANCZOS)
            sheet.paste(art, (x + (cell_w-art.width)//2, y + 8 + (cell_h-48-art.height)//2), art)
            d.text((x+12, y+cell_h-34), name.replace("-", " "),
                   fill=(240, 237, 217), font=font)
        sheet.save(SOURCE / filename, optimize=True)


def avatar(hero):
    # Reuse the generated hero; the runtime avatar frame is layered in UI Toolkit.
    w,h=hero.size
    head=hero.crop((int(w*.30),int(h*.02),int(w*.70),int(h*.47)))
    head=ImageOps.fit(head,(256,256),centering=(.5,.35))
    mask=Image.new("L",(256,256))
    ImageDraw.Draw(mask).ellipse((8,8,248,248),fill=255)
    head.putalpha(ImageChops_multiply(head.getchannel("A"),mask))
    save(head,"avatar")


def ImageChops_multiply(a,b):
    from PIL import ImageChops
    return ImageChops.multiply(a,b)


def copy_runtime_art(names=None):
        # Preserve the runtime artwork names. Crop generated alpha margins on
        # sprites that are stretched into wide controls.
    prepared = {
        "shop-card": 800,
        "shop-dialog": 1000,
        "shop-button": 1000,
        "shop-button-disabled": 1000,
        "shop-close-button": 1000,
        "inventory-card": 1200,
        "inventory-tab-idle": 640,
        "inventory-tab-active": 640,
        "inventory-button": 352,
        "inventory-button-disabled": 352,
        "inventory-dialog": 800,
        "banner": 1600,
        "button-primary": 1400,
        "button-secondary": 1400,
        "button-disabled": 1400,
        "hud-chip": 1024,
        "hud-tray": 1600,
        "hud-tray-v2": 1600,
        "nav": 1600,
        "chapter-card": 840,
        "dialog-panel": 1024,
        "bar-track": 1600,
        "bar-blue": 1600,
        "bar-red": 1600,
        "star-bright": 512,
        "star-gray": 512,
    }
    for image in sorted((SOURCE / "runtime").glob("*.png")):
        if names is not None and image.stem not in names:
            continue
        name = "panel" if image.stem == "panel-base" else image.stem.replace("-", "_")
        art = Image.open(image).convert("RGBA")
        if image.stem.startswith(("icon-sword-", "icon-skill-", "icon-slot-", "icon-linh-thach", "icon-tien-ngoc", "slot-")):
            # Consistent 80% icon footprint; socket frames use 96% of the canvas.
            # Keep the source illustration and its alpha; only crop and resize.
            # Ignore nearly invisible stray pixels when measuring the footprint;
            # keep the source alpha inside a small padded crop unchanged.
            visible = art.getchannel("A").point(lambda alpha: 255 if alpha >= 8 else 0).getbbox()
            if visible:
                left, top, right, bottom = visible
                art = art.crop((max(0, left-4), max(0, top-4),
                                min(art.width, right+4), min(art.height, bottom+4)))
            footprint = 492 if image.stem.startswith("slot-") else 410
            art.thumbnail((footprint, footprint), Image.Resampling.LANCZOS)
            canvas = Image.new("RGBA", (512, 512))
            canvas.paste(art, ((512-art.width)//2, (512-art.height)//2))
            save(canvas, name)
            continue
        if image.stem in prepared:
            visible = art.getchannel("A").point(lambda alpha: 255 if alpha >= 16 else 0).getbbox()
            if visible:
                padding = 8
                left, top, right, bottom = visible
                art = art.crop((max(0, left-padding), max(0, top-padding),
                                min(art.width, right+padding), min(art.height, bottom+padding)))
            size = prepared[image.stem]
        else:
            size = 512 if image.stem.startswith(("icon-", "tile-", "overlay-", "stage-", "skill-")) else 1200
        art.thumbnail((size, size), Image.Resampling.LANCZOS)
        save(art, name)


def main():
    for kind in ("map","game","boss","realm"):
        portrait_background(kind)
    cutout("beast","beast",900)
    hero=cutout("cultivator","cultivator",1100)
    avatar(hero)
    copy_runtime_art()
    build_runtime_previews()
    print(f"Generated {len(list(OUT.glob('*.webp')))} UI images in {OUT}")


if __name__ == "__main__":
    main()
