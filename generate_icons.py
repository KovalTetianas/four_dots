"""Генерирует все 16 вариантов иконки (4 точки квадратом, любые из них «жирные»).
Имя файла: dots_ABCD_<size>.png, где A,B,C,D — верх-лево, верх-право, низ-лево, низ-право
(1 = жирная точка, 0 = обычная)."""
import os
from itertools import product
from PIL import Image, ImageDraw

SIZES = [16, 32, 48, 128]
COLOR = (40, 40, 40, 255)
SS = 8  # суперсэмплинг для сглаживания

# Геометрия в долях от размера иконки
CENTERS = [(0.28, 0.28), (0.72, 0.28), (0.28, 0.72), (0.72, 0.72)]
R_NORMAL = 0.09   # обычная точка (маленькая)
R_BOLD = 0.19     # жирная точка (крупнее)

def draw(state, size):
    big = size * SS
    img = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    for (cx, cy), bold in zip(CENTERS, state):
        r = (R_BOLD if bold else R_NORMAL) * big
        x, y = cx * big, cy * big
        d.ellipse([x - r, y - r, x + r, y + r], fill=COLOR)
    return img.resize((size, size), Image.LANCZOS)

os.makedirs("extension/icons", exist_ok=True)
states = list(product([0, 1], repeat=4))
for st in states:
    name = "".join(map(str, st))
    for s in SIZES:
        draw(st, s).save(f"extension/icons/dots_{name}_{s}.png")

# Превью-лист со всеми вариантами, сгруппированными по числу жирных точек
cell, pad = 128, 24
groups = [[s for s in states if sum(s) == k] for k in range(5)]
cols = max(len(g) for g in groups)
sheet = Image.new("RGBA", (cols * (cell + pad) + pad, 5 * (cell + pad) + pad), (255, 255, 255, 255))
for row, g in enumerate(groups):
    for col, st in enumerate(g):
        x, y = pad + col * (cell + pad), pad + row * (cell + pad)
        ImageDraw.Draw(sheet).rectangle([x, y, x + cell, y + cell], outline=(220, 220, 220, 255))
        sheet.alpha_composite(draw(st, cell), (x, y))
sheet.save("preview_all_variants.png")
print(f"{len(states)} вариантов x {len(SIZES)} размеров")
