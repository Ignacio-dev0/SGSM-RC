import { formatearFechaHora, formatearHora } from './formato';

describe('formatos de fecha y hora', () => {
  it('las horas se muestran en formato de 24 horas, en hora de Argentina', () => {
    // 22:05 UTC = 19:05 en Argentina.
    expect(formatearHora('2026-10-07T22:05:00.000Z')).toBe('19:05');
    expect(formatearHora('2026-10-08T03:00:00.000Z')).toBe('00:00');
  });

  it('fecha y hora juntas: dd/mm/aaaa hh:mm', () => {
    expect(formatearFechaHora('2026-10-07T22:05:00.000Z')).toBe('07/10/2026 19:05');
  });
});
