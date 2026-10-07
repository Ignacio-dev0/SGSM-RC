import {
  accionEnPalabras,
  campoConNombre,
  entidadConId,
  entidadEnPalabras,
  nombreDeCampo,
  valorEnPalabras,
} from './palabras';

/**
 * Las claves que el backend escribe en valorAnterior / valorNuevo (cada registrarAuditoria de los
 * servicios de backend/src/modulos, relevadas en E6-07) y las sensibles que la consulta oculta
 * (D49). Si el backend suma una, se agrega acá y la prueba exige su nombre.
 */
const CLAVES_DEL_SERVIDOR = [
  'activo',
  'agruparPor',
  'apellido',
  'bloqueadoHasta',
  'cama',
  'contactoEmergenciaNombre',
  'contactoEmergenciaTelefono',
  'desde',
  'detalles',
  'diagnostico',
  'dni',
  'dosis',
  'email',
  'estado',
  'estudioId',
  'fechaBaja',
  'fechaEgreso',
  'fechaFin',
  'fechaHora',
  'fechaHoraObjetivo',
  'fechaIngreso',
  'fechaInicio',
  'fechaNacimiento',
  'formato',
  'frecuenciaHoras',
  'hasta',
  'matricula',
  'medicamento',
  'motivo',
  'motivoCambioEstado',
  'motivoCancelacion',
  'motivoEgreso',
  'motivoNoAdministrado',
  'nombre',
  'nombreUsuario',
  'numeroAfiliado',
  'obraSocial',
  'observaciones',
  'permisosAdicionales',
  'preparacion',
  'prescripcionId',
  'presentacion',
  'prioridad',
  'realizadoEn',
  'rol',
  'salaId',
  'sexo',
  'suministroId',
  'tipo',
  'tipoEstudio',
  'unidadDosis',
  'unidadMedida',
  'validadoBiometricamente',
  'vencidoEn',
  'via',
  // Sensibles: llegan como "[oculto]".
  'contrasena',
  'contrasenaHash',
  'patron',
  'fotoReferencia',
];

/** Los códigos que el backend guarda en los campos de valores fijos (enums de schema.prisma). */
const CODIGOS_DEL_SERVIDOR: Record<string, string[]> = {
  estado: [
    'INTERNADO',
    'EGRESADO',
    'VIGENTE',
    'SUSPENDIDA',
    'FINALIZADA',
    'PROGRAMADO',
    'REALIZADO',
    'CANCELADO',
    'PENDIENTE',
    'ATENDIDO',
    'VENCIDO',
  ],
  tipo: ['MEDICAMENTO', 'INSUMO', 'INSUMOS', 'ESTUDIO'],
  prioridad: ['ALTA', 'MEDIA', 'BAJA'],
  via: [
    'ORAL',
    'SUBLINGUAL',
    'INTRAVENOSA',
    'INTRAMUSCULAR',
    'SUBCUTANEA',
    'TOPICA',
    'INHALATORIA',
    'SONDA',
    'RECTAL',
    'OTRA',
  ],
  sexo: ['FEMENINO', 'MASCULINO', 'OTRO'],
  rol: ['ADMINISTRADOR', 'MEDICO', 'ENFERMERO'],
  motivo: ['INGRESO', 'TRASLADO', 'REINGRESO'],
  formato: ['pdf', 'xlsx'],
  agruparPor: ['paciente', 'insumo', 'usuario', 'dia'],
};

/** Los permisos del catálogo (backend/src/modulos/seguridad/catalogo-permisos.ts). */
const PERMISOS_DEL_SERVIDOR = [
  'usuarios.gestionar',
  'usuarios.permisos',
  'biometria.gestionar',
  'pacientes.ver',
  'pacientes.gestionar',
  'catalogo.ver',
  'catalogo.gestionar',
  'prescripciones.ver',
  'prescripciones.gestionar',
  'suministros.registrar',
  'suministros.ver',
  'suministros.corregir',
  'recordatorios.ver',
  'recordatorios.atender',
  'estudios.ver',
  'estudios.gestionar',
  'estudios.confirmar',
  'reportes.ver',
  'reportes.exportar',
  'auditoria.ver',
];

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
    expect(nombreDeCampo('numeroAfiliado')).toBe('Número de afiliado');
    expect(nombreDeCampo('otroCampoNuevo')).toBe('Otro campo nuevo');
    expect(nombreDeCampo('motivo_cambio')).toBe('Motivo cambio');
  });
});

// E6-07: los campos y sus valores con las palabras de las pantallas, no con los códigos.
describe('antes y después en palabras (E6-07)', () => {
  it.each(CLAVES_DEL_SERVIDOR)(
    'el campo "%s" tiene su nombre (no el armado por la regla)',
    (clave) => {
      expect(campoConNombre(clave)).toBe(true);
    },
  );

  it('los nombres llevan tildes y dicen qué son', () => {
    expect(nombreDeCampo('diagnostico')).toBe('Diagnóstico');
    expect(nombreDeCampo('preparacion')).toBe('Preparación');
    expect(nombreDeCampo('motivoCancelacion')).toBe('Motivo de la cancelación');
    expect(nombreDeCampo('validadoBiometricamente')).toBe('Confirmado con el rostro');
    expect(nombreDeCampo('tipoEstudio')).toBe('Tipo de estudio');
  });

  it.each(
    Object.entries(CODIGOS_DEL_SERVIDOR).flatMap(([campo, codigos]) =>
      codigos.map((codigo) => [campo, codigo]),
    ),
  )('%s = %s se dice en palabras', (campo, codigo) => {
    const palabras = valorEnPalabras(campo, codigo);
    expect(typeof palabras).toBe('string');
    expect(palabras).not.toBe(codigo);
  });

  it.each([
    ['estado', 'PENDIENTE', 'Pendiente'],
    ['estado', 'VENCIDO', 'Vencido'],
    ['estado', 'SUSPENDIDA', 'Suspendida'],
    ['estado', 'EGRESADO', 'Egresado'],
    ['tipo', 'MEDICAMENTO', 'Medicamento'],
    ['tipo', 'INSUMOS', 'Insumos'],
    ['prioridad', 'ALTA', 'Urgente'],
    ['prioridad', 'MEDIA', 'Pronto'],
    ['prioridad', 'BAJA', 'Programada'],
    ['via', 'SONDA', 'Por sonda'],
    ['via', 'SUBCUTANEA', 'Subcutánea'],
    ['rol', 'MEDICO', 'Médico'],
    ['motivo', 'INGRESO', 'Internación'],
    ['formato', 'xlsx', 'Excel'],
    ['agruparPor', 'insumo', 'Medicamento o insumo'],
    ['agruparPor', 'usuario', 'Personal'],
  ])('%s: %s → "%s" (las palabras de los chips y del glosario)', (campo, codigo, palabras) => {
    expect(valorEnPalabras(campo, codigo)).toBe(palabras);
  });

  it('los campos que son el id de otro registro dicen "n.º"', () => {
    expect(nombreDeCampo('prescripcionId')).toBe('Prescripción');
    expect(valorEnPalabras('prescripcionId', 40)).toBe('n.º 40');
    expect(valorEnPalabras('estudioId', 7)).toBe('n.º 7');
    expect(valorEnPalabras('suministroId', 912)).toBe('n.º 912');
    expect(valorEnPalabras('salaId', 2)).toBe('n.º 2');
  });

  it('en un reporte, sin sala ni tipo es "todas" y "todos", no "sin valor"', () => {
    expect(valorEnPalabras('salaId', null)).toBe('Todas las salas');
    expect(valorEnPalabras('tipo', null)).toBe('Medicamentos e insumos');
  });

  it('la frecuencia se lee como en la prescripción y los permisos con su nombre', () => {
    expect(valorEnPalabras('frecuenciaHoras', 8)).toBe(`cada 8${String.fromCharCode(160)}h`);
    expect(valorEnPalabras('permisosAdicionales', ['reportes.ver', 'auditoria.ver'])).toEqual([
      'Ver reportes',
      'Ver la auditoría',
    ]);
  });

  it.each(PERMISOS_DEL_SERVIDOR)('el permiso %s tiene nombre', (permiso) => {
    expect(valorEnPalabras('permisosAdicionales', [permiso])).not.toEqual([permiso]);
  });

  it('un código desconocido o un texto libre quedan como están', () => {
    expect(valorEnPalabras('estado', 'ARCHIVADO')).toBe('ARCHIVADO');
    expect(valorEnPalabras('motivoEgreso', 'Alta médica')).toBe('Alta médica');
    expect(valorEnPalabras('dosis', 500)).toBe(500);
  });
});
