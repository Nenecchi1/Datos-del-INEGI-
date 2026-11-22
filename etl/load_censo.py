"""Carga completa del ITER 2020 en el esquema censo de PostgreSQL.

Ejecutar con `python etl/load_censo.py` desde la raíz del proyecto.
La carga reemplaza el contenido de las seis tablas en una sola transacción.
"""

import io
import os
import re
from decimal import Decimal
from pathlib import Path

import numpy as np
import pandas as pd
from dotenv import load_dotenv
from psycopg2 import sql
from sqlalchemy import create_engine
from sqlalchemy.engine import URL, make_url

ROOT_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT_DIR / "data" / "raw"
ITER_CSV = DATA_DIR / "conjunto_de_datos_iter_00CSV20.csv"
TAMLOC_CSV = DATA_DIR / "tam_loc.csv.csv"
FILAS_POR_BLOQUE = 10_000

GEO_COLS = [
    "ENTIDAD", "NOM_ENT", "MUN", "NOM_MUN", "LOC", "NOM_LOC",
    "LONGITUD", "LATITUD", "ALTITUD", "TAMLOC",
]
DEMO_COLS = [
    "POBTOT", "POBFEM", "POBMAS", "POB0_14", "POB15_64",
    "POB65_MAS", "P_0A2", "P_18A24", "P_60YMAS",
]
SOCIAL_COLS = [
    "GRAPROES", "P18YM_PB", "P15YM_AN", "P15A17A", "P18A24A",
    "P3A5_NOA", "P6A11_NOA", "P12A14NOA", "PDER_SS", "PSINDER",
    "PCON_DISC", "PDER_IMSS", "PDER_ISTE", "PDER_SEGP", "PDER_IMSSB",
    "PAFIL_IPRIV", "POCUPADA",
]
VIVIENDA_COLS = [
    "TOTHOG", "HOGJEF_F", "VIVPARH_CV", "VPH_C_SERV", "VPH_AUTOM", "VPH_INTER",
]
TABLAS_HECHOS = {
    "hecho_demografia": DEMO_COLS,
    "hecho_social": SOCIAL_COLS,
    "hecho_vivienda": VIVIENDA_COLS,
}
INDICADOR_COLS = DEMO_COLS + SOCIAL_COLS + VIVIENDA_COLS
USE_COLS = GEO_COLS + INDICADOR_COLS

DMS_REGEX = re.compile(
    r"""(\d+)[°º]\s*(\d+)['’′]\s*(\d+(?:\.\d+)?)["”″]?\s*([NSEWO])?""",
    re.IGNORECASE,
)


def url_conexion() -> URL:
    """Admite las cinco variables DB_* del proyecto o una DATABASE_URL explícita."""
    if direccion := os.getenv("DATABASE_URL"):
        url = make_url(direccion)
        if url.drivername not in {"postgresql", "postgresql+psycopg2"}:
            raise ValueError("DATABASE_URL debe usar postgresql+psycopg2 para COPY.")
        return url.set(drivername="postgresql+psycopg2")

    for clave in ("DB_NAME", "DB_USER"):
        if not os.getenv(clave):
            raise ValueError(f"Falta {clave} en el entorno o en el archivo .env.")
    return URL.create(
        "postgresql+psycopg2",
        username=os.environ["DB_USER"], password=os.getenv("DB_PASSWORD"),
        host=os.getenv("DB_HOST", "localhost"), port=int(os.getenv("DB_PORT", "5432")),
        database=os.environ["DB_NAME"],
    )


def dms_a_decimal(valor: str, es_longitud: bool = False) -> float | None:
    texto = valor.strip().upper()
    if texto in {"", "*", "N/D"}:
        return None
    coincidencia = DMS_REGEX.fullmatch(texto)
    if coincidencia:
        grados, minutos, segundos, hemisferio = coincidencia.groups()
        if int(minutos) >= 60 or float(segundos) >= 60:
            raise ValueError(f"Minutos o segundos fuera de rango: {valor!r}")
        permitidos = {"W", "O", "E"} if es_longitud else {"N", "S"}
        if hemisferio and hemisferio not in permitidos:
            raise ValueError(f"Hemisferio incompatible con la coordenada: {valor!r}")
        decimal = int(grados) + int(minutos) / 60 + float(segundos) / 3600
        if hemisferio in {"W", "O", "S"} or (not hemisferio and es_longitud):
            decimal = -decimal
    else:
        decimal = float(texto)
        if es_longitud and decimal > 0:
            decimal = -decimal  # El ITER expresa las longitudes de México al oeste.
    limite = 180 if es_longitud else 90
    if not -limite <= decimal <= limite:
        raise ValueError(f"Coordenada fuera de rango: {valor!r}")
    return round(decimal, 6)


def cargar_catalogo_tamloc(ruta: Path) -> pd.DataFrame:
    opciones = dict(header=None, dtype=str, keep_default_na=False)
    try:
        original = pd.read_csv(ruta, encoding="utf-8-sig", **opciones)
    except UnicodeDecodeError:
        original = pd.read_csv(ruta, encoding="latin-1", **opciones)
    codigos = original.iloc[:, 0].str.strip()
    filas = codigos.str.fullmatch(r"[0-9]+")  # Omite el encabezado del catálogo.
    resultado = pd.DataFrame({
        "tam_loc": codigos[filas].astype(int),
        "descripcion": original.loc[filas].iloc[:, 1].str.strip(),
    })
    if sorted(resultado["tam_loc"]) != list(range(1, 15)):
        raise ValueError("El catálogo debe contener una vez cada código del 1 al 14.")
    if resultado["descripcion"].eq("").any():
        raise ValueError("Hay estratos sin descripción en el catálogo TAMLOC.")
    resultado["ambito"] = np.where(resultado["tam_loc"] <= 4, "rural", "urbano")
    return resultado.sort_values("tam_loc")


def clave_geografica(columna: pd.Series, ancho: int) -> pd.Series:
    texto = columna.str.strip()
    validas = texto.str.fullmatch(rf"[0-9]{{1,{ancho}}}")
    if not validas.all():
        raise ValueError(f"Clave {columna.name} inválida: {texto[~validas].iloc[0]!r}")
    return texto.str.zfill(ancho)


def construir_geografia(datos: pd.DataFrame) -> pd.DataFrame:
    entidad = clave_geografica(datos["ENTIDAD"], 2)
    mun = clave_geografica(datos["MUN"], 3)
    loc = clave_geografica(datos["LOC"], 4)
    nivel = np.select(
        [loc.isin(["9998", "9999"]), entidad == "00", mun == "000", loc == "0000"],
        ["agrupado", "nacional", "estatal", "municipal"], default="localidad",
    )
    tamloc = datos["TAMLOC"].str.strip().where(nivel == "localidad", "")
    tamloc = tamloc.replace({"": None, "*": None, "N/D": None, "n/d": None})
    tamloc = pd.to_numeric(tamloc, errors="raise").astype("Int16")
    altitud = datos["ALTITUD"].str.strip().str.replace(r"^0+-(\d+)$", r"-\1", regex=True)
    altitud = altitud.replace({"": None, "*": None, "N/D": None, "n/d": None})
    return pd.DataFrame({
        "cvegeo": entidad + mun + loc, "entidad": entidad, "mun": mun, "loc": loc,
        "nom_ent": datos["NOM_ENT"].str.strip(), "nom_mun": datos["NOM_MUN"].str.strip(),
        "nom_loc": datos["NOM_LOC"].str.strip(), "nivel": nivel, "tamloc": tamloc,
        "longitud": [dms_a_decimal(v, es_longitud=True) for v in datos["LONGITUD"]],
        "latitud": [dms_a_decimal(v) for v in datos["LATITUD"]],
        "altitud": pd.to_numeric(altitud, errors="raise").astype("Int64"),
    })


def construir_indicadores(
    datos: pd.DataFrame, claves: pd.Series,
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Transforma los valores y registra la causa de cada NULL en el mismo paso."""
    valores = pd.DataFrame({"cvegeo": claves})
    motivos = []
    for columna in INDICADOR_COLS:
        texto = datos[columna].str.strip()
        confidencial = texto.eq("*")
        ausente = confidencial | texto.eq("") | texto.str.upper().eq("N/D")
        # Rechaza tokens inesperados para conservar el motivo de cada valor nulo.
        try:
            numeros = pd.to_numeric(texto.mask(ausente), errors="raise")
            if (numeros.isna() & ~ausente).any() or not np.isfinite(numeros.dropna()).all():
                raise ValueError("dato no numérico")
            if (numeros < 0).any():
                raise ValueError("indicador negativo")
            valores[columna.lower()] = (
                numeros.round(2) if columna == "GRAPROES" else numeros.astype("Int64")
            )
        except (ValueError, TypeError) as exc:
            raise ValueError(f"Valor inválido en el indicador {columna}: {exc}") from exc
        if ausente.any():
            motivos.append(pd.DataFrame({
                "cvegeo": claves[ausente],
                "variable": columna,
                "estado": np.where(confidencial[ausente], "confidencial", "sin_dato"),
            }))
    estados = pd.concat(motivos, ignore_index=True) if motivos else pd.DataFrame(
        columns=["cvegeo", "variable", "estado"]
    )
    return valores, estados


def copy_dataframe(cursor, df: pd.DataFrame, tabla: str) -> None:
    if df.empty:
        return
    columnas = sql.SQL(", ").join(sql.Identifier(nombre) for nombre in df.columns)
    orden = sql.SQL(r"COPY {} ({}) FROM STDIN WITH (FORMAT CSV, NULL '\N')").format(
        sql.Identifier("censo", tabla), columnas,
    )
    with io.StringIO(newline="") as buffer:
        df.to_csv(buffer, index=False, header=False, na_rep="\\N")
        buffer.seek(0)
        cursor.copy_expert(orden, buffer)


def verificar_referencias(cursor) -> int:
    """Contrasta las vistas con el Gherkin. Para una muestra, comprueba los casos presentes."""
    casos = [
        ("Jalisco", "140000000", "v_poblacion_estatal",
         ("nom_ent", "pobtot", "pobfem", "pobmas"), ("Jalisco", 8348151, 4249696, 4098455)),
        ("Cuauhtémoc", "090150000", "v_indicadores_municipales",
         ("nom_mun", "pob0_14", "pob15_64", "pob65_mas", "graproes"),
         ("Cuauhtémoc", 83469, 398058, 64291, Decimal("12.41"))),
        ("Iztapalapa", "090070000", "v_indicadores_municipales",
         ("nom_mun", "pob15_64", "graproes"), ("Iztapalapa", 1293944, Decimal("10.42"))),
        ("Alacates", "140010003", "v_localidades",
         ("nom_loc", "p_18a24", "estado_18a24"), ("Alacates", None, "confidencial")),
    ]
    claves = ["000000000"] + [caso[1] for caso in casos]
    cursor.execute("SELECT cvegeo FROM censo.dim_geografia WHERE cvegeo IN %s", (tuple(claves),))
    presentes = {fila[0] for fila in cursor.fetchall()}
    comprobados = 0
    for nombre, clave, vista, columnas, esperado in casos:
        if "000000000" not in presentes and clave not in presentes:
            continue
        consulta = sql.SQL("SELECT {} FROM {} WHERE cvegeo = %s").format(
            sql.SQL(", ").join(sql.Identifier(c) for c in columnas), sql.Identifier("censo", vista),
        )
        cursor.execute(consulta, (clave,))
        resultado = cursor.fetchone()
        if resultado != esperado:
            raise ValueError(f"{nombre}: se esperaba {esperado}, se obtuvo {resultado}.")
        comprobados += 1
    return comprobados


def main() -> None:
    load_dotenv(ROOT_DIR / ".env")
    url = url_conexion()
    catalogo = cargar_catalogo_tamloc(TAMLOC_CSV)
    engine = create_engine(url)
    total = 0
    try:
        with pd.read_csv(
            ITER_CSV, usecols=USE_COLS, dtype=str, keep_default_na=False,
            encoding="utf-8-sig", chunksize=FILAS_POR_BLOQUE,
        ) as bloques, engine.begin() as conexion:
            with conexion.connection.cursor() as cursor:
                cursor.execute("""
                    TRUNCATE censo.estado_indicador, censo.hecho_vivienda,
                             censo.hecho_social, censo.hecho_demografia,
                             censo.dim_geografia, censo.dim_tamano_localidad
                """)
                copy_dataframe(cursor, catalogo, "dim_tamano_localidad")
                for datos in bloques:
                    geografia = construir_geografia(datos)
                    valores, estados = construir_indicadores(datos, geografia["cvegeo"])
                    copy_dataframe(cursor, geografia, "dim_geografia")
                    for tabla, columnas in TABLAS_HECHOS.items():
                        campos = ["cvegeo"] + [c.lower() for c in columnas]
                        copy_dataframe(cursor, valores[campos], tabla)
                    copy_dataframe(cursor, estados, "estado_indicador")
                    total += len(datos)
                    print(f"Filas del ITER procesadas: {total:,}", flush=True)
                if total == 0:
                    raise ValueError("El CSV del censo no contiene registros.")
                comprobados = verificar_referencias(cursor)
    finally:
        engine.dispose()
    print(f"Carga confirmada: {total:,} filas del ITER. Referencias verificadas: {comprobados}/4.")


if __name__ == "__main__":
    main()