// Textos para mostrar los valores del módulo de pacientes.
import type { Cama, Sexo } from '../../api/tipos';

export const SEXOS: { valor: Sexo; etiqueta: string }[] = [
  { valor: 'FEMENINO', etiqueta: 'Femenino' },
  { valor: 'MASCULINO', etiqueta: 'Masculino' },
  { valor: 'OTRO', etiqueta: 'Otro' },
];

export const etiquetaSexo = (s: Sexo) => SEXOS.find((x) => x.valor === s)?.etiqueta ?? s;

export const MOTIVO_ASIGNACION: Record<string, string> = {
  INGRESO: 'Ingreso',
  TRASLADO: 'Traslado',
  REINGRESO: 'Reingreso',
};

export const ACCIONES: Record<string, string> = {
  CREAR: 'Alta',
  MODIFICAR: 'Modificación',
  REINGRESAR: 'Reingreso',
  TRASLADAR: 'Traslado',
  EGRESAR: 'Egreso',
  ASIGNAR_CAMA: 'Asignación de cama',
  LIBERAR_CAMA: 'Liberación de cama',
  SUSPENDER: 'Suspensión',
  FINALIZAR: 'Finalización',
  CANCELAR: 'Cancelación',
  REGISTRAR: 'Registro',
  CORREGIR: 'Corrección',
};

/** Nombres legibles de los campos que aparecen en la auditoría. */
export const CAMPOS: Record<string, string> = {
  dni: 'DNI',
  nombre: 'Nombre',
  apellido: 'Apellido',
  fechaNacimiento: 'Fecha de nacimiento',
  sexo: 'Sexo',
  obraSocial: 'Obra social',
  numeroAfiliado: 'N.º de afiliado',
  diagnostico: 'Diagnóstico',
  contactoEmergenciaNombre: 'Contacto de emergencia',
  contactoEmergenciaTelefono: 'Teléfono de emergencia',
  observaciones: 'Observaciones',
  estado: 'Estado',
  fechaEgreso: 'Fecha de egreso',
  motivoEgreso: 'Motivo del egreso',
  fechaIngreso: 'Fecha de ingreso',
  cama: 'Cama',
  motivo: 'Motivo',
};

export const descripcionCama = (c: Pick<Cama, 'numero' | 'sala'>) =>
  `${c.sala.nombre} · ${c.numero}`;

/** Opciones de cama para un Selector: "Sala A – … · A-02". */
export const opcionesDeCamas = (camas: Cama[]) =>
  camas.map((c) => ({ valor: String(c.id), etiqueta: descripcionCama(c) }));
