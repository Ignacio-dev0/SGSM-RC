import { esquemaAltaPaciente } from './pacientes.esquemas';

const base = {
  dni: '30111222',
  nombre: 'Rosa',
  apellido: 'Benítez',
  sexo: 'FEMENINO',
  camaId: 1,
};

describe('fecha de nacimiento del paciente', () => {
  afterEach(() => jest.useRealTimers());

  it('"hoy" es el día de Argentina, no el de UTC (a las 22:30 todavía no es mañana)', () => {
    // 01:30 UTC del 8/10 = 22:30 del 7/10 en Argentina.
    jest.useFakeTimers().setSystemTime(new Date('2026-10-08T01:30:00Z'));

    expect(esquemaAltaPaciente.safeParse({ ...base, fechaNacimiento: '2026-10-08' }).success).toBe(
      false,
    );
    expect(esquemaAltaPaciente.safeParse({ ...base, fechaNacimiento: '2026-10-07' }).success).toBe(
      true,
    );
  });
});
