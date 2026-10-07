import type { EntradaAuditoria } from '../../api/auditoria';

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

export const entidadEnPalabras = (codigo: string) => ENTIDADES[codigo] ?? codigo;

/** "Paciente n.º 12"; un id que no es un número va después de dos puntos ("Reporte: suministros"). */
export function entidadConId(entidad: string, id: string | null) {
  const nombre = entidadEnPalabras(entidad);
  if (!id) return nombre;
  return /^\d+$/.test(id) ? `${nombre} n.º ${id}` : `${nombre}: ${id}`;
}

/** "Alvarez, Ana · DNI 30111222". */
export const pacienteConDni = (p: NonNullable<EntradaAuditoria['paciente']>) =>
  p.dni ? `${p.nombre} · DNI ${p.dni}` : p.nombre;

/** Los campos que más aparecen en los valores guardados, con su nombre en la interfaz. */
const CAMPOS: Record<string, string> = {
  activo: 'Activo',
  agruparPor: 'Agrupar por',
  apellido: 'Apellido',
  cama: 'Cama',
  camaId: 'Cama',
  cantidad: 'Cantidad',
  contactoEmergenciaNombre: 'Contacto de emergencia',
  contactoEmergenciaTelefono: 'Teléfono de emergencia',
  contrasena: 'Contraseña',
  desde: 'Desde',
  detalles: 'Detalle',
  diagnostico: 'Diagnóstico',
  dni: 'DNI',
  dosis: 'Dosis',
  email: 'Correo electrónico',
  estado: 'Estado',
  fechaEgreso: 'Fecha de egreso',
  fechaFin: 'Fecha de fin',
  fechaHora: 'Fecha y hora',
  fechaInicio: 'Fecha de inicio',
  fechaNacimiento: 'Fecha de nacimiento',
  formato: 'Formato',
  frecuenciaHoras: 'Frecuencia (horas)',
  hasta: 'Hasta',
  horaObjetivo: 'Hora objetivo',
  insumoId: 'Insumo',
  items: 'Insumos',
  matricula: 'Matrícula',
  motivo: 'Motivo',
  motivoEgreso: 'Motivo del egreso',
  nombre: 'Nombre',
  nombreUsuario: 'Usuario',
  obraSocial: 'Obra social',
  observaciones: 'Observaciones',
  pacienteId: 'Paciente',
  permisos: 'Permisos',
  prescripcionId: 'Prescripción',
  presentacion: 'Presentación',
  prioridad: 'Prioridad',
  rol: 'Rol',
  sala: 'Sala',
  salaId: 'Sala',
  sexo: 'Sexo',
  tipo: 'Tipo',
  unidad: 'Unidad',
  unidadDosis: 'Unidad de la dosis',
  unidadMedida: 'Unidad de medida',
  usuarioId: 'Usuario',
  via: 'Vía',
};

/** "unidadDosis" → "Unidad de la dosis"; uno desconocido, separado en palabras ("Numero afiliado"). */
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
