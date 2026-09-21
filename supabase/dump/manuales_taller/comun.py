"""
Lectura del ZIP de manuales, compartida por preparar.py y subir.py.

Los dos tienen que producir EXACTAMENTE los mismos bytes por manual: la ruta en
Storage sale de la huella (sha256). Por eso la unión del Azteca y el descifrado
viven acá y en ningún otro lado.
"""
import re
import sys
import unicodedata
import zipfile
from pathlib import Path

import fitz  # PyMuPDF

# La consola de Windows usa cp1252 y no imprime «→» ni «·»: sin esto, un print
# tira UnicodeEncodeError DESPUÉS de haber hecho el trabajo.
try:
    sys.stdout.reconfigure(encoding="utf-8")
except (AttributeError, ValueError):
    pass

ZIP_POR_DEFECTO = Path(r"C:\Users\Daniel\Downloads\OneDrive_1_20-9-2026.zip")
AZTECA_DIR = "PA 23-250 AZTECA MM/"
AZTECA_CLAVE = "pa-23-250-azteca-mm"
TOPE_TOMO = 52428800  # 50 MiB: el tope por archivo del plan gratuito de Supabase

# Duplicados vistos en el inventario: se descarta la clave de la izquierda y se
# conserva la de la derecha, pero SOLO después de comprobar que el texto coincide.
DUPLICADOS = {
    "pa28-service": "service-manual-140-200r",
    "overhaul-manual-lycoming-direct-drive-eng-autosaved": "overhaul-manual-lycoming-direct-drive-eng",
}


def slug(nombre):
    s = unicodedata.normalize("NFKD", nombre).encode("ascii", "ignore").decode()
    s = re.sub(r"\.pdf$", "", s, flags=re.I).lower()
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")[:60].strip("-")


def _muestra(doc):
    n = doc.page_count
    return [" ".join(doc[i].get_text().split()) for i in sorted({0, n // 4, n // 2, (3 * n) // 4, n - 1})]


def grupos_del_zip(z):
    """[(clave, [nombres en el ZIP])] de los manuales finales, sin duplicados."""
    grupos = {}
    for n in z.namelist():
        if n.endswith("/") or not n.lower().endswith(".pdf"):
            continue
        clave = AZTECA_CLAVE if n.startswith(AZTECA_DIR) else slug(Path(n).name)
        grupos.setdefault(clave, []).append(n)
    for dup, queda in DUPLICADOS.items():
        if dup not in grupos:
            continue
        with fitz.open(stream=z.read(grupos[dup][0]), filetype="pdf") as a, \
             fitz.open(stream=z.read(grupos[queda][0]), filetype="pdf") as b:
            if a.page_count != b.page_count or _muestra(a) != _muestra(b):
                sys.exit(f"{dup} y {queda} NO son el mismo manual: revisar antes de descartar.")
        del grupos[dup]
    return sorted(grupos.items())


def bytes_finales(z, clave, nombres):
    """Los bytes que se suben: el Azteca unido en orden de nombre; todo, sin cifrado."""
    if clave == AZTECA_CLAVE:
        salida = fitz.open()
        for n in sorted(nombres):
            with fitz.open(stream=z.read(n), filetype="pdf") as parte:
                salida.insert_pdf(parte)
        # garbage=1 y sin deflate: rápido y determinista. garbage=3 + deflate tardaba minutos.
        # use_objstms: ver en_tomos (sin esto el visor baja el archivo entero al abrirlo).
        datos = salida.tobytes(garbage=1, use_objstms=1, no_new_id=True)
        salida.close()
    else:
        datos = z.read(nombres[0])
    with fitz.open(stream=datos, filetype="pdf") as doc:
        if doc.needs_pass:
            sys.exit(f"{clave} pide contraseña para abrirse: no se puede cargar así.")
        # 🚨 NO usar doc.is_encrypted: PyMuPDF desbloquea solo los PDF que tienen
        # únicamente contraseña de dueño y ahí `is_encrypted` da False. Son 10 de
        # los 35 manuales (RC4), entre ellos el del Cessna 152, y pdf-lib no los
        # puede recortar. Lo que sí lo dice es el metadato "encryption".
        if not doc.metadata.get("encryption"):
            return datos
        return doc.tobytes(encryption=fitz.PDF_ENCRYPT_NONE, no_new_id=True)


def en_tomos(clave, datos):
    """Si pasa el tope por archivo, lo parte en dos mitades por página: [(clave, bytes)]."""
    if len(datos) <= TOPE_TOMO:
        return [(clave, datos)]
    with fitz.open(stream=datos, filetype="pdf") as doc:
        mitad = doc.page_count // 2
        partes = []
        for i, (desde, hasta) in enumerate([(0, mitad - 1), (mitad, doc.page_count - 1)], start=1):
            t = fitz.open()
            t.insert_pdf(doc, from_page=desde, to_page=hasta)
            # 🚨 use_objstms=1 NO es opcional: sin object streams, el árbol de
            # páginas queda desparramado por todo el archivo y el visor (pdf.js por
            # rangos) tiene que bajar el 98% del tomo solo para abrirlo. Con ellos,
            # el 3%. Medido el 2026-09-21 sobre el tomo 1 del T303 (31 MB).
            partes.append((f"{clave}-tomo-{i}", t.tobytes(garbage=1, use_objstms=1, no_new_id=True)))
            t.close()
    return partes
