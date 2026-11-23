from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.engine import Connection

from ..db import get_connection

router = APIRouter(prefix="/estados", tags=["Estados"])


@router.get("/catalogo")
def listar_estados(conexion: Connection = Depends(get_connection)):
    consulta = text("""
        SELECT entidad, nom_ent
        FROM censo.v_poblacion_estatal
        ORDER BY nom_ent
    """)
    return [dict(fila) for fila in conexion.execute(consulta).mappings()]


@router.get("")
def consultar_estado(estado: str, conexion: Connection = Depends(get_connection)):
    consulta = text("""
        SELECT cvegeo, entidad, nom_ent, pobtot, pobfem, pobmas
        FROM censo.v_poblacion_estatal
        WHERE lower(nom_ent) = lower(:estado)
    """)
    fila = conexion.execute(consulta, {"estado": estado.strip()}).mappings().one_or_none()
    if fila is None:
        raise HTTPException(404, "No se encontró el estado ingresado")
    return dict(fila)
