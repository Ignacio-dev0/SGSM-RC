import { validarContrato } from './contrato';

describe('contrato con el servidor: lo que mandan las pantallas se valida con sus esquemas', () => {
  it('acepta un cuerpo válido para el servidor', () => {
    expect(
      validarContrato('POST', '/api/pacientes/7/egresar', {
        motivo: 'Alta médica',
        fechaEgreso: '2026-10-07T12:00:00.000Z',
      }),
    ).toBeNull();
  });

  it('rechaza lo que el servidor rechazaría, diciendo qué campo falla', () => {
    const error = validarContrato('POST', '/api/pacientes/7/egresar', { motivo: 'a' });
    expect(error).toMatch(/POST \/api\/pacientes\/7\/egresar/);
    expect(error).toMatch(/motivo/);
  });

  it('valida también las rutas con parámetros y las de otros módulos', () => {
    expect(
      validarContrato('POST', '/api/suministros/medicamentos', {
        pacienteId: 7,
        prescripcionId: 40,
        cantidad: 500,
        observaciones: '',
        validacionToken: 'tok',
      }),
    ).toBeNull();
    expect(
      validarContrato('PATCH', '/api/prescripciones/40', { dosis: 0, motivo: 'x' }),
    ).not.toBeNull();
  });

  it('las rutas sin cuerpo que validar no tienen regla', () => {
    expect(validarContrato('GET', '/api/pacientes', undefined)).toBeNull();
    expect(validarContrato('POST', '/api/auth/logout', undefined)).toBeNull();
  });
});
