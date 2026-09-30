"""
Paso 1 de 3 de la carga inicial de manuales (spec 2026-09-20 §11).

Lee el ZIP SIN descomprimirlo a disco y escribe inventario.json: por manual, sus
páginas, tamaño, huella, texto de la portada y las entradas del índice que
hablan de inspecciones. Con eso se cura catalogo.json a mano.

    python preparar.py [ruta_del_zip]
"""
import hashlib
import json
import re
import sys
import zipfile
from pathlib import Path

import fitz

from comun import ZIP_POR_DEFECTO, AZTECA_CLAVE, grupos_del_zip, bytes_finales

INSPECCION = re.compile(r"INSPECT|HOUR|PERIODIC|SCHEDULED|ANNUAL|TIME LIMIT", re.I)


def main():
    ruta = Path(sys.argv[1]) if len(sys.argv) > 1 else ZIP_POR_DEFECTO
    z = zipfile.ZipFile(ruta)
    manuales = []
    for clave, nombres in grupos_del_zip(z):
        with fitz.open(stream=z.read(sorted(nombres)[0]), filetype="pdf") as original:
            cifrado = bool(original.metadata.get("encryption"))
        datos = bytes_finales(z, clave, nombres)
        with fitz.open(stream=datos, filetype="pdf") as limpio:
            assert not limpio.metadata.get("encryption"), f"{clave} sigue cifrado después de descifrarlo"
        if clave == AZTECA_CLAVE:
            # Tiene que salir idéntico cada vez: su ruta en Storage sale de la huella.
            otra = bytes_finales(z, clave, nombres)
            assert hashlib.sha256(datos).digest() == hashlib.sha256(otra).digest(), "El Azteca no sale igual dos veces"
        with fitz.open(stream=datos, filetype="pdf") as doc:
            toc = doc.get_toc()
            manuales.append({
                "clave": clave,
                "archivos": sorted(nombres) if clave != AZTECA_CLAVE else [f"PA 23-250 AZTECA MM/* ({len(nombres)} pedazos)"],
                "sha256": hashlib.sha256(datos).hexdigest(),
                "paginas": doc.page_count,
                "tamano_bytes": len(datos),
                "venia_cifrado": cifrado,
                "portada": " ".join(doc[0].get_text().split())[:400],
                "indice_inspeccion": [[lvl, t.strip(), p] for lvl, t, p in toc if INSPECCION.search(t)][:40],
            })
    salida = Path(__file__).parent / "inventario.json"
    salida.write_text(json.dumps({"zip": ruta.name, "manuales": manuales}, ensure_ascii=False, indent=1), encoding="utf-8")
    mb = sum(m["tamano_bytes"] for m in manuales) / 1048576
    cifrados = [m["clave"] for m in manuales if m["venia_cifrado"]]
    print(f"{len(manuales)} manuales · {mb:.0f} MB → {salida.name}")
    print(f"venían cifrados ({len(cifrados)}): {', '.join(cifrados)}")


if __name__ == "__main__":
    main()
