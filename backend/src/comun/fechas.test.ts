import {
  diasEntre,
  fechaEnArgentina,
  fechaHoraLegible,
  fechaLegible,
  horaArgentina,
  inicioDelDia,
  sumarDias,
} from './fechas';

describe('hora para los mensajes (zona del hospital)', () => {
  it('muestra la hora de Argentina en formato de 24 h', () => {
    expect(horaArgentina(new Date('2026-10-07T11:05:00Z'))).toBe('08:05');
    expect(horaArgentina(new Date('2026-10-07T20:30:00Z'))).toBe('17:30');
  });

  it('la medianoche es 00:00, no 24:00', () => {
    expect(horaArgentina(new Date('2026-10-08T03:00:00Z'))).toBe('00:00');
  });
});

describe('días en hora de Argentina (reportes, E6 · S18)', () => {
  it('el día empieza a las 00:00 de Argentina, que son las 03:00 UTC', () => {
    expect(inicioDelDia('2026-10-07').toISOString()).toBe('2026-10-07T03:00:00.000Z');
  });

  it('suma y resta días de calendario, también al cambiar de mes y de año', () => {
    expect(sumarDias('2026-10-07', 1)).toBe('2026-10-08');
    expect(sumarDias('2026-10-01', -6)).toBe('2026-09-25');
    expect(sumarDias('2026-12-31', 1)).toBe('2027-01-01');
    expect(sumarDias('2028-02-28', 1)).toBe('2028-02-29');
  });

  it('cuenta los días de un rango con los dos extremos incluidos', () => {
    expect(diasEntre('2026-10-01', '2026-10-07')).toBe(7);
    expect(diasEntre('2026-10-07', '2026-10-07')).toBe(1);
    expect(diasEntre('2026-01-01', '2026-12-31')).toBe(365);
  });

  it('la fecha de un instante es la de Argentina: a las 00:30 UTC todavía es el día anterior', () => {
    expect(fechaEnArgentina(new Date('2026-10-08T00:30:00Z'))).toBe('2026-10-07');
    expect(fechaEnArgentina(new Date('2026-10-08T03:30:00Z'))).toBe('2026-10-08');
  });

  it('muestra fechas y fechas con hora como se leen en Argentina', () => {
    expect(fechaLegible('2026-10-07')).toBe('07/10/2026');
    expect(fechaHoraLegible(new Date('2026-10-08T02:05:00Z'))).toBe('07/10/2026 23:05');
  });
});
