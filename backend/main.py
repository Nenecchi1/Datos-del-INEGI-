"""Aplicación FastAPI del Censo de México."""

import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .db import crear_motor
from .routes import estados, localidades, municipios


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.motor = crear_motor()
    try:
        yield
    finally:
        app.state.motor.dispose()


app = FastAPI(title="API del Censo de México 2020", lifespan=lifespan)
origins = os.getenv("CORS_ORIGINS", "").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in origins if origin.strip()],
    allow_methods=["GET"],
)

for rutas in (estados, municipios, localidades):
    app.include_router(rutas.router, prefix="/api")


@app.get("/health")
def health():
    return {"status": "ok"}


frontend = Path(__file__).resolve().parents[1] / "frontend"
if (frontend / "index.html").is_file():
    app.mount("/", StaticFiles(directory=frontend, html=True), name="frontend")
