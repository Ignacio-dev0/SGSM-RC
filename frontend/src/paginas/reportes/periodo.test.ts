import { esquemaReporteSuministros } from '../../../../backend/src/modulos/reportes/reportes.esquemas';
import {
  diasEntre,
  hoyEnArgentina,
  periodoEfectivo,
  sumarDias,
  textoDelPeriodo,
  validarPeriodo,
} from './periodo';

describe('días de calendario en hora de Argentina (S18 · D40)', () => {
  it('hoy es el día de Argentina, no el de UTC: a las 23:30 de Argentina en UTC ya es mañana', () => {
    expect(hoyEnArgentina(new Date('2026-10-08T02:30:00Z'))).toBe('2026-10-07');
    expect(hoyEnArgentina(new Date('2026-10-07T03:30:00Z'))).toBe('2026-10-07');
  });

  it('suma días y cuenta los días de un rango con los dos extremos incluidos', () => {
    expect(sumarDias('2026-10-07', -6)).toBe('2026-10-01');
    expect(sumarDias('2026-02-28', 1)).toBe('2026-03-01');
    expect(diasEntre('2026-10-01', '2026-10-07')).toBe(7);
    expect(diasEntre('2026-10-07', '2026-10-07')).toBe(1);
  });
});

describe('período efectivo: atajos y fechas elegidas', () => {
  const HOY = '2026-10-07';

  it('sin nada elegido son los últimos 7 días, hoy incluido (como el servidor)', () => {
    expect(periodoEfectivo({ periodo: '7', desde: '', hasta: '' }, HOY)).toEqual({
      desde: '2026-10-01',
      hasta: '2026-10-07',
      atajo: '7',
    });
  });

  it('"Hoy" es solo hoy y "30 días" son los últimos 30', () => {
    expect(periodoEfectivo({ periodo: 'hoy', desde: '', hasta: '' }, HOY)).toMatchObject({
      desde: HOY,
      hasta: HOY,
      atajo: 'hoy',
    });
    expect(periodoEfectivo({ periodo: '30', desde: '', hasta: '' }, HOY)).toMatchObject({
      desde: '2026-09-08',
      hasta: HOY,
    });
  });

  it('un atajo desconocido en la URL vale lo mismo que el de por defecto', () => {
    expect(periodoEfectivo({ periodo: 'cualquiera', desde: '', hasta: '' }, HOY)).toMatchObject({
      atajo: '7',
    });
  });

  it('con fechas elegidas manda lo elegido, sin atajo; con una sola, completa como el servidor', () => {
    expect(
      periodoEfectivo({ periodo: '7', desde: '2026-09-01', hasta: '2026-09-15' }, HOY),
    ).toEqual({ desde: '2026-09-01', hasta: '2026-09-15', atajo: null });
    expect(periodoEfectivo({ periodo: '7', desde: '2026-09-01', hasta: '' }, HOY)).toMatchObject({
      desde: '2026-09-01',
      hasta: HOY,
    });
    expect(periodoEfectivo({ periodo: '7', desde: '', hasta: '2026-09-15' }, HOY)).toMatchObject({
      desde: '2026-09-09',
      hasta: '2026-09-15',
    });
  });
});

describe('validación del período con los mismos mensajes que el servidor', () => {
  /** Lo que respondería el backend con esas fechas (campo → mensaje). */
  const delServidor = (desde: string, hasta: string) => {
    const r = esquemaReporteSuministros.safeParse({ desde, hasta });
    return r.success
      ? {}
      : Object.fromEntries(r.error.issues.map((i) => [String(i.path[0]), i.message]));
  };

  it.each([
    ['un período válido', '2026-10-01', '2026-10-07'],
    ['"hasta" antes que "desde"', '2026-10-07', '2026-10-01'],
    ['más de 366 días', '2025-01-01', '2026-01-02'],
    ['366 días justos', '2025-01-01', '2026-01-01'],
    ['una fecha mal escrita', '2026-13-45', '2026-10-07'],
  ])('%s', (_caso, desde, hasta) => {
    expect(validarPeriodo(desde, hasta)).toEqual(delServidor(desde, hasta));
  });
});

describe('texto del período', () => {
  it('dice las fechas en dd/mm/aaaa y cuántos días son', () => {
    expect(textoDelPeriodo('2026-10-01', '2026-10-07')).toBe(
      'Del 01/10/2026 al 07/10/2026 (7 días)',
    );
    expect(textoDelPeriodo('2026-10-07', '2026-10-07')).toBe('El 07/10/2026 (1 día)');
  });
});
