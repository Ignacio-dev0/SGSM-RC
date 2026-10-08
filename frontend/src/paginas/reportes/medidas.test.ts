import { anchoDelEje, anchoDeTexto, etiquetasQueEntran, maximoConLugar, recortar } from './medidas';

describe('medidas de los gráficos', () => {
  it('el ancho de un texto crece con sus letras y con el tamaño de la letra', () => {
    expect(anchoDeTexto('Gasa', 14)).toBeLessThan(anchoDeTexto('Gasa estéril', 14));
    expect(anchoDeTexto('Gasa', 14)).toBeLessThan(anchoDeTexto('Gasa', 18));
    expect(anchoDeTexto('', 14)).toBe(0);
  });

  // E6-03: el eje de los nombres se mide con el renglón más largo, hasta la mitad del gráfico.
  it('el eje de los nombres alcanza para el renglón más largo, sin pasar de la mitad del ancho', () => {
    const renglones = ['Pañal para adultos', 'Paquete x 10', 'Paracetamol'];
    const justo = anchoDelEje(renglones, 1000);
    expect(justo).toBeGreaterThanOrEqual(anchoDeTexto('Pañal para adultos', 14));
    expect(justo).toBeLessThan(500);
    expect(anchoDelEje(['Solución fisiológica al 0,9 % para infusión intravenosa'], 400)).toBe(200);
  });

  it('sin el ancho del contenedor (todavía no se midió), usa el del renglón más largo', () => {
    expect(anchoDelEje(['Pañal para adultos'], 0)).toBeGreaterThanOrEqual(
      anchoDeTexto('Pañal para adultos', 14),
    );
  });

  // E6-17: la biblioteca recorta lo que sale del área de las barras: el eje se estira para que el
  // número de la barra más larga entre a su derecha.
  it('el máximo del eje deja lugar para el número de la barra más larga', () => {
    const conLugar = maximoConLugar(30, ['30', '6'], 500) ?? 0;
    // La barra de 30 termina antes del borde y a su derecha entra "30".
    const finDeBarra = (30 / conLugar) * 500;
    expect(500 - finDeBarra).toBeGreaterThanOrEqual(anchoDeTexto('30'));
    expect(maximoConLugar(30, ['3 (37,5 %)'], 500)).toBeGreaterThan(conLugar);
  });

  it('sin el ancho medido, deja un quinto más; sin valores, no toca el eje', () => {
    expect(maximoConLugar(30, ['30'], 0)).toBe(36);
    expect(maximoConLugar(0, ['0'], 500)).toBeUndefined();
  });

  it('un renglón que no entra se corta con "…" según el ancho', () => {
    expect(recortar('Paracetamol', 200)).toBe('Paracetamol');
    const corto = recortar('Solución fisiológica al 0,9 % para infusión', 100);
    expect(corto.endsWith('…')).toBe(true);
    expect(anchoDeTexto(corto)).toBeLessThanOrEqual(100);
  });

  it('si el número con su porcentaje no entra (teléfono), queda solo el número', () => {
    const largas = ['31 (64,6 %)', '29 (60,4 %)'];
    const cortas = ['31', '29'];
    expect(etiquetasQueEntran(largas, cortas, 500)).toEqual(largas);
    expect(etiquetasQueEntran(largas, cortas, 126)).toEqual(cortas);
    // Sin medir todavía, las largas.
    expect(etiquetasQueEntran(largas, cortas, 0)).toEqual(largas);
  });
});
