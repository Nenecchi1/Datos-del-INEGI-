# language: es
Característica: Consulta y visualización de datos del Censo de Población y Vivienda 2020 (INEGI)
  Como analista de una empresa comercializadora de productos de consumo
  Quiero consultar, filtrar, comparar y graficar indicadores censales por zona y edad
  Para identificar mercados potenciales y planear dónde ofrecer los productos

  # Los escenarios usan la base censo_inegi con los datos del ITER 2020 ya cargados.
  Antecedentes:
    Dado que estoy en la página de búsqueda

  @estatal @consulta
  Escenario: Consultar la población total y por sexo de un estado válido
    Cuando ingreso el estado "Jalisco"
    Entonces se muestra una población total de "8,348,151" habitantes
    Y se muestran "4,249,696" mujeres y "4,098,455" hombres

  @municipal @filtros
  Esquema del escenario: Filtrar población por municipio y grupo de edad
    Cuando ingreso el estado "<entidad>"
    Y selecciono el municipio "<municipio>"
    Y selecciono el rango de edad "<rango_edad>"
    Entonces se muestra una población de "<poblacion>" habitantes

    Ejemplos:
      | entidad          | municipio  | rango_edad | poblacion |
      | Ciudad de México | Cuauhtémoc | 0 a 14     | 83,469    |
      | Ciudad de México | Cuauhtémoc | 15 a 64    | 398,058   |
      | Ciudad de México | Cuauhtémoc | 65 y más   | 64,291    |
      | Ciudad de México | Iztapalapa | 15 a 64    | 1,293,944 |

  @visualizacion @graficas
  Escenario: Visualizar en una gráfica la distribución por edad de Cuauhtémoc
    Dado que consulté el municipio "Cuauhtémoc" de "Ciudad de México"
    Cuando selecciono la opción "Ver gráfico"
    Entonces se muestra un gráfico de barras con los grupos "0 a 14", "15 a 64" y "65 y más"
    Y la barra "15 a 64" es la de mayor valor
    Y la gráfica y la tabla municipal muestran estas poblaciones por grupo de edad
      | grupo    | poblacion |
      | 0 a 14   | 83,469    |
      | 15 a 64  | 398,058   |
      | 65 y más | 64,291    |

  @comparativa @educacion
  Escenario: Comparar el grado promedio de escolaridad entre dos municipios
    Cuando comparo los municipios "Cuauhtémoc" e "Iztapalapa" de "Ciudad de México"
    Y selecciono el criterio "Nivel educativo"
    Entonces se muestra un grado promedio de escolaridad de "12.41" para "Cuauhtémoc"
    Y se muestra un grado promedio de escolaridad de "10.42" para "Iztapalapa"

  @validacion @negativo
  Escenario: Buscar una entidad federativa inexistente
    Cuando ingreso el estado "Jaliscoo"
    Entonces se muestra el mensaje "No se encontró el estado ingresado"
    Y el sistema no muestra registros censales

  @localidad @confidencialidad
  Escenario: Consultar un indicador reservado de una localidad
    Dado que consulto la localidad "Alacates" del municipio "Acatic" en "Jalisco"
    Cuando selecciono el rango de edad "18 a 24"
    Entonces el indicador aparece como "Dato confidencial" en lugar de un número