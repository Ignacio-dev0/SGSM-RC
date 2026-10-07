import { descriptorDesconocido, descriptorSimulado } from './simulado';

describe('rostros simulados para el modo de demostración', () => {
  it('genera siempre el mismo patrón de 128 valores para la misma persona', () => {
    const a = descriptorSimulado('enfermero');
    expect(a).toHaveLength(128);
    expect(descriptorSimulado('enfermero')).toEqual(a);
    expect(a.every((v) => v >= -0.2 && v <= 0.2)).toBe(true);
  });

  it('coincide con el algoritmo del backend (mismos primeros valores)', () => {
    // Los mismos valores se verifican en backend/src/semillas/biometria-simulada.test.ts.
    expect(
      descriptorSimulado('enfermero')
        .slice(0, 3)
        .map((v) => v.toFixed(6)),
    ).toEqual(VALORES_ESPERADOS);
  });

  it('dos personas distintas quedan lejos (no se confunden)', () => {
    const a = descriptorSimulado('enfermero');
    const b = descriptorSimulado('medico');
    const distancia = Math.hypot(...a.map((v, i) => v - b[i]!));
    expect(distancia).toBeGreaterThan(1);
    const c = descriptorDesconocido();
    expect(Math.hypot(...a.map((v, i) => v - c[i]!))).toBeGreaterThan(1);
  });
});

const VALORES_ESPERADOS = ['0.160157', '0.167035', '-0.007119'];
