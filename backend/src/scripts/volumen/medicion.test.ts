import { baseDeVolumen } from './base';
import {
  compararMediciones,
  cumple,
  percentil,
  reemplazarBloque,
  resumir,
  tablaMarkdown,
} from './medicion';

describe('medición de rendimiento (T702)', () => {
  it('percentil por rango más cercano: con 20 muestras el p95 es la 19.ª', () => {
    const veinte = Array.from({ length: 20 }, (_, i) => 20 - i); // 20, 19, …, 1
    expect(percentil(veinte, 50)).toBe(10);
    expect(percentil(veinte, 95)).toBe(19);
    expect(percentil(veinte, 100)).toBe(20);
    expect(percentil([7], 95)).toBe(7);
    expect(() => percentil([], 50)).toThrow();
  });

  it('resume p50, p95 y máximo, y cumple según el p95', () => {
    const tiempos = [...Array.from({ length: 19 }, () => 100), 3000];
    expect(resumir(tiempos)).toEqual({ p50: 100, p95: 100, max: 3000 });
    expect(cumple({ grupo: 'g', operacion: 'o', limiteMs: 500, tiempos })).toBe(true);
    expect(cumple({ grupo: 'g', operacion: 'o', limiteMs: 50, tiempos })).toBe(false);
  });

  it('arma la tabla con coma decimal y marca lo que excede', () => {
    const tabla = tablaMarkdown([
      { grupo: 'Cama', operacion: 'Panel', limiteMs: 500, tiempos: [4.25, 5, 6] },
      { grupo: 'Reportes', operacion: 'Año', limiteMs: 2000, tiempos: [2500, 2600] },
    ]);
    expect(tabla).toContain('| Cama | Panel | 500 | 5,0 | 6,0 | 6,0 | Cumple |');
    expect(tabla).toContain('| Reportes | Año | 2000 | 2500 | 2600 | 2600 | **Excede** |');
  });

  it('reemplaza solo el bloque de su etiqueta y lo agrega si falta', () => {
    const doc = 'Intro\n\n<!-- medicion:antes -->\nviejo\n<!-- /medicion:antes -->\n\nFin\n';
    const nuevo = reemplazarBloque(doc, 'antes', 'tabla nueva');
    expect(nuevo).toBe(
      'Intro\n\n<!-- medicion:antes -->\n\ntabla nueva\n\n<!-- /medicion:antes -->\n\nFin\n',
    );
    const agregado = reemplazarBloque(nuevo, 'despues', 'otra');
    expect(agregado).toContain('tabla nueva');
    expect(agregado).toMatch(
      /## Medición: despues\n\n<!-- medicion:despues -->\n\notra\n\n<!-- \/medicion:despues -->\n$/,
    );
  });
});

describe('comparación antes y después (T702)', () => {
  const bloque = (etiqueta: string, filas: string[]) =>
    [
      `<!-- medicion:${etiqueta} -->`,
      'Medido el …',
      '| Grupo   | Operación | Límite (ms) | p50 (ms) | p95 (ms) | Máx. (ms) | p95 ≤ límite |',
      '| ------- | --------- | ----------: | -------: | -------: | --------: | ------------ |',
      ...filas,
      `<!-- /medicion:${etiqueta} -->`,
    ].join('\n');

  it('compara el p95 de cada operación que está en las dos mediciones', () => {
    const doc = [
      bloque('antes', [
        '| Cama    | Panel     |         500 |       20 |      400 |       410 | Cumple       |',
        '| Reporte | Año       |        2000 |     1500 |     2500 |      2600 | **Excede**   |',
        '| Reporte | Sacada    |        2000 |        1 |        1 |         1 | Cumple       |',
      ]),
      bloque('despues', [
        '| Cama    | Panel     |         500 |       10 |      100 |       110 | Cumple       |',
        '| Reporte | Año       |        2000 |      900 |     1250 |      1300 | Cumple       |',
        '| Reporte | Nueva     |        2000 |      9,5 |      9,8 |        10 | Cumple       |',
      ]),
    ].join('\n\n');
    expect(compararMediciones(doc)).toBe(
      [
        '| Operación | Límite (ms) | p95 antes (ms) | p95 después (ms) | Cambio |',
        '| --------- | ----------: | -------------: | ---------------: | -----: |',
        '| Cama · Panel | 500 | 400 | 100 | −75 % |',
        '| Reporte · Año | 2000 | 2500 | 1250 | −50 % |',
      ].join('\n'),
    );
  });

  it('sin alguna de las dos mediciones no compara', () => {
    expect(compararMediciones(bloque('antes', []))).toBeNull();
  });
});

describe('resguardo de la base de volumen', () => {
  it('acepta solo bases *_volumen', () => {
    expect(baseDeVolumen('postgresql://u:c@localhost:5432/sgsm_volumen?schema=public')).toBe(
      'sgsm_volumen',
    );
    expect(() => baseDeVolumen('postgresql://u:c@localhost:5432/sgsm?schema=public')).toThrow(
      /_volumen/,
    );
    expect(() => baseDeVolumen('postgresql://u:c@localhost:5432/sgsm_test')).toThrow(/_volumen/);
    expect(() => baseDeVolumen('postgresql://u:c@localhost:5432/sgsm_volumen_x')).toThrow();
    expect(() => baseDeVolumen('no es una url')).toThrow(/URL/);
  });
});
