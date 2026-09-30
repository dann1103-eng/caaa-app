"""
Lee las páginas de borde de cada rango sugerido para comprobar que la sección
empieza y termina donde dice catalogo.json (el índice solo da el comienzo).

    python verificar_rangos.py
Imprime, por rango: la primera línea de la página ANTERIOR al desde, del desde,
del hasta y de la SIGUIENTE al hasta. Lo correcto: el desde abre la sección y
la siguiente al hasta ya es otra sección.
"""
import json
import sys
import zipfile
from pathlib import Path

import fitz

from comun import ZIP_POR_DEFECTO, grupos_del_zip, bytes_finales

AQUI = Path(__file__).parent


def cabecera(doc, n):
    if n < 1 or n > doc.page_count:
        return "(fuera del manual)"
    return " ".join(doc[n - 1].get_text().split())[:160] or "(sin texto)"


def main():
    cat = json.loads((AQUI / "catalogo.json").read_text(encoding="utf-8"))
    z = zipfile.ZipFile(Path(sys.argv[1]) if len(sys.argv) > 1 else ZIP_POR_DEFECTO)
    grupos = dict(grupos_del_zip(z))
    vistos = set()
    for p in cat["paquetes_sugeridos"]:
        for e in p["extractos"]:
            k = (e["clave"], e["desde"], e["hasta"])
            if k in vistos:
                continue
            vistos.add(k)
            with fitz.open(stream=bytes_finales(z, e["clave"], grupos[e["clave"]]), filetype="pdf") as doc:
                print(f"\n== {e['clave']}  {e['desde']}–{e['hasta']}  «{e['titulo']}»")
                for etiqueta, n in [("antes", e["desde"] - 1), ("desde", e["desde"]), ("hasta", e["hasta"]), ("después", e["hasta"] + 1)]:
                    print(f"   {etiqueta:8s} p.{n:<5} {cabecera(doc, n)}")


if __name__ == "__main__":
    main()
