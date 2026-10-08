import type { DatosPaciente } from '../../api/pacientes';
import type { Paciente } from '../../api/tipos';

export type ErroresPaciente = Partial<Record<keyof DatosPaciente | 'camaId', string>>;

export const PACIENTE_VACIO: DatosPaciente = {
  dni: '',
  nombre: '',
  apellido: '',
  fechaNacimiento: '',
  sexo: '',
  obraSocial: '',
  numeroAfiliado: '',
  diagnostico: '',
  contactoEmergenciaNombre: '',
  contactoEmergenciaTelefono: '',
  observaciones: '',
};

export const datosDePaciente = (p: Paciente): DatosPaciente => ({
  dni: p.dni,
  nombre: p.nombre,
  apellido: p.apellido,
  fechaNacimiento: p.fechaNacimiento,
  sexo: p.sexo,
  obraSocial: p.obraSocial ?? '',
  numeroAfiliado: p.numeroAfiliado ?? '',
  diagnostico: p.diagnostico ?? '',
  contactoEmergenciaNombre: p.contactoEmergenciaNombre ?? '',
  contactoEmergenciaTelefono: p.contactoEmergenciaTelefono ?? '',
  observaciones: p.observaciones ?? '',
});

/** Validación en la tablet de los datos obligatorios (el backend vuelve a validar todo). */
export function validarPaciente(d: DatosPaciente): ErroresPaciente {
  const e: ErroresPaciente = {};
  if (!d.dni.trim()) e.dni = 'Ingrese el DNI';
  else if (!/^\d{7,8}$/.test(d.dni.trim())) e.dni = 'El DNI debe tener 7 u 8 dígitos, sin puntos';
  if (!d.nombre.trim()) e.nombre = 'Ingrese el nombre';
  if (!d.apellido.trim()) e.apellido = 'Ingrese el apellido';
  if (!d.fechaNacimiento) e.fechaNacimiento = 'Ingrese la fecha de nacimiento';
  if (!d.sexo) e.sexo = 'Elija el sexo';
  return e;
}

/**
 * Para el reingreso desde la ficha (F18): solo los datos que se cambiaron frente a la ficha. Lo que
 * no se tocó no viaja y el servidor lo deja como estaba (un opcional vacío lo borraría).
 */
export function soloCambios(datos: DatosPaciente, ficha: DatosPaciente): Partial<DatosPaciente> {
  return Object.fromEntries(
    Object.entries(datos).filter(
      ([campo, valor]) => valor.trim() !== ficha[campo as keyof DatosPaciente].trim(),
    ),
  );
}

/**
 * Para el reingreso que se descubre al internar (el DNI es de un egresado): solo lo escrito. Un
 * opcional que quedó vacío no borra el de la ficha (F18).
 */
export const soloConValor = (datos: DatosPaciente): Partial<DatosPaciente> =>
  Object.fromEntries(Object.entries(datos).filter(([, valor]) => valor.trim() !== ''));
