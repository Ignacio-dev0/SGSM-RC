// Datos de demostración para las capturas de los manuales (SOLO desarrollo).
//
// Usa la API real, como lo haría el personal desde la tablet:
//   - como médico: interna 3 pacientes ficticios en camas libres de salas distintas, les indica
//     medicamentos del catálogo con la primera toma dentro de los próximos 10 a 25 minutos (así el
//     temporizador genera recordatorios pendientes) y programa 2 estudios (uno en unos 20 minutos
//     y otro mañana temprano);
//   - como enfermero: registra 2 administraciones y un registro de insumos de uno de ellos,
//     confirmando con el rostro simulado del modo de demostración.
//
// Es idempotente: reconoce lo suyo por el DNI de los pacientes y por las observaciones que dicen
// "Demostración manual", y no lo duplica. Si las tomas ya pasaron (los recordatorios vencen a la
// hora), al volver a correrlo renueva el horario: marca "No se administró" en los recordatorios
// vencidos de esas prescripciones, las finaliza y las vuelve a indicar con la primera toma en los
// próximos minutos; los estudios se reprograman.
//
// Uso (desde la raíz del repo, con la API andando):
//   node docs/manuales/herramientas/preparar-datos.mjs            (espera ~70 s y lista los recordatorios)
//   node docs/manuales/herramientas/preparar-datos.mjs --sin-esperar
//
// Variables opcionales: SGSM_API (por defecto http://localhost:3000) y las mismas de las pruebas
// e2e para los usuarios (E2E_USUARIO_MEDICO, E2E_CLAVE_MEDICO, E2E_USUARIO_ENFERMERO,
// E2E_CLAVE_ENFERMERO). Sin ellas, toma los usuarios de prueba de e2e/soporte.ts.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const API = process.env.SGSM_API ?? 'http://localhost:3000';
const MARCA = 'Demostración manual';
const MINUTO = 60_000;
const HORA = 60 * MINUTO;
const ZONA = 'America/Argentina/Buenos_Aires';
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const ESPERAR = !process.argv.includes('--sin-esperar');

// ───────────────────────── Datos ficticios ─────────────────────────

/** Pacientes inventados; los DNI empiezan con 9 para que no choquen con nadie. */
const PACIENTES = [
  {
    clave: 'olmedo',
    sala: 'Traumatología',
    camaPreferida: 'B-03',
    horasInternado: 6,
    datos: {
      dni: '90418273',
      apellido: 'Olmedo',
      nombre: 'Ramiro Teodoro',
      fechaNacimiento: '1956-06-22',
      sexo: 'MASCULINO',
      obraSocial: 'Obra social provincial',
      numeroAfiliado: '90-418273-00',
      diagnostico: 'Fractura de cadera derecha, posoperatorio inmediato',
      contactoEmergenciaNombre: 'Silvina Olmedo (hija)',
      contactoEmergenciaTelefono: '0351 555-0142',
      observaciones: `Paciente ficticio (${MARCA})`,
    },
    medicamentos: [
      { nombre: 'Ketorolac', dosis: 30, unidadDosis: 'mg', frecuenciaHoras: 8, via: 'INTRAVENOSA', obs: 'Dolor posoperatorio; diluir en 100 ml' },
      { nombre: 'Omeprazol', dosis: 20, unidadDosis: 'mg', frecuenciaHoras: 24, via: 'ORAL', obs: 'En ayunas' },
      { nombre: 'Enoxaparina', dosis: 40, unidadDosis: 'mg', frecuenciaHoras: 24, via: 'SUBCUTANEA', obs: 'Profilaxis antitrombótica' },
    ],
  },
  {
    clave: 'villafane',
    sala: 'Cuidados intermedios',
    camaPreferida: 'C-02',
    horasInternado: 26,
    datos: {
      dni: '90527614',
      apellido: 'Villafañe',
      nombre: 'Herminia',
      fechaNacimiento: '1941-11-02',
      sexo: 'FEMENINO',
      obraSocial: 'Obra social provincial',
      numeroAfiliado: '90-527614-01',
      diagnostico: 'Neumonía adquirida en la comunidad',
      contactoEmergenciaNombre: 'Aníbal Villafañe (hijo)',
      contactoEmergenciaTelefono: '0351 555-0187',
      observaciones: `Paciente ficticia (${MARCA})`,
    },
    medicamentos: [
      { nombre: 'Ceftriaxona', dosis: 1, unidadDosis: 'g', frecuenciaHoras: 24, via: 'INTRAVENOSA', obs: 'Pasar en 30 minutos' },
      { nombre: 'Paracetamol', dosis: 500, unidadDosis: 'mg', frecuenciaHoras: 6, via: 'ORAL', obs: 'Fiebre o dolor' },
      { nombre: 'Enalapril', dosis: 10, unidadDosis: 'mg', frecuenciaHoras: 12, via: 'ORAL', obs: 'Controlar la tensión arterial antes de dar' },
    ],
  },
  {
    clave: 'arrieta',
    sala: 'Neurorrehabilitación',
    camaPreferida: 'A-04',
    horasInternado: 72,
    datos: {
      dni: '90639158',
      apellido: 'Arrieta',
      nombre: 'Teodoro Julián',
      fechaNacimiento: '1969-02-14',
      sexo: 'MASCULINO',
      obraSocial: null,
      numeroAfiliado: null,
      diagnostico: 'Traumatismo de cráneo, rehabilitación motora',
      contactoEmergenciaNombre: 'Marta Ibarlucía (esposa)',
      contactoEmergenciaTelefono: '0351 555-0163',
      observaciones: `Paciente ficticio (${MARCA})`,
    },
    medicamentos: [
      { nombre: 'Baclofeno', dosis: 10, unidadDosis: 'mg', frecuenciaHoras: 8, via: 'ORAL', obs: 'Espasticidad' },
      { nombre: 'Clonazepam', dosis: 0.5, unidadDosis: 'mg', frecuenciaHoras: 12, via: 'ORAL', obs: 'Ansiedad e insomnio' },
    ],
  },
];

/** Estudios: uno cerca (genera recordatorio) y otro mañana a la mañana. */
const ESTUDIOS = [
  {
    paciente: 'villafane',
    cuando: 'pronto',
    tipo: 'Radiografía',
    nombre: 'Rx de tórax frente y perfil',
    obs: 'Control evolutivo de la neumonía',
  },
  {
    paciente: 'olmedo',
    cuando: 'manana',
    tipo: 'Análisis de laboratorio',
    nombre: 'Hemograma y coagulograma',
    obs: 'Control posoperatorio',
  },
];

/** Lo que registra enfermería (todo de Olmedo). */
const ADMINISTRACIONES = [
  { paciente: 'olmedo', medicamento: 'Ketorolac', obs: 'Sin novedades' },
  { paciente: 'olmedo', medicamento: 'Omeprazol', obs: 'Tolera la vía oral' },
];
const INSUMOS = {
  paciente: 'olmedo',
  items: [
    { nombre: 'Gasa estéril', cantidad: 4 },
    { nombre: 'Apósito adhesivo', cantidad: 2 },
    { nombre: 'Guantes de examen', cantidad: 2 },
  ],
  obs: 'Curación de la herida quirúrgica',
};

const VIAS = { ORAL: 'oral', INTRAVENOSA: 'intravenosa', SUBCUTANEA: 'subcutánea', INTRAMUSCULAR: 'intramuscular' };
const numero = (n) => String(n).replace('.', ',');

const conMarca = (texto) => `${texto} (${MARCA})`;
const esMio = (texto) => typeof texto === 'string' && texto.includes(MARCA);

// ───────────────────────── Utilidades ─────────────────────────

const hora = (fecha) =>
  new Intl.DateTimeFormat('es-AR', {
    timeZone: ZONA,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(fecha));
const fechaHora = (fecha) =>
  new Intl.DateTimeFormat('es-AR', {
    timeZone: ZONA,
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(fecha));
const normalizar = (t) =>
  t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
const redondear5 = (ms, modo = 'arriba') =>
  (modo === 'arriba' ? Math.ceil : Math.round)(ms / (5 * MINUTO)) * 5 * MINUTO;

/** Usuarios: variables de entorno o los usuarios de prueba de e2e/soporte.ts. */
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

class ErrorApi extends Error {
  constructor(metodo, ruta, status, cuerpo) {
    super(`${metodo} ${ruta} → ${status} ${cuerpo?.error?.codigo ?? ''} ${cuerpo?.error?.mensaje ?? ''}`);
    this.status = status;
    this.codigo = cuerpo?.error?.codigo;
    this.detalles = cuerpo?.error?.detalles;
  }
}

async function sesion(rol) {
  const { usuario, clave } = credenciales(rol);
  const r = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nombreUsuario: usuario, contrasena: clave }),
  });
  if (!r.ok) throw new ErrorApi('POST', '/api/auth/login', r.status, await r.json().catch(() => null));
  const cookie = r.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .find((c) => c.startsWith('sgsm_sesion='));
  if (!cookie) throw new Error(`El ingreso de ${rol} no devolvió la cookie de sesión`);
  const pedir = async (metodo, ruta, cuerpo) => {
    const res = await fetch(`${API}${ruta}`, {
      method: metodo,
      headers: { cookie, ...(cuerpo ? { 'content-type': 'application/json' } : {}) },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) throw new ErrorApi(metodo, ruta, res.status, json);
    return json;
  };
  return {
    usuario,
    get: (ruta) => pedir('GET', ruta),
    post: (ruta, cuerpo) => pedir('POST', ruta, cuerpo ?? {}),
    patch: (ruta, cuerpo) => pedir('PATCH', ruta, cuerpo),
  };
}

// Rostro simulado del modo de demostración: mismo algoritmo que frontend/src/biometria/simulado.ts
// y backend/src/semillas/biometria-simulada.ts (el patrón sale del nombre de usuario).
function hash(texto) {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}
function generador(semilla) {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const descriptorSimulado = (clave) => {
  const azar = generador(hash(clave));
  return Array.from({ length: 128 }, () => (azar() - 0.5) * 0.4);
};

async function confirmarConRostro(api, operacion) {
  const { data } = await api.post('/api/biometria/validar', {
    patron: descriptorSimulado(api.usuario),
    operacion,
  });
  if (!data.valido) {
    throw new Error(
      `El rostro simulado de ${api.usuario} no coincide (¿la base no tiene los rostros de demostración?)`,
    );
  }
  return data.validacionToken;
}

// ───────────────────────── Pasos ─────────────────────────

const resumen = { pacientes: [], prescripciones: [], estudios: [], suministros: [], avisos: [] };
const ahora = Date.now();

/** Horarios de las primeras tomas: múltiplos de 5 min entre ahora + 10 y ahora + 25. */
const HORARIOS = [];
for (let t = redondear5(ahora + 10 * MINUTO); t <= ahora + 25 * MINUTO; t += 5 * MINUTO) {
  HORARIOS.push(t);
}

async function internar(medico, p, camas) {
  const { data: encontrados } = await medico.get(`/api/pacientes?dni=${p.datos.dni}&porPagina=5`);
  const existente = encontrados.find((x) => x.dni === p.datos.dni);
  if (existente?.estado === 'INTERNADO') {
    resumen.pacientes.push(`${existente.apellido}, ${existente.nombre} · cama ${existente.cama?.numero} (ya estaba)`);
    return existente;
  }
  const libres = camas.filter((c) => !c.ocupada && c.habilitada !== false);
  const cama =
    libres.find((c) => c.numero === p.camaPreferida) ??
    libres.find((c) => c.sala.nombre.includes(p.sala));
  if (!cama) throw new Error(`No hay camas libres en la sala ${p.sala}`);
  cama.ocupada = true;

  let paciente;
  if (existente) {
    // Se había dado de alta (egreso): se reingresa en su misma ficha.
    ({ data: paciente } = await medico.post(`/api/pacientes/${existente.id}/reingresar`, {
      ...p.datos,
      camaId: cama.id,
    }));
  } else {
    const fechaIngreso = new Date(redondear5(ahora - p.horasInternado * HORA, 'cerca')).toISOString();
    ({ data: paciente } = await medico.post('/api/pacientes', { ...p.datos, camaId: cama.id, fechaIngreso }));
  }
  resumen.pacientes.push(
    `${paciente.apellido}, ${paciente.nombre} · cama ${paciente.cama?.numero ?? cama.numero} (${cama.sala.nombre})${existente ? ' (reingreso)' : ''}`,
  );
  return paciente;
}

async function noAdministrarVencidos(enfermero, prescripcionId) {
  const { data } = await enfermero.get('/api/recordatorios?tipo=MEDICAMENTO');
  for (const r of data.filter((x) => x.prescripcion?.id === prescripcionId && x.estado === 'VENCIDO')) {
    await enfermero.post(`/api/recordatorios/${r.id}/no-administrar`, {
      motivo: conMarca('Se renovó el horario de las tomas'),
    });
  }
}

async function indicar(medico, enfermero, paciente, plan, catalogo, indice) {
  const insumo = catalogo.find((i) => i.tipo === 'MEDICAMENTO' && normalizar(i.nombre).startsWith(normalizar(plan.nombre)));
  if (!insumo) {
    resumen.avisos.push(`No está ${plan.nombre} en el catálogo: no se indicó`);
    return null;
  }
  const { data: vigentes } = await medico.get(`/api/pacientes/${paciente.id}/prescripciones?estado=VIGENTE`);
  const mias = vigentes.filter((x) => x.medicamento.id === insumo.id && esMio(x.observaciones));
  const etiqueta = `${paciente.apellido}: ${insumo.nombre} ${numero(plan.dosis)} ${plan.unidadDosis} ${VIAS[plan.via] ?? plan.via.toLowerCase()} cada ${plan.frecuenciaHoras} h`;

  // Sigue sirviendo si la primera toma todavía no llegó (faltan 5 min o más).
  const vigente = mias.find((x) => new Date(x.fechaInicio).getTime() >= ahora + 5 * MINUTO);
  if (vigente) {
    resumen.prescripciones.push(`${etiqueta} · primera toma ${hora(vigente.fechaInicio)} (ya estaba)`);
    return vigente;
  }
  // La anterior ya pasó: se cierra y se vuelve a indicar con el horario de ahora.
  for (const vieja of mias) {
    await noAdministrarVencidos(enfermero, vieja.id);
    await medico.post(`/api/prescripciones/${vieja.id}/estado`, {
      estado: 'FINALIZADA',
      motivo: conMarca('Se renueva el horario de las tomas'),
    });
  }
  const fechaInicio = new Date(HORARIOS[indice % HORARIOS.length]).toISOString();
  try {
    const { data } = await medico.post(`/api/pacientes/${paciente.id}/prescripciones`, {
      insumoId: insumo.id,
      dosis: plan.dosis,
      unidadDosis: plan.unidadDosis,
      frecuenciaHoras: plan.frecuenciaHoras,
      via: plan.via,
      fechaInicio,
      observaciones: conMarca(plan.obs),
    });
    resumen.prescripciones.push(
      `${etiqueta} · primera toma ${hora(fechaInicio)}${mias.length ? ' (renovada)' : ''}`,
    );
    return data;
  } catch (e) {
    if (e.codigo === 'PRESCRIPCION_DUPLICADA') {
      resumen.avisos.push(`${etiqueta}: ya hay otra vigente cargada a mano; no se duplicó`);
      return null;
    }
    throw e;
  }
}

/** Mañana a las 07:00 de Argentina (UTC-3, sin horario de verano). */
function mananaTemprano() {
  const hoyAr = new Date(ahora - 3 * HORA).toISOString().slice(0, 10);
  return Date.parse(`${hoyAr}T07:00:00-03:00`) + 24 * HORA;
}

async function programar(medico, paciente, plan, tipos) {
  const tipo = tipos.find((t) => normalizar(t.nombre) === normalizar(plan.tipo));
  if (!tipo) {
    resumen.avisos.push(`No existe el tipo de estudio ${plan.tipo}: no se programó`);
    return;
  }
  const objetivo = plan.cuando === 'pronto' ? redondear5(ahora + 20 * MINUTO, 'cerca') : mananaTemprano();
  const sirve = (f) =>
    plan.cuando === 'pronto'
      ? f >= ahora + 5 * MINUTO && f <= ahora + 40 * MINUTO
      : f >= ahora + 2 * HORA;
  const { data } = await medico.get(`/api/pacientes/${paciente.id}/estudios?estado=PROGRAMADO`);
  const mio = data.find((e) => e.tipoEstudio.id === tipo.id && esMio(e.observaciones));
  const etiqueta = `${paciente.apellido}: ${plan.nombre}`;
  if (mio && sirve(new Date(mio.fechaHora).getTime())) {
    resumen.estudios.push(`${etiqueta} · ${fechaHora(mio.fechaHora)} (ya estaba)`);
    return;
  }
  const fecha = new Date(objetivo).toISOString();
  if (mio) {
    await medico.patch(`/api/estudios/${mio.id}`, { fechaHora: fecha });
    resumen.estudios.push(`${etiqueta} · ${fechaHora(fecha)} (reprogramado)`);
    return;
  }
  await medico.post(`/api/pacientes/${paciente.id}/estudios`, {
    tipoEstudioId: tipo.id,
    fechaHora: fecha,
    nombre: plan.nombre,
    observaciones: conMarca(plan.obs),
  });
  resumen.estudios.push(`${etiqueta} · ${fechaHora(fecha)}`);
}

async function registrarEnfermeria(enfermero, pacientes, catalogo) {
  const paciente = pacientes[INSUMOS.paciente];
  const { data: hechos } = await enfermero.get(`/api/suministros?pacienteId=${paciente.id}&porPagina=100`);
  const mios = hechos.filter((s) => esMio(s.observaciones));

  for (const plan of ADMINISTRACIONES) {
    const p = pacientes[plan.paciente];
    const ya = mios.find((s) => s.tipo === 'MEDICAMENTO' && s.prescripcion?.medicamento.startsWith(plan.medicamento));
    if (ya) {
      resumen.suministros.push(`Administración de ${ya.prescripcion.medicamento} a ${p.apellido} · ${hora(ya.fechaHora)} (ya estaba)`);
      continue;
    }
    const { data: vigentes } = await enfermero.get(`/api/pacientes/${p.id}/prescripciones?estado=VIGENTE`);
    const prescripcion = vigentes.find((x) => x.medicamento.nombre.startsWith(plan.medicamento) && esMio(x.observaciones));
    if (!prescripcion) {
      resumen.avisos.push(`No hay prescripción vigente de ${plan.medicamento} para ${p.apellido}: no se administró`);
      continue;
    }
    const validacionToken = await confirmarConRostro(enfermero, 'Administrar medicamento');
    const { data } = await enfermero.post('/api/suministros/medicamentos', {
      pacienteId: p.id,
      prescripcionId: prescripcion.id,
      observaciones: conMarca(plan.obs),
      validacionToken,
    });
    resumen.suministros.push(`Administración de ${prescripcion.medicamento.nombre} a ${p.apellido} · ${hora(data.fechaHora)}`);
  }

  if (mios.some((s) => s.tipo === 'INSUMOS')) {
    resumen.suministros.push(`Registro de insumos de ${paciente.apellido} (ya estaba)`);
    return;
  }
  const items = [];
  for (const it of INSUMOS.items) {
    const insumo = catalogo.find((i) => i.tipo === 'INSUMO' && normalizar(i.nombre).startsWith(normalizar(it.nombre)));
    if (insumo) items.push({ insumoId: insumo.id, cantidad: it.cantidad, nombre: insumo.nombre });
    else resumen.avisos.push(`No está el insumo ${it.nombre} en el catálogo`);
  }
  if (!items.length) return;
  const validacionToken = await confirmarConRostro(enfermero, 'Registrar insumos');
  await enfermero.post('/api/suministros/insumos', {
    pacienteId: paciente.id,
    items: items.map(({ insumoId, cantidad }) => ({ insumoId, cantidad })),
    observaciones: conMarca(INSUMOS.obs),
    validacionToken,
  });
  resumen.suministros.push(
    `Registro de insumos de ${paciente.apellido}: ${items.map((i) => `${i.nombre} × ${i.cantidad}`).join(', ')}`,
  );
}

async function listarRecordatorios(enfermero) {
  const { data, meta } = await enfermero.get('/api/recordatorios');
  console.log(`\nRecordatorios para atender: ${meta.total} (${meta.urgentes} urgentes)`);
  for (const r of data) {
    const que = r.prescripcion
      ? `${r.prescripcion.medicamento} ${numero(r.prescripcion.dosis)} ${r.prescripcion.unidadDosis}`
      : `Estudio: ${r.estudio?.nombre}`;
    console.log(
      `  ${r.estado.padEnd(9)} ${r.prioridad.padEnd(5)} ${hora(r.fechaHoraObjetivo)} · ${r.cama?.numero ?? '—'} ${r.paciente.apellido}, ${r.paciente.nombre} · ${que}`,
    );
  }
  return meta;
}

// ───────────────────────── Principal ─────────────────────────

async function principal() {
  const medico = await sesion('medico');
  const enfermero = await sesion('enfermero');

  const { data: camas } = await medico.get('/api/camas');
  const { data: catalogo } = await medico.get('/api/insumos');
  const { data: tipos } = await medico.get('/api/tipos-estudio');

  const pacientes = {};
  for (const p of PACIENTES) pacientes[p.clave] = await internar(medico, p, camas);

  let indice = 0;
  for (const p of PACIENTES) {
    for (const plan of p.medicamentos) {
      await indicar(medico, enfermero, pacientes[p.clave], plan, catalogo, indice++);
    }
  }
  for (const plan of ESTUDIOS) await programar(medico, pacientes[plan.paciente], plan, tipos);

  try {
    await registrarEnfermeria(enfermero, pacientes, catalogo);
  } catch (e) {
    resumen.avisos.push(`Enfermería: ${e.message}`);
  }

  const lista = (titulo, items) => {
    console.log(`\n${titulo}`);
    for (const i of items) console.log(`  - ${i}`);
  };
  console.log(`Datos de demostración (${fechaHora(ahora)}, hora de Argentina)`);
  lista('Pacientes', resumen.pacientes);
  lista('Prescripciones', resumen.prescripciones);
  lista('Estudios', resumen.estudios);
  lista('Enfermería', resumen.suministros);
  if (resumen.avisos.length) lista('Avisos', resumen.avisos);

  if (ESPERAR) {
    console.log('\nEsperando 70 s a que el temporizador genere los recordatorios…');
    await new Promise((r) => setTimeout(r, 70_000));
  }
  const meta = await listarRecordatorios(enfermero);
  if (ESPERAR && meta.total === 0) process.exitCode = 1;
}

principal().catch((e) => {
  console.error(`No se pudieron preparar los datos: ${e.message}`);
  process.exitCode = 1;
});
