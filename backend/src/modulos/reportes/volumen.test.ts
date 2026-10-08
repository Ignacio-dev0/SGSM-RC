import type { TipoInsumo } from '@prisma/client';
import { fechaEnArgentina } from '../../comun/fechas';
import { prisma } from '../../db';
import {
  PERIODO,
  sembrarDatosDeReportes,
  type DatosDeReportes,
} from '../../../tests/soporte/reportes';
import { prepararBaseConSeguridad } from '../../../tests/soporte/sesion';
import { limites, redondear } from './consultas';
import { estadisticasDelPeriodo } from './estadisticas.servicio';
import { reporteSuministros } from './reporte.servicio';
import { AGRUPACIONES, type Agrupacion } from './reportes.esquemas';

/**
 * Las consultas de reportes reescritas para el volumen de un año (T702 · D74, D75) dan lo mismo
 * que la definición del contrato (docs/reportes.md), calculada acá a mano fila por fila sobre los
 * datos de T608 más dos casos borde: un suministro con un medicamento y un insumo, y uno con el
 * mismo insumo en dos líneas.
 */

type Filtros = { salaId: number | null; tipo: TipoInsumo | null };

describe('reportes con volumen: mismas cuentas que la definición (T702)', () => {
  let datos: DatosDeReportes;

  beforeAll(async () => {
    await prepararBaseConSeguridad();
    datos = await sembrarDatosDeReportes();
    const { ana, beto } = datos.pacientes;
    const { paracetamol, gasa } = datos.insumos;
    const receta = await prisma.prescripcion.findFirstOrThrow({ where: { pacienteId: ana.id } });
    await prisma.suministro.create({
      data: {
        pacienteId: ana.id,
        usuarioId: datos.usuarios.sofia.id,
        tipo: 'MEDICAMENTO',
        prescripcionId: receta.id,
        fechaHora: new Date('2026-10-05T18:00:00Z'),
        detalles: {
          create: [
            { insumoId: paracetamol.id, cantidad: 250 },
            { insumoId: gasa.id, cantidad: 1 },
          ],
        },
      },
    });
    await prisma.suministro.create({
      data: {
        pacienteId: beto.id,
        usuarioId: datos.usuarios.lucas.id,
        tipo: 'INSUMOS',
        fechaHora: new Date('2026-10-06T18:00:00Z'),
        detalles: {
          create: [
            { insumoId: gasa.id, cantidad: 1 },
            { insumoId: gasa.id, cantidad: 2 },
          ],
        },
      },
    });
  });
  afterAll(() => prisma.$disconnect());

  /** Las líneas del período según el contrato: tipo de cada insumo y sala del momento (D41–D43). */
  async function lineas({ salaId, tipo }: Filtros) {
    const { inicio, fin } = limites(PERIODO);
    const suministros = await prisma.suministro.findMany({
      where: { fechaHora: { gte: inicio, lt: fin } },
      include: {
        detalles: { include: { insumo: true } },
        prescripcion: true,
        paciente: { include: { asignaciones: { include: { cama: true } } } },
      },
    });
    return suministros.flatMap((s) => {
      const enSala =
        salaId === null ||
        s.paciente.asignaciones.some(
          (a) =>
            a.cama.salaId === salaId &&
            a.fechaDesde <= s.fechaHora &&
            (a.fechaHasta === null || a.fechaHasta > s.fechaHora),
        );
      return s.detalles
        .filter((d) => enSala && (tipo === null || d.insumo.tipo === tipo))
        .map((d) => ({
          suministro: s.id,
          paciente: s.pacienteId,
          usuario: s.usuarioId,
          dia: fechaEnArgentina(s.fechaHora),
          insumo: d.insumo,
          unidad: s.prescripcion?.unidadDosis ?? d.insumo.unidadMedida,
          cantidad: d.cantidad,
        }));
    });
  }

  type Linea = Awaited<ReturnType<typeof lineas>>[number];

  /** Suministros distintos y suma de unidades por clave. */
  function agrupar(ls: Linea[], clave: (l: Linea) => string) {
    const grupos = new Map<string, { suministros: Set<number>; unidades: number }>();
    for (const l of ls) {
      const g = grupos.get(clave(l)) ?? { suministros: new Set(), unidades: 0 };
      g.suministros.add(l.suministro);
      g.unidades += l.cantidad;
      grupos.set(clave(l), g);
    }
    return [...grupos]
      .map(([c, g]) => ({
        clave: c,
        suministros: g.suministros.size,
        unidades: redondear(g.unidades),
      }))
      .sort((a, b) => a.clave.localeCompare(b.clave));
  }

  const CLAVE: Record<Agrupacion, (l: Linea) => string> = {
    paciente: (l) => String(l.paciente),
    usuario: (l) => String(l.usuario),
    insumo: (l) => `${l.insumo.id}|${l.unidad}`,
    dia: (l) => l.dia,
  };

  const combinaciones = (): Filtros[] => [
    { salaId: null, tipo: null },
    { salaId: null, tipo: 'MEDICAMENTO' },
    { salaId: null, tipo: 'INSUMO' },
    { salaId: datos.salas.a, tipo: null },
    { salaId: datos.salas.b, tipo: 'INSUMO' },
  ];

  it('el reporte por cada agrupación y su total (D75)', async () => {
    for (const filtros of combinaciones()) {
      const ls = await lineas(filtros);
      for (const agruparPor of AGRUPACIONES) {
        const r = await reporteSuministros({ ...PERIODO, ...filtros, agruparPor });
        const obtenido = r.data
          .map(({ clave, suministros, unidades }) => ({ clave, suministros, unidades }))
          .sort((a, b) => a.clave.localeCompare(b.clave));
        expect({ filtros, agruparPor, filas: obtenido }).toEqual({
          filtros,
          agruparPor,
          filas: agrupar(ls, CLAVE[agruparPor]),
        });
        expect(r.meta.totales).toEqual({
          suministros: new Set(ls.map((l) => l.suministro)).size,
          unidades: redondear(ls.reduce((s, l) => s + l.cantidad, 0)),
        });
      }
    }
  });

  it('las estadísticas: totales, consumo por tipo, evolución y más usados (D74)', async () => {
    for (const filtros of combinaciones()) {
      const ls = await lineas(filtros);
      const distintos = (f: (l: Linea) => boolean) =>
        new Set(ls.filter(f).map((l) => l.suministro)).size;
      const medicamentos = distintos((l) => l.insumo.tipo === 'MEDICAMENTO');
      const insumos = distintos((l) => l.insumo.tipo === 'INSUMO');
      const { data } = await estadisticasDelPeriodo({ ...PERIODO, ...filtros });

      expect({ filtros, totales: data.totales }).toEqual({
        filtros,
        totales: {
          suministros: distintos(() => true),
          medicamentos,
          insumos,
          pacientes: new Set(ls.map((l) => l.paciente)).size,
        },
      });
      expect(data.consumoPorTipo).toEqual([
        { tipo: 'MEDICAMENTO', suministros: medicamentos },
        { tipo: 'INSUMO', suministros: insumos },
      ]);
      for (const punto of data.evolucionDiaria) {
        const delDia = (f: (l: Linea) => boolean) =>
          distintos((l) => l.dia === punto.fecha && f(l));
        expect(punto).toEqual({
          fecha: punto.fecha,
          suministros: delDia(() => true),
          medicamentos: delDia((l) => l.insumo.tipo === 'MEDICAMENTO'),
          insumos: delDia((l) => l.insumo.tipo === 'INSUMO'),
        });
      }
      const porInsumo = agrupar(ls, (l) => String(l.insumo.id));
      expect(
        data.insumosMasUsados.map((i) => ({
          clave: String(i.insumoId),
          suministros: i.suministros,
        })),
      ).toEqual(
        expect.arrayContaining(porInsumo.map(({ clave, suministros }) => ({ clave, suministros }))),
      );
      expect(data.insumosMasUsados).toHaveLength(porInsumo.length);
    }
  });
});
