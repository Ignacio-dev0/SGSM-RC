import { formatearProximaToma } from './proximaToma';

/** 12:00 en Argentina del 7/10 (15:00 UTC). Las tomas se dan como "horas desde ahora". */
const AHORA = new Date('2026-10-07T15:00:00.000Z');
const en = (horas: number, desde = AHORA) =>
  new Date(desde.getTime() + horas * 3_600_000).toISOString();

describe('formatearProximaToma', () => {
  it('una toma de hoy dice "hoy" y la hora de 24 horas', () => {
    expect(formatearProximaToma(en(4), AHORA)).toBe('hoy 16:00');
    expect(formatearProximaToma(en(-3), AHORA)).toBe('hoy 09:00');
  });

  it('una toma de mañana dice "mañana": con 24 h de frecuencia, 08:00 no es hoy', () => {
    expect(formatearProximaToma(en(20), AHORA)).toBe('mañana 08:00');
  });

  it('desde pasado mañana, y las tomas viejas, llevan día y mes (dd/mm)', () => {
    expect(formatearProximaToma(en(44), AHORA)).toBe('09/10 08:00');
    expect(formatearProximaToma(en(-62), AHORA)).toBe('04/10 22:00');
  });

  it('una toma atrasada de ayer dice "ayer", para no confundirla con una de hoy', () => {
    expect(formatearProximaToma(en(-13), AHORA)).toBe('ayer 23:00');
  });

  it('el día se cuenta en hora de Argentina, no en UTC', () => {
    // 22:00 en Argentina del 7/10 = 01:00 UTC del 8/10.
    const noche = new Date('2026-10-08T01:00:00.000Z');
    expect(formatearProximaToma('2026-10-08T02:00:00.000Z', noche)).toBe('hoy 23:00');
    expect(formatearProximaToma('2026-10-08T03:00:00.000Z', noche)).toBe('mañana 00:00');
    expect(formatearProximaToma('2026-10-06T02:59:00.000Z', noche)).toBe('05/10 23:59');
  });

  it('sin toma no hay nada que mostrar', () => {
    expect(formatearProximaToma(null, AHORA)).toBe('—');
  });

  it('sin indicar "ahora", usa el momento actual', () => {
    expect(formatearProximaToma(new Date(Date.now() + 60_000).toISOString())).toMatch(
      /^(hoy|mañana) \d{2}:\d{2}$/,
    );
  });
});
