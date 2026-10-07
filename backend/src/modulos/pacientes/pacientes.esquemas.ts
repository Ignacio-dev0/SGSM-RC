import { z } from 'zod';
import { hoyEnArgentina } from '../../comun/fechas';
import { esquemaPaginacion } from '../../comun/paginacion';
import { esquemaDni } from '../usuarios/usuarios.esquemas';

const textoOpcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

const camposPaciente = {
  dni: esquemaDni,
  nombre: z.string().trim().min(2, 'Ingrese el nombre').max(80),
  apellido: z.string().trim().min(2, 'Ingrese el apellido').max(80),
  fechaNacimiento: z.iso
    .date('Ingrese la fecha de nacimiento (AAAA-MM-DD)')
    .refine(
      (f) => f >= '1900-01-01' && f <= hoyEnArgentina(),
      'La fecha de nacimiento no es válida',
    ),
  sexo: z.enum(['FEMENINO', 'MASCULINO', 'OTRO'], { error: 'Elija el sexo' }),
  obraSocial: textoOpcional(80),
  numeroAfiliado: textoOpcional(40),
  diagnostico: textoOpcional(255),
  contactoEmergenciaNombre: textoOpcional(120),
  contactoEmergenciaTelefono: textoOpcional(30),
  observaciones: textoOpcional(500),
};

const esquemaCamaId = z.coerce.number({ error: 'Elija una cama' }).int().positive('Elija una cama');

export const esquemaAltaPaciente = z.object({
  ...camposPaciente,
  camaId: esquemaCamaId,
  fechaIngreso: z.iso.datetime({ offset: true }).optional(),
});

export const esquemaModificacionPaciente = z.object(camposPaciente).partial();

export const esquemaReingreso = z
  .object(camposPaciente)
  .partial()
  .extend({ camaId: esquemaCamaId });

export const esquemaTraslado = z.object({ camaId: esquemaCamaId });

export const esquemaEgreso = z.object({
  motivo: z.string().trim().min(3, 'Indique el motivo del egreso').max(255),
  fechaEgreso: z.iso.datetime({ offset: true }).optional(),
});

export const esquemaBusquedaPacientes = esquemaPaginacion.extend({
  /** DNI o apellido (lo que escriba el usuario en el buscador). */
  texto: z.string().trim().max(80).optional(),
  dni: z.string().trim().max(10).optional(),
  apellido: z.string().trim().max(80).optional(),
  cama: z.string().trim().max(10).optional(),
  salaId: z.coerce.number().int().positive().optional(),
  estado: z.enum(['INTERNADO', 'EGRESADO']).optional(),
});

export type AltaPaciente = z.infer<typeof esquemaAltaPaciente>;
export type ModificacionPaciente = z.infer<typeof esquemaModificacionPaciente>;
export type Reingreso = z.infer<typeof esquemaReingreso>;
export type BusquedaPacientes = z.infer<typeof esquemaBusquedaPacientes>;
