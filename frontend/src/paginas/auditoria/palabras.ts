import type { EntradaAuditoria } from '../../api/auditoria';
import { formatearCama } from '../pacientes/etiquetas';
import { VIAS } from '../prescripciones/etiquetas';

/**
 * La auditoría en palabras (T607). El backend guarda códigos (`TRASLADAR`, `AsignacionCama`,
 * `unidadDosis`); la pantalla los dice como se habla. Lo que todavía no está acá se muestra con su
 * código tal cual: cada etapa suma acciones y la pantalla no debe inventarles un nombre.
 */

/** Qué hizo quien aparece en la fila (en pasado: "López, Lucas · Trasladó"). */
const ACCIONES: Record<string, string> = {
  CREAR: 'Creó',
  MODIFICAR: 'Modificó',
  REGISTRAR: 'Registró',
  CORREGIR: 'Corrigió',
  BAJA: 'Dio de baja',
  REACTIVAR: 'Reactivó',
  INICIAR_SESION: 'Inició sesión',
  INICIAR_SESION_FALLIDO: 'Intento de ingreso fallido',
  BLOQUEAR_CUENTA: 'Bloqueó la cuenta',
  VALIDACION_FACIAL_FALLIDA: 'Validación facial fallida',
  GENERAR: 'Generó',
  VENCER: 'Marcó como vencido',
  ATENDER: 'Atendió',
  NO_ADMINISTRAR: 'Marcó como no administrado',
  CANCELAR: 'Canceló',
  EXPORTAR: 'Exportó',
  PROGRAMAR: 'Programó',
  REPROGRAMAR: 'Reprogramó',
  CONFIRMAR: 'Confirmó',
  TRASLADAR: 'Trasladó',
  // Egreso: en la interfaz es "Dar de alta" (PRODUCT.md, glosario).
  EGRESAR: 'Dio de alta',
  REINGRESAR: 'Reingresó',
  SUSPENDER: 'Suspendió',
  REANUDAR: 'Reanudó',
  FINALIZAR: 'Finalizó',
  ASIGNAR_CAMA: 'Asignó la cama',
  LIBERAR_CAMA: 'Liberó la cama',
  REGISTRAR_BIOMETRIA: 'Registró el rostro',
  ACTUALIZAR_BIOMETRIA: 'Actualizó el rostro',
  ELIMINAR_BIOMETRIA: 'Eliminó el rostro',
  MODIFICAR_PERMISOS: 'Modificó los permisos',
  CERRAR_SESION: 'Cerró sesión',
  OPERACION_CANCELADA: 'Canceló la operación',
};

const ENTIDADES: Record<string, string> = {
  Paciente: 'Paciente',
  AsignacionCama: 'Asignación de cama',
  DatoBiometrico: 'Rostro',
  Estudio: 'Estudio',
  Insumo: 'Insumo',
  Prescripcion: 'Prescripción',
  Recordatorio: 'Recordatorio',
  Reporte: 'Reporte',
  Suministro: 'Suministro',
  Usuario: 'Usuario',
};

export const accionEnPalabras = (codigo: string) => ACCIONES[codigo] ?? codigo;

/**
 * La acción según sobre qué se hizo: crear un paciente es internarlo (PRODUCT.md, glosario), no
 * "darlo de alta" ni "crearlo". El resto, como `accionEnPalabras`.
 */
export const accionSobre = (codigo: string, entidad: string) =>
  codigo === 'CREAR' && entidad === 'Paciente' ? 'Internó' : accionEnPalabras(codigo);

export const entidadEnPalabras = (codigo: string) => ENTIDADES[codigo] ?? codigo;

/** "Paciente n.º 12"; un id que no es un número va después de dos puntos ("Reporte: suministros"). */
export function entidadConId(entidad: string, id: string | null) {
  const nombre = entidadEnPalabras(entidad);
  if (!id) return nombre;
  return /^\d+$/.test(id) ? `${nombre} n.º ${id}` : `${nombre}: ${id}`;
}

/**
 * A quién o a qué se le hizo (C2 · F14): "Usuario: Pérez, Ana" si el servidor manda el nombre;
 * si no, "Usuario n.º 4". Nunca se confunde con quién lo hizo, que va en su propia columna.
 */
export const sobreQue = (e: Pick<EntradaAuditoria, 'entidad' | 'entidadId' | 'entidadEtiqueta'>) =>
  e.entidadEtiqueta
    ? `${entidadEnPalabras(e.entidad)}: ${e.entidadEtiqueta}`
    : entidadConId(e.entidad, e.entidadId);

/** "Alvarez, Ana · DNI 30111222". */
export const pacienteConDni = (p: NonNullable<EntradaAuditoria['paciente']>) =>
  p.dni ? `${p.nombre} · DNI ${p.dni}` : p.nombre;

/**
 * Cada campo que el backend guarda en los valores de antes y después (registrarAuditoria de cada
 * servicio), con su nombre en la interfaz. La prueba de palabras.test.ts recorre las claves del
 * servidor y falla si alguna no está.
 */
const CAMPOS: Record<string, string> = {
  activo: 'Activo',
  // C5: desde cuándo se cuentan las tomas (al reanudar, ese momento).
  agendaDesde: 'Tomas contadas desde',
  agruparPor: 'Agrupado por',
  apellido: 'Apellido',
  bloqueadoHasta: 'Bloqueado hasta',
  cama: 'Cama',
  contactoEmergenciaNombre: 'Contacto de emergencia',
  contactoEmergenciaTelefono: 'Teléfono de emergencia',
  desde: 'Desde',
  detalles: 'Medicamentos e insumos',
  diagnostico: 'Diagnóstico',
  dni: 'DNI',
  dosis: 'Dosis',
  email: 'Correo electrónico',
  estado: 'Estado',
  estudioId: 'Estudio',
  fechaBaja: 'Fecha de baja',
  fechaEgreso: 'Fecha de egreso',
  fechaFin: 'Fecha de fin',
  fechaHora: 'Fecha y hora',
  fechaHoraObjetivo: 'Hora programada',
  fechaIngreso: 'Fecha de ingreso',
  fechaInicio: 'Fecha de inicio',
  fechaNacimiento: 'Fecha de nacimiento',
  formato: 'Formato',
  frecuenciaHoras: 'Frecuencia',
  hasta: 'Hasta',
  matricula: 'Matrícula',
  medicamento: 'Medicamento',
  motivo: 'Motivo',
  motivoCambioEstado: 'Motivo del cambio de estado',
  motivoCancelacion: 'Motivo de la cancelación',
  motivoEgreso: 'Motivo del egreso',
  motivoNoAdministrado: 'Motivo por el que no se administró',
  nombre: 'Nombre',
  nombreUsuario: 'Nombre de usuario',
  numeroAfiliado: 'Número de afiliado',
  obraSocial: 'Obra social',
  observaciones: 'Observaciones',
  permisosAdicionales: 'Permisos adicionales',
  preparacion: 'Preparación',
  prescripcionId: 'Prescripción',
  presentacion: 'Presentación',
  prioridad: 'Prioridad',
  realizadoEn: 'Realizado el',
  rol: 'Rol',
  salaId: 'Sala',
  sexo: 'Sexo',
  suministroId: 'Suministro',
  tipo: 'Tipo',
  tipoEstudio: 'Tipo de estudio',
  unidadDosis: 'Unidad de la dosis',
  unidadMedida: 'Unidad de medida',
  validadoBiometricamente: 'Confirmado con el rostro',
  vencidoEn: 'Venció el',
  via: 'Vía',
  // Sensibles: la consulta los entrega ocultos (D49), pero el nombre se dice igual.
  contrasena: 'Contraseña',
  contrasenaHash: 'Contraseña',
  patron: 'Rostro',
  fotoReferencia: 'Foto del rostro',
};

/** ¿El campo tiene su nombre en la interfaz (y no el armado por la regla)? */
export const campoConNombre = (clave: string) => Object.hasOwn(CAMPOS, clave);

/** "unidadDosis" → "Unidad de la dosis"; uno desconocido, separado en palabras ("Otro campo"). */
export function nombreDeCampo(clave: string) {
  const conocido = CAMPOS[clave];
  if (conocido) return conocido;
  const palabras = clave
    .replace(/_/g, ' ')
    .replace(/([a-záéíóúñ0-9])([A-ZÁÉÍÓÚÑ])/g, '$1 $2')
    .trim()
    .toLowerCase();
  return palabras.charAt(0).toUpperCase() + palabras.slice(1);
}

/**
 * Los códigos de cada campo con las palabras de las pantallas: las de los chips (Vigente,
 * Suspendida, Egresado), las de la urgencia de los recordatorios (DESIGN.md: ALTA es "Urgente") y
 * las del glosario (PRODUCT.md).
 */
const VALORES: Record<string, Record<string, string>> = {
  estado: {
    INTERNADO: 'Internado',
    EGRESADO: 'Egresado',
    VIGENTE: 'Vigente',
    SUSPENDIDA: 'Suspendida',
    FINALIZADA: 'Finalizada',
    PROGRAMADO: 'Programado',
    REALIZADO: 'Realizado',
    CANCELADO: 'Cancelado',
    PENDIENTE: 'Pendiente',
    ATENDIDO: 'Atendido',
    VENCIDO: 'Vencido',
  },
  tipo: {
    MEDICAMENTO: 'Medicamento',
    INSUMO: 'Insumo',
    // El de un suministro: los insumos que se registraron juntos.
    INSUMOS: 'Insumos',
    ESTUDIO: 'Estudio',
  },
  prioridad: { ALTA: 'Urgente', MEDIA: 'Pronto', BAJA: 'Programada' },
  via: Object.fromEntries(VIAS.map((v) => [v.valor, v.etiqueta])),
  sexo: { FEMENINO: 'Femenino', MASCULINO: 'Masculino', OTRO: 'Otro' },
  rol: { ADMINISTRADOR: 'Administrador', MEDICO: 'Médico', ENFERMERO: 'Enfermero' },
  // Por qué se asignó la cama.
  motivo: { INGRESO: 'Internación', TRASLADO: 'Traslado', REINGRESO: 'Reingreso' },
  formato: { pdf: 'PDF', xlsx: 'Excel' },
  agruparPor: {
    paciente: 'Paciente',
    insumo: 'Medicamento o insumo',
    usuario: 'Personal',
    dia: 'Día',
  },
};

/** Los permisos del catálogo, con lo que dejan hacer. */
const PERMISOS: Record<string, string> = {
  'usuarios.gestionar': 'Gestionar usuarios',
  'usuarios.permisos': 'Asignar permisos',
  'biometria.gestionar': 'Registrar el rostro del personal',
  'pacientes.ver': 'Ver pacientes',
  'pacientes.gestionar': 'Internar, trasladar y dar de alta pacientes',
  'catalogo.ver': 'Ver el catálogo',
  'catalogo.gestionar': 'Mantener el catálogo',
  'prescripciones.ver': 'Ver prescripciones',
  'prescripciones.gestionar': 'Indicar y cambiar prescripciones',
  'suministros.registrar': 'Administrar y registrar insumos',
  'suministros.ver': 'Ver lo que se registró',
  'suministros.corregir': 'Corregir lo registrado',
  'recordatorios.ver': 'Ver recordatorios',
  'recordatorios.atender': 'Atender recordatorios',
  'estudios.ver': 'Ver estudios',
  'estudios.gestionar': 'Programar estudios',
  'estudios.confirmar': 'Confirmar estudios',
  'reportes.ver': 'Ver reportes',
  'reportes.exportar': 'Descargar reportes',
  'auditoria.ver': 'Ver la auditoría',
};

/** Campos que son el id de otro registro: se leen "n.º 40", como en "Prescripción n.º 40". */
const IDS = new Set(['prescripcionId', 'estudioId', 'suministroId', 'salaId']);

/** Lo que significa "sin valor" en un reporte exportado: no se filtró. */
const SIN_FILTRO: Record<string, string> = {
  salaId: 'Todas las salas',
  tipo: 'Medicamentos e insumos',
};

const NBSP = String.fromCharCode(160);

/**
 * El valor de un campo en palabras: los códigos con su nombre ("PENDIENTE" → "Pendiente"), los
 * ids con "n.º", la frecuencia como en la prescripción y los permisos con lo que dejan hacer. Un
 * código desconocido o un texto libre quedan como están (las fechas y los números los escribe
 * `textoDeValor`).
 */
export function valorEnPalabras(clave: string, valor: unknown): unknown {
  if (valor === null && SIN_FILTRO[clave]) return SIN_FILTRO[clave];
  if (IDS.has(clave) && typeof valor === 'number') return `n.º ${valor}`;
  if (clave === 'frecuenciaHoras' && typeof valor === 'number') return `cada ${valor}${NBSP}h`;
  // "Sala A – … · A-01": la cama no se parte en "A-" y "01" (F3).
  if (clave === 'cama' && typeof valor === 'string') return formatearCama(valor);
  if (clave === 'permisosAdicionales' && Array.isArray(valor)) {
    return valor.map((p) => (typeof p === 'string' ? (PERMISOS[p] ?? p) : p));
  }
  if (typeof valor === 'string') return VALORES[clave]?.[valor] ?? valor;
  return valor;
}
