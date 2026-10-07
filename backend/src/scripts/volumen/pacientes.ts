import type { Prisma, ViaAdministracion } from '@prisma/client';
import { type Azar, pesosZipf } from './azar';
import { VOLUMEN } from './base';
import type { Catalogo, Personal } from './catalogo';
import {
  APELLIDOS,
  DIAGNOSTICOS,
  MOTIVOS_CANCELACION_ESTUDIO,
  MOTIVOS_EGRESO,
  NOMBRES_FEMENINOS,
  NOMBRES_MASCULINOS,
  OBRAS_SOCIALES,
  TIPOS_ESTUDIO,
} from './nombres';

/**
 * Pacientes, camas, prescripciones y estudios del volumen (T702), armados en TypeScript con el
 * azar con semilla. Cada cama tiene una sucesión de estadías a lo largo del año (12 o 13, sin
 * superponerse); las 110 camas ocupadas hoy tienen la última estadía abierta (internados).
 */

type Tx = Prisma.TransactionClient;

const HORA = 3_600_000;
const DIA = 24 * HORA;

export interface Estadia {
  pacienteId: number;
  camaId: number;
  ingreso: Date;
  /** null: sigue internado. */
  egreso: Date | null;
  motivoEgreso: string | null;
}

/** Fin de lo que lleva la estadía: el egreso o ahora. */
const finDe = (e: Estadia, ahora: Date) => e.egreso ?? ahora;

const alMinuto = (ms: number) => new Date(Math.floor(ms / 60_000) * 60_000);
/** Las tomas empiezan a una hora en punto, como se indican en la práctica. */
const horaEnPunto = (ms: number) => new Date(Math.ceil(ms / HORA) * HORA);

export function planificarEstadias(azar: Azar, inicio: Date, ahora: Date): Estadia[] {
  const camas = VOLUMEN.salas * VOLUMEN.camasPorSala;
  const orden = azar.mezclar(Array.from({ length: camas }, (_, i) => i + 1));
  const libres = new Set(orden.slice(0, camas - VOLUMEN.internados));
  // Las 1500 estadías: la mitad de las camas tiene una más que la otra mitad.
  const base = Math.floor(VOLUMEN.pacientes / camas);
  const conUnaMas = new Set(orden.slice(0, VOLUMEN.pacientes - base * camas));
  const anio = ahora.getTime() - inicio.getTime();

  const estadias: Omit<Estadia, 'pacienteId'>[] = [];
  for (let camaId = 1; camaId <= camas; camaId++) {
    const n = base + (conUnaMas.has(camaId) ? 1 : 0);
    const huecos = Array.from(
      { length: n },
      (_, k) => (k === 0 ? azar.entre(0, 2) : azar.entre(0.2, 2.5)) * DIA,
    );
    const huecoFinal = libres.has(camaId) ? azar.entre(1, 6) * DIA : 0;
    const pesos = Array.from({ length: n }, () => azar.entre(0.4, 1.6));
    const disponible = anio - huecos.reduce((s, h) => s + h, 0) - huecoFinal;
    const suma = pesos.reduce((s, p) => s + p, 0);
    let cursor = inicio.getTime();
    for (let k = 0; k < n; k++) {
      const ingreso = cursor + huecos[k]!;
      const egreso = ingreso + (disponible * pesos[k]!) / suma;
      const abierta = k === n - 1 && !libres.has(camaId);
      estadias.push({
        camaId,
        ingreso: alMinuto(ingreso),
        egreso: abierta ? null : alMinuto(Math.min(egreso, ahora.getTime() - HORA)),
        motivoEgreso: abierta ? null : azar.elegir(MOTIVOS_EGRESO),
      });
      cursor = egreso;
    }
  }
  // El id del paciente crece con la fecha de ingreso, como en la base real.
  return estadias
    .sort((a, b) => a.ingreso.getTime() - b.ingreso.getTime() || a.camaId - b.camaId)
    .map((e, i) => ({ ...e, pacienteId: i + 1 }));
}

/** Pacientes y su asignación de cama (una por estadía). */
export async function crearPacientes(tx: Tx, azar: Azar, estadias: Estadia[], personal: Personal) {
  const pesosApellido = pesosZipf(APELLIDOS.length, 0.8);
  const apellidos = APELLIDOS.map((a, i) => [a, pesosApellido[i]!] as const);
  const dnis = new Set<string>();
  const creadores = [...personal.administradores, ...personal.medicos];
  const pacientes: Prisma.PacienteCreateManyInput[] = [];
  const asignaciones: Prisma.AsignacionCamaCreateManyInput[] = [];

  for (const e of estadias) {
    let dni: string;
    do dni = String(azar.entero(8_000_000, 45_000_000));
    while (dnis.has(dni));
    dnis.add(dni);
    const sexo = azar.ponderado([
      ['FEMENINO', 0.5],
      ['MASCULINO', 0.495],
      ['OTRO', 0.005],
    ] as const);
    const obraSocial = azar.elegir(OBRAS_SOCIALES);
    const nacimiento = new Date(e.ingreso.getTime() - azar.entre(20, 92) * 365.25 * DIA);
    const creadoPorId = azar.elegir(creadores);
    pacientes.push({
      id: e.pacienteId,
      dni,
      nombre: azar.elegir(sexo === 'FEMENINO' ? NOMBRES_FEMENINOS : NOMBRES_MASCULINOS),
      apellido: azar.ponderado(apellidos),
      fechaNacimiento: new Date(`${nacimiento.toISOString().slice(0, 10)}T00:00:00.000Z`),
      sexo,
      obraSocial: obraSocial === 'Sin obra social' ? null : obraSocial,
      numeroAfiliado: obraSocial === 'Sin obra social' ? null : String(azar.entero(1e9, 9e9)),
      diagnostico: azar.elegir(DIAGNOSTICOS),
      contactoEmergenciaNombre: `${azar.elegir(NOMBRES_FEMENINOS)} ${azar.elegir(APELLIDOS)}`,
      contactoEmergenciaTelefono: `11-${azar.entero(4000, 6999)}-${azar.entero(1000, 9999)}`,
      estado: e.egreso ? 'EGRESADO' : 'INTERNADO',
      fechaIngreso: e.ingreso,
      fechaEgreso: e.egreso,
      motivoEgreso: e.motivoEgreso,
      creadoPorId,
      creadoEn: e.ingreso,
      actualizadoEn: e.egreso ?? e.ingreso,
    });
    asignaciones.push({
      id: e.pacienteId,
      pacienteId: e.pacienteId,
      camaId: e.camaId,
      motivo: 'INGRESO',
      fechaDesde: e.ingreso,
      fechaHasta: e.egreso,
      asignadoPorId: creadoPorId,
      liberadoPorId: e.egreso ? creadoPorId : null,
    });
  }
  await tx.paciente.createMany({ data: pacientes });
  await tx.asignacionCama.createMany({ data: asignaciones });
}

/** Cuántas prescripciones tiene cada estadía: proporcional a su duración, 12.000 en total. */
function repartir(estadias: Estadia[], ahora: Date): number[] {
  const pesos = estadias.map(
    (e) => 3 + (finDe(e, ahora).getTime() - e.ingreso.getTime()) / (3 * DIA),
  );
  const suma = pesos.reduce((s, p) => s + p, 0);
  const exactas = pesos.map((p) => (VOLUMEN.prescripciones * p) / suma);
  const cantidades = exactas.map(Math.floor);
  const faltan = VOLUMEN.prescripciones - cantidades.reduce((s, c) => s + c, 0);
  exactas
    .map((x, i) => [x - Math.floor(x), i] as const)
    .sort((a, b) => b[0] - a[0] || a[1] - b[1])
    .slice(0, faltan)
    .forEach(([, i]) => cantidades[i]!++);
  return cantidades;
}

function viaPara(azar: Azar, presentacion: string): ViaAdministracion {
  if (presentacion.startsWith('Ampolla')) {
    return azar.ponderado([
      ['INTRAVENOSA', 0.5],
      ['INTRAMUSCULAR', 0.25],
      ['SUBCUTANEA', 0.25],
    ] as const);
  }
  return azar.num() < 0.9 ? 'ORAL' : 'SONDA';
}

/**
 * Prescripciones: empiezan a una hora en punto dentro de la estadía y duran de 3 a 14 días o hasta
 * el alta. Las que terminaron están FINALIZADAS; las abiertas al egreso, SUSPENDIDAS por el egreso
 * (T210); las de internados que siguen, VIGENTES.
 */
export async function crearPrescripciones(
  tx: Tx,
  azar: Azar,
  estadias: Estadia[],
  personal: Personal,
  catalogo: Catalogo,
  ahora: Date,
) {
  const cantidades = repartir(estadias, ahora);
  const medicamentos = catalogo.medicamentos.map(
    (m, i) => [m, catalogo.pesosMedicamentos[i]!] as const,
  );
  const filas: Prisma.PrescripcionCreateManyInput[] = [];
  estadias.forEach((e, i) => {
    const fin = finDe(e, ahora).getTime();
    for (let k = 0; k < cantidades[i]!; k++) {
      const inicio = horaEnPunto(
        e.ingreso.getTime() + azar.entre(0, 0.85) * (fin - e.ingreso.getTime()),
      );
      const duracion = azar.ponderado([
        [azar.entre(3, 7) * DIA, 0.35],
        [azar.entre(7, 14) * DIA, 0.35],
        [Infinity, 0.3],
      ] as const);
      const planificado = Number.isFinite(duracion)
        ? horaEnPunto(inicio.getTime() + duracion)
        : null;
      const terminada = planificado !== null && planificado.getTime() < fin;
      const estado = terminada ? 'FINALIZADA' : e.egreso ? 'SUSPENDIDA' : 'VIGENTE';
      const m = azar.ponderado(medicamentos);
      const creadoEn = new Date(
        Math.max(e.ingreso.getTime(), inicio.getTime() - azar.entre(0, 2) * HORA),
      );
      filas.push({
        pacienteId: e.pacienteId,
        insumoId: m.id,
        dosis: m.dosis * azar.elegir([0.5, 1, 1, 1, 2]),
        unidadDosis: m.unidad,
        frecuenciaHoras: azar.ponderado([
          [6, 0.2],
          [8, 0.35],
          [12, 0.25],
          [24, 0.2],
        ] as const),
        via: viaPara(azar, m.presentacion),
        fechaInicio: inicio,
        fechaFin: planificado,
        observaciones: azar.num() < 0.05 ? 'Administrar con alimentos' : null,
        estado,
        motivoCambioEstado:
          estado === 'FINALIZADA'
            ? 'Tratamiento completo'
            : estado === 'SUSPENDIDA'
              ? `Egreso del paciente: ${e.motivoEgreso}`
              : null,
        prescriptorId: azar.elegir(personal.medicos),
        creadoEn,
        actualizadoEn: terminada ? planificado : (e.egreso ?? creadoEn),
      });
    }
  });
  // Ids en el orden en que se cargaron.
  filas.sort((a, b) => (a.creadoEn as Date).getTime() - (b.creadoEn as Date).getTime());
  await tx.prescripcion.createMany({ data: filas.map((f, i) => ({ ...f, id: i + 1 })) });
}

/** Estudios: en un instante al azar de alguna estadía (más estudios en las estadías largas). */
export async function crearEstudios(
  tx: Tx,
  azar: Azar,
  estadias: Estadia[],
  personal: Personal,
  ahora: Date,
) {
  const acumulado: number[] = [];
  let total = 0;
  for (const e of estadias) {
    total += finDe(e, ahora).getTime() - e.ingreso.getTime();
    acumulado.push(total);
  }
  const ventana = 30 * 60_000;
  const filas: Prisma.EstudioCreateManyInput[] = [];
  for (let i = 0; i < VOLUMEN.estudios; i++) {
    const r = azar.num() * total;
    let j = acumulado.findIndex((a) => a > r);
    if (j < 0) j = estadias.length - 1;
    const e = estadias[j]!;
    const desde = acumulado[j - 1] ?? 0;
    let fecha = new Date(
      Math.floor((e.ingreso.getTime() + r - desde) / (15 * 60_000)) * 15 * 60_000,
    );
    // Un internado tiene además estudios programados para los próximos días.
    if (!e.egreso && azar.num() < 0.12) {
      fecha = new Date(
        Math.ceil((ahora.getTime() + azar.entre(1, 168) * HORA) / (15 * 60_000)) * 15 * 60_000,
      );
    }
    const [tipoNombre, preparacion, nombres] = azar.elegir(TIPOS_ESTUDIO);
    const tipoEstudioId = TIPOS_ESTUDIO.findIndex(([n]) => n === tipoNombre) + 1;
    const pasado = fecha.getTime() <= ahora.getTime() - ventana;
    const realizado = pasado && azar.num() < 0.88;
    const realizadoEn = realizado
      ? new Date(Math.min(fecha.getTime() + azar.entre(0, 90) * 60_000, ahora.getTime()))
      : null;
    const creadoEn = new Date(
      Math.min(
        Math.max(e.ingreso.getTime(), fecha.getTime() - azar.entre(1, 72) * HORA),
        ahora.getTime(),
      ),
    );
    filas.push({
      pacienteId: e.pacienteId,
      tipoEstudioId,
      nombre: azar.elegir(nombres),
      fechaHora: fecha,
      preparacion,
      estado: !pasado ? 'PROGRAMADO' : realizado ? 'REALIZADO' : 'CANCELADO',
      motivoCancelacion: pasado && !realizado ? azar.elegir(MOTIVOS_CANCELACION_ESTUDIO) : null,
      realizadoEn,
      confirmadoPorId: realizado ? azar.elegir(personal.enfermeros) : null,
      creadoPorId: azar.elegir(personal.medicos),
      creadoEn,
      actualizadoEn: realizadoEn ?? (pasado ? fecha : creadoEn),
    });
  }
  filas.sort((a, b) => (a.creadoEn as Date).getTime() - (b.creadoEn as Date).getTime());
  await tx.estudio.createMany({ data: filas.map((f, i) => ({ ...f, id: i + 1 })) });
}
