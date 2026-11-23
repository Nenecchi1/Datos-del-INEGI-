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
  try {
    const resp = await fetch("/api/estados");
    if (!resp.ok) return;
    const data = await resp.json();

    const selects = [
      document.getElementById("select-entidad-mun"),
      document.getElementById("comp-entidad"),
    ];

    selects.forEach((select) => {
      data.resultados.forEach((ent) => {
        const opt = document.createElement("option");
        opt.value = ent.nom_ent;
        opt.textContent = ent.nom_ent;
        select.appendChild(opt);
      });
    });
  } catch (err) {
    console.error("Error cargando entidades:", err);
  }
}

async function cargarMunicipiosEnSelects(entidad, selects) {
  selects.forEach((sel) => {
    sel.innerHTML = '<option value="">Cargando...</option>';
    sel.disabled = true;
  });

  if (!entidad) {
    selects.forEach((sel) => {
      sel.innerHTML = '<option value="">Selecciona primero una entidad...</option>';
    });
    return;
  }

  const resp = await fetch(`/api/municipios?entidad=${encodeURIComponent(entidad)}`);
  const data = await resp.json();

  selects.forEach((sel) => {
    sel.innerHTML = '<option value="">Selecciona un municipio...</option>';
    if (resp.ok && data.resultados) {
      data.resultados.forEach((m) => {
        const opt = document.createElement("option");
        opt.value = m.nom_mun;
        opt.textContent = m.nom_mun;
        sel.appendChild(opt);
      });
      sel.disabled = false;
    }
  });
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
    const resp = await fetch(`/api/estados?q=${encodeURIComponent(query)}`);
    const data = await resp.json();

    if (!resp.ok) {
      mostrarMensaje(msgEl, data.detail || "No se encontraron resultados para la entidad solicitada");
      return;
    }

    contEl.innerHTML = data.resultados
      .map(
        (est) => `
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
      `
      )
      .join("");
  } catch (err) {
    mostrarMensaje(msgEl, "Error de conexión con la API.");
  }
});

// --- 2. Municipios y Gráficas ---
document.getElementById("select-entidad-mun").addEventListener("change", (e) => {
  cargarMunicipiosEnSelects(e.target.value, [document.getElementById("select-municipio")]);
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

  const params = new URLSearchParams({ entidad, municipio });
  if (rango) params.set("rango_edad", rango);

  try {
    const resp = await fetch(`/api/municipios?${params.toString()}`);
    const data = await resp.json();

    if (!resp.ok) {
      mostrarMensaje(msgEl, data.detail || "No se encontraron datos del municipio.");
      return;
    }

    const mun = data.resultados[0];
    detalleEl.classList.remove("hidden");

    if (rango && mun.rango_seleccionado) {
      rangoBox.innerHTML = `<strong>${escaparHtml(mun.nom_mun)} (${escaparHtml(mun.rango_seleccionado)}):</strong> <span id="valor-rango-edad">${formatearNumero(mun.poblacion_rango)}</span> habitantes`;
      rangoBox.classList.remove("hidden");
    }

    const filas = [
      ["Entidad", mun.nom_ent],
      ["Municipio", mun.nom_mun],
      ["Población total", formatearNumero(mun.pobtot)],
      ["0 a 14 años", formatearNumero(mun.pob0_14)],
      ["15 a 64 años", formatearNumero(mun.pob15_64)],
      ["65 años y más", formatearNumero(mun.pob65_mas)],
      ["Grado promedio de escolaridad", `${formatearDecimal(mun.graproes)} años`],
      ["Viviendas con internet", formatearNumero(mun.vph_inter)],
    ];

    document.querySelector("#tabla-municipio tbody").innerHTML = filas
      .map(([k, v]) => `<tr><td>${escaparHtml(k)}</td><td><strong>${escaparHtml(v)}</strong></td></tr>`)
      .join("");

    renderGraficaEdades(mun);
  } catch (err) {
    mostrarMensaje(msgEl, "Error de conexión con la API.");
  }
});

function renderGraficaEdades(mun) {
  const ctx = document.getElementById("grafica-edades");
  if (chartEdades) {
    chartEdades.destroy();
  }

  const valores = [mun.pob0_14, mun.pob15_64, mun.pob65_mas];
  ctx.dataset.valores = JSON.stringify(valores);

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
  cargarMunicipiosEnSelects(e.target.value, [
    document.getElementById("comp-mun-1"),
    document.getElementById("comp-mun-2"),
  ]);
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

  const params = new URLSearchParams({ entidad, m1, m2 });

  try {
    const resp = await fetch(`/api/municipios/comparar?${params.toString()}`);
    const data = await resp.json();

    if (!resp.ok) {
      mostrarMensaje(msgEl, data.detail || "No se pudo realizar la comparación.");
      return;
    }

    contEl.innerHTML = data.comparativa
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
    mostrarMensaje(msgEl, "Error de conexión con la API.");
  }
});

// --- 4. Localidades y Confidencialidad ---
function renderPoblacion18a24(loc) {
  if (loc.p_18a24 === null || loc.p_18a24 === undefined) {
    const etiqueta = loc.etiqueta_18a24 || "Sin dato";
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
  if (entidad) params.set("entidad", entidad);
  if (municipio) params.set("municipio", municipio);
  if (localidad) params.set("localidad", localidad);

  try {
    const resp = await fetch(`/api/localidades?${params.toString()}`);
    const data = await resp.json();

    if (!resp.ok) {
      mostrarMensaje(msgEl, data.detail || "No se encontraron localidades con esos filtros.");
      return;
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
    mostrarMensaje(msgEl, "Error de conexión con la API.");
  }
});

document.addEventListener("DOMContentLoaded", cargarCatalogoEntidades);