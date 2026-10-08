import { formatearCama, ubicacionCama } from './etiquetas';

/** Guion no separable (U+2011): "A-01" nunca queda partido en "A-" y "01". */
const GUION_NO_SEPARABLE = String.fromCharCode(0x2011);

describe('camas sin partirse (F28)', () => {
  it('formatearCama cambia el guion por uno que no permite cortar el renglón', () => {
    expect(formatearCama('A-01')).toBe(`A${GUION_NO_SEPARABLE}01`);
    expect(formatearCama('B-12')).toBe(`B${GUION_NO_SEPARABLE}12`);
  });

  it('formatearCama no toca lo que no tiene guion ni cambia el resto del texto', () => {
    expect(formatearCama('Box 3')).toBe('Box 3');
    // La raya larga que separa la sala del nombre no es el guion de la cama.
    expect(formatearCama('Sala B – Traumatología · B-01')).toBe(
      `Sala B – Traumatología · B${GUION_NO_SEPARABLE}01`,
    );
  });

  it('ubicacionCama dice la cama primero y la escribe sin posibilidad de corte', () => {
    expect(
      ubicacionCama({ numero: 'A-01', sala: { id: 1, nombre: 'Sala A – Neurorrehabilitación' } }),
    ).toBe(`Cama A${GUION_NO_SEPARABLE}01 · Sala A – Neurorrehabilitación`);
  });
});
