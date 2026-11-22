"""Configuración de PostgreSQL y conexiones para las consultas del censo."""

import os
from collections.abc import Iterator
from pathlib import Path

from dotenv import load_dotenv
from fastapi import Request
from sqlalchemy import URL, create_engine, make_url
from sqlalchemy.engine import Connection, Engine

load_dotenv(Path(__file__).resolve().parents[1] / ".env")


def crear_motor() -> Engine:
    if direccion := os.getenv("DATABASE_URL"):
        url = make_url(direccion)
        if url.drivername not in {"postgresql", "postgresql+psycopg2"}:
            raise ValueError("DATABASE_URL debe apuntar a PostgreSQL con psycopg2.")
        url = url.set(drivername="postgresql+psycopg2")
    else:
        url = URL.create(
            "postgresql+psycopg2",
            username=os.environ["DB_USER"],
            password=os.getenv("DB_PASSWORD"),
            host=os.getenv("DB_HOST", "localhost"),
            port=int(os.getenv("DB_PORT", "5432")),
            database=os.environ["DB_NAME"],
        )
    return create_engine(url, pool_pre_ping=True)


def get_connection(request: Request) -> Iterator[Connection]:
    with request.app.state.motor.connect() as conexion:
        yield conexion
