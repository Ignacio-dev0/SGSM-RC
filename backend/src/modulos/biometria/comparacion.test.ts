import { compararPatrones, distanciaEuclidea, esPatronValido } from './comparacion';

const patron = (valor: number) => Array.from({ length: 128 }, () => valor);

describe('comparación de patrones faciales (T404 · CU10)', () => {
  it('calcula la distancia euclídea entre dos vectores', () => {
    expect(distanciaEuclidea([0, 0], [3, 4])).toBe(5);
    expect(distanciaEuclidea(patron(0.1), patron(0.1))).toBe(0);
  });

  it('coincide cuando la distancia no supera el umbral', () => {
    const guardado = patron(0);
    const parecido = patron(0.04); // distancia = 0,04 × √128 ≈ 0,45
    const distinto = patron(0.06); // ≈ 0,68

    expect(compararPatrones(guardado, parecido, 0.5)).toMatchObject({ coincide: true });
    expect(compararPatrones(guardado, distinto, 0.5)).toMatchObject({ coincide: false });
  });

  it('informa la distancia y una similitud entre 0 y 1 para la auditoría', () => {
    const r = compararPatrones(patron(0), patron(0.04), 0.5);
    expect(r.distancia).toBeCloseTo(0.4525, 3);
    expect(r.similitud).toBeGreaterThan(0);
    expect(r.similitud).toBeLessThanOrEqual(1);
    expect(compararPatrones(patron(0), patron(0), 0.5).similitud).toBe(1);
  });

  it('el umbral es configurable: con uno más estricto el mismo rostro no alcanza', () => {
    expect(compararPatrones(patron(0), patron(0.04), 0.4).coincide).toBe(false);
  });

  it('valida que el patrón tenga 128 números finitos', () => {
    expect(esPatronValido(patron(0.1))).toBe(true);
    expect(esPatronValido([0.1, 0.2])).toBe(false);
    expect(esPatronValido([...patron(0.1).slice(1), Number.NaN])).toBe(false);
  });

  it('rechaza comparar vectores de distinto largo', () => {
    expect(() => distanciaEuclidea([1], [1, 2])).toThrow();
  });
});
