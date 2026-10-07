import { prioridadDe } from './prioridad';

const toma = new Date('2026-10-07T11:00:00Z');
const faltan = (min: number) => new Date(toma.getTime() - min * 60_000);

describe('prioridad de un recordatorio según lo que falta (T503 · S10)', () => {
  it.each([
    [30, 'BAJA'],
    [16, 'BAJA'],
    [15, 'MEDIA'],
    [6, 'MEDIA'],
    [5, 'ALTA'],
    [0, 'ALTA'],
    [-8, 'ALTA'],
    [-90, 'ALTA'],
  ] as const)('con %i min hasta la toma es %s', (minutos, prioridad) => {
    expect(prioridadDe('MEDICAMENTO', toma, faltan(minutos))).toBe(prioridad);
  });

  it('un estudio siempre es MEDIA', () => {
    expect(prioridadDe('ESTUDIO', toma, faltan(30))).toBe('MEDIA');
    expect(prioridadDe('ESTUDIO', toma, faltan(-10))).toBe('MEDIA');
  });
});
