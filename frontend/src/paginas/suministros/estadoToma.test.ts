import {
  colorEstadoToma,
  duracion,
  estadoToma,
  textoEstadoToma,
  varianteEstadoToma,
  type EstadoToma,
} from './estadoToma';

const AHORA = new Date('2026-10-07T18:00:00.000Z');
const en = (minutos: number) => new Date(AHORA.getTime() + minutos * 60_000).toISOString();

const prescripcion = (
  proximaToma: string | null,
  ultimas: { fechaHora: string; usuario: string }[] = [],
) => ({
  frecuenciaHoras: 8,
  proximaToma,
  ultimasAdministraciones: ultimas.map((u, i) => ({ id: i + 1, cantidad: 1, ...u })),
});

describe('duracion', () => {
  it.each([
    [0, '0 min'],
    [45, '45 min'],
    [60, '1 h'],
    [185, '3 h 5 min'],
  ])('%i minutos → %s', (minutos, texto) => expect(duracion(minutos)).toBe(texto));
});

describe('estado de la toma de una prescripción', () => {
  it('toca ahora si la toma es dentro de la próxima media hora', () => {
    expect(estadoToma(prescripcion(en(30)), AHORA)).toMatchObject({ tipo: 'ahora' });
    expect(estadoToma(prescripcion(en(0)), AHORA)).toMatchObject({ tipo: 'ahora' });
  });

  it('está atrasada si la toma pendiente ya pasó', () => {
    expect(estadoToma(prescripcion(en(-20)), AHORA)).toMatchObject({
      tipo: 'atrasada',
      minutos: 20,
    });
  });

  it('falta si la toma es en más de media hora', () => {
    const e = estadoToma(prescripcion(en(185)), AHORA);
    expect(e).toMatchObject({ tipo: 'falta', minutos: 185 });
    expect(textoEstadoToma(e)).toBe('Faltan 3 h 5 min');
  });

  it('ya se dio si la última administración cae en la misma toma (menos de media frecuencia)', () => {
    const e = estadoToma(
      prescripcion(en(470), [{ fechaHora: en(-10), usuario: 'Acosta, Sofía' }]),
      AHORA,
    );
    expect(e).toMatchObject({ tipo: 'dada', minutos: 10, usuario: 'Acosta, Sofía' });
    // Hora absoluta (24 h, Argentina): la misma forma que el aviso al elegir la tarjeta.
    expect(textoEstadoToma(e)).toBe('Ya se dio a las 14:50');
  });

  it('una administración de la toma anterior no cuenta como dada', () => {
    const e = estadoToma(
      prescripcion(en(5), [{ fechaHora: en(-475), usuario: 'Acosta, Sofía' }]),
      AHORA,
    );
    expect(e).toMatchObject({ tipo: 'ahora' });
  });

  it('sin próxima toma (tratamiento terminado)', () => {
    expect(textoEstadoToma(estadoToma(prescripcion(null), AHORA))).toBe('Sin más tomas');
  });
});

describe('cómo se muestra cada estado', () => {
  const estados: { tipo: string; estado: EstadoToma; color: string; variante: string }[] = [
    {
      tipo: 'dada',
      estado: { tipo: 'dada', minutos: 10, fechaHora: en(-10), usuario: 'Acosta, Sofía' },
      color: 'warning',
      variante: 'outlined',
    },
    {
      tipo: 'atrasada',
      estado: { tipo: 'atrasada', minutos: 20, toma: en(-20) },
      color: 'warning',
      variante: 'filled',
    },
    { tipo: 'ahora', estado: { tipo: 'ahora', toma: en(0) }, color: 'primary', variante: 'filled' },
    {
      tipo: 'falta',
      estado: { tipo: 'falta', minutos: 185, toma: en(185) },
      color: 'default',
      variante: 'outlined',
    },
    { tipo: 'sin-tomas', estado: { tipo: 'sin-tomas' }, color: 'default', variante: 'outlined' },
  ];

  it.each(estados)('$tipo → color $color y variante $variante', ({ estado, color, variante }) => {
    expect(colorEstadoToma(estado)).toBe(color);
    expect(varianteEstadoToma(estado)).toBe(variante);
  });

  it('ningún estado usa el verde de "todo bien": una toma ya dada pide cuidado, no tranquiliza', () => {
    for (const { estado } of estados) expect(colorEstadoToma(estado)).not.toBe('success');
  });
});
