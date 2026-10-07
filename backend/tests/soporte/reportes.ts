// Datos armados a mano para las pruebas de reportes y estadísticas (E6 · T608). Los totales
// esperados se calculan a mano a partir de esta tabla; las pruebas además los comparan con la base.
//
// Período: 01/10 al 07/10 de 2026 (hora de Argentina = UTC−3).
//
// | #  | Paciente (sala)        | Usuario | Hora Argentina   | Qué                         |
// | -- | ---------------------- | ------- | ---------------- | --------------------------- |
// | 10 | Benítez (B)            | Sofía   | 01/10 00:00      | Pañal × 4                   |
// | 1  | Alvarez (A)            | Sofía   | 02/10 10:00      | Paracetamol × 500 mg        |
// | 2  | Alvarez (A)            | Sofía   | 02/10 12:00      | Gasa × 2 + Pañal × 1        |
// | 3  | Alvarez (A)            | Lucas   | 02/10 23:30      | Paracetamol × 500 mg        |
// | 4  | Benítez (B)            | Lucas   | 03/10 00:30      | Paracetamol × 1 comprimido  |
// | 5  | Benítez (B)            | Lucas   | 03/10 09:00      | Gasa × 3 (corregido, era 5) |
// | 6  | Castro (A)             | Sofía   | 04/10 09:00      | Pañal × 2                   |
// | 7  | Castro (B, trasladada) | Sofía   | 06/10 09:00      | Pañal × 1                   |
// | 8  | Alvarez (A)            | Sofía   | 30/09 23:59      | Gasa × 10 (fuera)           |
// | 9  | Benítez (B)            | Lucas   | 08/10 00:00      | Gasa × 10 (fuera)           |
//
// Recordatorios del período: R1 a tiempo, R2 tarde, R3 no administrado, R4 vencido sin atender,
// R5 pendiente, R8 estudio a tiempo (Castro, ya en la sala B); R6 cancelado y R7 fuera no cuentan.
import type { Prisma } from '@prisma/client';
import { prisma } from '../../src/db';
import {
  crearCama,
  crearEstudio,
  crearInsumo,
  crearPacienteBasico,
  crearPrescripcionBasica,
  crearUsuarioBasico,
} from './fabricas';

export const PERIODO = { desde: '2026-10-01', hasta: '2026-10-07' } as const;

const INGRESO = new Date('2026-09-01T12:00:00Z');
const TRASLADO = new Date('2026-10-05T12:00:00Z');

export async function sembrarDatosDeReportes() {
  const sofia = await crearUsuarioBasico({ apellido: 'Suárez', nombre: 'Sofía' });
  const lucas = await crearUsuarioBasico({ apellido: 'López', nombre: 'Lucas' });
  const medica = await crearUsuarioBasico({ apellido: 'Médica', nombre: 'Marta' });

  const a1 = await crearCama('Sala A', 'A-01');
  const a2 = await crearCama('Sala A', 'A-02');
  const b1 = await crearCama('Sala B', 'B-01');
  const b2 = await crearCama('Sala B', 'B-02');

  const internar = async (apellido: string, nombre: string, camaId: number) => {
    const p = await crearPacienteBasico(medica.id, { apellido, nombre, fechaIngreso: INGRESO });
    await prisma.asignacionCama.create({
      data: {
        pacienteId: p.id,
        camaId,
        motivo: 'INGRESO',
        fechaDesde: INGRESO,
        asignadoPorId: medica.id,
      },
    });
    return p;
  };
  const ana = await internar('Alvarez', 'Ana', a1.id);
  const beto = await internar('Benítez', 'Beto', b1.id);
  const carla = await internar('Castro', 'Carla', a2.id);
  // Carla pasa de la sala A a la B el 05/10 a las 09:00.
  await prisma.asignacionCama.updateMany({
    where: { pacienteId: carla.id },
    data: { fechaHasta: TRASLADO, liberadoPorId: medica.id },
  });
  await prisma.asignacionCama.create({
    data: {
      pacienteId: carla.id,
      camaId: b2.id,
      motivo: 'TRASLADO',
      fechaDesde: TRASLADO,
      asignadoPorId: medica.id,
    },
  });

  const paracetamol = await crearInsumo({
    nombre: 'Paracetamol',
    unidadMedida: 'mg',
    presentacion: 'Comprimidos 500 mg',
  });
  const gasa = await crearInsumo({
    nombre: 'Gasa estéril',
    tipo: 'INSUMO',
    unidadMedida: 'unidad',
    presentacion: 'Sobre x 1',
  });
  const panal = await crearInsumo({
    nombre: 'Pañal para adultos',
    tipo: 'INSUMO',
    unidadMedida: 'unidad',
    presentacion: 'Paquete x 10',
  });
  // Dos prescripciones del mismo medicamento en unidades distintas (D42).
  const recetaAna = await crearPrescripcionBasica(ana.id, medica.id, {
    insumoId: paracetamol.id,
    unidadDosis: 'mg',
    fechaInicio: INGRESO,
  });
  const recetaBeto = await crearPrescripcionBasica(beto.id, medica.id, {
    insumoId: paracetamol.id,
    dosis: 1,
    unidadDosis: 'comprimido',
    fechaInicio: INGRESO,
  });

  const suministrar = (
    pacienteId: number,
    usuarioId: number,
    fechaHora: string,
    items: [number, number][],
    extra: Partial<Prisma.SuministroUncheckedCreateInput> = {},
  ) =>
    prisma.suministro.create({
      data: {
        pacienteId,
        usuarioId,
        tipo: extra.prescripcionId ? 'MEDICAMENTO' : 'INSUMOS',
        fechaHora: new Date(fechaHora),
        validadoBiometricamente: true,
        detalles: { create: items.map(([insumoId, cantidad]) => ({ insumoId, cantidad })) },
        ...extra,
      },
    });
  const med = { prescripcionId: recetaAna.id };

  const s10 = await suministrar(beto.id, sofia.id, '2026-10-01T03:00:00Z', [[panal.id, 4]]);
  const s1 = await suministrar(
    ana.id,
    sofia.id,
    '2026-10-02T13:00:00Z',
    [[paracetamol.id, 500]],
    med,
  );
  const s2 = await suministrar(ana.id, sofia.id, '2026-10-02T15:00:00Z', [
    [gasa.id, 2],
    [panal.id, 1],
  ]);
  const s3 = await suministrar(
    ana.id,
    lucas.id,
    '2026-10-03T02:30:00Z',
    [[paracetamol.id, 500]],
    med,
  );
  const s4 = await suministrar(beto.id, lucas.id, '2026-10-03T03:30:00Z', [[paracetamol.id, 1]], {
    prescripcionId: recetaBeto.id,
  });
  // S19: corregido de 5 a 3 (la corrección reemplaza el detalle); cuenta con lo corregido.
  const s5 = await suministrar(beto.id, lucas.id, '2026-10-03T12:00:00Z', [[gasa.id, 5]]);
  await prisma.detalleSuministro.updateMany({
    where: { suministroId: s5.id },
    data: { cantidad: 3 },
  });
  await prisma.suministro.update({
    where: { id: s5.id },
    data: {
      corregidoEn: new Date('2026-10-03T13:00:00Z'),
      corregidoPorId: lucas.id,
      motivoCorreccion: 'Eran 3 gasas',
    },
  });
  const s6 = await suministrar(carla.id, sofia.id, '2026-10-04T12:00:00Z', [[panal.id, 2]]);
  const s7 = await suministrar(carla.id, sofia.id, '2026-10-06T12:00:00Z', [[panal.id, 1]]);
  await suministrar(ana.id, sofia.id, '2026-10-01T02:59:00Z', [[gasa.id, 10]]);
  await suministrar(beto.id, lucas.id, '2026-10-08T03:00:00Z', [[gasa.id, 10]]);

  const recordar = (data: Omit<Prisma.RecordatorioUncheckedCreateInput, 'prioridad'>) =>
    prisma.recordatorio.create({ data: { prioridad: 'MEDIA', ...data } });
  const toma = (pacienteId: number, prescripcionId: number, objetivo: string) => ({
    tipo: 'MEDICAMENTO' as const,
    pacienteId,
    prescripcionId,
    fechaHoraObjetivo: new Date(objetivo),
  });
  const en = (iso: string) => new Date(iso);
  // R1 a tiempo, R2 tarde (venció y después se administró).
  await recordar({
    ...toma(ana.id, recetaAna.id, '2026-10-02T13:00:00Z'),
    estado: 'ATENDIDO',
    atendidoEn: s1.fechaHora,
    atendidoPorId: sofia.id,
    suministroId: s1.id,
  });
  await recordar({
    ...toma(ana.id, recetaAna.id, '2026-10-02T21:00:00Z'),
    estado: 'ATENDIDO',
    vencidoEn: en('2026-10-02T22:00:00Z'),
    atendidoEn: s3.fechaHora,
    atendidoPorId: lucas.id,
    suministroId: s3.id,
  });
  // R3 no administrado, R4 vencido sin atender, R5 pendiente.
  await recordar({
    ...toma(beto.id, recetaBeto.id, '2026-10-03T03:00:00Z'),
    estado: 'ATENDIDO',
    atendidoEn: en('2026-10-03T03:10:00Z'),
    atendidoPorId: lucas.id,
    motivoNoAdministrado: 'Paciente en ayunas',
  });
  await recordar({
    ...toma(beto.id, recetaBeto.id, '2026-10-04T11:00:00Z'),
    estado: 'VENCIDO',
    vencidoEn: en('2026-10-04T12:00:00Z'),
  });
  await recordar({ ...toma(beto.id, recetaBeto.id, '2026-10-07T20:00:00Z') });
  // R6 cancelado y R7 fuera del período: no cuentan.
  await recordar({ ...toma(ana.id, recetaAna.id, '2026-10-05T12:00:00Z'), estado: 'CANCELADO' });
  await recordar({
    ...toma(ana.id, recetaAna.id, '2026-09-30T12:00:00Z'),
    estado: 'ATENDIDO',
    atendidoEn: en('2026-09-30T12:05:00Z'),
    atendidoPorId: sofia.id,
    motivoNoAdministrado: 'Vómitos',
  });
  // R8: estudio de Carla, ya en la sala B, confirmado a tiempo.
  const estudio = await crearEstudio(carla.id, medica.id, {
    fechaHora: en('2026-10-06T15:00:00Z'),
    estado: 'REALIZADO',
    realizadoEn: en('2026-10-06T15:20:00Z'),
    confirmadoPorId: sofia.id,
  });
  await recordar({
    tipo: 'ESTUDIO',
    pacienteId: carla.id,
    estudioId: estudio.id,
    fechaHoraObjetivo: estudio.fechaHora,
    estado: 'ATENDIDO',
    atendidoEn: en('2026-10-06T15:20:00Z'),
    atendidoPorId: sofia.id,
  });

  return {
    usuarios: { sofia, lucas },
    pacientes: { ana, beto, carla },
    salas: { a: a1.salaId, b: b1.salaId },
    insumos: { paracetamol, gasa, panal },
    suministros: { s1, s2, s3, s4, s5, s6, s7, s10 },
  };
}

export type DatosDeReportes = Awaited<ReturnType<typeof sembrarDatosDeReportes>>;
