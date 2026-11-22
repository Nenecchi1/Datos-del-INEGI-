from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.engine import Connection

from ..db import get_connection

router = APIRouter(prefix="/municipios", tags=["Municipios"])

RangoEdad = Literal["0 a 14", "15 a 64", "65 y más"]


def _buscar_municipio(conexion: Connection, estado: str, municipio: str):
    consulta = text("""
        SELECT cvegeo, entidad, mun, nom_ent, nom_mun,
               pob0_14, pob15_64, pob65_mas, graproes
        FROM censo.v_indicadores_municipales
        WHERE lower(nom_ent) = lower(:estado)
          AND (lower(nom_mun) = lower(:municipio) OR mun = :municipio)
        ORDER BY mun
    """)
    filas = conexion.execute(
        consulta, {"estado": estado.strip(), "municipio": municipio.strip()}
    ).mappings().all()
    if not filas:
        raise HTTPException(404, f"No se encontró el municipio {municipio} en {estado}")
    if len(filas) > 1:
        raise HTTPException(409, {
            "mensaje": "Hay varios municipios con ese nombre. Usa una de las claves municipales.",
            "claves": [fila["mun"] for fila in filas],
        })
    return filas[0]


@router.get("")
def consultar_municipio(
    estado: str,
    municipio: str,
    rango_edad: RangoEdad | None = None,
    conexion: Connection = Depends(get_connection),
):
    fila = _buscar_municipio(conexion, estado, municipio)
    grupos = {
        "0 a 14": fila["pob0_14"],
        "15 a 64": fila["pob15_64"],
        "65 y más": fila["pob65_mas"],
    }
    respuesta = {
        "cvegeo": fila["cvegeo"],
        "entidad": fila["entidad"],
        "mun": fila["mun"],
        "nom_ent": fila["nom_ent"],
        "nom_mun": fila["nom_mun"],
        "grupos_edad": grupos,
    }
    if rango_edad is not None:
        respuesta.update(rango_edad=rango_edad, poblacion=grupos[rango_edad])
    return respuesta


@router.get("/comparativa")
def comparar_escolaridad(
    estado: str,
    municipio_a: str,
    municipio_b: str,
    conexion: Connection = Depends(get_connection),
):
    municipios = []
    for nombre in (municipio_a, municipio_b):
        fila = _buscar_municipio(conexion, estado, nombre)
        municipios.append({
            "cvegeo": fila["cvegeo"],
            "nom_ent": fila["nom_ent"],
            "nom_mun": fila["nom_mun"],
            "graproes": fila["graproes"],
        })
    return {"criterio": "Nivel educativo", "municipios": municipios}
