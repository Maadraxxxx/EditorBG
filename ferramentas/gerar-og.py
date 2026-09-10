# -*- coding: utf-8 -*-
"""
Gera og.png — a miniatura que aparece quando alguem compartilha o link do
EditorBG no WhatsApp, no Facebook ou no X.

1200x630 e a medida que todos eles esperam. Nas mesmas cores do site, para o
link nao parecer de outro produto.
"""
import os
from PIL import Image, ImageDraw, ImageFont

L, A = 1200, 630

FUNDO = (11, 15, 25)
TXT = (232, 237, 247)
MUDO = (141, 153, 179)
ROXO = (99, 102, 241)
CIANO = (34, 211, 238)


def fonte(tamanho, negrito=True):
    candidatos = [
        r"C:\Windows\Fonts\segoeuib.ttf" if negrito else r"C:\Windows\Fonts\segoeui.ttf",
        r"C:\Windows\Fonts\arialbd.ttf" if negrito else r"C:\Windows\Fonts\arial.ttf",
    ]
    for c in candidatos:
        if os.path.exists(c):
            return ImageFont.truetype(c, tamanho)
    return ImageFont.load_default()


img = Image.new("RGB", (L, A), FUNDO)
d = ImageDraw.Draw(img, "RGBA")

# Os dois halos do fundo do site, desenhados como circulos bem transparentes
# sobrepostos — sem gradiente de verdade, mas de longe da a mesma impressao.
for cx, cy, raio, cor in [(150, -60, 620, ROXO), (1080, 20, 560, CIANO)]:
    for i in range(60, 0, -1):
        r = raio * i / 60
        alfa = int(22 * (1 - i / 60) ** 2)
        if alfa <= 0:
            continue
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=cor + (alfa,))

# --- as duas plaquetas da marca, sobrepostas como no site ---
def plaqueta(x, y, lado, cor1, cor2, raio=26):
    caixa = Image.new("RGBA", (lado, lado), (0, 0, 0, 0))
    dd = ImageDraw.Draw(caixa)
    for i in range(lado):
        k = i / max(1, lado - 1)
        cor = tuple(int(cor1[j] + (cor2[j] - cor1[j]) * k) for j in range(3))
        dd.line([(0, i), (lado, i)], fill=cor + (255,))
    mascara = Image.new("L", (lado, lado), 0)
    ImageDraw.Draw(mascara).rounded_rectangle([0, 0, lado - 1, lado - 1], raio, fill=255)
    img.paste(caixa, (x, y), mascara)


plaqueta(96, 150, 96, (34, 211, 238), (14, 165, 233))          # tras: recortar
plaqueta(140, 194, 104, (129, 140, 248), (79, 70, 229))        # frente: tesoura

# icone de recorte na plaqueta de tras
d.line([(120, 176), (120, 224), (168, 224)], fill=(255, 255, 255, 235), width=7, joint="curve")
d.line([(104, 192), (152, 192), (152, 240)], fill=(255, 255, 255, 235), width=7, joint="curve")

# tesoura na plaqueta da frente
cxi, cyi = 192, 246
d.ellipse([cxi - 34, cyi - 10, cxi - 14, cyi + 10], outline=(255, 255, 255, 240), width=6)
d.ellipse([cxi - 34, cyi + 22, cxi - 14, cyi + 42], outline=(255, 255, 255, 240), width=6)
d.line([(cxi - 16, cyi + 2), (cxi + 44, cyi + 44)], fill=(255, 255, 255, 240), width=6)
d.line([(cxi - 16, cyi + 34), (cxi + 44, cyi - 8)], fill=(255, 255, 255, 240), width=6)

# --- texto ---
d.text((300, 168), "EditorBG", font=fonte(96), fill=TXT)
d.text((304, 286), "Remover fundo e editar imagens", font=fonte(46, False), fill=(200, 210, 230))
d.text((304, 348), "com IA, direto no seu navegador", font=fonte(46, False), fill=(200, 210, 230))

# A frase que separa o site dos concorrentes fica em destaque proprio. A
# pilula e medida a partir do texto: chutar a largura fazia a ultima palavra
# encostar na borda, e com outra fonte instalada estouraria de vez.
frase = "suas imagens não saem do seu computador"
f_frase = fonte(30, False)
larg_frase = d.textlength(frase, font=f_frase)

x0, y0 = 300, 438
recuo_texto = 64          # espaco do ponto verde ate a letra
pilula_larg = recuo_texto + larg_frase + 34

d.rounded_rectangle([x0, y0, x0 + pilula_larg, y0 + 66], 33, fill=(255, 255, 255, 16),
                    outline=(52, 66, 96, 255), width=2)
d.ellipse([x0 + 30, y0 + 24, x0 + 48, y0 + 42], fill=(74, 222, 128, 255))
d.text((x0 + recuo_texto, y0 + 18), frase, font=f_frase, fill=(200, 210, 230))

d.text((300, 540), "editorbg.com.br", font=fonte(34), fill=MUDO)

img.save("og.png", "PNG", optimize=True)
print("og.png:", os.path.getsize("og.png") // 1024, "KB", img.size)
