-- Prototipo 6 | Censo de Población y Vivienda 2020
-- Ejecutar en la base censo_inegi. Las claves se reciben como texto desde la ETL.
BEGIN;

CREATE SCHEMA IF NOT EXISTS censo;

CREATE TABLE IF NOT EXISTS censo.dim_tamano_localidad (
    tam_loc     SMALLINT PRIMARY KEY CHECK (tam_loc BETWEEN 1 AND 14),
    descripcion VARCHAR(40) NOT NULL,
    ambito      VARCHAR(6) NOT NULL,
    CHECK (ambito = CASE WHEN tam_loc <= 4 THEN 'rural' ELSE 'urbano' END)
);

CREATE TABLE IF NOT EXISTS censo.dim_geografia (
    cvegeo   CHAR(9) PRIMARY KEY,
    entidad  CHAR(2) NOT NULL CHECK (entidad ~ '^[0-9]{2}$'),
    mun      CHAR(3) NOT NULL CHECK (mun ~ '^[0-9]{3}$'),
    loc      CHAR(4) NOT NULL CHECK (loc ~ '^[0-9]{4}$'),
    nom_ent  VARCHAR(50) NOT NULL,
    nom_mun  VARCHAR(100) NOT NULL,
    nom_loc  VARCHAR(150) NOT NULL,
    nivel    VARCHAR(10) NOT NULL,
    tamloc   SMALLINT REFERENCES censo.dim_tamano_localidad (tam_loc),
    longitud NUMERIC(9,6) CHECK (longitud BETWEEN -180 AND 180),
    latitud  NUMERIC(9,6) CHECK (latitud BETWEEN -90 AND 90),
    altitud  INTEGER,

    CONSTRAINT clave_geografica_valida
        CHECK (cvegeo = (entidad::TEXT || mun::TEXT || loc::TEXT)),
    CONSTRAINT jerarquia_geografica_valida
        CHECK ((entidad <> '00' OR mun = '000')
           AND (mun <> '000' OR loc IN ('0000', '9998', '9999'))),
    CONSTRAINT nivel_geografico_valido
        CHECK (nivel = CASE
            WHEN loc IN ('9998', '9999') THEN 'agrupado'
            WHEN entidad = '00' THEN 'nacional'
            WHEN mun = '000' THEN 'estatal'
            WHEN loc = '0000' THEN 'municipal'
            ELSE 'localidad'
        END),
    CONSTRAINT estrato_de_localidad
        CHECK (tamloc IS NULL OR nivel = 'localidad')
);

-- Una fila por clave geográfica del Censo 2020 en cada tabla de hechos.
-- Un indicador reservado o ausente se carga como NULL. El valor 0 es válido.
CREATE TABLE IF NOT EXISTS censo.hecho_demografia (
    cvegeo    CHAR(9) PRIMARY KEY REFERENCES censo.dim_geografia (cvegeo),
    pobtot    INTEGER CHECK (pobtot >= 0),
    pobfem    INTEGER CHECK (pobfem >= 0),
    pobmas    INTEGER CHECK (pobmas >= 0),
    pob0_14   INTEGER CHECK (pob0_14 >= 0),
    pob15_64  INTEGER CHECK (pob15_64 >= 0),
    pob65_mas INTEGER CHECK (pob65_mas >= 0),
    p_0a2     INTEGER CHECK (p_0a2 >= 0),
    p_18a24   INTEGER CHECK (p_18a24 >= 0),
    p_60ymas  INTEGER CHECK (p_60ymas >= 0)
);

CREATE TABLE IF NOT EXISTS censo.hecho_social (
    cvegeo      CHAR(9) PRIMARY KEY REFERENCES censo.dim_geografia (cvegeo),
    graproes    NUMERIC(4,2) CHECK (graproes >= 0),
    p18ym_pb    INTEGER CHECK (p18ym_pb >= 0),
    p15ym_an    INTEGER CHECK (p15ym_an >= 0),
    p15a17a     INTEGER CHECK (p15a17a >= 0),
    p18a24a     INTEGER CHECK (p18a24a >= 0),
    p3a5_noa    INTEGER CHECK (p3a5_noa >= 0),
    p6a11_noa   INTEGER CHECK (p6a11_noa >= 0),
    p12a14noa   INTEGER CHECK (p12a14noa >= 0),
    pder_ss     INTEGER CHECK (pder_ss >= 0),
    psinder     INTEGER CHECK (psinder >= 0),
    pcon_disc   INTEGER CHECK (pcon_disc >= 0),
    pder_imss   INTEGER CHECK (pder_imss >= 0),
    pder_iste   INTEGER CHECK (pder_iste >= 0),
    pder_segp   INTEGER CHECK (pder_segp >= 0),
    pder_imssb  INTEGER CHECK (pder_imssb >= 0),
    pafil_ipriv INTEGER CHECK (pafil_ipriv >= 0),
    pocupada    INTEGER CHECK (pocupada >= 0)
);

CREATE TABLE IF NOT EXISTS censo.hecho_vivienda (
    cvegeo     CHAR(9) PRIMARY KEY REFERENCES censo.dim_geografia (cvegeo),
    tothog     INTEGER CHECK (tothog >= 0),
    hogjef_f   INTEGER CHECK (hogjef_f >= 0),
    vivparh_cv INTEGER CHECK (vivparh_cv >= 0),
    vph_c_serv INTEGER CHECK (vph_c_serv >= 0),
    vph_autom  INTEGER CHECK (vph_autom >= 0),
    vph_inter  INTEGER CHECK (vph_inter >= 0)
);

-- variable conserva el encabezado oficial en mayúsculas (por ejemplo, P_18A24).
-- Se registra la causa únicamente para los indicadores numéricos sin valor.
CREATE TABLE IF NOT EXISTS censo.estado_indicador (
    cvegeo   CHAR(9) REFERENCES censo.dim_geografia (cvegeo),
    variable VARCHAR(20) CHECK (variable ~ '^[A-Z][A-Z0-9_]*$'),
    estado   VARCHAR(20) NOT NULL CHECK (estado IN ('confidencial', 'sin_dato')),
    PRIMARY KEY (cvegeo, variable)
);

COMMIT;
