let chartEdades = null;

function formatearNumero(valor) {
  if (valor === null || valor === undefined) return "Sin dato";
  return Number(valor).toLocaleString("en-US");
}

function formatearDecimal(valor) {
  if (valor === null || valor === undefined) return "Sin dato";
  return Number(valor).toFixed(2);
}

function escaparHtml(texto) {
  return String(texto ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function mostrarMensaje(elemento, texto) {
  elemento.textContent = texto;
  elemento.classList.remove("hidden");
}

function ocultarMensaje(elemento) {
  elemento.textContent = "";
  elemento.classList.add("hidden");
}

async function consultarApi(ruta, parametros = {}) {
  const query = new URLSearchParams(parametros).toString();
  let resp;
  try {
    resp = await fetch(query ? ruta + "?" + query : ruta);
  } catch {
    throw new Error("No se pudo conectar con la API del censo.");
  }
  if (resp.ok) return resp.json();

  const { detail } = await resp.json().catch(() => ({}));
  if (typeof detail === "string") throw new Error(detail);
  if (detail?.mensaje) throw new Error(detail.mensaje);
  if (Array.isArray(detail)) {
    const campos = detail.map((error) => error.loc?.at(-1)).filter(Boolean);
    if (campos.length) throw new Error("Revisa los campos de la consulta: " + campos.join(", ") + ".");
  }
  throw new Error(`La API no pudo completar la consulta (HTTP ${resp.status}).`);
}

// --- Navegación entre pestañas ---
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(btn.dataset.panel).classList.add("active");
  });
});

// --- Carga inicial de entidades para los selectores ---
async function cargarCatalogoEntidades() {
  const selects = [
    document.getElementById("select-entidad-mun"),
    document.getElementById("comp-entidad"),
  ];
  try {
    const estados = await consultarApi("/api/estados/catalogo");
    if (!estados.length) throw new Error("El censo no tiene entidades disponibles.");
    for (const select of selects) {
      for (const estado of estados) select.add(new Option(estado.nom_ent, estado.nom_ent));
    }
  } catch (err) {
    for (const id of ["municipio-mensaje", "comparativa-mensaje"]) {
      mostrarMensaje(document.getElementById(id), err.message);
    }
  }
}

async function cargarMunicipiosEnSelects(selectorEntidad, selects, msgEl) {
  const entidad = selectorEntidad.value;
  ocultarMensaje(msgEl);
  selects.forEach((sel) => {
    sel.replaceChildren(new Option(entidad ? "Cargando..." : "Selecciona primero una entidad...", ""));
    sel.disabled = true;
  });
  const boton = selectorEntidad.form.querySelector('button[type="submit"]');
  boton.disabled = true;
  if (!entidad) return;

  try {
    const municipios = await consultarApi("/api/municipios/catalogo", { estado: entidad });
    if (selectorEntidad.value !== entidad) return;
    if (!municipios.length) throw new Error("No hay municipios disponibles para esta entidad.");
    const nombres = new Set();
    const repetidos = new Set();
    for (const { nom_mun } of municipios) {
      if (nombres.has(nom_mun)) repetidos.add(nom_mun);
      nombres.add(nom_mun);
    }
    for (const sel of selects) {
      sel.replaceChildren(new Option("Selecciona un municipio...", ""));
      for (const { mun, nom_mun } of municipios) {
        const etiqueta = repetidos.has(nom_mun) ? `${nom_mun} (${mun})` : nom_mun;
        sel.add(new Option(etiqueta, mun));
      }
      sel.disabled = false;
    }
    boton.disabled = false;
  } catch (err) {
    if (selectorEntidad.value !== entidad) return;
    for (const sel of selects) sel.replaceChildren(new Option("Municipios no disponibles", ""));
    mostrarMensaje(msgEl, err.message);
  }
}

// --- 1. Consulta Estatal ---
document.getElementById("form-estado").addEventListener("submit", async (e) => {
  e.preventDefault();
  const query = document.getElementById("input-estado").value.trim();
  const msgEl = document.getElementById("estado-mensaje");
  const contEl = document.getElementById("estado-resultados");

  ocultarMensaje(msgEl);
  contEl.innerHTML = "";

  try {
    const est = await consultarApi("/api/estados", { estado: query });
    contEl.innerHTML = `
        <article class="card" data-entidad="${escaparHtml(est.nom_ent)}">
          <h3>${escaparHtml(est.nom_ent)}</h3>
          <ul class="metric-list">
            <li>
              <span>Población total</span>
              <span class="metric-value" data-metric="pobtot">${formatearNumero(est.pobtot)}</span>
            </li>
            <li>
              <span>Población femenina</span>
              <span class="metric-value" data-metric="pobfem">${formatearNumero(est.pobfem)}</span>
            </li>
            <li>
              <span>Población masculina</span>
              <span class="metric-value" data-metric="pobmas">${formatearNumero(est.pobmas)}</span>
            </li>
          </ul>
        </article>
      `;
  } catch (err) {
    mostrarMensaje(msgEl, err.message);
  }
});

// --- 2. Municipios y Gráficas ---
document.getElementById("select-entidad-mun").addEventListener("change", (e) => {
  document.getElementById("municipio-detalle").classList.add("hidden");
  cargarMunicipiosEnSelects(e.target, [document.getElementById("select-municipio")],
    document.getElementById("municipio-mensaje"));
});

document.getElementById("form-municipio").addEventListener("submit", async (e) => {
  e.preventDefault();
  const entidad = document.getElementById("select-entidad-mun").value;
  const municipio = document.getElementById("select-municipio").value;
  const rango = document.getElementById("select-rango-edad").value;

  const msgEl = document.getElementById("municipio-mensaje");
  const detalleEl = document.getElementById("municipio-detalle");
  const rangoBox = document.getElementById("rango-destacado");

  ocultarMensaje(msgEl);
  detalleEl.classList.add("hidden");
  rangoBox.classList.add("hidden");

  const params = new URLSearchParams({ estado: entidad, municipio });
  if (rango) params.set("rango_edad", rango);

  try {
    const mun = await consultarApi("/api/municipios", params);
    detalleEl.classList.remove("hidden");

    if (rango) {
      rangoBox.innerHTML = `<strong>${escaparHtml(mun.nom_mun)} (${escaparHtml(mun.rango_edad)}):</strong> <span id="valor-rango-edad">${formatearNumero(mun.poblacion)}</span> habitantes`;
      rangoBox.classList.remove("hidden");
    }

    const filas = [
      ["Entidad", mun.nom_ent],
      ["Municipio", mun.nom_mun],
      ["Población total", formatearNumero(mun.pobtot)],
      ["0 a 14 años", formatearNumero(mun.grupos_edad["0 a 14"])],
      ["15 a 64 años", formatearNumero(mun.grupos_edad["15 a 64"])],
      ["65 años y más", formatearNumero(mun.grupos_edad["65 y más"])],
      ["Grado promedio de escolaridad", `${formatearDecimal(mun.graproes)} años`],
      ["Viviendas con internet", formatearNumero(mun.vph_inter)],
    ];

    document.querySelector("#tabla-municipio tbody").innerHTML = filas
      .map(([k, v]) => `<tr><td>${escaparHtml(k)}</td><td><strong>${escaparHtml(v)}</strong></td></tr>`)
      .join("");

    renderGraficaEdades(mun);
  } catch (err) {
    mostrarMensaje(msgEl, err.message);
  }
});

function renderGraficaEdades(mun) {
  const ctx = document.getElementById("grafica-edades");
  if (chartEdades) {
    chartEdades.destroy();
  }

  const valores = ["0 a 14", "15 a 64", "65 y más"].map((grupo) => mun.grupos_edad[grupo]);
  ctx.dataset.valores = JSON.stringify(valores);
  if (typeof Chart === "undefined") {
    document.getElementById("grafica-mensaje").classList.remove("hidden");
    return;
  }
  document.getElementById("grafica-mensaje").classList.add("hidden");

  chartEdades = new Chart(ctx, {
    type: "bar",
    data: {
      labels: ["0 a 14 años", "15 a 64 años", "65 años y más"],
      datasets: [
        {
          label: `Habitantes en ${mun.nom_mun}`,
          data: valores,
          backgroundColor: ["#2d7d66", "#1b4d3e", "#6ee7b7"],
          borderRadius: 6,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: true },
      },
      scales: {
        y: { beginAtZero: true },
      },
    },
  });
}

// --- 3. Comparación Municipal ---
document.getElementById("comp-entidad").addEventListener("change", (e) => {
  document.getElementById("comparativa-resultados").replaceChildren();
  cargarMunicipiosEnSelects(e.target, [
    document.getElementById("comp-mun-1"),
    document.getElementById("comp-mun-2"),
  ], document.getElementById("comparativa-mensaje"));
});

document.getElementById("form-comparar").addEventListener("submit", async (e) => {
  e.preventDefault();
  const entidad = document.getElementById("comp-entidad").value;
  const m1 = document.getElementById("comp-mun-1").value;
  const m2 = document.getElementById("comp-mun-2").value;

  const msgEl = document.getElementById("comparativa-mensaje");
  const contEl = document.getElementById("comparativa-resultados");

  ocultarMensaje(msgEl);
  contEl.innerHTML = "";

  if (m1 === m2) {
    mostrarMensaje(msgEl, "Selecciona dos municipios distintos para comparar.");
    return;
  }

  try {
    const data = await consultarApi("/api/municipios/comparativa", {
      estado: entidad, municipio_a: m1, municipio_b: m2,
    });
    contEl.innerHTML = data.municipios
      .map(
        (m) => `
        <article class="card" data-comp-municipio="${escaparHtml(m.nom_mun)}">
          <h3>${escaparHtml(m.nom_mun)}</h3>
          <ul class="metric-list">
            <li>
              <span>Grado promedio de escolaridad</span>
              <span class="metric-value" data-metric="graproes">${formatearDecimal(m.graproes)} años</span>
            </li>
            <li>
              <span>Población total</span>
              <span class="metric-value">${formatearNumero(m.pobtot)}</span>
            </li>
            <li>
              <span>15 a 64 años</span>
              <span class="metric-value">${formatearNumero(m.pob15_64)}</span>
            </li>
            <li>
              <span>Viviendas con internet</span>
              <span class="metric-value">${formatearNumero(m.vph_inter)}</span>
            </li>
          </ul>
        </article>
      `
      )
      .join("");
  } catch (err) {
    mostrarMensaje(msgEl, err.message);
  }
});

// --- 4. Localidades y Confidencialidad ---
function renderPoblacion18a24(loc) {
  if (loc.p_18a24 === null || loc.p_18a24 === undefined) {
    const etiqueta = loc.mensaje || "Sin dato";
    const clase = loc.estado_18a24 === "confidencial" ? "badge-confidencial" : "badge-sin-dato";
    return `<span class="${clase}">${escaparHtml(etiqueta)}</span>`;
  }
  return formatearNumero(loc.p_18a24);
}

document.getElementById("form-localidad").addEventListener("submit", async (e) => {
  e.preventDefault();
  const entidad = document.getElementById("loc-entidad").value.trim();
  const municipio = document.getElementById("loc-municipio").value.trim();
  const localidad = document.getElementById("loc-nombre").value.trim();

  const msgEl = document.getElementById("localidad-mensaje");
  const wrapEl = document.getElementById("localidad-tabla-wrap");
  const tbody = document.querySelector("#tabla-localidades tbody");

  ocultarMensaje(msgEl);
  wrapEl.classList.add("hidden");
  tbody.innerHTML = "";

  const params = new URLSearchParams();
  if (entidad) params.set("estado", entidad);
  if (municipio) params.set("municipio", municipio);
  if (localidad) params.set("localidad", localidad);

  try {
    const data = await consultarApi("/api/localidades/buscar", params);
    if (!data.resultados.length) {
      mostrarMensaje(msgEl, "No se encontraron localidades con esos filtros.");
      return;
    }
    if (data.hay_mas) {
      mostrarMensaje(msgEl, `Se muestran las primeras ${data.resultados.length} localidades. Agrega un filtro para precisar la búsqueda.`);
    }

    tbody.innerHTML = data.resultados
      .map(
        (loc) => `
        <tr data-localidad="${escaparHtml(loc.nom_loc)}">
          <td><strong>${escaparHtml(loc.nom_loc)}</strong></td>
          <td>${escaparHtml(loc.nom_mun)}</td>
          <td>${escaparHtml(loc.nom_ent)}</td>
          <td>${escaparHtml(loc.ambito || "N/D")}</td>
          <td>${formatearNumero(loc.pobtot)}</td>
          <td data-metric="p_18a24">${renderPoblacion18a24(loc)}</td>
        </tr>
      `
      )
      .join("");

    wrapEl.classList.remove("hidden");
  } catch (err) {
    mostrarMensaje(msgEl, err.message);
  }
});

cargarCatalogoEntidades();
