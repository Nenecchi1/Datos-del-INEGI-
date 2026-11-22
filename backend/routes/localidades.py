from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
from sqlalchemy.engine import Connection

from ..db import get_connection

router = APIRouter(prefix="/localidades", tags=["Localidades"])


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
    respuesta = dict(filas[0])
    mensajes = {"confidencial": "Dato confidencial", "sin_dato": "Sin dato"}
    respuesta["mensaje"] = mensajes.get(respuesta["estado_18a24"])
    return respuesta
