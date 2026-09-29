"""Create the reusable, painted UI PNGs for the three-level prototype.

The only AI source images are assets/ui-source/{world,beast,cultivator}.png.
Everything emitted here is a project-owned bitmap; Unity only displays it.
Requires Pillow 11+ and can be rerun with: python3 tools/generate_ui_assets.py
"""

from pathlib import Path
from math import cos, sin, pi
import random
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageOps


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets/ui-source"
OUT = ROOT / "client/Assets/Resources/UI"
OUT.mkdir(parents=True, exist_ok=True)
S = 3


def save(im, name):
    im.save(OUT / (name + ".png"), optimize=True)


def scale_points(points):
    return [(int(x * S), int(y * S)) for x, y in points]


def stroked(draw, points, color, width, joint="curve"):
    draw.line(scale_points(points), fill=color, width=int(width * S), joint=joint)


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
    if kind == "map":
        # A deliberate winding route lets the three dynamic stage nodes sit on the art.
        route = Image.new("RGBA", crop.size)
        d = ImageDraw.Draw(route)
        pts = []
        for i in range(160):
            t = i / 159
            x = 515 + 195 * sin(t * 2.4 * pi + 0.1) * (1 - .25 * t)
            y = 1590 - t * 1050
            pts.append((round(x), round(y)))
        d.line(pts, fill=(45, 42, 30, 110), width=59, joint="curve")
        d.line(pts, fill=(242, 224, 171, 184), width=40, joint="curve")
        d.line(pts, fill=(254, 241, 203, 90), width=21, joint="curve")
        crop = Image.alpha_composite(crop, route.filter(ImageFilter.GaussianBlur(1)))
    elif kind == "realm":
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


def surface(name, w, h, base, rim, inner, radius=30, ornamental=True):
    im = Image.new("RGBA", (w*S, h*S))
    d = ImageDraw.Draw(im)
    box = (2*S, 2*S, (w-2)*S, (h-2)*S)
    d.rounded_rectangle(box, radius*S, fill=base, outline=rim, width=4*S)
    d.rounded_rectangle((9*S, 9*S, (w-9)*S, (h-9)*S), (radius-7)*S,
                        outline=inner, width=2*S)
    d.rounded_rectangle((17*S, 17*S, (w-17)*S, (h-17)*S), max(5, radius-14)*S,
                        outline=(111, 198, 179, 67), width=1*S)
    if ornamental:
        for x, flip in [(20, 1), (w-20, -1)]:
            for y, fy in [(20, 1), (h-20, -1)]:
                stroked(d, [(x, y+fy*12), (x+flip*4, y+fy*4),
                             (x+flip*12, y), (x+flip*23, y)], rim, 2)
                d.ellipse(((x-3)*S, (y-3)*S, (x+3)*S, (y+3)*S), fill=inner)
    save(im.resize((w, h), Image.Resampling.LANCZOS), name)


def tile_base(kind):
    w = 128
    im = Image.new("RGBA", (w*S, w*S))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((2*S, 2*S, 126*S, 126*S), 17*S,
                        fill=(5, 43, 55, 247), outline=(157, 191, 177, 255), width=3*S)
    d.rounded_rectangle((8*S, 8*S, 120*S, 120*S), 12*S,
                        fill=(11, 54, 67, 230), outline=(59, 119, 124, 255), width=2*S)
    d.line(scale_points([(12, 18), (108, 18)]), fill=(123, 200, 203, 70), width=2*S)
    if kind == "sword":
        stroked(d, [(41, 91), (84, 35)], (42, 150, 255, 255), 19)
        stroked(d, [(41, 91), (84, 35)], (223, 250, 255, 255), 11)
        d.polygon(scale_points([(85, 19), (90, 46), (75, 39)]), fill=(239, 251, 255, 255))
        stroked(d, [(29, 79), (54, 98)], (235, 194, 91, 255), 8)
        d.ellipse((27*S, 94*S, 42*S, 109*S), fill=(230, 194, 92, 255))
    elif kind == "fire":
        d.rounded_rectangle((35*S, 19*S, 92*S, 109*S), 6*S,
                            fill=(197, 38, 26, 255), outline=(255, 200, 92, 255), width=4*S)
        d.polygon(scale_points([(61, 34), (75, 58), (68, 60), (78, 84),
                                 (56, 95), (45, 81), (53, 66), (49, 57)]), fill=(255, 202, 62, 255))
        d.polygon(scale_points([(61, 55), (67, 75), (57, 84), (55, 72)]), fill=(255, 247, 183, 255))
    elif kind == "lightning":
        d.polygon(scale_points([(67, 17), (35, 71), (57, 68), (48, 110),
                                 (94, 51), (69, 55), (83, 21)]), fill=(110, 56, 216, 255))
        stroked(d, [(70, 25), (49, 62), (67, 60), (57, 94)], (225, 205, 255, 255), 7)
    elif kind == "stone":
        d.polygon(scale_points([(64, 16), (94, 47), (83, 92), (64, 111),
                                 (42, 88), (34, 47)]), fill=(16, 194, 204, 255))
        d.polygon(scale_points([(64, 19), (78, 49), (64, 78), (45, 49)]), fill=(153, 255, 245, 255))
        d.polygon(scale_points([(64, 78), (83, 52), (77, 87), (64, 107)]), fill=(5, 113, 157, 255))
    elif kind == "herb":
        stroked(d, [(46, 103), (82, 28)], (191, 232, 104, 255), 5)
        d.ellipse((22*S, 49*S, 62*S, 77*S), fill=(58, 191, 67, 255), outline=(187, 240, 114, 255), width=3*S)
        d.ellipse((60*S, 31*S, 105*S, 62*S), fill=(72, 211, 70, 255), outline=(195, 247, 126, 255), width=3*S)
        d.ellipse((45*S, 75*S, 85*S, 99*S), fill=(40, 164, 61, 255), outline=(184, 240, 126, 255), width=3*S)
    elif kind == "rock":
        d.polygon(scale_points([(22, 87), (31, 42), (62, 25), (99, 41),
                                 (108, 87), (67, 109)]), fill=(89, 107, 112, 255))
        d.polygon(scale_points([(31, 42), (62, 25), (69, 70), (22, 87)]), fill=(139, 153, 154, 255))
        stroked(d, [(67, 70), (79, 59), (97, 64)], (37, 58, 63, 255), 3)
    save(im.resize((w, w), Image.Resampling.LANCZOS), f"tile_{kind}")


def overlay(name):
    im = Image.new("RGBA", (128*S, 128*S))
    d = ImageDraw.Draw(im)
    if name == "seal":
        for a,b in [((14, 15), (114, 113)), ((14, 113), (114, 15))]:
            stroked(d, [a,b], (81, 48, 9, 255), 13)
            stroked(d, [a,b], (238, 186, 65, 255), 8)
        d.ellipse((50*S, 50*S, 78*S, 78*S), fill=(231, 197, 92, 255), outline=(75, 56, 24, 255), width=3*S)
    elif name == "slash":
        stroked(d, [(15, 107), (110, 17)], (46, 191, 255, 190), 22)
        stroked(d, [(15, 107), (110, 17)], (242, 255, 255, 255), 7)
    else:
        for i in range(8):
            a = i*pi/4
            stroked(d, [(64+24*cos(a),64+24*sin(a)), (64+52*cos(a),64+52*sin(a))],
                    (249, 213, 106, 230), 7)
        d.ellipse((42*S,42*S,86*S,86*S), fill=(251,230,143,255), outline=(255,255,218,255), width=4*S)
    save(im.resize((128, 128), Image.Resampling.LANCZOS), f"overlay_{name}")


def icon(name):
    im = Image.new("RGBA", (96*S, 96*S))
    d = ImageDraw.Draw(im)
    gold=(244,210,132,255)
    pale=(229,249,243,255)
    if name == "map":
        d.polygon(scale_points([(19,74),(28,27),(47,39),(59,19),(77,29),(76,76),(58,65),(43,77)]), fill=pale, outline=gold)
        stroked(d,[(47,39),(43,77)],(75,136,131,255),3)
    elif name == "person":
        d.ellipse((37*S,17*S,61*S,45*S),fill=pale)
        d.polygon(scale_points([(28,84),(35,53),(62,53),(70,84)]),fill=pale)
    elif name == "bag":
        d.ellipse((29*S,39*S,68*S,82*S),fill=pale,outline=gold,width=3*S)
        stroked(d,[(38,34),(59,34)],gold,5)
        stroked(d,[(43,23),(53,34),(60,23)],gold,4)
    elif name == "lotus":
        for x in [27,40,54]:
            d.ellipse((x*S,38*S,(x+20)*S,76*S),fill=pale,outline=gold,width=2*S)
        d.polygon(scale_points([(48,20),(63,56),(48,74),(33,56)]),fill=(247,224,149,255))
    elif name == "menu":
        for y in [28,47,66]: stroked(d,[(25,y),(71,y)],gold,6)
    elif name == "skill":
        stroked(d,[(23,74),(69,24)],(142,219,255,255),15)
        stroked(d,[(23,74),(69,24)],pale,7)
        stroked(d,[(23,60),(39,74)],gold,6)
    elif name == "herb":
        stroked(d,[(38,77),(66,25)],gold,4)
        d.ellipse((23*S,43*S,56*S,62*S),fill=(95,222,92,255))
        d.ellipse((51*S,26*S,78*S,46*S),fill=(126,245,114,255))
    elif name == "bolt":
        d.polygon(scale_points([(53,13),(28,54),(48,52),(39,83),(70,44),(53,46),(64,16)]),fill=(105,224,255,255))
    elif name == "coin":
        d.ellipse((18*S,24*S,77*S,77*S),fill=(249,209,100,255),outline=(255,242,185,255),width=3*S)
        d.ellipse((29*S,32*S,67*S,68*S),outline=(178,108,35,255),width=3*S)
    else:
        d.ellipse((19*S,20*S,77*S,77*S),fill=(53,231,181,255),outline=gold,width=3*S)
        d.ellipse((33*S,32*S,63*S,63*S),fill=(13,108,117,255))
    save(im.resize((96,96),Image.Resampling.LANCZOS),f"icon_{name}")


def avatar(hero):
    # Reuse the generated hero rather than spending a fourth image generation.
    w,h=hero.size
    head=hero.crop((int(w*.30),int(h*.02),int(w*.70),int(h*.47)))
    head=ImageOps.fit(head,(256,256),centering=(.5,.35))
    mask=Image.new("L",(256,256))
    ImageDraw.Draw(mask).ellipse((8,8,248,248),fill=255)
    head.putalpha(ImageChops_multiply(head.getchannel("A"),mask))
    frame=Image.new("RGBA",(256,256))
    frame.alpha_composite(head)
    ImageDraw.Draw(frame).ellipse((7,7,249,249),outline=(247,212,125,255),width=8)
    save(frame,"avatar")


def ImageChops_multiply(a,b):
    from PIL import ImageChops
    return ImageChops.multiply(a,b)


def main():
    for kind in ("map","game","boss","realm"):
        portrait_background(kind)
    cutout("beast","beast",900)
    hero=cutout("cultivator","cultivator",1100)
    avatar(hero)
    surface("panel",512,256,(5,47,55,246),(210,169,92,255),(252,222,152,255),35)
    surface("panel_light",512,256,(15,78,83,235),(224,187,111,255),(255,236,169,255),35)
    surface("banner",700,140,(4,50,59,246),(190,161,93,255),(250,222,158,255),40)
    surface("button_primary",430,132,(186,125,45,255),(255,220,125,255),(255,244,183,255),35)
    surface("button_secondary",430,132,(13,82,88,255),(169,207,173,255),(234,226,169,255),35)
    surface("button_disabled",430,132,(45,68,71,235),(105,125,119,255),(144,155,144,255),35)
    surface("stage_done",160,160,(9,73,77,255),(222,188,106,255),(255,231,156,255),78)
    surface("stage_current",160,160,(199,139,52,255),(255,240,149,255),(255,253,205,255),78)
    surface("stage_locked",160,160,(29,56,60,240),(113,131,129,255),(157,166,152,255),78)
    surface("bar_track",500,52,(5,47,56,250),(214,177,102,255),(103,151,138,255),24,False)
    surface("bar_blue",500,52,(21,137,221,255),(136,240,255,255),(219,255,255,255),24,False)
    surface("bar_red",500,52,(204,55,53,255),(255,153,113,255),(255,225,177,255),24,False)
    surface("nav",900,164,(3,45,51,252),(190,156,90,255),(223,201,127,255),46)
    save(Image.new("RGBA", (16, 16), (0, 25, 31, 169)), "dim_overlay")
    for kind in ("sword","fire","lightning","stone","herb","rock"):
        tile_base(kind)
    for name in ("seal","slash","omni"):
        overlay(name)
    for name in ("map","person","bag","lotus","menu","skill","herb","bolt","coin","jade"):
        icon(name)
    print(f"Generated {len(list(OUT.glob('*.png')))} UI images in {OUT}")


if __name__ == "__main__":
    main()
