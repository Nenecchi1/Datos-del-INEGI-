from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.engine import Connection

from ..db import get_connection

router = APIRouter(prefix="/localidades", tags=["Localidades"])

LIMITE_RESULTADOS = 100
MENSAJES_18A24 = {"confidencial": "Dato confidencial", "sin_dato": "Sin dato"}


def _con_mensaje(fila):
    return {**fila, "mensaje": MENSAJES_18A24.get(fila["estado_18a24"])}


@router.get("/buscar")
def buscar_localidades(
    estado: str = "",
    municipio: str = "",
    localidad: str = "",
    conexion: Connection = Depends(get_connection),
):
    consulta = """
        SELECT cvegeo, nom_ent, nom_mun, nom_loc, ambito, pobtot, p_18a24, estado_18a24
        FROM censo.v_localidades
    """
    filtros = []
    parametros = {}
    for columna, valor in (("nom_ent", estado), ("nom_mun", municipio), ("nom_loc", localidad)):
        if valor.strip():
            filtros.append(f"lower({columna}) = lower(:{columna})")
            parametros[columna] = valor.strip()
    if filtros:
        consulta += " WHERE " + " AND ".join(filtros)
    consulta += " ORDER BY cvegeo LIMIT :limite"
    filas = conexion.execute(
        text(consulta), {**parametros, "limite": LIMITE_RESULTADOS + 1}
    ).mappings().all()
    return {
        "resultados": [_con_mensaje(fila) for fila in filas[:LIMITE_RESULTADOS]],
        "hay_mas": len(filas) > LIMITE_RESULTADOS,
    }


@router.get("")
def consultar_localidad(
    estado: str,
    municipio: str,
    localidad: str,
    cvegeo: Annotated[str | None, Query(pattern=r"^[0-9]{9}$")] = None,
    conexion: Connection = Depends(get_connection),
):
    consulta = """
        SELECT * FROM censo.v_localidades
        WHERE lower(nom_ent) = lower(:estado)
          AND lower(nom_mun) = lower(:municipio)
          AND lower(nom_loc) = lower(:localidad)
    """
    parametros = {
        "estado": estado.strip(),
        "municipio": municipio.strip(),
        "localidad": localidad.strip(),
    }
    if cvegeo is not None:
        consulta += " AND cvegeo = :cvegeo"
        parametros["cvegeo"] = cvegeo
    filas = conexion.execute(text(consulta + " ORDER BY cvegeo"), parametros).mappings().all()
    if not filas:
        raise HTTPException(404, "No se encontró la localidad ingresada")
    if len(filas) > 1:
        raise HTTPException(409, {
            "mensaje": "Hay varias localidades con ese nombre. Selecciona una clave cvegeo.",
            "claves": [fila["cvegeo"] for fila in filas],
        })
    return _con_mensaje(filas[0])
