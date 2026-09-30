"""
Paso 2 de 3: sube los manuales a Supabase Storage (bucket privado manuales-taller).

Corre con las credenciales de Railway, que NO se imprimen ni se guardan:
    cd legacy/CAA-backend
    railway run python ../../supabase/dump/manuales_taller/subir.py [--tomos] [ruta_del_zip]

Re-ejecutable: la ruta sale de la huella del archivo y, si ya existe, se da por
subido. Escribe subidos.json: clave → {sha256, paginas, tamano_bytes, archivo_path}.

--tomos: parte en dos lo que pase de 50 MiB (plan gratuito de Supabase). Usarlo
SOLO si la primera corrida falla con "tamaño máximo". En la carga del 2026-09-21
fallaron tres: los dos del T303 y el Azteca ya unido.
"""
import hashlib
import json
import os
import sys
import uuid
import zipfile
from pathlib import Path

import fitz
import requests

sys.path.insert(0, str(Path(__file__).parent))
from comun import ZIP_POR_DEFECTO, grupos_del_zip, bytes_finales, en_tomos  # noqa: E402

AQUI = Path(__file__).parent
BUCKET = "manuales-taller"
NS = uuid.UUID("6f1c2a6e-8d0b-4a8e-9a55-2c7c0f6b1e11")  # fijo: misma huella → misma ruta


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    tomos = "--tomos" in sys.argv
    url = os.environ["SUPABASE_URL"].rstrip("/")
    key = os.environ["SUPABASE_SERVICE_KEY"]
    h = {"Authorization": f"Bearer {key}", "apikey": key}

    r = requests.get(f"{url}/storage/v1/bucket/{BUCKET}", headers=h, timeout=30)
    if r.status_code != 200:
        sys.exit(f"El bucket {BUCKET} no existe: correr primero la migración 20260921000001.")

    z = zipfile.ZipFile(Path(args[0]) if args else ZIP_POR_DEFECTO)
    previo = AQUI / "subidos.json"
    salida = json.loads(previo.read_text(encoding="utf-8")) if previo.exists() else {}
    fallos = []
    for clave, nombres in grupos_del_zip(z):
        datos = bytes_finales(z, clave, nombres)
        partes = en_tomos(clave, datos) if tomos else [(clave, datos)]
        for k, b in partes:
            sha = hashlib.sha256(b).hexdigest()
            ruta = f"manuales/{uuid.uuid5(NS, sha)}.pdf"
            resp = requests.post(
                f"{url}/storage/v1/object/{BUCKET}/{ruta}",
                headers={**h, "Content-Type": "application/pdf", "x-upsert": "false"},
                data=b, timeout=900,
            )
            ya_estaba = resp.status_code == 409 or '"409"' in resp.text or "already exists" in resp.text
            if resp.status_code in (200, 201) or ya_estaba:
                with fitz.open(stream=b, filetype="pdf") as d:
                    salida[k] = {"sha256": sha, "paginas": d.page_count, "tamano_bytes": len(b), "archivo_path": ruta}
                print(f"{'YA   ' if ya_estaba else 'OK   '} {k} ({len(b) / 1048576:.1f} MB)")
            else:
                fallos.append(k)
                print(f"FALLO {k}: {resp.status_code} {resp.text[:200]}")
    previo.write_text(json.dumps(salida, indent=1), encoding="utf-8")
    print(f"\n{len(salida)} subidos · {len(fallos)} fallos {fallos if fallos else ''}")
    if fallos:
        sys.exit(1)


if __name__ == "__main__":
    main()
