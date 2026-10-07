import { compararValores, textoDeValor } from './comparacion';

describe('antes y después, campo por campo', () => {
  it('una fila por campo, en el orden guardado, marcando solo los que cambiaron', () => {
    const filas = compararValores(
      { cama: 'Sala A · A-01', estado: 'INTERNADO' },
      { cama: 'Sala A · A-02', estado: 'INTERNADO' },
    );
    expect(filas).toEqual([
      {
        clave: 'cama',
        campo: 'Cama',
        antes: 'Sala A · A-01',
        despues: 'Sala A · A-02',
        cambio: true,
      },
      { clave: 'estado', campo: 'Estado', antes: 'INTERNADO', despues: 'INTERNADO', cambio: false },
    ]);
  });

  it('un campo que aparece o desaparece también cambió', () => {
    const filas = compararValores(
      { motivo: 'Dolor' },
      { motivo: 'Dolor', observaciones: 'Sin fiebre' },
    );
    expect(filas.find((f) => f.clave === 'observaciones')).toMatchObject({
      antes: undefined,
      despues: 'Sin fiebre',
      cambio: true,
    });
  });

  it('los objetos anidados se comparan por su contenido, no por el orden de sus claves', () => {
    const [fila] = compararValores(
      { dosis: { valor: 500, unidad: 'mg' } },
      { dosis: { unidad: 'mg', valor: 500 } },
    );
    expect(fila?.cambio).toBe(false);
    const [otra] = compararValores(
      { items: [{ insumoId: 1, cantidad: 2 }] },
      { items: [{ insumoId: 1, cantidad: 3 }] },
    );
    expect(otra?.cambio).toBe(true);
  });

  it('sin valores anteriores (se creó con la acción) no marca nada como cambiado', () => {
    const filas = compararValores(null, { tipo: 'MEDICAMENTO', prioridad: 'MEDIA' });
    expect(filas.map((f) => [f.campo, f.cambio])).toEqual([
      ['Tipo', false],
      ['Prioridad', false],
    ]);
    expect(compararValores(null, null)).toEqual([]);
  });
});

describe('cada valor como se lee', () => {
  it.each([
    [null, 'Sin valor'],
    [undefined, 'Sin valor'],
    ['', 'Sin valor'],
    [true, 'Sí'],
    [false, 'No'],
    [0.5, '0,5'],
    [1000, '1000'],
    ['[oculto]', '[oculto]'],
    ['2026-10-02T02:30:00.000Z', '01/10/2026 23:30'],
    ['2026-10-02', '02/10/2026'],
    ['Sala A · A-02', 'Sala A · A-02'],
    [['a', 'b'], 'a, b'],
  ])('%j → "%s"', (valor, texto) => {
    expect(textoDeValor(valor)).toBe(texto);
  });

  it('un objeto anidado no es un texto: se arma aparte', () => {
    expect(textoDeValor({ a: 1 })).toBeNull();
    expect(textoDeValor([{ a: 1 }])).toBeNull();
  });
});
