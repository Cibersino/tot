# -*- coding: utf-8 -*-
from __future__ import annotations

from pathlib import Path
import csv
import math
import shutil
import zipfile

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

OUTDIR = Path('docs/test_files/photographed_lot1_realistic_v2')
BUNDLE = Path('docs/test_files/photographed_lot1_realistic_v2_bundle.zip')
CREATE_BUNDLE = False

FONT_CANDIDATES = [
    r'C:\Windows\Fonts\times.ttf',
    r'C:\Windows\Fonts\georgia.ttf',
    r'C:\Windows\Fonts\arial.ttf',
]

W = 900
H = 1260
FONT_SIZE = 20
LINE_STEP = 27

TRANSCRIPTS = {
    'photographed_001': """  En la biblioteca del puerto se decía que los mapas
viejos tenían un modo peculiar de ordenar la
memoria. No servían solo para llegar a un muelle o a
una calle; también fijaban el tamaño de las
ausencias. El archivero, que llevaba allí desde
1998, repetía que un plano de 1912 podía mentir
menos que un testigo apurado. A las nueve y media
abría las cajas, limpiaba el polvo con un paño de
algodón y anotaba en el margen: "revisado,
14/04/2025". Luego comparaba nombres borrados,
números de lote, abreviaturas de un ferrocarril ya
clausurado y el valor de unas bodegas que en 1931
figuraban tasadas en $ 48.700.

  Aquella mañana encontró una hoja doblada entre dos
croquis de mareas. No era una carta sentimental,
como pensó al principio, sino un informe breve sobre
el costo de reparar un muelle después de una
tormenta. Indicaba 37 tablones nuevos, 12 pernos de
bronce, tres cuadrillas y una demora estimada de 18
días hábiles. El total, escrito con tinta azul ya
desvaída, llegaba a $ 1.286,40. Debajo aparecía una
nota más íntima: "No olvidar que el viento del sur
desplaza las cuentas y el ánimo". El archivero
sonrió, porque esa mezcla de cálculo y confesión
resumía mejor que cualquier manual la vida del
puerto.

  Al cerrar la caja, oyó en el patio a dos
estudiantes discutir por una fecha. Uno insistía en
1907; el otro, en 1908. Los hizo pasar, les mostró
el plano y les explicó que una cifra mal leída podía
cambiar el sentido entero de una calle. "La ciudad",
dijo, "se corrige con paciencia, igual que una
edición anotada". Los jóvenes copiaron la
referencia, agradecieron en voz baja y se fueron con
una seriedad nueva, como si hubieran entendido que
incluso el error tiene domicilio.""",
    'photographed_002': """  La profesora de historia rural solía iniciar el
semestre con una escena mínima: una mesa, una
balanza, tres cuadernos y un recibo de molino
fechado el 22/08/1946. Decía que el campo no debía
imaginarse como una postal inmóvil, sino como una
contabilidad en movimiento. En el recibo figuraban
86 sacos de trigo, un descuento por humedad del 3,5
%, el pago de dos jornales y un flete de $ 17,80.
Ninguno de esos datos parecía épico; precisamente
por eso servían para entender cómo se sostenía una
familia, cómo se aplazaba una compra o cómo una
lluvia tardía podía alterar la conversación de todo
un valle.

  Ese día pidió a sus alumnos que describieran el
documento sin apresurarse a interpretarlo. Algunos
hablaron de la letra irregular del capataz; otros
notaron la tinta corrida en la esquina superior,
donde alguien había dejado un vaso húmedo. Una
estudiante observó la abreviatura "qq." y preguntó
si todavía se usaba para quintales. La profesora
respondió que la unidad había perdido presencia,
pero no del todo, y añadió que las palabras técnicas
suelen retirarse más lentamente que los oficios.
Después leyó una anotación al reverso: "cobrar el
saldo antes del 5 de septiembre". A partir de esa
línea, el aula entendió que la economía doméstica
rara vez espera.

  Antes de terminar, la profesora comparó ese recibo
con una boleta agrícola de 1973. Había tractores,
combustible, repuestos y una cifra final mucho
mayor: $ 12.460. Sin embargo, el problema seguía
siendo parecido. ¿Cuánto reservar para semillas?
¿Cuánto asumir como riesgo? ¿Qué parte del trabajo
podía posponerse? No buscaba nostalgia, sino
precisión. "Las épocas cambian", concluyó, "pero el
detalle concreto sigue siendo la puerta más honesta
hacia el pasado".""",
    'photographed_003': """  Cuando el taller de encuadernación abrió de nuevo,
después de las lluvias de julio, el primer encargo
fue un tomo de actas municipales de 1924. No tenía
un gran valor comercial, pero sí un desgaste que
imponía respeto: lomo vencido, costuras tensas,
papel quebradizo en los márgenes y una serie de
manchas pardas cerca de las páginas 118 a 126. La
maestra encuadernadora pidió luz lateral, una regla
metálica, adhesivo neutro y una libreta donde anotó
cada intervención con hora y observación. A las
10:15 escribió: "separación controlada del
cuadernillo III". A las 11:40: "limpieza en seco,
pérdida mínima". Al costado agregó el costo probable
de materiales, $ 9.800, sin incluir mano de obra.

  El ayudante, que recién cumplía seis meses en el
oficio, preguntó por qué era necesario registrar
tanto. Ella respondió que reparar un libro sin dejar
rastro era otra forma de dañarlo. Cada fibra
restaurada debía conservar memoria de su fragilidad,
igual que una ciudad conserva cicatrices de un
incendio antiguo aunque pinte las fachadas. Mientras
hablaban, el ventilador movía apenas las tiras de
papel japonés sobre la mesa. Nadie elevaba la voz,
porque el trabajo exigía una cortesía física: tomar,
mirar, esperar.

  Al mediodía apareció un funcionario con prisa y
pidió el volumen para una ceremonia del 03/09/2025.
La maestra negó con calma. Dijo que el secado
necesitaba veinticuatro horas, que acelerar el
proceso sería visible en los pliegos y que el apuro
administrativo no justificaba una mala reparación.
El funcionario revisó su reloj, anotó un número de
contacto y se fue molesto. El ayudante creyó que
habría problemas, pero ella siguió pegando el
refuerzo interno. "Hay trabajos", dijo, "que solo
parecen lentos a quienes no saben leer sus
consecuencias".""",
    'photographed_004': """  En el segundo piso del museo ferroviario había una
sala dedicada a horarios, tarifas y reglamentos de
viaje. Casi nadie entraba allí con entusiasmo; la
mayoría buscaba locomotoras, gorras o fotografías de
estaciones nevadas. Sin embargo, el curador sostenía
que una tabla de salidas podía ser tan reveladora
como una máquina de vapor. Sobre una vitrina exhibía
el itinerario de invierno de 1954: tren mixto a las
06:35, expreso a las 08:10, servicio dominical a las
17:45 y recargo nocturno de $ 2,15 para equipaje
superior a 20 kg. También figuraban abreviaturas que
exigían paciencia: "det. fac.", "comb. corr.", "vag.
dorm.".

  Una tarde llevó a un grupo de visitantes escolares
y les pidió elegir un dato aparentemente trivial. Un
niño señaló la diferencia entre "sale" y "parte";
una niña, la nota que advertía retrasos por crecidas
entre junio y agosto. El curador explicó que el
lenguaje operativo nunca es neutral: cada término
define responsabilidades, tolerancias y
expectativas. Si el cartel decía "hora oficial", por
ejemplo, implicaba una autoridad técnica y una
promesa pública. De pronto la sala dejó de parecer
aburrida. Los alumnos compararon montos, hicieron
cuentas rápidas y calcularon cuánto habría costado
viajar en familia desde Talca a Puerto Montt en
julio de 1956, sumando tres boletos, dos valijas y
un canasto.

  Al final, antes de cerrar, el curador mostró un
reglamento impreso en tipografía diminuta. En el
artículo 17 se prohibía fumar en andenes cubiertos;
en el 21 se exigía conservar el boleto hasta el
destino final; en el 28 se fijaba una multa de $
5,00 por alterar el orden. "Un museo", dijo,
"también se construye con normas". Nadie protestó.
Habían descubierto que la historia, a veces, viaja
en letra pequeña.""",
    'photographed_005': """  El informe de compras de la cooperativa no estaba
escrito para impresionar a nadie, pero contenía una
claridad que muchos discursos envidiarían. En la
primera página se resumían los movimientos de abril
de 2025: 420 cuadernos escolares, 180 lápices de
grafito, 96 cajas de témperas, 14 resmas tamaño
oficio y 32 bidones de limpiador neutro. La columna
de proveedor indicaba tres nombres ficticios y una
nota al pie: "pago a 30 días, salvo ítemes de
reposición urgente". En la columna final aparecían
montos exactos, descuentos del 4 % y recargos
menores por traslado a la sede norte. El total de la
orden principal ascendía a $ 684.230, IVA incl.

  Más abajo, el redactor incorporó observaciones que
no eran meramente contables. Señaló que el lote de
cuadernos con tapas azules llegó con dos cajas
húmedas y que el embalaje de témperas presentaba
esquinas golpeadas, aunque sin pérdida de contenido.
Registró también que la recepción se hizo a las
16:20, con firma del encargado y fotografía de
respaldo. Un párrafo breve recomendaba revisar el
stock de archivadores antes del 12/05, porque el
consumo trimestral había superado la proyección
inicial en un 11,8 %. Esa cifra, más que alarmar,
orientaba.

  La utilidad del documento estaba en su tono. No
prometía milagros administrativos ni culpaba a
terceros por cada atraso. Describía. Comparaba.
Medía. Al final proponía tres acciones concretas:
consolidar pedidos pequeños, renegociar flete en
compras sobre 250 kg y actualizar la planilla
maestra con códigos abreviados consistentes. Quien
leyera esa página sin prejuicios entendería algo
sencillo y raro: una institución se vuelve confiable
cuando su rutina queda escrita con precisión
suficiente para ser revisada por cualquiera.""",
    'photographed_006': """  En la edición revisada del manual de laboratorio,
el capítulo sobre cuadernos de campo ocupaba apenas
unas pocas páginas, pero concentraba una ética
completa del trabajo científico. No hablaba primero
de fórmulas ni de aparatos costosos, sino de la
disciplina de anotar. "Escriba la fecha entera",
decía la instrucción inicial, "incluya hora,
temperatura ambiente y versión del protocolo". Más
adelante añadía una recomendación menos técnica y
más humana: "si una medición sale mal, no la borre;
márquela y explique por qué". El ejemplo reproducía
una entrada del 17/11/2024, a las 08:45, con una
lectura descartada por condensación y un reinicio
del equipo a las 09:02.

  El autor del manual sabía que los errores tienden
a esconderse en la prisa. Por eso insistía en
detalles modestos: numerar páginas, no confiar en
papeles sueltos, registrar lotes de reactivos,
distinguir entre observación y conclusión. Incluso
daba un ejemplo financiero, acaso para sorprender:
si un ensayo consume insumos por $ 38.500 y debe
repetirse por una omisión evitable, el problema no
es solo presupuestario, sino metodológico. La cifra
sirve para recordar que el descuido tiene costo,
aunque no siempre aparezca en una factura.

  La última sección proponía un ejercicio breve.
Cada estudiante debía describir el banco de trabajo
sin usar adjetivos vagos. No bastaba escribir
"ordenado" o "sucio"; había que anotar posiciones,
cantidades, etiquetas, fechas de apertura y estado
de las superficies. El resultado, decía el manual,
era menos elegante que un resumen apresurado, pero
mucho más útil. Quien aprende a registrar con
exactitud descubre que la claridad no es un talento
innato. Es una práctica, casi siempre silenciosa,
que mejora cuando se repite con honestidad.""",
}

SAMPLES = [
    dict(id='photographed_001', family='photographed', difficulty='difficult', seed=64001, page_coverage_pct=93.2, borde_exterior_pct=6.8, perspective_deg=6.1, rotation_deg=-1.2, skew_deg=1.4, open_book=True, book_side='right', page_style='cream_mottled', background_style='wood_warm', lighting_style='warm_side', blur_level=2, blur_sigma=0.55, jpeg_quality=50, noise_sigma=3.8, ds_scale=0.89, hotspot_strength=0.08, gutter_shadow=0.22, curvature_amp=18.0, notes='Libro abierto, página derecha, toma cercana desde arriba-derecha, con curvatura clara y papel crema con leve desgaste.'),
    dict(id='photographed_002', family='photographed', difficulty='difficult', seed=64002, page_coverage_pct=92.6, borde_exterior_pct=7.4, perspective_deg=3.4, rotation_deg=1.7, skew_deg=0.9, open_book=True, book_side='left', page_style='gray_fine', background_style='fabric_gray', lighting_style='top_hotspot_soft', blur_level=1, blur_sigma=0.40, jpeg_quality=56, noise_sigma=3.2, ds_scale=0.90, hotspot_strength=0.10, gutter_shadow=0.18, curvature_amp=15.0, notes='Libro abierto, página izquierda, cámara un poco más alta y fondo textil mate con iluminación más blanda.'),
    dict(id='photographed_003', family='photographed', difficulty='difficult', seed=64003, page_coverage_pct=92.1, borde_exterior_pct=7.9, perspective_deg=7.6, rotation_deg=-0.5, skew_deg=1.8, open_book=True, book_side='left', page_style='yellowed_marks', background_style='desk_dark', lighting_style='oblique_shadow', blur_level=2, blur_sigma=0.68, jpeg_quality=48, noise_sigma=4.2, ds_scale=0.87, hotspot_strength=0.06, gutter_shadow=0.28, curvature_amp=20.0, notes='Libro abierto con ángulo más oblicuo, curvatura marcada cerca del lomo y fondo oscuro mate.'),
    dict(id='photographed_004', family='photographed', difficulty='difficult', seed=64004, page_coverage_pct=93.7, borde_exterior_pct=6.3, perspective_deg=4.8, rotation_deg=2.1, skew_deg=1.1, open_book=True, book_side='right', page_style='fibrous_cornerwear', background_style='desk_cool_object', lighting_style='cool_uneven', blur_level=1, blur_sigma=0.42, jpeg_quality=54, noise_sigma=3.4, ds_scale=0.91, hotspot_strength=0.05, gutter_shadow=0.23, curvature_amp=16.0, notes='Libro abierto, página derecha, toma casual a pulso y fondo de escritorio con objeto fuera de foco.'),
    dict(id='photographed_005', family='photographed', difficulty='medium', seed=64005, page_coverage_pct=92.9, borde_exterior_pct=7.1, perspective_deg=2.7, rotation_deg=-2.0, skew_deg=0.6, open_book=True, book_side='right', page_style='cared_soft', background_style='cloth_beige', lighting_style='soft_even_shadow', blur_level=1, blur_sigma=0.36, jpeg_quality=60, noise_sigma=2.1, ds_scale=0.93, hotspot_strength=0.04, gutter_shadow=0.15, curvature_amp=12.0, notes='Libro abierto más estable y legible, todavía con textura real de papel y sombra de lomo leve.'),
    dict(id='photographed_006', family='photographed', difficulty='easy', seed=64006, page_coverage_pct=93.5, borde_exterior_pct=6.5, perspective_deg=2.2, rotation_deg=0.4, skew_deg=0.0, open_book=False, book_side='none', page_style='clean_soft', background_style='neutral_soft', lighting_style='clean_even', blur_level=1, blur_sigma=0.22, jpeg_quality=68, noise_sigma=1.2, ds_scale=0.95, hotspot_strength=0.03, gutter_shadow=0.0, curvature_amp=0.0, notes='Documento casi plano, más limpio y estable, con leve textura y luz uniforme.'),
]


def load_font(size):
    for candidate in FONT_CANDIDATES:
        try:
            p = Path(candidate)
            if p.exists():
                return ImageFont.truetype(str(p), size)
        except Exception:
            pass
    return ImageFont.load_default()


FONT = load_font(FONT_SIZE)


def ensure_dir(path: Path):
    path.mkdir(parents=True, exist_ok=True)


def background(rng, style):
    yy = np.linspace(0, 1, H, dtype=np.float32)[:, None, None]
    xx = np.linspace(0, 1, W, dtype=np.float32)[None, :, None]
    if style == 'wood_warm':
        base = np.full((H, W, 3), [118, 90, 68], dtype=np.float32)
        grain = np.sin(np.linspace(0, 16, W, dtype=np.float32))[None, :, None]
        base += grain * np.array([18, 12, 8], dtype=np.float32)
        base += yy * np.array([-8, -6, -4], dtype=np.float32)
    elif style == 'fabric_gray':
        base = np.full((H, W, 3), [118, 120, 124], dtype=np.float32)
        weave_x = np.sin(np.linspace(0, 220, W, dtype=np.float32))[None, :, None]
        weave_y = np.sin(np.linspace(0, 250, H, dtype=np.float32))[:, None, None]
        base += weave_x * 3 + weave_y * 2.5
        ring = np.exp(-(((xx[..., 0] - 0.16) ** 2) + ((yy[..., 0] - 0.84) ** 2)) / 0.005)[..., None]
        base -= ring * 9
    elif style == 'desk_dark':
        base = np.full((H, W, 3), [60, 64, 69], dtype=np.float32)
        base += yy * np.array([-20, -18, -16], dtype=np.float32)
        base += xx * np.array([10, 8, 6], dtype=np.float32)
        overlay = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        d = ImageDraw.Draw(overlay)
        d.rounded_rectangle((760, 160, 930, 500), radius=24, fill=(30, 34, 42, 110))
        overlay = overlay.filter(ImageFilter.GaussianBlur(24))
        arr = np.array(overlay).astype(np.float32)
        a = arr[:, :, 3:4] / 255.0
        base = base * (1 - a) + arr[:, :, :3] * a
    elif style == 'desk_cool_object':
        base = np.full((H, W, 3), [138, 145, 152], dtype=np.float32)
        base += yy * np.array([-10, -8, -6], dtype=np.float32)
        overlay = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        d = ImageDraw.Draw(overlay)
        d.rounded_rectangle((770, 90, 960, 270), radius=20, fill=(55, 68, 82, 105))
        d.rectangle((50, 1110, 285, 1335), fill=(225, 228, 232, 82))
        overlay = overlay.filter(ImageFilter.GaussianBlur(20))
        arr = np.array(overlay).astype(np.float32)
        a = arr[:, :, 3:4] / 255.0
        base = base * (1 - a) + arr[:, :, :3] * a
    elif style == 'cloth_beige':
        base = np.full((H, W, 3), [170, 157, 142], dtype=np.float32)
        wave_x = np.sin(np.linspace(0, 11, W, dtype=np.float32))[None, :, None]
        wave_y = np.sin(np.linspace(0, 15, H, dtype=np.float32))[:, None, None]
        base += wave_x * 7 + wave_y * 5
    else:
        base = np.full((H, W, 3), [214, 212, 206], dtype=np.float32)
        base += yy * np.array([-10, -10, -8], dtype=np.float32)
        shadow = np.exp(-(((xx[..., 0] - 0.70) ** 2) / 0.06 + ((yy[..., 0] - 0.88) ** 2) / 0.06))[..., None]
        base -= shadow * 12
    base += cv2.GaussianBlur(rng.normal(0, 5, base.shape).astype(np.float32), (0, 0), sigmaX=2.0)
    return np.clip(base, 0, 255).astype(np.uint8)


def paper(rng, w, h, style):
    tints = {
        'cream_mottled': np.array([245, 241, 232], dtype=np.float32),
        'gray_fine': np.array([242, 239, 233], dtype=np.float32),
        'yellowed_marks': np.array([243, 237, 225], dtype=np.float32),
        'fibrous_cornerwear': np.array([246, 242, 233], dtype=np.float32),
        'cared_soft': np.array([247, 243, 235], dtype=np.float32),
        'clean_soft': np.array([248, 244, 236], dtype=np.float32),
    }
    arr = np.full((h, w, 3), tints[style], dtype=np.float32)
    low = cv2.GaussianBlur(rng.normal(0, 14, (h, w)).astype(np.float32), (0, 0), sigmaX=w / 7.0, sigmaY=h / 7.0)
    arr += low[..., None] * 0.28
    fib = cv2.GaussianBlur(rng.normal(0, 1.1, (h, w)).astype(np.float32), (0, 0), sigmaX=0.7, sigmaY=0.7)
    arr += fib[..., None] * 4.5
    xx = np.linspace(0, 1, w, dtype=np.float32)[None, :]
    yy = np.linspace(0, 1, h, dtype=np.float32)[:, None]
    if style != 'clean_soft':
        edge = np.minimum(np.minimum(xx, 1 - xx), np.minimum(yy, 1 - yy))
        wear = np.clip((0.045 - edge) / 0.045, 0, 1)
        arr -= wear[..., None] * np.array([8, 7, 5], dtype=np.float32)
        count = 6 if style in ('yellowed_marks', 'fibrous_cornerwear') else 4
        for _ in range(count):
            cx = float(rng.uniform(0.08, 0.92))
            cy = float(rng.uniform(0.06, 0.95))
            sx = float(rng.uniform(0.015, 0.05))
            sy = float(rng.uniform(0.015, 0.045))
            stain = np.exp(-(((xx - cx) ** 2) / (2 * sx * sx) + ((yy - cy) ** 2) / (2 * sy * sy)))
            arr -= stain[..., None] * rng.uniform(2.5, 6.5)
    if style == 'fibrous_cornerwear':
        arr[:60, :90] -= 8
        arr[-70:, -100:] -= 5
    return np.clip(arr, 0, 255).astype(np.uint8)


def render_page(sample, lines):
    rng = np.random.default_rng(sample['seed'])
    page = Image.fromarray(paper(rng, sample['page_w'], sample['page_h'], sample['page_style'])).convert('RGBA')
    draw = ImageDraw.Draw(page)
    inner = 60 if sample['open_book'] else 72
    outer = 84 if sample['open_book'] else 72
    top = 62
    if sample['open_book'] and sample['book_side'] == 'right':
        left_margin = inner
    elif sample['open_book'] and sample['book_side'] == 'left':
        left_margin = outer
    else:
        left_margin = 74
    y = top
    for line in lines:
        if line == '':
            y += 15
            continue
        jitter = float(rng.uniform(-0.55, 0.75)) if sample['difficulty'] != 'easy' else 0.0
        xj = float(rng.uniform(-0.3, 0.4)) if sample['difficulty'] == 'difficult' else 0.0
        ink = 44 + int(rng.integers(-3, 4))
        draw.text((left_margin + xj, y + jitter), line, font=FONT, fill=(ink, ink - 5, ink - 8, 255))
        y += LINE_STEP
    return np.array(page)


def curve_page(arr, sample):
    if not sample['open_book']:
        return arr
    h, w = arr.shape[:2]
    X, Y = np.meshgrid(np.arange(w, dtype=np.float32), np.arange(h, dtype=np.float32))
    if sample['book_side'] == 'right':
        dx = X
        sign = 1.0
    else:
        dx = (w - 1) - X
        sign = -1.0
    decay = np.exp(-dx / (w * 0.18))
    prof = np.power(np.clip(np.sin(np.pi * (Y / max(1, h - 1))), 0.0, 1.0), 1.12)
    y_shift = sample['curvature_amp'] * decay * prof
    x_shift = sample['curvature_amp'] * 0.18 * decay * (0.5 - np.abs(Y / max(1, h - 1) - 0.5)) * sign
    map_x = np.clip(X + x_shift, 0, w - 1).astype(np.float32)
    map_y = np.clip(Y - y_shift, 0, h - 1).astype(np.float32)
    warped = cv2.remap(arr, map_x, map_y, interpolation=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
    wave = np.sin((Y / max(1, h - 1)) * np.pi * 2) * decay * sign * 1.2
    map_x2 = np.clip(X + wave, 0, w - 1).astype(np.float32)
    map_y2 = np.clip(Y, 0, h - 1).astype(np.float32)
    return cv2.remap(warped, map_x2, map_y2, interpolation=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)


def light_page(arr, sample, rng):
    out = arr.astype(np.float32)
    h, w = out.shape[:2]
    xx = np.linspace(0, 1, w, dtype=np.float32)[None, :]
    yy = np.linspace(0, 1, h, dtype=np.float32)[:, None]
    if sample['gutter_shadow'] > 0:
        edge = xx if sample['book_side'] == 'right' else 1 - xx
        band = np.exp(-edge / 0.045) * (0.52 + 0.48 * np.power(np.clip(np.sin(np.pi * yy), 0.0, 1.0), 1.1))
        out[:, :, :3] *= (1 - sample['gutter_shadow'] * band)[..., None]
    light = np.ones((h, w), dtype=np.float32)
    style = sample['lighting_style']
    if style == 'warm_side':
        light *= 1 + 0.10 * (0.56 - xx) - 0.04 * (yy - 0.5)
    elif style == 'top_hotspot_soft':
        light *= 1 - 0.03 * yy + 0.02 * xx
    elif style == 'oblique_shadow':
        light *= 1 - 0.08 * (0.8 * xx + 0.6 * yy)
    elif style == 'cool_uneven':
        light *= 1 - 0.03 * xx + 0.05 * (yy - 0.5)
    elif style == 'soft_even_shadow':
        light *= 1 - 0.02 * yy + 0.015 * xx
    elif style == 'clean_even':
        light *= 1 - 0.012 * yy
    if sample['hotspot_strength'] > 0:
        cx = float(rng.uniform(0.18, 0.82))
        cy = 0.22 if style != 'clean_even' else 0.18
        sx = 0.15 if sample['difficulty'] == 'difficult' else 0.11
        sy = 0.10
        spot = np.exp(-(((xx - cx) ** 2) / (2 * sx * sx) + ((yy - cy) ** 2) / (2 * sy * sy)))
        light *= 1 + sample['hotspot_strength'] * spot
    out[:, :, :3] *= light[..., None]
    return np.clip(out, 0, 255).astype(np.uint8)


def page_size(sample):
    aspect = 0.71
    area = W * H * (sample['page_coverage_pct'] / 100.0)
    h = int(round(math.sqrt(area / aspect)))
    w = int(round(h * aspect))
    return min(w, W - 38), min(h, H - 38)


def build_quad(sample):
    w, h = sample['page_w'], sample['page_h']
    offsets = {
        'photographed_001': (24, -16),
        'photographed_002': (-28, -44),
        'photographed_003': (-46, 28),
        'photographed_004': (18, 18),
        'photographed_005': (-24, 22),
        'photographed_006': (4, -8),
    }
    mx = (W - w) / 2 + offsets[sample['id']][0]
    my = (H - h) / 2 + offsets[sample['id']][1]
    x0, y0, x1, y1 = mx, my, mx + w, my + h
    p = math.tan(math.radians(sample['perspective_deg'])) * h * 0.055
    s = math.tan(math.radians(sample['skew_deg'])) * h * 0.10
    quad = np.array([
        [x0 + p * 0.80 + max(0, s) * 0.20, y0 + p * 0.16],
        [x1 - p * 0.68 + max(0, -s) * 0.12, y0 - p * 0.03],
        [x1 + p * 0.10 - max(0, s) * 0.10, y1 + p * 0.05],
        [x0 - p * 0.12 - max(0, -s) * 0.08, y1 + p * 0.11],
    ], dtype=np.float32)
    a = math.radians(sample['rotation_deg'])
    c = np.array([W / 2, H / 2], dtype=np.float32)
    R = np.array([[math.cos(a), -math.sin(a)], [math.sin(a), math.cos(a)]], dtype=np.float32)
    return ((quad - c) @ R.T) + c


def warp_rgba(rgba, quad):
    h, w = rgba.shape[:2]
    src = np.array([[0, 0], [w - 1, 0], [w - 1, h - 1], [0, h - 1]], dtype=np.float32)
    M = cv2.getPerspectiveTransform(src, quad.astype(np.float32))
    return cv2.warpPerspective(rgba, M, (W, H), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=(0, 0, 0, 0))


def degradation_list(sample):
    items = ['perspective']
    if abs(sample['rotation_deg']) > 0.01:
        items.append('rotation')
    if sample['skew_deg'] > 0.01:
        items.append('skew')
    if sample['open_book']:
        items += ['line_curvature', 'gutter_shadow', 'nonlinear_page_warp']
    items += ['uneven_lighting', 'paper_texture']
    if sample['noise_sigma'] > 0.5:
        items.append('gaussian_sensor_noise')
    if sample['jpeg_quality'] < 75:
        items.append('jpeg_artifacts')
    if sample['ds_scale'] < 0.99:
        items.append('reduced_effective_resolution')
    items.append('mild_blur' if sample['blur_level'] <= 2 else 'moderate_blur')
    return ','.join(items)


def param_string(sample):
    parts = [
        f'page_coverage_pct={sample["page_coverage_pct"]}',
        f'borde_exterior_pct={sample["borde_exterior_pct"]}',
        f'perspective_deg={sample["perspective_deg"]}',
        f'rotation_deg={sample["rotation_deg"]}',
        f'skew_deg={sample["skew_deg"]}',
        f'open_book={str(sample["open_book"]).lower()}',
        f'book_side={sample["book_side"]}',
        f'blur_level={sample["blur_level"]}',
        f'jpeg_quality={sample["jpeg_quality"]}',
        f'background_style={sample["background_style"]}',
        f'lighting_style={sample["lighting_style"]}',
        f'page_style={sample["page_style"]}',
    ]
    return ';'.join(parts)


def write_tsv(path, header, rows):
    with path.open('w', encoding='utf-8', newline='') as f:
        writer = csv.writer(f, delimiter='\t')
        writer.writerow(header)
        writer.writerows(rows)


def maybe_bundle():
    if not CREATE_BUNDLE:
        return
    with zipfile.ZipFile(BUNDLE, 'w', zipfile.ZIP_DEFLATED, compresslevel=1) as zf:
        for file in sorted(OUTDIR.iterdir()):
            if file.is_file():
                zf.write(file, arcname=file.name)


def render_sample(sample):
    rng = np.random.default_rng(sample['seed'])
    lines = TRANSCRIPTS[sample['id']].splitlines()
    sample['page_w'], sample['page_h'] = page_size(sample)
    page = render_page(sample, lines)
    page = curve_page(page, sample)
    page = light_page(page, sample, rng)
    quad = build_quad(sample)
    rgba = page.copy()
    alpha = rgba[:, :, 3]
    shadow = np.zeros_like(rgba)
    shadow[:, :, 3] = (cv2.GaussianBlur(alpha, (0, 0), sigmaX=14) * (0.25 if sample['difficulty'] == 'difficult' else 0.18)).astype(np.uint8)
    bg = background(rng, sample['background_style'])
    fg = cv2.cvtColor(bg, cv2.COLOR_RGB2RGBA).astype(np.float32)
    for layer in (warp_rgba(shadow, quad), warp_rgba(rgba, quad)):
        a = layer[:, :, 3:4].astype(np.float32) / 255.0
        fg[:, :, :3] = fg[:, :, :3] * (1 - a) + layer[:, :, :3] * a
    img = cv2.cvtColor(fg.astype(np.uint8), cv2.COLOR_RGBA2RGB).astype(np.float32)
    img += rng.normal(0, sample['noise_sigma'], img.shape)
    img = cv2.GaussianBlur(img, (0, 0), sigmaX=sample['blur_sigma'], sigmaY=sample['blur_sigma'])
    ds = sample['ds_scale']
    small = cv2.resize(np.clip(img, 0, 255).astype(np.uint8), (max(32, int(W * ds)), max(32, int(H * ds))), interpolation=cv2.INTER_AREA)
    img = cv2.resize(small, (W, H), interpolation=cv2.INTER_LINEAR)
    ok, enc = cv2.imencode('.jpg', cv2.cvtColor(img, cv2.COLOR_RGB2BGR), [int(cv2.IMWRITE_JPEG_QUALITY), sample['jpeg_quality']])
    if not ok:
        raise RuntimeError(f'JPEG encode failed: {sample["id"]}')
    decoded = cv2.imdecode(enc, cv2.IMREAD_COLOR)
    if decoded is None:
        raise RuntimeError(f'JPEG decode failed: {sample["id"]}')
    return cv2.cvtColor(decoded, cv2.COLOR_BGR2RGB)


def main():
    if OUTDIR.exists():
        shutil.rmtree(OUTDIR)
    ensure_dir(OUTDIR)
    manifest_rows = []
    qc_rows = []
    for sample in SAMPLES:
        img = render_sample(sample)
        png_path = OUTDIR / f'{sample["id"]}.png'
        txt_path = OUTDIR / f'{sample["id"]}.txt'
        ok = cv2.imwrite(str(png_path), cv2.cvtColor(img, cv2.COLOR_RGB2BGR), [int(cv2.IMWRITE_PNG_COMPRESSION), 1])
        if not ok:
            raise RuntimeError(f'PNG write failed: {sample["id"]}')
        txt_path.write_text(TRANSCRIPTS[sample['id']], encoding='utf-8')
        manifest_rows.append([sample['id'], sample['family'], png_path.name, txt_path.name, sample['difficulty'], degradation_list(sample), param_string(sample), sample['notes'], sample['seed']])
        qc_rows.append([sample['id'], sample['page_coverage_pct'], sample['perspective_deg'], sample['rotation_deg'], sample['skew_deg'], 'yes' if sample['open_book'] else 'no', 'yes' if sample['gutter_shadow'] > 0 else 'no', sample['notes']])
    write_tsv(OUTDIR / 'photographed_lot1_manifest.tsv', ['id','family','filename','transcript_filename','difficulty','degradations','params','notes','seed'], manifest_rows)
    write_tsv(OUTDIR / 'photographed_lot1_qc.tsv', ['id','page_coverage_pct','perspective_deg','rotation_deg','skew_deg','curvature_present','gutter_shadow_present','realism_notes'], qc_rows)
    maybe_bundle()
    print('OK')


if __name__ == '__main__':
    main()
