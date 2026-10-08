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
  ultimas: { fechaHora: string; usuario: string; tomaProgramada?: string }[] = [],
) => ({
  // Empezó hace dos días, en la grilla de las 14:00 UTC: tomas a las 22:00, 06:00 y 14:00 UTC.
  fechaInicio: en(-48 * 60 - 4 * 60),
  fechaFin: null,
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

  it('al reanudar, una dosis de hace menos de media frecuencia sigue contando como dada (D123)', () => {
    // Se dio hace 1 h, se suspendió y se reanudó hace 10 min: el servidor pide confirmar otra.
    const reanudada = {
      ...prescripcion(en(0), [{ fechaHora: en(-60), usuario: 'Acosta, Sofía' }]),
      agendaDesde: en(-10),
    };
    expect(estadoToma(reanudada, AHORA)).toMatchObject({ tipo: 'dada', minutos: 60 });
  });

  it('al reanudar, una dosis vieja de la agenda anterior no cuenta como dada', () => {
    const reanudada = {
      ...prescripcion(en(0), [
        { fechaHora: en(-300), tomaProgramada: en(-300), usuario: 'Acosta, Sofía' },
      ]),
      agendaDesde: en(-10),
    };
    expect(estadoToma(reanudada, AHORA)).toMatchObject({ tipo: 'ahora' });
  });

  describe('la primera toma adelantada (RN07: hasta media frecuencia antes del inicio)', () => {
    // Inicio a las 12:00, cada 8 h; la primera dosis se dio a las 10:00 y quedó en la toma de las 12:00.
    const inicio = '2026-10-07T12:00:00.000Z';
    const adelantada = {
      fechaInicio: inicio,
      agendaDesde: inicio,
      fechaFin: null,
      frecuenciaHoras: 8,
      ultimasAdministraciones: [
        {
          id: 1,
          fechaHora: '2026-10-07T10:00:00.000Z',
          tomaProgramada: inicio,
          cantidad: 1,
          usuario: 'Acosta, Sofía',
        },
      ],
    };

    it('media hora después de darla, ya se dio (no "Faltan 1 h 30 min")', () => {
      const e = estadoToma(
        { ...adelantada, proximaToma: '2026-10-07T20:00:00.000Z' },
        new Date('2026-10-07T10:30:00.000Z'),
      );
      expect(e).toMatchObject({ tipo: 'dada', minutos: 30, usuario: 'Acosta, Sofía' });
    });

    it('pasada media frecuencia de la dosis, su toma (la de ahora) sigue dada, como en el servidor', () => {
      // 14:30: la toma más cercana es la de las 12:00, y esa dosis la cubrió.
      const e = estadoToma(
        { ...adelantada, proximaToma: '2026-10-07T20:00:00.000Z' },
        new Date('2026-10-07T14:30:00.000Z'),
      );
      expect(e).toMatchObject({ tipo: 'dada', fechaHora: '2026-10-07T10:00:00.000Z' });
    });

    it('cuando la más cercana ya es la siguiente, deja de estar dada', () => {
      const e = estadoToma(
        { ...adelantada, proximaToma: '2026-10-07T20:00:00.000Z' },
        new Date('2026-10-07T16:30:00.000Z'),
      );
      expect(e).toMatchObject({ tipo: 'falta', minutos: 210 });
    });
  });

  it('al cambiar la frecuencia, la última dosis es el ancla: sigue contando como dada (C5)', () => {
    const cambiada = {
      ...prescripcion(en(710), [{ fechaHora: en(-10), usuario: 'Acosta, Sofía' }]),
      agendaDesde: en(-10),
    };
    expect(estadoToma(cambiada, AHORA)).toMatchObject({ tipo: 'dada', minutos: 10 });
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
