-- Ejecutar en censo_inegi después de 01_schema_estrella.sql.
BEGIN;

-- Los filtros de la interfaz buscan nombres sin distinguir mayúsculas.
CREATE INDEX IF NOT EXISTS ix_geo_estatal_nombre
    ON censo.dim_geografia (lower(nom_ent))
    WHERE nivel = 'estatal';

CREATE INDEX IF NOT EXISTS ix_geo_municipal_entidad_nombre
    ON censo.dim_geografia (entidad, lower(nom_mun))
    WHERE nivel = 'municipal';

CREATE INDEX IF NOT EXISTS ix_geo_localidad_municipio_nombre
    ON censo.dim_geografia (entidad, mun, lower(nom_loc))
    WHERE nivel = 'localidad';

CREATE OR REPLACE VIEW censo.v_poblacion_estatal AS
SELECT g.cvegeo, g.entidad, g.nom_ent, d.pobtot, d.pobfem, d.pobmas
FROM censo.dim_geografia AS g
JOIN censo.hecho_demografia AS d ON d.cvegeo = g.cvegeo
WHERE g.nivel = 'estatal';

-- Los indicadores y promedios proceden de la fila oficial del municipio.
CREATE OR REPLACE VIEW censo.v_indicadores_municipales AS
SELECT g.cvegeo, g.entidad, g.mun, g.nom_ent, g.nom_mun,
       d.pobtot, d.pobfem, d.pobmas, d.pob0_14, d.pob15_64, d.pob65_mas,
       d.p_0a2, d.p_18a24, d.p_60ymas,
       s.graproes, s.p18ym_pb, s.p15ym_an, s.p15a17a, s.p18a24a,
       s.p3a5_noa, s.p6a11_noa, s.p12a14noa, s.pder_ss, s.psinder,
       s.pcon_disc, s.pder_imss, s.pder_iste, s.pder_segp, s.pder_imssb,
       s.pafil_ipriv, s.pocupada,
       v.tothog, v.hogjef_f, v.vivparh_cv, v.vph_c_serv, v.vph_autom, v.vph_inter
FROM censo.dim_geografia AS g
JOIN censo.hecho_demografia AS d ON d.cvegeo = g.cvegeo
LEFT JOIN censo.hecho_social AS s ON s.cvegeo = g.cvegeo
LEFT JOIN censo.hecho_vivienda AS v ON v.cvegeo = g.cvegeo
WHERE g.nivel = 'municipal';

-- Incluye las coordenadas para el mapa y el motivo de reserva del rango 18–24.
CREATE OR REPLACE VIEW censo.v_localidades AS
SELECT g.cvegeo, g.entidad, g.mun, g.loc, g.nom_ent, g.nom_mun, g.nom_loc,
       g.longitud, g.latitud, g.altitud, g.tamloc,
       t.descripcion AS tamano_localidad, t.ambito,
       d.pobtot, d.pob0_14, d.pob15_64, d.pob65_mas, d.p_0a2, d.p_18a24, d.p_60ymas,
       e.estado AS estado_18a24
FROM censo.dim_geografia AS g
LEFT JOIN censo.dim_tamano_localidad AS t ON t.tam_loc = g.tamloc
LEFT JOIN censo.hecho_demografia AS d ON d.cvegeo = g.cvegeo
LEFT JOIN censo.estado_indicador AS e
    ON e.cvegeo = g.cvegeo AND e.variable = 'P_18A24'
WHERE g.nivel = 'localidad';

COMMIT;
