import { diaYMes, numero, porcentaje } from './formato';

const NBSP = String.fromCharCode(160);

describe('números de los reportes (E6-14)', () => {
  it('una cantidad lleva hasta 3 decimales, como la dosis: 2,25 no se redondea a 2,3', () => {
    expect(numero(2.25)).toBe('2,25');
    expect(numero(0.125)).toBe('0,125');
    expect(numero(0.5)).toBe('0,5');
    expect(numero(1006)).toBe('1006');
    expect(numero(12345)).toBe('12345');
  });

  it('un porcentaje lleva un decimal y el signo pegado al número', () => {
    expect(porcentaje(37.5)).toBe(`37,5${NBSP}%`);
    expect(porcentaje(66.666)).toBe(`66,7${NBSP}%`);
    expect(porcentaje(80)).toBe(`80${NBSP}%`);
  });

  it('el día del eje, sin el año', () => {
    expect(diaYMes('2026-10-07')).toBe('07/10');
  });
});
