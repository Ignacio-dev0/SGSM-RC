import { accionEnPalabras, entidadConId, entidadEnPalabras, nombreDeCampo } from './palabras';

describe('la auditoría en palabras', () => {
  it.each([
    ['CREAR', 'Creó'],
    ['MODIFICAR', 'Modificó'],
    ['REGISTRAR', 'Registró'],
    ['CORREGIR', 'Corrigió'],
    ['BAJA', 'Dio de baja'],
    ['REACTIVAR', 'Reactivó'],
    ['INICIAR_SESION', 'Inició sesión'],
    ['INICIAR_SESION_FALLIDO', 'Intento de ingreso fallido'],
    ['BLOQUEAR_CUENTA', 'Bloqueó la cuenta'],
    ['VALIDACION_FACIAL_FALLIDA', 'Validación facial fallida'],
    ['GENERAR', 'Generó'],
    ['VENCER', 'Marcó como vencido'],
    ['ATENDER', 'Atendió'],
    ['NO_ADMINISTRAR', 'Marcó como no administrado'],
    ['CANCELAR', 'Canceló'],
    ['EXPORTAR', 'Exportó'],
    ['PROGRAMAR', 'Programó'],
    ['REPROGRAMAR', 'Reprogramó'],
    ['CONFIRMAR', 'Confirmó'],
    ['TRASLADAR', 'Trasladó'],
    ['EGRESAR', 'Dio de alta'],
    ['REINGRESAR', 'Reingresó'],
    ['SUSPENDER', 'Suspendió'],
    ['REANUDAR', 'Reanudó'],
    ['FINALIZAR', 'Finalizó'],
    ['ASIGNAR_CAMA', 'Asignó la cama'],
    ['LIBERAR_CAMA', 'Liberó la cama'],
    ['REGISTRAR_BIOMETRIA', 'Registró el rostro'],
    ['ACTUALIZAR_BIOMETRIA', 'Actualizó el rostro'],
    ['ELIMINAR_BIOMETRIA', 'Eliminó el rostro'],
    ['MODIFICAR_PERMISOS', 'Modificó los permisos'],
    ['CERRAR_SESION', 'Cerró sesión'],
    ['OPERACION_CANCELADA', 'Canceló la operación'],
  ])('%s → "%s"', (codigo, palabras) => {
    expect(accionEnPalabras(codigo)).toBe(palabras);
  });

  it('una acción que todavía no tiene nombre se muestra con su código, sin inventar', () => {
    expect(accionEnPalabras('ARCHIVAR')).toBe('ARCHIVAR');
  });

  it('las entidades con sus nombres y el id del registro', () => {
    expect(entidadEnPalabras('Prescripcion')).toBe('Prescripción');
    expect(entidadEnPalabras('AsignacionCama')).toBe('Asignación de cama');
    expect(entidadEnPalabras('DatoBiometrico')).toBe('Rostro');
    expect(entidadEnPalabras('Otra')).toBe('Otra');
    expect(entidadConId('Paciente', '12')).toBe('Paciente n.º 12');
    expect(entidadConId('Reporte', 'suministros')).toBe('Reporte: suministros');
    expect(entidadConId('Usuario', null)).toBe('Usuario');
  });

  it('los campos guardados con sus nombres; los desconocidos, separados en palabras', () => {
    expect(nombreDeCampo('cama')).toBe('Cama');
    expect(nombreDeCampo('unidadDosis')).toBe('Unidad de la dosis');
    expect(nombreDeCampo('prescripcionId')).toBe('Prescripción');
    expect(nombreDeCampo('numeroAfiliado')).toBe('Numero afiliado');
    expect(nombreDeCampo('motivo_cambio')).toBe('Motivo cambio');
  });
});
