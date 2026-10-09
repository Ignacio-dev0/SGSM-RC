// Guía del médico: preparación y controles por la API, y la red de seguridad del navegador.

import { DIA, EGRESADA, HORA, MARCA, MINUTO, sesionApi } from './datos.mjs';
import { quiere } from './pantalla.mjs';

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
    const fechaEgreso = new Date(
      Math.max(haceSeis, Date.parse(p.fechaIngreso) + HORA),
    ).toISOString();
    await api.post(`/api/pacientes/${p.id}/egresar`, {
      motivo: `Alta médica (${MARCA})`,
      fechaEgreso: new Date(Math.min(Date.parse(fechaEgreso), Date.now() - MINUTO)).toISOString(),
    });
    console.log(`  preparación: ${EGRESADA.apellido} quedó egresada`);
  }
}

/** Prescripción suspendida de Arrieta (Ibuprofeno), para mostrar cómo se reanuda. */
export const SUSPENDIDA = {
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
    (x) =>
      x.medicamento.nombre.startsWith(SUSPENDIDA.medicamento) &&
      String(x.observaciones ?? '').includes(MARCA),
  );
  if (mias.some((x) => x.estado === 'SUSPENDIDA')) return;
  let p = mias.find((x) => x.estado === 'VIGENTE');
  if (!p) {
    if (
      todas.some(
        (x) => x.medicamento.nombre.startsWith(SUSPENDIDA.medicamento) && x.estado === 'VIGENTE',
      )
    ) {
      throw new Error(
        `Arrieta ya tiene ${SUSPENDIDA.medicamento} vigente cargado a mano: no se prepara la suspendida`,
      );
    }
    const { data: catalogo } = await api.get(
      '/api/insumos?tipo=MEDICAMENTO&activo=true&porPagina=100',
    );
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
  await api.post(`/api/prescripciones/${p.id}/estado`, {
    estado: 'SUSPENDIDA',
    motivo: SUSPENDIDA.motivo,
  });
  console.log(`  preparación: ${SUSPENDIDA.medicamento} de Arrieta quedó suspendido`);
}

export async function prepararDatos() {
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
  console.log(
    `  recordatorios: ${meta.total} para atender (${meta.urgentes} urgentes, ${vencidos} vencidos)`,
  );
  if (meta.total === 0 || vencidos > 0) {
    console.warn(
      '  ! Los recordatorios no están como en la demostración: correr preparar-datos.mjs y esperar ~70 s',
    );
  }
}

/** Antes de los dos envíos que el servidor tiene que rechazar, se comprueba que los rechace. */
export async function egresadaLista() {
  const p = await buscarPaciente(EGRESADA.dni);
  return p?.estado === 'EGRESADO';
}
export async function ketorolacVigente() {
  const { data } = await api.get(`/api/pacientes/${ids.olmedo}/prescripciones?estado=VIGENTE`);
  return data.find((x) => x.medicamento.nombre.startsWith('Ketorolac')) ?? null;
}

// ───────────────────────── Red de seguridad ─────────────────────────

export const bloqueados = [];
/** Envíos permitidos en este momento (los fija cada recorrido justo antes de tocar el botón). */
export const permitido = { reingreso: false, duplicada: false };

export async function redDeSeguridad(contexto) {
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
