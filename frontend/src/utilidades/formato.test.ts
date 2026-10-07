import {
  formatearFechaHora,
  formatearFechaHoraCorta,
  formatearHora,
  rangoDeFechas,
  sinCortes,
} from './formato';

/** Espacio no separable: el renglón no se parte ahí. */
const NBSP = String.fromCharCode(160);

describe('formatos de fecha y hora', () => {
  it('las horas se muestran en formato de 24 horas, en hora de Argentina', () => {
    // 22:05 UTC = 19:05 en Argentina.
    expect(formatearHora('2026-10-07T22:05:00.000Z')).toBe('19:05');
    expect(formatearHora('2026-10-08T03:00:00.000Z')).toBe('00:00');
  });

  it('fecha y hora juntas: dd/mm/aaaa hh:mm', () => {
    expect(formatearFechaHora('2026-10-07T22:05:00.000Z')).toBe('07/10/2026 19:05');
  });

  it('la versión corta deja día, mes y hora: dd/mm hh:mm', () => {
    expect(formatearFechaHoraCorta('2026-10-07T11:00:00.000Z')).toBe('07/10 08:00');
    expect(formatearFechaHoraCorta(null)).toBe('—');
  });
});

describe('sinCortes: el número y su unidad no quedan en renglones distintos (F28)', () => {
  it('une el número con la unidad que le sigue', () => {
    expect(sinCortes('Comprimidos 500 mg')).toBe(`Comprimidos 500${NBSP}mg`);
    expect(sinCortes('Frasco 100 ml')).toBe(`Frasco 100${NBSP}ml`);
    expect(sinCortes('Solución 0,9 %')).toBe(`Solución 0,9${NBSP}%`);
  });

  it('une también las medidas "10 x 10 cm" y los paquetes "x 10"', () => {
    expect(sinCortes('Gasa estéril 10 x 10 cm')).toBe(`Gasa estéril 10${NBSP}x${NBSP}10${NBSP}cm`);
    expect(sinCortes('Paquete x 10')).toBe(`Paquete x${NBSP}10`);
  });

  it('deja los demás espacios como están, para que el texto largo siga cortando', () => {
    expect(sinCortes('Gasa estéril esterilizada')).toBe('Gasa estéril esterilizada');
    expect(sinCortes('')).toBe('');
  });

  it('es idempotente: aplicarlo dos veces da lo mismo', () => {
    const una = sinCortes('Gasa estéril 10 x 10 cm');
    expect(sinCortes(una)).toBe(una);
  });
});

describe('rangoDeFechas: el período de un filtro, dicho en una frase', () => {
  it('con las dos fechas dice "entre el … y el …"', () => {
    expect(rangoDeFechas('2026-10-01', '2026-10-05')).toBe('entre el 01/10/2026 y el 05/10/2026');
  });

  it('con una sola dice desde o hasta', () => {
    expect(rangoDeFechas('2026-10-01', '')).toBe('desde el 01/10/2026');
    expect(rangoDeFechas('', '2026-10-05')).toBe('hasta el 05/10/2026');
  });

  it('sin fechas no dice nada', () => {
    expect(rangoDeFechas('', '')).toBe('');
  });
});
