# Prototipo 6 · Interfaz de consulta del Censo de México

Aplicación web en desarrollo para que una empresa comercializadora de productos de consumo pueda comparar mercados por estado, municipio o alcaldía. A partir del Censo de Población y Vivienda 2020 del INEGI, un analista podrá consultar cuántas personas viven en una zona, ver su distribución por edad y comparar indicadores como el grado promedio de escolaridad.

**Avance actual.** Las etapas 1 y 2 documentan el análisis de los datos, los seis escenarios de aceptación en Gherkin y el diseño de la base de datos en PostgreSQL. Hay dos scripts SQL para crear las tablas, los índices y las vistas. La siguiente etapa es la carga de los CSV con Python. Después se conectarán la API, la interfaz web y las pruebas automatizadas.

## Datos del INEGI

Coloca los tres archivos originales en `data/raw/`. El conjunto nacional está disponible en la opción **CSV** junto a **Estados Unidos Mexicanos**. [Consulta y descarga del INEGI](https://www.inegi.org.mx/app/scitel/Default?ev=9)

| Archivo | Uso en el proyecto |
| --- | --- |
| `conjunto_de_datos_iter_00CSV20.csv` | Contiene 195,662 registros y 232 columnas. El prototipo selecciona 42 variables para sus consultas. |
| `diccionario_datos_iter_00CSV20.csv` | Describe las variables y permite comprobar el significado de cada encabezado. |
| `tam_loc.csv.csv` | Define las 14 categorías de tamaño de localidad. |

La carga debe conservar los ceros iniciales de las claves. Por ejemplo, `09` (Ciudad de México), `015` (Cuauhtémoc) y `0000` (total de la alcaldía) forman la clave `090150000`. Para las consultas de población se usa el total del nivel solicitado y se evita contar otra vez a sus localidades. Un asterisco (`*`) se registra como dato confidencial, `N/D` como dato faltante y `0` como valor numérico válido.

## Estructura del proyecto

| Ruta | Responsabilidad |
| --- | --- |
| `data/raw/` | Archivos CSV originales del INEGI. |
| `sql/` | Scripts de creación del esquema, índices y vistas. |
| `etl/load_censo.py` | Lectura, limpieza y carga en PostgreSQL con pandas y SQLAlchemy. |
| `backend/` | API en FastAPI. `database.py` gestiona la conexión y `routes/censo.py` consulta las vistas. |
| `frontend/` | Interfaz en HTML5, CSS y JavaScript. `js/api.js` consulta la API, `js/charts.js` dibuja las gráficas con Chart.js y `js/app.js` gestiona los filtros, el mapa y la exportación. |
| `features/` | Escenarios en `censo_mexico.feature`, configuración de Selenium en `environment.py` y pasos de Behave en `steps/censo_steps.py`. |

Las dependencias de Python se registran en `requirements.txt`. Las credenciales de PostgreSQL se guardan localmente en `.env`. El archivo `.gitignore` debe excluir `.env`, `.venv/`, `__pycache__/` y el CSV censal de gran tamaño.

## Preparar la base de datos

Con PostgreSQL en ejecución y `psql` disponible en la terminal, sitúate en la raíz del proyecto. Los comandos suponen una instalación local con el usuario `postgres`. Si usas otro usuario, sustituye ese nombre por el de tu cuenta.

**1. Crea la base de datos** si todavía no existe.

```bash
psql -h localhost -U postgres -d postgres -c "CREATE DATABASE censo_inegi;"
```

**2. Ejecuta los dos scripts en orden.** El primero crea el esquema `censo` y sus seis tablas. El segundo crea tres índices de búsqueda y las vistas `v_poblacion_estatal`, `v_indicadores_municipales` y `v_localidades`.

```bash
psql -h localhost -U postgres -d censo_inegi -v ON_ERROR_STOP=1 -f sql/01_schema_estrella.sql
psql -h localhost -U postgres -d censo_inegi -v ON_ERROR_STOP=1 -f sql/02_indexes_views.sql
```

**3. Verifica la estructura.** Desde la terminal, abre una sesión en la base que acabas de preparar.

```bash
psql -h localhost -U postgres -d censo_inegi
```

Dentro de `psql`, ejecuta esta consulta. Antes de cargar los datos ya deben aparecer 6 tablas (`BASE TABLE`) y 3 vistas (`VIEW`) en el esquema recién creado.

```sql
SELECT table_type, COUNT(*) AS cantidad
FROM information_schema.tables
WHERE table_schema = 'censo'
GROUP BY table_type
ORDER BY table_type;
```

## Escenarios de aceptación

El proyecto usa desarrollo guiado por el comportamiento (BDD). Los seis escenarios escritos en Gherkin definen lo que debe observar el analista en la interfaz. Estos resultados servirán para validar el sistema con Behave y Selenium después de cargar los datos.

| Escenario | Resultado esperado |
| --- | --- |
| Buscar Jalisco | 8,348,151 habitantes, de los cuales 4,249,696 son mujeres y 4,098,455 son hombres. |
| Filtrar un municipio por edad | Al elegir Cuauhtémoc, Ciudad de México, y el rango de 15 a 64 años, se muestran 398,058 habitantes. |
| Seleccionar «Ver gráfico» | En Cuauhtémoc aparecen tres barras. La de 15 a 64 años (398,058) supera a las de 0 a 14 (83,469) y 65 y más (64,291). |
| Comparar el nivel educativo | El grado promedio de escolaridad es de 12.41 años en Cuauhtémoc y de 10.42 en Iztapalapa. |
| Buscar un estado inexistente | Al escribir «Jaliscoo» se muestra «No se encontró el estado ingresado». |
| Consultar un dato confidencial | En Alacates, municipio de Acatic, Jalisco, el indicador de 18 a 24 años se muestra como «Dato confidencial». |

Proyecto académico de la asignatura Aseguramiento y Calidad del Software de la Universidad Autónoma de la Ciudad de México.