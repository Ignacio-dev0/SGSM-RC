// Capturas del Guía del médico (SOLO desarrollo, con los datos de demostración).
//
// Recorre la interfaz como lo haría el médico, empezando por el Inicio y tocando lo que cada
// pantalla ofrece, y guarda PNG con marcadores numerados en docs/manuales/img/medico/:
//   - tablet vertical 768 × 1024 (el equipo del hospital), tema claro, escala 1;
//   - unas pocas en teléfono 375 × 812, donde el menú pasa a un cajón.
//
// No guarda nada: las altas, traslados, cambios y cancelaciones se muestran con el diálogo
// abierto y se cierran con Cancelar. Una red de seguridad corta en el navegador cualquier pedido
// que modifique datos, salvo dos intentos que el servidor rechaza a propósito para mostrar sus
// avisos (y que se verifican antes por la API):
//   - internar con el DNI de una paciente ya egresada → aviso de reingreso;
//   - indicar Ketorolac a Olmedo, que ya lo tiene vigente → aviso de prescripción duplicada.
// Para el primero hace falta una paciente egresada: si no existe, se la interna y se le da el
// alta por la API (ficticia, DNI 90815437, observaciones "Demostración manual"). Para mostrar
// Reanudar hace falta una prescripción suspendida: si no está, se le indica Ibuprofeno a Arrieta
// y se la suspende por la API (observaciones "Demostración manual"). Es lo único que este script
// deja en la base, y solo la primera vez.
//
// La marca "(Demostración manual)" con la que preparar-datos.mjs reconoce sus datos se borra del
// texto de la pantalla justo antes de cada captura (no de la base): es interna y distrae.
//
// Requisitos: la interfaz en http://localhost:4173 (vite preview, modo demostración), la API en
// http://localhost:3000 y los datos de docs/manuales/herramientas/preparar-datos.mjs (si los
// recordatorios vencieron, volver a correrlo y esperar ~70 s).
//
// Uso (desde la raíz del repo):
//   node docs/manuales/herramientas/capturar-medico.mjs                 (todas)
//   node docs/manuales/herramientas/capturar-medico.mjs --solo 07,08    (solo los recorridos que
//                                                                        tienen esas capturas)
//   node docs/manuales/herramientas/capturar-medico.mjs --ver           (con la ventana a la vista)
//
// Variables opcionales: SGSM_WEB, SGSM_API y las de los usuarios de las pruebas e2e
// (E2E_USUARIO_MEDICO, E2E_CLAVE_MEDICO). Sin ellas toma el usuario de prueba de e2e/soporte.ts.

import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const WEB = process.env.SGSM_WEB ?? 'http://localhost:4173';
const API = process.env.SGSM_API ?? 'http://localhost:3000';
const SALIDA = resolve(RAIZ, 'docs/manuales/img/medico');
const ZONA = 'America/Argentina/Buenos_Aires';
const MARCA = 'Demostración manual';
const MINUTO = 60_000;
const HORA = 60 * MINUTO;
const DIA = 24 * HORA;

const TABLET = { width: 768, height: 1024 };
const TELEFONO = { width: 375, height: 812 };

/** Marcadores: magenta (no lo usa la interfaz, que es verde azulado, rojo y ocre) con borde blanco. */
const COLOR = '#D0006F';
const RADIO = 16;

const args = process.argv.slice(2);
const indiceSolo = args.indexOf('--solo');
const SOLO = indiceSolo >= 0 ? args[indiceSolo + 1].split(',').map((s) => s.padStart(2, '0')) : null;
const VER = args.includes('--ver');

// ───────────────────────── Datos ficticios ─────────────────────────

/** Paciente que se carga en el formulario de internación (no se guarda). */
const NUEVO = {
  dni: '90926481',
  nombre: 'Leandro Ezequiel',
  apellido: 'Sosa',
  fechaNacimiento: '1978-08-30',
  sexo: 'Masculino',
  obraSocial: 'Obra social provincial',
  numeroAfiliado: '90-926481-00',
  diagnostico: 'Lesión medular incompleta, rehabilitación',
  contacto: 'Nora Ruiz (madre)',
  telefono: '0351 555-0129',
  cama: 'C-04',
};

/** Paciente ficticia ya egresada, para mostrar el aviso de reingreso. */
const EGRESADA = {
  dni: '90815437',
  apellido: 'Quiroga',
  nombre: 'Elvira Dolores',
  fechaNacimiento: '1950-03-09',
  sexo: 'FEMENINO',
  obraSocial: 'Obra social provincial',
  numeroAfiliado: '90-815437-02',
  diagnostico: 'Accidente cerebrovascular isquémico, rehabilitación',
  contactoEmergenciaNombre: 'Raúl Quiroga (hijo)',
  contactoEmergenciaTelefono: '0351 555-0175',
  observaciones: `Paciente ficticia (${MARCA})`,
};

// ───────────────────────── Utilidades ─────────────────────────

const pad = (n) => String(n).padStart(2, '0');

/** "AAAA-MM-DDTHH:mm" en hora de Argentina (UTC-3, sin horario de verano) para un instante. */
const campoDe = (ms) => new Date(ms - 3 * HORA).toISOString().slice(0, 16);

/** Campo de fecha y hora para un día relativo a hoy (0 = hoy, 1 = mañana) a una hora dada. */
function campoDia(dias, hh, mm = 0) {
  const hoyAr = new Date(Date.now() - 3 * HORA).toISOString().slice(0, 10);
  const dia = new Date(Date.parse(`${hoyAr}T00:00:00Z`) + dias * DIA).toISOString().slice(0, 10);
  return `${dia}T${pad(hh)}:${pad(mm)}`;
}

/** Usuario de prueba del médico: variables de entorno o e2e/soporte.ts (nunca va al manual). */
function credenciales(rol) {
  const ROL = rol.toUpperCase();
  let usuario = process.env[`E2E_USUARIO_${ROL}`];
  let clave = process.env[`E2E_CLAVE_${ROL}`];
  if (!usuario || !clave) {
    const soporte = readFileSync(resolve(RAIZ, 'e2e/soporte.ts'), 'utf8');
    usuario ??= new RegExp(`E2E_USUARIO_${ROL} \\?\\? '([^']+)'`).exec(soporte)?.[1];
    clave ??= new RegExp(`E2E_CLAVE_${ROL} \\?\\? '([^']+)'`).exec(soporte)?.[1];
  }
  if (!usuario || !clave) throw new Error(`No encuentro el usuario de prueba de ${rol}`);
  return { usuario, clave };
}

async function sesionApi(rol) {
  const { usuario, clave } = credenciales(rol);
  const r = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nombreUsuario: usuario, contrasena: clave }),
  });
  if (!r.ok) throw new Error(`No se pudo ingresar a la API como ${rol}: ${r.status}`);
  const cookie = r.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .find((c) => c.startsWith('sgsm_sesion='));
  const pedir = async (metodo, ruta, cuerpo) => {
    const res = await fetch(`${API}${ruta}`, {
      method: metodo,
      headers: { cookie, ...(cuerpo ? { 'content-type': 'application/json' } : {}) },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) throw new Error(`${metodo} ${ruta} → ${res.status} ${json?.error?.mensaje ?? ''}`);
    return json;
  };
  return { get: (ruta) => pedir('GET', ruta), post: (ruta, cuerpo) => pedir('POST', ruta, cuerpo ?? {}) };
}

// ───────────────────────── Preparación y controles por la API ─────────────────────────

let api;
const ids = {};

async function buscarPaciente(dni) {
  const { data } = await api.get(`/api/pacientes?dni=${dni}&porPagina=5`);
  return data.find((p) => p.dni === dni) ?? null;
}

/** La paciente egresada del aviso de reingreso: si no está, se la interna y se le da el alta. */
async function asegurarEgresada() {
  let p = await buscarPaciente(EGRESADA.dni);
  if (p && !String(p.observaciones ?? '').includes(MARCA)) {
    throw new Error(`El DNI ${EGRESADA.dni} es de otro paciente: no se usa para el reingreso`);
  }
  if (!p) {
    const { data: camas } = await api.get('/api/camas?estado=libre');
    const cama = camas.find((c) => c.numero === 'C-05') ?? camas[0];
    if (!cama) throw new Error('No hay camas libres para preparar la paciente egresada');
    ({ data: p } = await api.post('/api/pacientes', {
      ...EGRESADA,
      camaId: cama.id,
      fechaIngreso: new Date(Date.now() - 20 * DIA).toISOString(),
    }));
    console.log(`  preparación: se internó a ${EGRESADA.apellido} (ficticia) para darle el alta`);
  }
  if (p.estado === 'INTERNADO') {
    const haceSeis = Date.now() - 6 * DIA;
    const fechaEgreso = new Date(Math.max(haceSeis, Date.parse(p.fechaIngreso) + HORA)).toISOString();
    await api.post(`/api/pacientes/${p.id}/egresar`, {
      motivo: `Alta médica (${MARCA})`,
      fechaEgreso: new Date(Math.min(Date.parse(fechaEgreso), Date.now() - MINUTO)).toISOString(),
    });
    console.log(`  preparación: ${EGRESADA.apellido} quedó egresada`);
  }
}

/** Prescripción suspendida de Arrieta (Ibuprofeno), para mostrar cómo se reanuda. */
const SUSPENDIDA = {
  medicamento: 'Ibuprofeno',
  dosis: 400,
  unidadDosis: 'mg',
  frecuenciaHoras: 8,
  via: 'ORAL',
  observaciones: `Dolor de hombro derecho (${MARCA})`,
  motivo: 'Epigastralgia; se reevalúa en 48 h',
};

async function asegurarSuspendida() {
  const { data: todas } = await api.get(`/api/pacientes/${ids.arrieta}/prescripciones`);
  const mias = todas.filter(
    (x) => x.medicamento.nombre.startsWith(SUSPENDIDA.medicamento) && String(x.observaciones ?? '').includes(MARCA),
  );
  if (mias.some((x) => x.estado === 'SUSPENDIDA')) return;
  let p = mias.find((x) => x.estado === 'VIGENTE');
  if (!p) {
    if (todas.some((x) => x.medicamento.nombre.startsWith(SUSPENDIDA.medicamento) && x.estado === 'VIGENTE')) {
      throw new Error(`Arrieta ya tiene ${SUSPENDIDA.medicamento} vigente cargado a mano: no se prepara la suspendida`);
    }
    const { data: catalogo } = await api.get('/api/insumos?tipo=MEDICAMENTO&activo=true&porPagina=100');
    const insumo = catalogo.find((i) => i.nombre.startsWith(SUSPENDIDA.medicamento));
    if (!insumo) throw new Error(`No está ${SUSPENDIDA.medicamento} en el catálogo`);
    // Inicio entre 3 y 4 horas atrás y cada 8 h: ninguna toma cae cerca de ahora (sin recordatorios).
    const inicio = Math.floor((Date.now() - 3 * HORA) / HORA) * HORA;
    ({ data: p } = await api.post(`/api/pacientes/${ids.arrieta}/prescripciones`, {
      insumoId: insumo.id,
      dosis: SUSPENDIDA.dosis,
      unidadDosis: SUSPENDIDA.unidadDosis,
      frecuenciaHoras: SUSPENDIDA.frecuenciaHoras,
      via: SUSPENDIDA.via,
      fechaInicio: new Date(inicio).toISOString(),
      observaciones: SUSPENDIDA.observaciones,
    }));
    console.log(`  preparación: se le indicó ${SUSPENDIDA.medicamento} a Arrieta para suspenderlo`);
  }
  await api.post(`/api/prescripciones/${p.id}/estado`, { estado: 'SUSPENDIDA', motivo: SUSPENDIDA.motivo });
  console.log(`  preparación: ${SUSPENDIDA.medicamento} de Arrieta quedó suspendido`);
}

async function prepararDatos() {
  api = await sesionApi('medico');
  await asegurarEgresada();
  for (const [clave, dni] of [
    ['olmedo', '90418273'],
    ['villafane', '90527614'],
    ['arrieta', '90639158'],
  ]) {
    const p = await buscarPaciente(dni);
    if (!p || p.estado !== 'INTERNADO') {
      throw new Error(`Falta el paciente de demostración ${clave}: correr preparar-datos.mjs`);
    }
    ids[clave] = p.id;
  }
  if (quiere('28', '29')) await asegurarSuspendida();
  const { data: recordatorios, meta } = await api.get('/api/recordatorios');
  const vencidos = recordatorios.filter((r) => r.estado === 'VENCIDO').length;
  console.log(`  recordatorios: ${meta.total} para atender (${meta.urgentes} urgentes, ${vencidos} vencidos)`);
  if (meta.total === 0 || vencidos > 0) {
    console.warn(
      '  ! Los recordatorios no están como en la demostración: correr preparar-datos.mjs y esperar ~70 s',
    );
  }
}

/** Antes de los dos envíos que el servidor tiene que rechazar, se comprueba que los rechace. */
async function egresadaLista() {
  const p = await buscarPaciente(EGRESADA.dni);
  return p?.estado === 'EGRESADO';
}
async function ketorolacVigente() {
  const { data } = await api.get(`/api/pacientes/${ids.olmedo}/prescripciones?estado=VIGENTE`);
  return data.find((x) => x.medicamento.nombre.startsWith('Ketorolac')) ?? null;
}

// ───────────────────────── Red de seguridad ─────────────────────────

const bloqueados = [];
/** Envíos permitidos en este momento (los fija cada recorrido justo antes de tocar el botón). */
const permitido = { reingreso: false, duplicada: false };

async function redDeSeguridad(contexto) {
  await contexto.route('**/api/**', async (route) => {
    const req = route.request();
    const metodo = req.method();
    const url = new URL(req.url());
    if (metodo === 'GET' || metodo === 'HEAD' || url.pathname.startsWith('/api/auth/')) {
      return route.continue();
    }
    let cuerpo = {};
    try {
      cuerpo = req.postDataJSON() ?? {};
    } catch {
      /* sin cuerpo */
    }
    if (
      metodo === 'POST' &&
      url.pathname === '/api/pacientes' &&
      permitido.reingreso &&
      cuerpo.dni === EGRESADA.dni
    ) {
      return route.continue();
    }
    if (
      metodo === 'POST' &&
      url.pathname === `/api/pacientes/${ids.olmedo}/prescripciones` &&
      permitido.duplicada &&
      cuerpo.confirmarDuplicada === false
    ) {
      return route.continue();
    }
    bloqueados.push(`${metodo} ${url.pathname}`);
    return route.abort('blockedbyclient');
  });
}

// ───────────────────────── Pantalla ─────────────────────────

/** Espera a que la pantalla termine de cargar (sin pedidos ni indicadores de carga). */
async function esperar(page) {
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page
    .locator('[role="progressbar"]:visible, .MuiCircularProgress-root:visible, .MuiLinearProgress-root:visible')
    .first()
    .waitFor({ state: 'detached', timeout: 10_000 })
    .catch(() => undefined);
  await page.waitForTimeout(250);
}

/**
 * El contenedor de un campo (etiqueta, caja y ayuda) a partir de su etiqueta. El localizador de
 * `has` se busca dentro de cada contenedor, por eso sale de la página y no de `raiz`.
 */
const campo = (raiz, etiqueta, exacto = false) => {
  const pagina = typeof raiz.page === 'function' ? raiz.page() : raiz;
  return raiz
    .locator('.MuiFormControl-root', { has: pagina.getByLabel(etiqueta, { exact: exacto }) })
    .first();
};

/** Elige en un <select> nativo la opción cuyo texto contiene `texto`. */
async function elegir(select, texto) {
  const valor = await select.evaluate(
    (s, t) => [...s.options].find((o) => o.text.includes(t))?.value,
    texto,
  );
  if (valor === undefined) throw new Error(`No hay una opción «${texto}»`);
  await select.selectOption(valor);
}

/** Lleva un elemento al centro de la vista (lejos de la barra fija de arriba). */
async function asomar(loc) {
  await loc.first().waitFor({ state: 'visible', timeout: 10_000 });
  await loc.first().evaluate((el) => el.scrollIntoView({ block: 'center', inline: 'nearest' }));
  await loc.page().waitForTimeout(200);
}

async function irAlInicio(page) {
  await page.goto(`${WEB}/`);
  await page.getByRole('heading', { level: 1, name: /^Hola,/ }).waitFor();
  await esperar(page);
}

async function ingresar(page) {
  const { usuario, clave } = credenciales('medico');
  await page.goto(`${WEB}/ingresar`);
  await page.getByRole('textbox', { name: 'Usuario' }).fill(usuario);
  await page.getByLabel('Contraseña', { exact: true }).fill(clave);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await page.getByRole('heading', { level: 1, name: /^Hola,/ }).waitFor();
  await esperar(page);
}

/** Desde el Inicio: Buscar paciente → escribir el apellido → tocar su fila → ficha. */
async function abrirFicha(page, apellido, telefono = false) {
  await irAlInicio(page);
  await page.getByRole('link', { name: /Buscar paciente/ }).click();
  await page.getByLabel('Buscar por apellido, DNI o cama').fill(apellido);
  // En el teléfono cada paciente es una tarjeta: se toca su contenido, como con el dedo.
  const fila = telefono
    ? page.locator('li', { has: page.getByRole('button', { name: new RegExp(`Abrir ${apellido}`) }) })
    : page.getByRole('row', { name: new RegExp(`Abrir ${apellido}`) });
  await fila.first().waitFor();
  await esperar(page);
  await fila.first().click();
  await page.getByRole('heading', { level: 1, name: new RegExp(`^${apellido},`) }).waitFor();
  await esperar(page);
}

// ───────────────────────── Marcadores y captura ─────────────────────────

const referencias = [];
const problemas = [];

/** Centro del círculo según el lado elegido, dentro de la vista. */
function centroDelCirculo(r, lado, vp) {
  const fuera = RADIO + 8;
  let cx;
  let cy;
  switch (lado) {
    case 'dentro-arriba':
      cx = r.x + r.w - RADIO - 12;
      cy = r.y + RADIO + 10;
      break;
    case 'izq-arriba':
      cx = r.x - fuera;
      cy = r.y + RADIO;
      break;
    case 'izq':
      cx = r.x - fuera;
      cy = r.y + r.h / 2;
      break;
    case 'der':
      cx = r.x + r.w + fuera;
      cy = r.y + r.h / 2;
      break;
    case 'arriba':
      cx = r.x + Math.min(r.w / 2, 40);
      cy = r.y - fuera;
      break;
    case 'abajo':
      cx = r.x + r.w / 2;
      cy = r.y + r.h + fuera;
      break;
    case 'dentro':
      cx = r.x + r.w - RADIO - 10;
      cy = r.y + r.h / 2;
      break;
    case 'esquina-der':
      cx = r.x + r.w + 2;
      cy = r.y - 2;
      break;
    default: // esquina superior izquierda
      cx = r.x - 2;
      cy = r.y - 2;
  }
  const m = RADIO + 3;
  return {
    cx: Math.min(Math.max(cx, m), vp.width - m),
    cy: Math.min(Math.max(cy, m), vp.height - m),
  };
}

/**
 * Rectángulo VISIBLE del elemento: getBoundingClientRect recortado por los contenedores que lo
 * esconden (por ejemplo, una fila de tabla más ancha que su caja con desplazamiento lateral).
 */
const rectDe = (loc) =>
  loc.evaluate((el) => {
    const b = el.getBoundingClientRect();
    let x0 = b.left;
    let y0 = b.top;
    let x1 = b.right;
    let y1 = b.bottom;
    // La etiqueta de un campo sobresale por arriba de su caja: el recuadro la deja adentro.
    for (const l of el.querySelectorAll('label')) {
      const r = l.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      x0 = Math.min(x0, r.left);
      y0 = Math.min(y0, r.top);
      x1 = Math.max(x1, r.right);
      y1 = Math.max(y1, r.bottom);
    }
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (/(auto|scroll|hidden|clip)/.test(s.overflowX + s.overflowY)) {
        const c = p.getBoundingClientRect();
        x0 = Math.max(x0, c.left);
        y0 = Math.max(y0, c.top);
        x1 = Math.min(x1, c.right);
        y1 = Math.min(y1, c.bottom);
      }
    }
    return { x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) };
  });

/**
 * Captura con marcadores. `marcas`: [{ n, loc, que, lado?, recuadro? }]. `incluir`: otros
 * elementos que tienen que entrar en el recorte. `recorte`: 'auto' (alto justo, ancho completo),
 * 'pantalla' o 'arriba' (desde el borde superior, con la barra).
 */
async function capturar(page, archivo, { muestra, marcas = [], incluir = [], recorte = 'auto', margen = 20 }) {
  if (SOLO && !SOLO.includes(archivo.slice(0, 2))) return;
  const vp = page.viewportSize();
  await esperar(page);
  // Sin foco ni puntero encima: la captura no muestra un estado de edición que el texto no explica.
  await page.mouse.move(vp.width - 3, vp.height - 3);
  await page.evaluate(() => {
    const el = document.activeElement;
    if (el instanceof HTMLElement && el !== document.body) el.blur();
  });
  await page.waitForTimeout(250);
  // La marca interna de los datos de demostración no se muestra (solo en la pantalla, no en la base).
  await page.evaluate((marca) => {
    const quitar = (t) => t.replaceAll(` (${marca})`, '').replaceAll(`(${marca})`, '');
    const recorrido = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = recorrido.nextNode(); n; n = recorrido.nextNode()) {
      if (n.nodeValue.includes(marca)) n.nodeValue = quitar(n.nodeValue);
    }
    for (const campo of document.querySelectorAll('input, textarea')) {
      if (campo.value.includes(marca)) campo.value = quitar(campo.value);
    }
  }, MARCA);

  const calculadas = [];
  for (const m of marcas) {
    // Un marcador puede abarcar varios controles juntos (un grupo): se marca su unión.
    const partes = [];
    for (const l of Array.isArray(m.loc) ? m.loc : [m.loc]) {
      await l.first().waitFor({ state: 'visible', timeout: 10_000 });
      partes.push(await rectDe(l.first()));
    }
    const x0 = Math.min(...partes.map((p) => p.x));
    const y0 = Math.min(...partes.map((p) => p.y));
    const r = {
      x: x0,
      y: y0,
      w: Math.max(...partes.map((p) => p.x + p.w)) - x0,
      h: Math.max(...partes.map((p) => p.y + p.h)) - y0,
    };
    if (r.w === 0 || r.h === 0 || r.y < 0 || r.y + r.h > vp.height || r.x < 0 || r.x + r.w > vp.width + 1) {
      throw new Error(`${archivo}: el marcador ${m.n} (${m.que}) quedó fuera de la vista ${JSON.stringify(r)}`);
    }
    calculadas.push({ n: m.n, que: m.que, ...r, ...centroDelCirculo(r, m.lado, vp), recuadro: m.recuadro !== false });
  }
  const extras = [];
  for (const loc of incluir) {
    await loc.first().waitFor({ state: 'visible', timeout: 10_000 });
    extras.push(await rectDe(loc.first()));
  }

  // Avisa si dos círculos quedan encimados.
  for (let i = 0; i < calculadas.length; i++) {
    for (let j = i + 1; j < calculadas.length; j++) {
      const a = calculadas[i];
      const b = calculadas[j];
      if (Math.hypot(a.cx - b.cx, a.cy - b.cy) < 2 * RADIO + 4) {
        console.warn(`  ! ${archivo}: los círculos ${a.n} y ${b.n} se tocan`);
      }
    }
  }

  await page.evaluate(
    ({ marcas, color, radio }) => {
      const capa = document.createElement('div');
      capa.id = 'marcadores-del-manual';
      capa.style.cssText = 'position:fixed;inset:0;z-index:2147483647;pointer-events:none;';
      for (const m of marcas) {
        if (m.recuadro) {
          const b = document.createElement('div');
          b.style.cssText =
            `position:fixed;left:${m.x - 5}px;top:${m.y - 5}px;width:${m.w + 10}px;height:${m.h + 10}px;` +
            `border:3px solid ${color};border-radius:8px;box-sizing:border-box;` +
            'box-shadow:0 0 0 2px #fff, inset 0 0 0 2px #fff;';
          capa.appendChild(b);
        }
        const c = document.createElement('div');
        c.textContent = String(m.n);
        c.style.cssText =
          `position:fixed;left:${m.cx - radio}px;top:${m.cy - radio}px;width:${2 * radio}px;height:${2 * radio}px;` +
          `border-radius:50%;background:${color};color:#fff;border:3px solid #fff;box-sizing:border-box;` +
          `display:flex;align-items:center;justify-content:center;font:700 17px/1 Arial,Helvetica,sans-serif;` +
          'box-shadow:0 1px 5px rgba(0,0,0,.6);';
        capa.appendChild(c);
      }
      document.body.appendChild(capa);
    },
    { marcas: calculadas, color: COLOR, radio: RADIO },
  );
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

  let clip;
  if (recorte === 'pantalla') {
    clip = { x: 0, y: 0, width: vp.width, height: vp.height };
  } else {
    const arriba = [];
    const abajo = [];
    for (const m of calculadas) {
      arriba.push(m.y - 8, m.cy - RADIO - 4);
      abajo.push(m.y + m.h + 8, m.cy + RADIO + 4);
    }
    for (const r of extras) {
      arriba.push(r.y);
      abajo.push(r.y + r.h);
    }
    let y0 = recorte === 'arriba' ? 0 : Math.max(0, Math.min(...arriba) - margen);
    const { desplazada, finDeLaBarra } = await page.evaluate(() => ({
      desplazada: window.scrollY > 0,
      // La barra superior y la franja fija de abajo (aviso de demostración).
      finDeLaBarra: Math.max(
        0,
        ...[...document.querySelectorAll('header, body *')]
          .filter((el) => {
            const s = getComputedStyle(el);
            const r = el.getBoundingClientRect();
            return s.position === 'fixed' && r.top <= 70 && r.width > window.innerWidth / 2 && r.height < 200;
          })
          .map((el) => el.getBoundingClientRect().bottom),
      ),
    }));
    if (recorte !== 'arriba') {
      if (!desplazada && y0 < 150) {
        // Lo útil empieza cerca de arriba: entra la barra entera y no queda un ítem del menú cortado.
        y0 = 0;
      } else if (desplazada && y0 < finDeLaBarra) {
        // Con la página desplazada, lo que pasa por debajo de la barra fija no se muestra a medias.
        y0 = finDeLaBarra;
      }
    }
    const y1 = Math.min(vp.height, Math.max(...abajo) + margen);
    const pedido = Math.max(...abajo) - Math.min(...arriba);
    if (pedido > vp.height) problemas.push(`${archivo}: lo pedido no entra en la vista`);
    clip = { x: 0, y: Math.round(y0), width: vp.width, height: Math.round(y1 - y0) };
  }

  mkdirSync(SALIDA, { recursive: true });
  await page.screenshot({ path: resolve(SALIDA, archivo), clip, animations: 'disabled' });
  await page.evaluate(() => document.getElementById('marcadores-del-manual')?.remove());

  referencias.push({
    archivo: `img/medico/${archivo}`,
    muestra,
    tamano: { w: clip.width, h: clip.height },
    marcadores: marcas.map((m) => ({ n: m.n, que: m.que })),
  });
  console.log(`  ok ${archivo} (${clip.width}×${clip.height})`);
}

const quiere = (...nn) => !SOLO || nn.some((n) => SOLO.includes(n));

// ───────────────────────── Recorridos (tablet) ─────────────────────────

/** 00 · Pantalla de ingreso (sin sesión; los campos quedan vacíos). */
async function pantallaDeIngreso(page) {
  if (!quiere('00')) return;
  await page.goto(`${WEB}/ingresar`);
  await page.getByRole('heading', { level: 1, name: 'Ingresar' }).waitFor();
  await esperar(page);
  await capturar(page, '00-ingresar.png', {
    muestra: 'Pantalla Ingresar, con los campos vacíos',
    incluir: [page.getByRole('heading', { level: 1, name: 'Ingresar' })],
    marcas: [
      { n: 1, loc: campo(page, 'Usuario', true), que: 'Campo Usuario', lado: 'izq' },
      { n: 2, loc: campo(page, 'Contraseña', true), que: 'Campo Contraseña', lado: 'izq' },
      {
        n: 3,
        loc: page.getByRole('button', { name: 'Mostrar contraseña' }),
        que: 'Ojo: muestra u oculta la contraseña',
        lado: 'esquina-der',
      },
      {
        n: 4,
        loc: page.getByText('Recordar mi usuario en esta tablet').locator('xpath=..'),
        que: 'Recordar mi usuario en esta tablet',
        lado: 'izq',
      },
      { n: 5, loc: page.getByRole('button', { name: 'Ingresar' }), que: 'Botón Ingresar', lado: 'izq' },
    ],
  });
}

/** 01–02 · Inicio y búsqueda de pacientes. */
async function inicioYBusqueda(page) {
  if (!quiere('01', '02')) return;
  await irAlInicio(page);
  const menu = page.getByRole('navigation', { name: 'Menú principal' });
  await capturar(page, '01-inicio.png', {
    muestra: 'Inicio del médico: las tareas del día, el menú lateral y la insignia de recordatorios',
    recorte: 'arriba',
    marcas: [
      { n: 1, loc: page.getByRole('link', { name: /Buscar paciente/ }), que: 'Tarea Buscar paciente' },
      { n: 2, loc: page.getByRole('link', { name: /Internar paciente/ }), que: 'Tarea Internar paciente' },
      { n: 3, loc: page.getByRole('link', { name: /Ver reportes/ }), que: 'Tarea Ver reportes' },
      {
        n: 4,
        loc: page.getByRole('link', { name: /^Recordatorios: / }),
        que: 'Insignia de recordatorios en la barra: el reloj con un número (cuántos hay para atender)',
        lado: 'abajo',
        recuadro: false,
      },
      { n: 5, loc: menu, que: 'Menú lateral (Inicio, Recordatorios, Pacientes, Suministros, Reportes)', lado: 'abajo' },
      {
        n: 6,
        loc: page.getByRole('link', { name: /Ver lo que se registró/ }),
        que: 'Tarea Ver lo que se registró (la misma pantalla que Suministros en el menú)',
        lado: 'esquina-der',
      },
      {
        n: 7,
        loc: page.getByRole('button', { name: /^Tema de la pantalla/ }),
        que: 'Botón Tema de la pantalla (claro, oscuro o igual que el dispositivo)',
        lado: 'abajo',
        recuadro: false,
      },
      {
        n: 8,
        loc: page.getByRole('button', { name: /^Notificaciones/ }),
        que: 'Campana de Notificaciones',
        lado: 'abajo',
        recuadro: false,
      },
    ],
  });

  await page.getByRole('link', { name: /Buscar paciente/ }).click();
  await page.getByRole('heading', { level: 1, name: 'Pacientes' }).waitFor();
  await esperar(page);
  await page.getByLabel('Buscar por apellido, DNI o cama').fill('Olmedo');
  await page.getByRole('row', { name: /Abrir Olmedo/ }).waitFor();
  await expectFilas(page, 1);
  await capturar(page, '02-buscar-paciente.png', {
    muestra: 'Pacientes: búsqueda por apellido, DNI o cama, con los filtros de sala y estado',
    incluir: [page.getByRole('heading', { level: 1, name: 'Pacientes' }), page.getByText(/^Página \d+ de \d+/)],
    marcas: [
      {
        n: 1,
        loc: campo(page, 'Buscar por apellido, DNI o cama'),
        que: 'Campo Buscar por apellido, DNI o cama',
        lado: 'esquina-der',
      },
      { n: 2, loc: campo(page, 'Sala', true), que: 'Filtro Sala', lado: 'esquina-der' },
      { n: 3, loc: campo(page, 'Estado', true), que: 'Filtro Estado (Internados, Egresados, Todos)', lado: 'esquina-der' },
      { n: 4, loc: page.getByRole('row', { name: /Abrir Olmedo/ }), que: 'Fila del paciente: se toca para abrir su ficha' },
      { n: 5, loc: page.getByRole('button', { name: 'Internar paciente' }), que: 'Botón Internar paciente' },
    ],
  });
}

async function expectFilas(page, n) {
  const tabla = page.getByRole('table', { name: 'Pacientes' });
  for (let i = 0; i < 40; i++) {
    if ((await tabla.locator('tbody tr').count()) === n) return;
    await page.waitForTimeout(150);
  }
}

/** Llena los datos personales del formulario de internación. */
async function llenarDatosPersonales(page, d) {
  await page.getByLabel('DNI').fill(d.dni);
  await page.getByLabel('Nombre', { exact: false }).first().fill(d.nombre);
  await page.getByLabel('Apellido').fill(d.apellido);
  await page.getByLabel('Fecha de nacimiento').fill(d.fechaNacimiento);
  await page.getByLabel('Sexo').selectOption({ label: d.sexo });
  if (d.obraSocial) await page.getByLabel('Obra social').fill(d.obraSocial);
  if (d.numeroAfiliado) await page.getByLabel('N.º de afiliado').fill(d.numeroAfiliado);
}

/** 03–05 · Internar en una cama libre y aviso de reingreso. */
async function internar(page) {
  if (!quiere('03', '04', '05')) return;
  await irAlInicio(page);
  await page.getByRole('link', { name: /Internar paciente/ }).click();
  const titulo = page.getByRole('heading', { level: 1, name: 'Internar paciente' });
  await titulo.waitFor();
  await esperar(page);
  await llenarDatosPersonales(page, NUEVO);
  await page.getByLabel('Diagnóstico').fill(NUEVO.diagnostico);
  await page.getByLabel('Contacto de emergencia').fill(NUEVO.contacto);
  await page.getByLabel('Teléfono de emergencia').fill(NUEVO.telefono);
  await elegir(page.getByRole('combobox', { name: /^Cama/ }), NUEVO.cama);
  await page.evaluate(() => window.scrollTo(0, 0));
  await capturar(page, '03-internar-datos.png', {
    muestra: 'Internar paciente: datos personales de un paciente nuevo (ficticio), sin guardar',
    incluir: [titulo],
    marcas: [
      { n: 1, loc: campo(page, 'DNI'), que: 'Campo DNI (7 u 8 dígitos, sin puntos)', lado: 'izq' },
      { n: 2, loc: campo(page, 'Nombre'), que: 'Campo Nombre', lado: 'izq' },
      { n: 3, loc: campo(page, 'Apellido'), que: 'Campo Apellido', lado: 'izq' },
      { n: 4, loc: campo(page, 'Fecha de nacimiento'), que: 'Campo Fecha de nacimiento', lado: 'izq' },
      { n: 5, loc: campo(page, 'Sexo'), que: 'Selector Sexo', lado: 'izq' },
    ],
  });

  const botonInternar = page.getByRole('button', { name: 'Internar', exact: true });
  await asomar(page.getByRole('combobox', { name: /^Cama/ }));
  await capturar(page, '04-internar-cama.png', {
    muestra: 'Internar paciente: datos clínicos, elección de la cama libre y botón Internar (sin tocarlo)',
    incluir: [page.getByRole('heading', { level: 2, name: 'Datos clínicos y contacto' })],
    marcas: [
      {
        n: 1,
        loc: [
          campo(page, 'Diagnóstico'),
          campo(page, 'Observaciones'),
          campo(page, 'Contacto de emergencia'),
          campo(page, 'Teléfono de emergencia'),
        ],
        que: 'Datos clínicos y de contacto (opcionales): Diagnóstico, Observaciones, Contacto y Teléfono de emergencia',
        lado: 'izq',
      },
      { n: 2, loc: campo(page, 'Cama'), que: 'Selector Cama: solo ofrece camas libres', lado: 'izq' },
      { n: 3, loc: botonInternar, que: 'Botón Internar', lado: 'esquina-der' },
      { n: 4, loc: page.getByRole('button', { name: 'Cancelar' }), que: 'Botón Cancelar', lado: 'izq' },
    ],
  });

  if (!quiere('05')) return;
  if (!(await egresadaLista())) {
    problemas.push('05: la paciente egresada no está; no se intentó el reingreso');
    return;
  }
  await irAlInicio(page);
  await page.getByRole('link', { name: /Internar paciente/ }).click();
  await titulo.waitFor();
  await esperar(page);
  await llenarDatosPersonales(page, {
    ...EGRESADA,
    sexo: 'Femenino',
  });
  await elegir(page.getByRole('combobox', { name: /^Cama/ }), 'C-03');
  permitido.reingreso = true;
  await botonInternar.click();
  const aviso = page.locator('.MuiAlert-root', { hasText: 'ya estuvo internado' });
  await aviso.waitFor();
  permitido.reingreso = false;
  await page.evaluate(() => window.scrollTo(0, 0));
  await capturar(page, '05-reingreso-aviso.png', {
    muestra:
      'Internar con el DNI de una paciente que ya estuvo internada (ficticia): aviso con Registrar reingreso, sin tocarlo',
    incluir: [titulo],
    marcas: [
      { n: 1, loc: aviso, que: 'Aviso «El paciente ya estuvo internado»' },
      { n: 2, loc: page.getByRole('button', { name: 'Registrar reingreso' }), que: 'Botón Registrar reingreso', lado: 'esquina-der' },
      { n: 3, loc: campo(page, 'DNI'), que: 'El DNI que se escribió (el de la paciente egresada)', lado: 'izq' },
    ],
  });
}

/** 06–08 · Ficha del paciente, cambiar de cama y dar de alta (diálogos sin confirmar). */
async function fichaTrasladoAlta(page) {
  if (!quiere('06', '07', '08')) return;
  await abrirFicha(page, 'Olmedo');
  const encabezado = page.getByRole('heading', { level: 1, name: /^Olmedo,/ }).locator('xpath=..');
  await page.locator('li', { hasText: 'Ketorolac' }).first().waitFor();
  await capturar(page, '06-ficha-paciente.png', {
    muestra: 'Ficha del paciente (Olmedo): identificación, acciones, pestañas y sus prescripciones',
    marcas: [
      { n: 1, loc: encabezado, que: 'Nombre, DNI, edad y cama del paciente', lado: 'esquina-der' },
      { n: 2, loc: page.getByRole('button', { name: 'Trasladar' }), que: 'Botón Trasladar (cambiar de cama)' },
      { n: 3, loc: page.getByRole('button', { name: 'Dar de alta' }), que: 'Botón Dar de alta', lado: 'esquina-der' },
      { n: 4, loc: page.getByRole('tablist', { name: 'Secciones de la ficha' }), que: 'Pestañas Datos, Prescripciones, Estudios, Historial' },
      { n: 5, loc: page.getByRole('button', { name: 'Nueva prescripción' }), que: 'Botón Nueva prescripción' },
      { n: 6, loc: page.locator('li', { hasText: 'Ketorolac' }).first(), que: 'Tarjeta de una prescripción: se toca para ver el detalle' },
    ],
  });

  if (quiere('07')) {
    await page.getByRole('button', { name: 'Trasladar' }).click();
    const dialogo = page.getByRole('dialog', { name: 'Trasladar de cama' });
    await dialogo.waitFor();
    await esperar(page);
    await elegir(dialogo.getByLabel('Cama nueva'), 'B-05');
    await capturar(page, '07-trasladar.png', {
      muestra: 'Diálogo Trasladar de cama con la cama nueva elegida, sin confirmar',
      incluir: [dialogo],
      marcas: [
        { n: 1, loc: dialogo.getByText(/Cama actual/), que: 'Paciente y cama actual (queda libre al trasladar)', lado: 'izq' },
        { n: 2, loc: campo(dialogo, 'Cama nueva'), que: 'Selector Cama nueva (solo camas libres)', lado: 'izq' },
        { n: 3, loc: dialogo.getByRole('button', { name: 'Trasladar' }), que: 'Botón Trasladar', lado: 'esquina-der' },
        { n: 4, loc: dialogo.getByRole('button', { name: 'Cancelar' }), que: 'Botón Cancelar', lado: 'izq' },
      ],
    });
    await dialogo.getByRole('button', { name: 'Cancelar' }).click();
    await dialogo.waitFor({ state: 'hidden' });
  }

  if (quiere('08')) {
    await page.getByRole('button', { name: 'Dar de alta' }).click();
    const dialogo = page.getByRole('dialog', { name: 'Dar de alta al paciente' });
    await dialogo.waitFor();
    await dialogo.getByLabel('Motivo del egreso').fill('Alta médica');
    await capturar(page, '08-dar-de-alta.png', {
      muestra: 'Diálogo Dar de alta al paciente con fecha y motivo, sin confirmar',
      incluir: [dialogo],
      marcas: [
        {
          n: 1,
          loc: dialogo.getByText(/Se liberará la cama/).locator('xpath=..'),
          que: 'A quién se da de alta, qué pasa (cama, prescripciones, estudios) y cómo se reingresa',
          lado: 'izq',
        },
        { n: 2, loc: campo(dialogo, 'Fecha y hora de egreso'), que: 'Campo Fecha y hora de egreso (viene con la hora actual)', lado: 'izq' },
        { n: 3, loc: campo(dialogo, 'Motivo del egreso'), que: 'Campo Motivo del egreso (obligatorio)', lado: 'izq' },
        { n: 4, loc: dialogo.getByRole('button', { name: 'Dar de alta' }), que: 'Botón Dar de alta', lado: 'esquina-der' },
        { n: 5, loc: dialogo.getByRole('button', { name: 'Cancelar' }), que: 'Botón Cancelar', lado: 'izq' },
      ],
    });
    await dialogo.getByRole('button', { name: 'Cancelar' }).click();
    await dialogo.waitFor({ state: 'hidden' });
  }
}

/** 09–10 · Indicar un medicamento (formulario lleno, sin guardar). */
async function nuevaPrescripcion(page) {
  if (!quiere('09', '10')) return;
  await abrirFicha(page, 'Arrieta');
  await page.getByRole('button', { name: 'Nueva prescripción' }).click();
  const titulo = page.getByRole('heading', { level: 1, name: 'Nueva prescripción' });
  await titulo.waitFor();
  await page.getByRole('region', { name: 'Paciente' }).waitFor();
  await esperar(page);
  await elegir(page.getByLabel('Medicamento'), 'Paracetamol');
  await page.getByLabel('Dosis').fill('500');
  await page.getByLabel('Frecuencia').selectOption({ label: 'Cada 8 horas' });
  await page.getByLabel('Vía').selectOption({ label: 'Oral' });
  const inicio = campoDe(Math.ceil((Date.now() + 10 * MINUTO) / HORA) * HORA);
  await page.getByLabel('Inicio').fill(inicio);
  await page.getByLabel('Observaciones').fill('Dolor de hombro derecho; no más de 3 g por día');
  await page.evaluate(() => window.scrollTo(0, 0));
  await capturar(page, '09-prescripcion-formulario.png', {
    muestra: 'Nueva prescripción (Arrieta): medicamento, dosis, unidad, frecuencia y vía',
    incluir: [titulo],
    marcas: [
      { n: 1, loc: page.getByRole('region', { name: 'Paciente' }), que: 'A quién se le indica: nombre, DNI, edad y cama' },
      { n: 2, loc: campo(page, 'Medicamento'), que: 'Selector Medicamento (catálogo)', lado: 'izq' },
      { n: 3, loc: campo(page, 'Dosis'), que: 'Campo Dosis', lado: 'izq' },
      { n: 4, loc: campo(page, 'Unidad'), que: 'Campo Unidad (se completa con la del medicamento)', lado: 'izq' },
      { n: 5, loc: campo(page, 'Frecuencia'), que: 'Selector Frecuencia', lado: 'izq' },
      { n: 6, loc: campo(page, 'Vía'), que: 'Selector Vía', lado: 'izq' },
    ],
  });

  await asomar(page.getByRole('list', { name: 'Primeras tomas' }));
  await capturar(page, '10-prescripcion-tomas.png', {
    muestra: 'Nueva prescripción: inicio, fin opcional, primeras tomas calculadas y Guardar prescripción (sin tocarlo)',
    marcas: [
      { n: 1, loc: campo(page, 'Inicio'), que: 'Campo Inicio (primera toma)', lado: 'izq' },
      { n: 2, loc: campo(page, 'Fin (opcional)'), que: 'Campo Fin (opcional)', lado: 'izq' },
      { n: 3, loc: page.getByRole('list', { name: 'Primeras tomas' }), que: 'Primeras tomas, en 24 h, para revisar antes de guardar', lado: 'izq' },
      { n: 4, loc: page.getByRole('button', { name: 'Guardar prescripción' }), que: 'Botón Guardar prescripción', lado: 'esquina-der' },
      { n: 5, loc: page.getByRole('button', { name: 'Cancelar' }), que: 'Botón Cancelar', lado: 'izq' },
    ],
  });
}

/** 11 · Aviso de prescripción duplicada (el servidor la rechaza y no se toca Cargar igual). */
async function prescripcionDuplicada(page) {
  if (!quiere('11')) return;
  const vigente = await ketorolacVigente();
  if (!vigente) {
    problemas.push('11: Olmedo no tiene Ketorolac vigente; no se intentó el aviso de duplicada');
    return;
  }
  await abrirFicha(page, 'Olmedo');
  await page.getByRole('button', { name: 'Nueva prescripción' }).click();
  const titulo = page.getByRole('heading', { level: 1, name: 'Nueva prescripción' });
  await titulo.waitFor();
  await page.getByRole('region', { name: 'Paciente' }).waitFor();
  await esperar(page);
  await elegir(page.getByLabel('Medicamento'), 'Ketorolac');
  await page.getByLabel('Dosis').fill('30');
  await page.getByLabel('Frecuencia').selectOption({ label: 'Cada 8 horas' });
  await page.getByLabel('Vía').selectOption({ label: 'Intravenosa' });
  permitido.duplicada = true;
  await page.getByRole('button', { name: 'Guardar prescripción' }).click();
  const aviso = page.locator('.MuiAlert-root', { hasText: 'Posible prescripción duplicada' });
  await aviso.waitFor();
  permitido.duplicada = false;
  await page.evaluate(() => window.scrollTo(0, 0));
  await capturar(page, '11-prescripcion-duplicada.png', {
    muestra: 'Aviso de posible prescripción duplicada (Ketorolac a Olmedo, que ya lo tiene vigente), sin tocar Cargar igual',
    incluir: [titulo],
    marcas: [
      { n: 1, loc: aviso, que: 'Aviso «Posible prescripción duplicada» con la que ya está vigente' },
      { n: 2, loc: page.getByRole('button', { name: 'Cargar igual' }), que: 'Botón Cargar igual', lado: 'izq' },
      { n: 3, loc: campo(page, 'Medicamento'), que: 'Selector Medicamento (para corregir)', lado: 'izq' },
    ],
  });
}

/** Desde la ficha de un paciente, toca la tarjeta de una prescripción y espera su detalle. */
async function abrirPrescripcion(page, apellido, medicamento) {
  await abrirFicha(page, apellido);
  // La tarjeta entera abre el detalle (se toca el contenido, como con el dedo).
  await page.locator('li', { hasText: medicamento }).first().click();
  await page.getByRole('heading', { level: 1, name: new RegExp(`^${medicamento}`) }).waitFor();
  await page.getByRole('region', { name: 'Paciente' }).waitFor();
  await esperar(page);
}

/**
 * 12–15 · Cambiar la dosis (Enalapril de Villafañe), y suspender y finalizar otra indicación
 * (Ceftriaxona de Villafañe): diálogos con motivo, sin confirmar. Son prescripciones distintas
 * para que, leídas en orden, no parezca que el cambio de la 12 no se guardó.
 */
async function cambiarIndicacion(page) {
  if (!quiere('12', '13', '14', '15')) return;
  if (quiere('12', '13')) await cambiarDosis(page);
  if (quiere('14', '15')) await suspenderYFinalizar(page);
}

async function cambiarDosis(page) {
  await abrirPrescripcion(page, 'Villafañe', 'Enalapril');
  const dosis = page.getByLabel('Dosis');
  const original = await dosis.inputValue();
  await dosis.fill('20');
  const guardar = page.getByRole('button', { name: 'Guardar cambios' });
  await page.evaluate(() => window.scrollTo(0, 0));
  await capturar(page, '12-prescripcion-detalle.png', {
    muestra: 'Detalle de una prescripción (Enalapril de Villafañe) con la dosis cambiada de 10 a 20 mg, antes de guardar',
    incluir: [page.getByRole('heading', { level: 1, name: /^Enalapril/ })],
    marcas: [
      { n: 1, loc: page.getByRole('button', { name: 'Suspender' }), que: 'Botón Suspender' },
      { n: 2, loc: page.getByRole('button', { name: 'Finalizar' }), que: 'Botón Finalizar', lado: 'esquina-der' },
      { n: 3, loc: campo(page, 'Dosis'), que: 'Campo Dosis (cambiada de 10 a 20)', lado: 'izq' },
      { n: 4, loc: campo(page, 'Frecuencia'), que: 'Selector Frecuencia', lado: 'izq' },
      { n: 5, loc: guardar, que: 'Botón Guardar cambios', lado: 'esquina-der' },
    ],
  });

  if (quiere('13')) {
    await guardar.click();
    const dialogo = page.getByRole('dialog', { name: 'Guardar cambios en la prescripción' });
    await dialogo.waitFor();
    await dialogo.getByLabel('Motivo del cambio').fill('Tensión arterial elevada en los controles');
    await capturar(page, '13-prescripcion-guardar-cambios.png', {
      muestra: 'Diálogo Guardar cambios en la prescripción: antes y después, y motivo, sin confirmar',
      incluir: [dialogo],
      marcas: [
        { n: 1, loc: dialogo.getByRole('table', { name: 'Cambios' }), que: 'Tabla Antes / Después de lo que cambia' },
        { n: 2, loc: campo(dialogo, 'Motivo del cambio'), que: 'Campo Motivo del cambio (obligatorio)', lado: 'izq' },
        { n: 3, loc: dialogo.getByRole('button', { name: 'Guardar', exact: true }), que: 'Botón Guardar', lado: 'esquina-der' },
        { n: 4, loc: dialogo.getByRole('button', { name: 'Cancelar' }), que: 'Botón Cancelar', lado: 'izq' },
      ],
    });
    await dialogo.getByRole('button', { name: 'Cancelar' }).click();
    await dialogo.waitFor({ state: 'hidden' });
  }
  // Vuelve la dosis a la original: al salir no queda un cambio a medias (ni el aviso de descartar).
  await dosis.fill(original);
}

async function suspenderYFinalizar(page) {
  await abrirPrescripcion(page, 'Villafañe', 'Ceftriaxona');
  for (const [nn, boton, titulo, motivo, archivo, muestra, mensaje] of [
    [
      '14',
      'Suspender',
      'Suspender la prescripción',
      'Se reevalúa con el resultado del hemocultivo',
      '14-prescripcion-suspender.png',
      'Diálogo Suspender la prescripción con su motivo, sin confirmar (se puede reanudar)',
      'Qué se suspende y que se puede reanudar después',
    ],
    [
      '15',
      'Finalizar',
      'Finalizar la prescripción',
      'Completó el tratamiento',
      '15-prescripcion-finalizar.png',
      'Diálogo Finalizar la prescripción con su motivo, sin confirmar (no se puede reanudar)',
      'Qué se finaliza y que no se puede reanudar',
    ],
  ]) {
    if (!quiere(nn)) continue;
    await page.getByRole('button', { name: boton, exact: true }).click();
    const dialogo = page.getByRole('dialog', { name: titulo });
    await dialogo.waitFor();
    await dialogo.getByLabel('Motivo').fill(motivo);
    await capturar(page, archivo, {
      muestra,
      incluir: [dialogo],
      marcas: [
        { n: 1, loc: dialogo.getByText(/^Se (suspende|finaliza)/), que: mensaje, lado: 'izq' },
        { n: 2, loc: campo(dialogo, 'Motivo'), que: 'Campo Motivo (obligatorio)', lado: 'izq' },
        { n: 3, loc: dialogo.getByRole('button', { name: boton, exact: true }), que: `Botón ${boton}`, lado: 'esquina-der' },
        { n: 4, loc: dialogo.getByRole('button', { name: 'Cancelar' }), que: 'Botón Cancelar', lado: 'izq' },
      ],
    });
    await dialogo.getByRole('button', { name: 'Cancelar' }).click();
    await dialogo.waitFor({ state: 'hidden' });
  }
}

/** 28–29 · Encontrar una prescripción suspendida (Mostrar: Todas) y el diálogo Reanudar, sin confirmar. */
async function reanudar(page) {
  if (!quiere('28', '29')) return;
  await abrirFicha(page, 'Arrieta');
  await page.getByLabel('Mostrar', { exact: true }).selectOption({ label: 'Todas' });
  const tarjeta = page.locator('li', { hasText: SUSPENDIDA.medicamento }).first();
  await tarjeta.waitFor();
  await esperar(page);
  await asomar(tarjeta);
  await capturar(page, '28-prescripcion-suspendida.png', {
    muestra: 'Ficha de Arrieta con Mostrar: Todas, donde aparece la prescripción suspendida (Ibuprofeno)',
    marcas: [
      { n: 1, loc: campo(page, 'Mostrar', true), que: 'Selector Mostrar (en Todas)', lado: 'izq' },
      { n: 2, loc: tarjeta, que: 'Tarjeta de la prescripción suspendida' },
    ],
  });

  if (!quiere('29')) return;
  await tarjeta.click();
  await page.getByRole('heading', { level: 1, name: new RegExp(`^${SUSPENDIDA.medicamento}`) }).waitFor();
  await esperar(page);
  await page.getByRole('button', { name: 'Reanudar', exact: true }).click();
  const dialogo = page.getByRole('dialog', { name: 'Reanudar la prescripción' });
  await dialogo.waitFor();
  await dialogo.getByLabel('Motivo').fill('Sin epigastralgia; vuelve el dolor de hombro');
  await capturar(page, '29-prescripcion-reanudar.png', {
    muestra: 'Diálogo Reanudar la prescripción con su motivo, sin confirmar',
    incluir: [dialogo],
    marcas: [
      { n: 1, loc: dialogo.getByText(/^Se reanuda/), que: 'Qué se reanuda', lado: 'izq' },
      { n: 2, loc: campo(dialogo, 'Motivo'), que: 'Campo Motivo (obligatorio)', lado: 'izq' },
      { n: 3, loc: dialogo.getByRole('button', { name: 'Reanudar', exact: true }), que: 'Botón Reanudar', lado: 'esquina-der' },
      { n: 4, loc: dialogo.getByRole('button', { name: 'Cancelar' }), que: 'Botón Cancelar', lado: 'izq' },
    ],
  });
  await dialogo.getByRole('button', { name: 'Cancelar' }).click();
  await dialogo.waitFor({ state: 'hidden' });
}

/** 16–19 · Estudios: programar, reprogramar y cancelar (diálogos sin confirmar). */
async function estudios(page) {
  if (!quiere('16', '17', '18', '19')) return;
  await abrirFicha(page, 'Olmedo');
  await page.getByRole('tab', { name: 'Estudios' }).click();
  const tarjeta = page.locator('li', { hasText: 'Hemograma y coagulograma' }).first();
  await tarjeta.waitFor();
  await esperar(page);
  const programar = page.getByRole('button', { name: 'Programar estudio' }).first();
  const reprogramar = page.getByRole('button', { name: 'Reprogramar Hemograma y coagulograma' });
  const cancelar = page.getByRole('button', { name: 'Cancelar estudio Hemograma y coagulograma' });
  await capturar(page, '16-estudios-pestana.png', {
    muestra: 'Pestaña Estudios de la ficha (Olmedo): el estudio programado con sus acciones',
    incluir: [page.getByRole('heading', { level: 1, name: /^Olmedo,/ })],
    marcas: [
      { n: 1, loc: page.getByRole('tab', { name: 'Estudios' }), que: 'Pestaña Estudios' },
      { n: 2, loc: programar, que: 'Botón Programar estudio', lado: 'esquina-der' },
      { n: 3, loc: tarjeta, que: 'Tarjeta del estudio: fecha y hora, preparación y quién lo programó' },
      { n: 4, loc: cancelar, que: 'Botón Cancelar estudio', lado: 'izq' },
      { n: 5, loc: reprogramar, que: 'Botón Reprogramar', lado: 'esquina-der' },
    ],
  });

  if (quiere('17')) {
    await programar.click();
    const dialogo = page.getByRole('dialog', { name: 'Programar estudio' });
    await dialogo.waitFor();
    await esperar(page);
    await elegir(dialogo.getByLabel('Tipo de estudio'), 'Tomografía computada');
    await dialogo.getByLabel('Fecha y hora').fill(campoDia(1, 10, 0));
    await dialogo.getByLabel('Nombre del estudio (opcional)').fill('TC de cadera derecha');
    await dialogo.getByLabel('Observaciones (opcional)').fill('Trasladar en camilla');
    await capturar(page, '17-programar-estudio.png', {
      muestra: 'Diálogo Programar estudio lleno (tomografía para mañana a las 10:00), sin confirmar',
      incluir: [dialogo],
      marcas: [
        { n: 1, loc: campo(dialogo, 'Tipo de estudio'), que: 'Selector Tipo de estudio', lado: 'izq' },
        { n: 2, loc: campo(dialogo, 'Fecha y hora'), que: 'Campo Fecha y hora', lado: 'esquina-der' },
        { n: 3, loc: campo(dialogo, 'Nombre del estudio (opcional)'), que: 'Campo Nombre del estudio (se completa con el tipo)', lado: 'izq' },
        { n: 4, loc: campo(dialogo, 'Preparación (opcional)'), que: 'Campo Preparación (la del tipo; se puede cambiar o borrar)', lado: 'izq' },
        { n: 5, loc: dialogo.getByRole('button', { name: 'Programar estudio' }), que: 'Botón Programar estudio', lado: 'esquina-der' },
      ],
    });
    await dialogo.getByRole('button', { name: 'Cancelar' }).click();
    await dialogo.waitFor({ state: 'hidden' });
  }

  if (quiere('18')) {
    await reprogramar.click();
    const dialogo = page.getByRole('dialog', { name: 'Reprogramar estudio' });
    await dialogo.waitFor();
    await dialogo.getByLabel('Nueva fecha y hora').fill(campoDia(1, 8, 0));
    await capturar(page, '18-reprogramar-estudio.png', {
      muestra: 'Diálogo Reprogramar estudio con la hora nueva (mañana 08:00), sin confirmar',
      incluir: [dialogo],
      marcas: [
        { n: 1, loc: dialogo.getByText(/Está programado para el/), que: 'Para cuándo está programado ahora', lado: 'izq' },
        { n: 2, loc: campo(dialogo, 'Nueva fecha y hora'), que: 'Campo Nueva fecha y hora', lado: 'izq' },
        { n: 3, loc: dialogo.getByRole('button', { name: 'Reprogramar' }), que: 'Botón Reprogramar', lado: 'esquina-der' },
        { n: 4, loc: dialogo.getByRole('button', { name: 'Cancelar' }), que: 'Botón Cancelar', lado: 'izq' },
      ],
    });
    await dialogo.getByRole('button', { name: 'Cancelar' }).click();
    await dialogo.waitFor({ state: 'hidden' });
  }

  if (quiere('19')) {
    await cancelar.click();
    const dialogo = page.getByRole('dialog', { name: 'Cancelar el estudio' });
    await dialogo.waitFor();
    await dialogo.getByLabel('Motivo de la cancelación').fill('Se suspendió el turno del laboratorio');
    await capturar(page, '19-cancelar-estudio.png', {
      muestra: 'Diálogo Cancelar el estudio con su motivo, sin confirmar (no se puede deshacer)',
      incluir: [dialogo],
      marcas: [
        { n: 1, loc: dialogo.getByText(/^Se cancela/).locator('xpath=..'), que: 'Qué estudio se cancela, de quién, y que no se puede deshacer', lado: 'izq' },
        { n: 2, loc: campo(dialogo, 'Motivo de la cancelación'), que: 'Campo Motivo de la cancelación (obligatorio)', lado: 'izq' },
        { n: 3, loc: dialogo.getByRole('button', { name: 'Cancelar estudio' }), que: 'Botón Cancelar estudio', lado: 'esquina-der' },
        { n: 4, loc: dialogo.getByRole('button', { name: 'Volver' }), que: 'Botón Volver (no cancela nada)', lado: 'izq' },
      ],
    });
    await dialogo.getByRole('button', { name: 'Volver' }).click();
    await dialogo.waitFor({ state: 'hidden' });
  }
}

/** 20 · Recordatorios (el médico los ve, no los atiende). */
async function recordatorios(page) {
  if (!quiere('20')) return;
  await irAlInicio(page);
  await page.getByRole('link', { name: /^Recordatorios: / }).click();
  await page.getByRole('heading', { level: 1, name: 'Recordatorios' }).waitFor();
  const lista = page.getByRole('list', { name: 'Recordatorios para atender' });
  await lista.waitFor();
  await esperar(page);
  const primera = lista.getByRole('listitem').first();
  await capturar(page, '20-recordatorios.png', {
    muestra: 'Recordatorios: tomas y estudios de la próxima media hora, de lo más urgente a lo menos (solo lectura para el médico)',
    recorte: 'arriba',
    incluir: [lista.getByRole('listitem').nth(1)],
    marcas: [
      { n: 1, loc: page.getByRole('link', { name: /^Recordatorios: / }), que: 'Insignia de recordatorios (a un toque desde cualquier pantalla)' },
      { n: 2, loc: page.getByText(/para atender ·/), que: 'Cuántos hay, cuántos urgentes y la hora de actualización', lado: 'esquina-der' },
      { n: 3, loc: campo(page, 'Tipo', true), que: 'Filtro Tipo (tomas o estudios)', lado: 'esquina-der' },
      { n: 4, loc: campo(page, 'Sala', true), que: 'Filtro Sala', lado: 'esquina-der' },
      { n: 5, loc: primera, que: 'Tarjeta de un recordatorio: hora, prioridad, paciente, cama y qué toca' },
    ],
  });
}

/** 21–24 · Reportes y estadísticas (el médico los ve; el archivo se le pide a un administrador). */
async function reportes(page) {
  if (!quiere('21', '22', '23', '24')) return;
  await irAlInicio(page);
  await page.getByRole('link', { name: /Ver reportes/ }).click();
  const titulo = page.getByRole('heading', { level: 1, name: 'Reportes' });
  await titulo.waitFor();
  const tabla = page.getByRole('table', { name: /Reporte de suministros por/ });
  await tabla.waitFor();
  await esperar(page);
  const filtros = page.getByRole('search', { name: 'Filtros' });
  await capturar(page, '21-reportes-filtros.png', {
    muestra: 'Reportes, pestaña Suministros: período y filtros (por defecto, los últimos 7 días)',
    incluir: [titulo],
    margen: 10,
    marcas: [
      { n: 1, loc: page.getByRole('tablist', { name: 'Secciones de los reportes' }), que: 'Pestañas Suministros y Estadísticas' },
      { n: 2, loc: filtros.getByRole('group').first(), que: 'Atajos de período: Hoy, 7 días, 30 días', lado: 'esquina-der' },
      { n: 3, loc: [campo(page, 'Desde'), campo(page, 'Hasta')], que: 'Campos Desde y Hasta (otro período)', lado: 'esquina-der' },
      { n: 4, loc: [campo(page, 'Sala'), campo(page, 'Tipo')], que: 'Filtros Sala y Tipo (medicamentos o insumos)', lado: 'esquina-der' },
      { n: 5, loc: campo(page, 'Agrupar por'), que: 'Selector Agrupar por (paciente, insumo, personal o día)', lado: 'esquina-der' },
    ],
  });

  if (quiere('22')) {
    const nota = page.getByText('Para descargar el archivo, pídaselo a un administrador.');
    // La tabla entera a la vista, con el resumen y la nota de arriba.
    await tabla.evaluate((el) => el.scrollIntoView({ block: 'end' }));
    await page.evaluate(() => window.scrollBy(0, 24));
    await page.waitForTimeout(200);
    await capturar(page, '22-reportes-resultado.png', {
      muestra: 'Reportes: resumen del período, la nota para pedir el archivo y la tabla agrupada por paciente',
      margen: 8,
      marcas: [
        { n: 1, loc: page.getByText(/^Del \d\d\/\d\d\/\d{4} al/), que: 'Qué período, salas y tipos se están viendo', lado: 'izq' },
        { n: 2, loc: nota, que: 'Nota: el médico no descarga; el archivo (PDF o Excel) se le pide a un administrador', lado: 'izq' },
        { n: 3, loc: page.getByRole('link', { name: /Ver cada unidad por separado/ }), que: 'Enlace Ver cada unidad por separado', lado: 'izq' },
        { n: 4, loc: tabla, que: 'Tabla del reporte, con el total al pie' },
      ],
    });
  }

  if (quiere('23', '24')) {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.getByRole('tab', { name: 'Estadísticas' }).click();
    const indicadores = page.locator('[aria-label="Indicadores del período"]');
    await indicadores.first().waitFor();
    await esperar(page);
    await capturar(page, '23-reportes-estadisticas.png', {
      muestra: 'Reportes, pestaña Estadísticas: el mismo período y los indicadores (suministros, pacientes, recordatorios atendidos)',
      incluir: [titulo],
      marcas: [
        { n: 1, loc: page.getByRole('tab', { name: 'Estadísticas' }), que: 'Pestaña Estadísticas' },
        { n: 2, loc: filtros.getByRole('group').first(), que: 'El mismo período y filtros que en Suministros', lado: 'esquina-der' },
        { n: 3, loc: indicadores.first(), que: 'Indicadores del período' },
        {
          n: 4,
          loc: page.getByText(/^Sobre los \d+ recordatorios/),
          que: 'Cómo se cuentan los recordatorios atendidos y a tiempo',
          lado: 'izq',
        },
      ],
    });

    if (quiere('24')) {
      const grafico = page.getByRole('region', { name: 'Medicamentos e insumos más usados' });
      const verTabla = grafico.getByRole('button', { name: /Ver como tabla/ });
      // El gráfico, justo debajo de la barra fija (sin texto cortado por encima).
      await grafico.evaluate((el) => {
        el.scrollIntoView({ block: 'start' });
        window.scrollBy(0, -130);
      });
      await page.waitForTimeout(200);
      await capturar(page, '24-reportes-grafico.png', {
        muestra: 'Reportes, pestaña Estadísticas: un gráfico (los más usados del período) con su botón Ver como tabla',
        margen: 6,
        marcas: [
          { n: 1, loc: grafico, que: 'Gráfico con su título y qué muestra', lado: 'dentro-arriba' },
          { n: 2, loc: verTabla, que: 'Botón Ver como tabla (los mismos números, para leerlos exactos)', lado: 'izq' },
        ],
      });
    }
  }
}

// ───────────────────────── Recorridos (teléfono) ─────────────────────────

async function telefono(page) {
  if (!quiere('25', '26', '27')) return;
  await irAlInicio(page);
  const abrirMenu = page.getByRole('button', { name: 'Abrir el menú' });
  await capturar(page, '25-telefono-inicio.png', {
    muestra: 'Inicio en el teléfono: el menú se abre con el botón de la barra',
    recorte: 'arriba',
    marcas: [
      { n: 1, loc: abrirMenu, que: 'Botón Abrir el menú', lado: 'abajo' },
      { n: 2, loc: page.getByRole('link', { name: /^Recordatorios: / }), que: 'Insignia de recordatorios', lado: 'abajo' },
      { n: 3, loc: page.getByRole('link', { name: /Buscar paciente/ }), que: 'Tarea Buscar paciente' },
      { n: 4, loc: page.getByRole('button', { name: 'Salir' }), que: 'Botón Salir (la flecha, sin texto)', lado: 'abajo' },
    ],
  });

  if (quiere('26')) {
    await abrirMenu.click();
    const menu = page.getByRole('navigation', { name: 'Menú principal' });
    await menu.waitFor();
    await page.waitForTimeout(400);
    await capturar(page, '26-telefono-menu.png', {
      muestra: 'Menú en cajón del teléfono, con el tema de la pantalla al pie',
      recorte: 'pantalla',
      marcas: [
        { n: 1, loc: menu.getByRole('link', { name: 'Recordatorios' }), que: 'Opción Recordatorios', lado: 'dentro', recuadro: false },
        { n: 2, loc: menu.getByRole('link', { name: 'Pacientes' }), que: 'Opción Pacientes', lado: 'dentro', recuadro: false },
        { n: 3, loc: menu.getByRole('link', { name: 'Reportes' }), que: 'Opción Reportes', lado: 'dentro', recuadro: false },
        { n: 4, loc: page.getByText('Tema de la pantalla').locator('xpath=..'), que: 'Tema de la pantalla (claro u oscuro)', lado: 'arriba' },
      ],
    });
    await page.keyboard.press('Escape');
    await menu.waitFor({ state: 'hidden' });
  }

  if (quiere('27')) {
    await abrirFicha(page, 'Olmedo', true);
    await capturar(page, '27-telefono-ficha.png', {
      muestra: 'Ficha del paciente en el teléfono: las acciones pasan debajo del nombre',
      recorte: 'pantalla',
      marcas: [
        { n: 1, loc: page.getByRole('heading', { level: 1, name: /^Olmedo,/ }).locator('xpath=..'), que: 'Nombre, DNI, edad y cama', lado: 'izq-arriba' },
        { n: 2, loc: page.getByRole('button', { name: 'Trasladar' }), que: 'Botón Trasladar', lado: 'esquina-der' },
        { n: 3, loc: page.getByRole('button', { name: 'Dar de alta' }), que: 'Botón Dar de alta', lado: 'der' },
        { n: 4, loc: page.getByRole('tablist', { name: 'Secciones de la ficha' }), que: 'Pestañas de la ficha' },
      ],
    });
  }
}

// ───────────────────────── Principal ─────────────────────────

async function nuevaPagina(navegador, viewport, { conSesion = true } = {}) {
  const contexto = await navegador.newContext({
    viewport,
    deviceScaleFactor: 1,
    colorScheme: 'light',
    locale: 'es-AR',
    timezoneId: ZONA,
    reducedMotion: 'reduce',
    ...(viewport.width < 600 ? { isMobile: true, hasTouch: true } : {}),
  });
  await redDeSeguridad(contexto);
  const page = await contexto.newPage();
  page.setDefaultTimeout(15_000);
  // Al salir de un formulario a medias, el navegador pregunta: se sale sin guardar.
  page.on('dialog', (d) => void d.accept());
  if (conSesion) await ingresar(page);
  return page;
}

async function principal() {
  console.log('Preparando…');
  await prepararDatos();
  const navegador = await chromium.launch({ headless: !VER });
  try {
    console.log('Tablet 768 × 1024');
    if (quiere('00')) {
      const sinSesion = await nuevaPagina(navegador, TABLET, { conSesion: false });
      try {
        await pantallaDeIngreso(sinSesion);
      } catch (e) {
        problemas.push(`pantallaDeIngreso: ${e.message.split('\n')[0]}`);
        console.error(`  ✗ pantallaDeIngreso: ${e.message.split('\n')[0]}`);
      }
      await sinSesion.context().close();
    }
    const tablet = await nuevaPagina(navegador, TABLET);
    for (const recorrido of [
      inicioYBusqueda,
      internar,
      fichaTrasladoAlta,
      nuevaPrescripcion,
      prescripcionDuplicada,
      cambiarIndicacion,
      reanudar,
      estudios,
      recordatorios,
      reportes,
    ]) {
      try {
        await recorrido(tablet);
      } catch (e) {
        problemas.push(`${recorrido.name}: ${e.message.split('\n')[0]}`);
        console.error(`  ✗ ${recorrido.name}: ${e.message.split('\n')[0]}`);
        await tablet.screenshot({ path: resolve(SALIDA, `_error-${recorrido.name}.png`) }).catch(() => undefined);
      }
    }
    if (quiere('25', '26', '27')) {
      console.log('Teléfono 375 × 812');
      const movil = await nuevaPagina(navegador, TELEFONO);
      try {
        await telefono(movil);
      } catch (e) {
        problemas.push(`telefono: ${e.message.split('\n')[0]}`);
        console.error(`  ✗ telefono: ${e.message.split('\n')[0]}`);
      }
    }
  } finally {
    await navegador.close();
  }

  // Con --solo se reemplazan en referencias.json solo las capturas que se rehicieron.
  let todas = referencias;
  if (SOLO) {
    let anteriores = [];
    try {
      anteriores = JSON.parse(readFileSync(resolve(SALIDA, 'referencias.json'), 'utf8'));
    } catch {
      /* no había */
    }
    const nuevas = new Set(referencias.map((r) => r.archivo));
    todas = [...anteriores.filter((r) => !nuevas.has(r.archivo)), ...referencias];
  }
  todas.sort((a, b) => a.archivo.localeCompare(b.archivo));
  if (referencias.length) {
    writeFileSync(resolve(SALIDA, 'referencias.json'), `${JSON.stringify(todas, null, 2)}\n`);
  }
  if (bloqueados.length) {
    console.log(`\nLa red de seguridad cortó ${bloqueados.length} pedidos que modificaban datos:`);
    for (const b of bloqueados) console.log(`  - ${b}`);
  }
  if (problemas.length) {
    console.log('\nProblemas:');
    for (const p of problemas) console.log(`  - ${p}`);
    process.exitCode = 1;
  }
}

principal().catch((e) => {
  console.error(`No se pudieron hacer las capturas: ${e.message}`);
  process.exitCode = 1;
});
