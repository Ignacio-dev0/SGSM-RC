import { proximasTomas } from './agenda';

describe('vista previa de horarios', () => {
  it('lista las primeras tomas desde el inicio cada N horas', () => {
    const tomas = proximasTomas('2026-10-07T08:00:00.000Z', 8, null, 4);
    expect(tomas.map((t) => t.toISOString())).toEqual([
      '2026-10-07T08:00:00.000Z',
      '2026-10-07T16:00:00.000Z',
      '2026-10-08T00:00:00.000Z',
      '2026-10-08T08:00:00.000Z',
    ]);
  });

  it('se corta en la fecha de fin', () => {
    expect(
      proximasTomas('2026-10-07T08:00:00.000Z', 8, '2026-10-07T20:00:00.000Z', 4),
    ).toHaveLength(2);
  });

  it('sin datos válidos no devuelve horarios', () => {
    expect(proximasTomas('', 8, null, 4)).toEqual([]);
    expect(proximasTomas('2026-10-07T08:00:00.000Z', 0, null, 4)).toEqual([]);
  });
});

describe('formato de dosis', () => {
  it('usa coma decimal y no agrupa miles, para no confundir 1000 con 1,000', async () => {
    const { formatearDosis } = await import('../paginas/prescripciones/etiquetas');
    expect(formatearDosis(1000, 'mg')).toBe('1000 mg');
    expect(formatearDosis(0.5, 'comprimido')).toBe('0,5 comprimido');
  });
});
