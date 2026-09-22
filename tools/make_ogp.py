r"""OGP 画像（X などに出るサムネイル）を 1 枚作る。静的な画像でよいので使い捨てのスクリプト。

    ..\game_ai_lab\backend\.venv\Scripts\python tools\make_ogp.py

出力: public/ogp.png（1200 x 630）
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

W, H = 1200, 630
BG = (8, 10, 16)
PANEL = (13, 16, 23)
ACCENT = (46, 230, 214)
MUTED = (140, 151, 171)
CELL = 26

COLORS = {
    "I": (46, 230, 214), "J": (79, 124, 255), "L": (255, 159, 67), "O": (255, 217, 61),
    "S": (74, 222, 128), "T": (192, 132, 252), "Z": (251, 113, 133), "G": (90, 100, 114),
}

# 盤面（下から上に積み上がっている様子。'.' は空き）
BOARD = [
    "..........",
    "..........",
    "..........",
    "....T.....",
    "...TTT....",
    "..........",
    "..........",
    ".JJ....LL.",
    ".J.SS.ZL..",
    "GGGGG.GGGG",
    "GGG.GGGGGG",
    "GGGGGGG.GG",
    "ZZGGGGGGGG",
    ".ZZGGGGG.G",
]


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    """Windows のフォントを使う。無ければ既定のビットマップフォント。"""
    for name in (("meiryob.ttc", "YuGothB.ttc", "msgothic.ttc") if bold
                 else ("meiryo.ttc", "YuGothR.ttc", "msgothic.ttc")):
        path = Path(r"C:\Windows\Fonts") / name
        if path.exists():
            return ImageFont.truetype(str(path), size)
    return ImageFont.load_default(size)


def cell(d: ImageDraw.ImageDraw, x: int, y: int, color: tuple[int, int, int]) -> None:
    d.rounded_rectangle([x + 1, y + 1, x + CELL - 2, y + CELL - 2], radius=5, fill=color)
    d.rounded_rectangle([x + 4, y + 3, x + CELL - 5, y + 9], radius=3,
                        fill=tuple(min(255, c + 60) for c in color))


def main() -> None:
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)

    # 背景のぼんやりした光
    glow = Image.new("RGB", (W, H), BG)
    gd = ImageDraw.Draw(glow)
    gd.ellipse([-200, -320, 900, 420], fill=(16, 44, 46))
    gd.ellipse([700, -260, 1500, 380], fill=(30, 20, 46))
    img = Image.blend(img, glow, 0.55)
    d = ImageDraw.Draw(img)

    # 右側に盤面
    bw, bh = CELL * 10, CELL * 20
    bx, by = W - bw - 90, (H - bh) // 2
    d.rounded_rectangle([bx - 10, by - 10, bx + bw + 10, by + bh + 10], radius=14, fill=PANEL,
                        outline=(34, 40, 54), width=2)
    for gy in range(1, 20):
        d.line([bx, by + gy * CELL, bx + bw, by + gy * CELL], fill=(26, 31, 43))
    for gx in range(1, 10):
        d.line([bx + gx * CELL, by, bx + gx * CELL, by + bh], fill=(26, 31, 43))
    bottom = by + bh
    for row_i, row in enumerate(reversed(BOARD)):
        for x, ch in enumerate(row):
            if ch != ".":
                cell(d, bx + x * CELL, bottom - (row_i + 1) * CELL, COLORS[ch])

    # 左側に文字
    d.text((90, 150), "絶対に倒れない", font=font(72, True), fill=(232, 236, 245))
    d.text((90, 240), "テトリス", font=font(92, True), fill=ACCENT)
    d.text((90, 372), "自己対戦で学習した AI が、延々と積み続けます。", font=font(27), fill=(210, 218, 232))
    d.text((90, 412), "おじゃまブロックを送って倒してください。", font=font(27), fill=(210, 218, 232))
    d.text((90, 486), "倒せた人は殿堂入り", font=font(30, True), fill=(255, 217, 61))
    d.text((90, 536), "taorenai-tetris.pages.dev", font=font(24), fill=MUTED)

    out = Path(__file__).resolve().parent.parent / "public" / "ogp.png"
    out.parent.mkdir(parents=True, exist_ok=True)
    img.save(out, optimize=True)
    print(f"書き出し: {out}（{out.stat().st_size / 1024:.0f} KB）")


if __name__ == "__main__":
    main()
