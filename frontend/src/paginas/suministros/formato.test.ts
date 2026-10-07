import { detalleDe } from './formato';

const NBSP = String.fromCharCode(160);

describe('detalleDe: lo suministrado en una línea (F28)', () => {
  it('une cada insumo con su cantidad y no deja cortar el número de su unidad', () => {
    const detalle = detalleDe({
      detalles: [
        { insumo: 'Paracetamol', cantidad: 500, unidad: 'mg' },
        { insumo: 'Gasa estéril 10 x 10 cm', cantidad: 2, unidad: 'unidad' },
      ],
    });
    expect(detalle).toBe(
      `Paracetamol × 500${NBSP}mg, Gasa estéril 10${NBSP}x${NBSP}10${NBSP}cm × 2${NBSP}unidad`,
    );
  });
});
