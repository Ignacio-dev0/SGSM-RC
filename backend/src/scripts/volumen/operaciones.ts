import { hoyEnArgentina, inicioDelDia, sumarDias } from '../../comun/fechas';
import { prisma } from '../../db';
import { ejecutarCiclo } from '../../modulos/recordatorios/ciclo.servicio';
import { CONTRASENA_VOLUMEN, USUARIOS_MEDICION } from './base';
import type { SesionHttp } from './cliente';
import { LIMITE_CAMA_MS, LIMITE_GENERAL_MS } from './medicion';

/**
 * Las operaciones comunes que se miden (T702 · RNF03) y los datos que usan, elegidos del volumen:
 * el internado con más suministros (la ficha más pesada), el apellido más repetido, etc.
 */

/** Patrón facial del enfermero de medición: el mismo vector de las pruebas (registrarRostro). */
export const ROSTRO = Array.from({ length: 128 }, () => 0.1);

export interface Sesiones {
  admin: SesionHttp;
  medico: SesionHttp;
  enfermero: SesionHttp;
}

export interface Operacion {
  grupo: string;
  operacion: string;
  limiteMs: number;
  /** Corre la vuelta `i` (0 es el calentamiento) y devuelve lo que tardó la parte medida. */
  medir: (i: number) => Promise<number>;
}

export async function cronometrar(accion: () => Promise<unknown>): Promise<number> {
  const t0 = performance.now();
  await accion();
  return performance.now() - t0;
}

const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

export async function prepararEscenario(vueltas: number) {
  const [ficha] = await prisma.$queryRaw<{ id: number }[]>`
    SELECT s.paciente_id AS id FROM suministros s JOIN pacientes p ON p.id = s.paciente_id
    WHERE p.estado = 'INTERNADO' GROUP BY 1 ORDER BY count(*) DESC, 1 LIMIT 1`;
  if (!ficha) throw new Error('El volumen no tiene internados: corra npm run volumen:sembrar');
  const paciente = await prisma.paciente.findUniqueOrThrow({
    where: { id: ficha.id },
    include: { asignaciones: { where: { fechaHasta: null }, include: { cama: true } } },
  });
  const cama = paciente.asignaciones[0]!.cama;
  const [apellido] = await prisma.$queryRaw<{ apellido: string }[]>`
    SELECT apellido FROM pacientes GROUP BY 1 ORDER BY count(*) DESC, 1 LIMIT 1`;
  const prescripcion = await prisma.prescripcion.findFirstOrThrow({
    where: { pacienteId: ficha.id, estado: 'VIGENTE' },
    orderBy: { id: 'asc' },
  });
  const ahora = new Date();
  // Una prescripción distinta por vuelta: vigente, ya empezada y sin terminar.
  const aAdministrar = await prisma.prescripcion.findMany({
    where: {
      estado: 'VIGENTE',
      paciente: { estado: 'INTERNADO' },
      fechaInicio: { lte: new Date(ahora.getTime() - 3_600_000) },
      OR: [{ fechaFin: null }, { fechaFin: { gt: new Date(ahora.getTime() + 3_600_000) } }],
    },
    select: { id: true, pacienteId: true },
    orderBy: { id: 'asc' },
    take: vueltas + 1,
  });
  if (aAdministrar.length <= vueltas) throw new Error('No hay prescripciones vigentes suficientes');
  const [responsable] = await prisma.$queryRaw<{ id: number }[]>`
    SELECT usuario_id AS id FROM suministros GROUP BY 1 ORDER BY count(*) DESC, 1 LIMIT 1`;
  const auditoria = await prisma.auditoria.count();
  const hoy = hoyEnArgentina();
  return {
    paciente,
    cama,
    texto: sinTildes(apellido!.apellido).toLowerCase().slice(0, 5),
    dni: paciente.dni.slice(0, 4),
    prescripcionId: prescripcion.id,
    aAdministrar,
    responsableId: responsable!.id,
    hoy,
    desde30: sumarDias(hoy, -29),
    desde366: sumarDias(hoy, -365),
    paginaLejana: Math.ceil(auditoria / 100),
  };
}

export type Escenario = Awaited<ReturnType<typeof prepararEscenario>>;

/** Las operaciones en el orden en que se miden (el ciclo al final: adelanta el reloj). */
export function operaciones(s: Sesiones, e: Escenario): Operacion[] {
  const get = (sesion: SesionHttp, ruta: string) => () =>
    cronometrar(() => sesion.pedir('GET', ruta));
  const op = (
    grupo: string,
    operacion: string,
    limiteMs: number,
    medir: (i: number) => Promise<number>,
  ): Operacion => ({ grupo, operacion, limiteMs, medir });
  const cama = (operacion: string, sesion: SesionHttp, ruta: string) =>
    op('Al lado de la cama', operacion, LIMITE_CAMA_MS, get(sesion, ruta));
  const general = (grupo: string, operacion: string, sesion: SesionHttp, ruta: string) =>
    op(grupo, operacion, LIMITE_GENERAL_MS, get(sesion, ruta));
  const periodo = (desde: string) => `desde=${desde}&hasta=${e.hoy}`;
  const id = e.paciente.id;
  const desdeIso = inicioDelDia(e.desde30).toISOString();
  const base = Date.now();

  const reportes = [30, 366].flatMap((dias) => {
    const desde = dias === 30 ? e.desde30 : e.desde366;
    return (['paciente', 'insumo', 'usuario', 'dia'] as const).map((agrupar) =>
      general(
        'Reportes',
        `Reporte de suministros, ${dias} días, por ${agrupar}`,
        s.medico,
        `/api/reportes/suministros?${periodo(desde)}&agruparPor=${agrupar}`,
      ),
    );
  });

  return [
    op('Sesión', 'Iniciar sesión (enfermero)', LIMITE_GENERAL_MS, () =>
      cronometrar(() => s.enfermero.iniciar(USUARIOS_MEDICION.enfermero, CONTRASENA_VOLUMEN)),
    ),
    cama('Buscar paciente por apellido (todos)', s.enfermero, `/api/pacientes?texto=${e.texto}`),
    cama('Buscar paciente por DNI', s.enfermero, `/api/pacientes?texto=${e.dni}`),
    cama('Buscar paciente por cama', s.enfermero, `/api/pacientes?texto=${e.cama.numero}`),
    cama(
      'Internados de una sala (tablet)',
      s.enfermero,
      `/api/pacientes?estado=INTERNADO&salaId=${e.cama.salaId}`,
    ),
    cama('Ficha del paciente', s.enfermero, `/api/pacientes/${id}`),
    cama(
      'Prescripciones del paciente (próxima toma)',
      s.enfermero,
      `/api/pacientes/${id}/prescripciones`,
    ),
    cama('Prescripción con agenda de 24 h', s.enfermero, `/api/prescripciones/${e.prescripcionId}`),
    cama('Panel de recordatorios', s.enfermero, '/api/recordatorios'),
    cama(
      'Panel de recordatorios de una sala',
      s.enfermero,
      `/api/recordatorios?salaId=${e.cama.salaId}`,
    ),
    op('Registrar', 'Validar el rostro', LIMITE_GENERAL_MS, () =>
      cronometrar(() => s.enfermero.pedir('POST', '/api/biometria/validar', { patron: ROSTRO })),
    ),
    op('Registrar', 'Registrar una administración', LIMITE_GENERAL_MS, async (i) => {
      const { data } = (await s.enfermero.pedir('POST', '/api/biometria/validar', {
        patron: ROSTRO,
      })) as { data: { validacionToken: string } };
      const { id: prescripcionId, pacienteId } = e.aAdministrar[i]!;
      return cronometrar(() =>
        s.enfermero.pedir('POST', '/api/suministros/medicamentos', {
          pacienteId,
          prescripcionId,
          validacionToken: data.validacionToken,
        }),
      );
    }),
    general(
      'Consultas',
      'Historial del paciente (pestaña de la ficha)',
      s.enfermero,
      `/api/pacientes/${id}/historial`,
    ),
    general('Consultas', 'Historial de suministros, sin filtros', s.enfermero, '/api/suministros'),
    general(
      'Consultas',
      'Historial de suministros de un paciente',
      s.enfermero,
      `/api/suministros?pacienteId=${id}`,
    ),
    general(
      'Consultas',
      'Historial de suministros de un responsable, 30 días',
      s.enfermero,
      `/api/suministros?usuarioId=${e.responsableId}&desde=${desdeIso}`,
    ),
    general(
      'Consultas',
      'Historial de insumos, página 50',
      s.enfermero,
      '/api/suministros?tipoInsumo=INSUMO&pagina=50',
    ),
    general(
      'Consultas',
      'Responsables (filtro del historial)',
      s.enfermero,
      '/api/suministros/responsables',
    ),
    ...reportes,
    general(
      'Reportes',
      'Estadísticas, 30 días',
      s.medico,
      `/api/reportes/estadisticas?${periodo(e.desde30)}`,
    ),
    general(
      'Reportes',
      'Estadísticas, 366 días',
      s.medico,
      `/api/reportes/estadisticas?${periodo(e.desde366)}`,
    ),
    general(
      'Exportar',
      'Reporte en PDF, 30 días',
      s.admin,
      `/api/reportes/suministros/exportar?formato=pdf&${periodo(e.desde30)}`,
    ),
    general(
      'Exportar',
      'Reporte en Excel, 30 días',
      s.admin,
      `/api/reportes/suministros/exportar?formato=xlsx&${periodo(e.desde30)}`,
    ),
    general(
      'Exportar',
      'Estadísticas en PDF, 30 días',
      s.admin,
      `/api/reportes/estadisticas/exportar?formato=pdf&${periodo(e.desde30)}`,
    ),
    general(
      'Exportar',
      'Estadísticas en Excel, 30 días',
      s.admin,
      `/api/reportes/estadisticas/exportar?formato=xlsx&${periodo(e.desde30)}`,
    ),
    general('Auditoría', 'Primera página, sin filtros', s.admin, '/api/auditoria'),
    general(
      'Auditoría',
      `Página lejana (${e.paginaLejana} de 100)`,
      s.admin,
      `/api/auditoria?pagina=${e.paginaLejana}&tamano=100`,
    ),
    general(
      'Auditoría',
      'Acción y entidad (REGISTRAR · Suministro)',
      s.admin,
      '/api/auditoria?accion=REGISTRAR&entidad=Suministro',
    ),
    general('Auditoría', 'De un paciente', s.admin, `/api/auditoria?pacienteId=${id}`),
    general(
      'Auditoría',
      'De un usuario, 30 días',
      s.admin,
      `/api/auditoria?usuarioId=${e.responsableId}&${periodo(e.desde30)}`,
    ),
    general('Auditoría', 'Opciones de los filtros', s.admin, '/api/auditoria/opciones'),
    // Un minuto simulado por vuelta, como el temporizador real (genera, vence y repriorizar).
    op('Temporizador', 'Ciclo de recordatorios (110 internados)', LIMITE_GENERAL_MS, (i) =>
      cronometrar(() => ejecutarCiclo(new Date(base + i * 60_000))),
    ),
  ];
}
