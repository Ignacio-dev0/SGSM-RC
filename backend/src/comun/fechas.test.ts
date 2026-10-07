import { horaArgentina } from './fechas';

describe('hora para los mensajes (zona del hospital)', () => {
  it('muestra la hora de Argentina en formato de 24 h', () => {
    expect(horaArgentina(new Date('2026-10-07T11:05:00Z'))).toBe('08:05');
    expect(horaArgentina(new Date('2026-10-07T20:30:00Z'))).toBe('17:30');
  });

  it('la medianoche es 00:00, no 24:00', () => {
    expect(horaArgentina(new Date('2026-10-08T03:00:00Z'))).toBe('00:00');
  });
});
