import { reloj } from '../../comun/reloj';
import {
  esquemaEstadisticas,
  esquemaExportarEstadisticas,
  esquemaExportarSuministros,
  esquemaReporteSuministros,
} from './reportes.esquemas';

// 7 de octubre a las 23:30 de Argentina: en UTC ya es el 8 (el "hoy" es el de Argentina).
const AHORA = new Date('2026-10-08T02:30:00Z');

describe('parámetros de los reportes (E6 · contrato con el frontend)', () => {
  beforeEach(() => jest.spyOn(reloj, 'ahora').mockReturnValue(AHORA));
  afterEach(() => jest.restoreAllMocks());

  describe('período, sala y tipo (comunes)', () => {
    it('sin parámetros son los últimos 7 días hasta hoy en Argentina, de todo el hospital', () => {
      expect(esquemaEstadisticas.parse({})).toEqual({
        desde: '2026-10-01',
        hasta: '2026-10-07',
        salaId: null,
        tipo: null,
      });
    });

    it('con solo "hasta", son los 7 días que terminan ese día', () => {
      expect(esquemaEstadisticas.parse({ hasta: '2026-09-30' })).toMatchObject({
        desde: '2026-09-24',
        hasta: '2026-09-30',
      });
    });

    it('con solo "desde", llega hasta hoy', () => {
      expect(esquemaEstadisticas.parse({ desde: '2026-09-01' })).toMatchObject({
        desde: '2026-09-01',
        hasta: '2026-10-07',
      });
    });

    it('convierte la sala de la query a número y acepta los dos tipos', () => {
      expect(
        esquemaEstadisticas.parse({
          desde: '2026-10-07',
          hasta: '2026-10-07',
          salaId: '3',
          tipo: 'INSUMO',
        }),
      ).toEqual({ desde: '2026-10-07', hasta: '2026-10-07', salaId: 3, tipo: 'INSUMO' });
      expect(esquemaEstadisticas.parse({ tipo: 'MEDICAMENTO' }).tipo).toBe('MEDICAMENTO');
    });

    it('admite como mucho 366 días, con los dos extremos incluidos', () => {
      expect(
        esquemaEstadisticas.safeParse({ desde: '2025-10-07', hasta: '2026-10-07' }).success,
      ).toBe(true);
      const r = esquemaEstadisticas.safeParse({ desde: '2025-10-06', hasta: '2026-10-07' });
      expect(r.error?.issues).toEqual([
        expect.objectContaining({
          path: ['desde'],
          message: 'El período puede tener hasta 366 días',
        }),
      ]);
    });

    it('"hasta" no puede ser anterior a "desde"', () => {
      const r = esquemaEstadisticas.safeParse({ desde: '2026-10-05', hasta: '2026-10-04' });
      expect(r.error?.issues).toEqual([
        expect.objectContaining({
          path: ['hasta'],
          message: 'La fecha "hasta" no puede ser anterior a "desde"',
        }),
      ]);
    });

    it.each([
      ['una fecha con hora', { desde: '2026-10-01T10:00:00Z' }, 'desde'],
      ['una fecha que no existe', { hasta: '2026-02-30' }, 'hasta'],
      ['una fecha en otro formato', { desde: '01/10/2026' }, 'desde'],
      ['una sala que no es un número', { salaId: 'A' }, 'salaId'],
      ['una sala que no es positiva', { salaId: '0' }, 'salaId'],
      ['un tipo que no existe', { tipo: 'ESTUDIO' }, 'tipo'],
    ])('rechaza %s, con un mensaje para la persona', (_caso, query, campo) => {
      const r = esquemaEstadisticas.safeParse(query);
      expect(r.success).toBe(false);
      expect(r.error?.issues[0]?.path).toEqual([campo]);
      expect(r.error?.issues[0]?.message).toMatch(/fecha|sala|tipo/i);
    });
  });

  describe('reporte de suministros: agrupación', () => {
    it('agrupa por paciente si no se indica', () => {
      expect(esquemaReporteSuministros.parse({}).agruparPor).toBe('paciente');
    });

    it.each(['paciente', 'insumo', 'usuario', 'dia'])('acepta agrupar por %s', (agruparPor) => {
      expect(esquemaReporteSuministros.parse({ agruparPor })).toMatchObject({
        agruparPor,
        desde: '2026-10-01',
        hasta: '2026-10-07',
      });
    });

    it('rechaza otra agrupación', () => {
      const r = esquemaReporteSuministros.safeParse({ agruparPor: 'sala' });
      expect(r.error?.issues[0]).toMatchObject({
        path: ['agruparPor'],
        message: 'Agrupe por paciente, insumo, usuario o día',
      });
    });
  });

  describe('exportación: formato', () => {
    it('exige el formato pdf o xlsx, con los mismos parámetros del reporte', () => {
      expect(esquemaExportarSuministros.parse({ formato: 'xlsx', agruparPor: 'dia' })).toEqual({
        desde: '2026-10-01',
        hasta: '2026-10-07',
        salaId: null,
        tipo: null,
        agruparPor: 'dia',
        formato: 'xlsx',
      });
      expect(esquemaExportarEstadisticas.parse({ formato: 'pdf' })).toMatchObject({
        formato: 'pdf',
        desde: '2026-10-01',
      });
    });

    it.each([{}, { formato: 'csv' }])('rechaza un formato que no es pdf ni xlsx (%o)', (query) => {
      const r = esquemaExportarEstadisticas.safeParse(query);
      expect(r.error?.issues[0]).toMatchObject({
        path: ['formato'],
        message: 'Elija el formato: pdf o xlsx',
      });
    });
  });
});
