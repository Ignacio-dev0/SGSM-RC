/**
 * Contrato con el servidor para las pruebas de pantallas (paridad con producción): cada cuerpo
 * que una pantalla manda a la API simulada se valida con el MISMO esquema zod que usa el
 * backend. Si una pantalla manda algo que el servidor real rechazaría, la prueba falla, aunque
 * el imitador (MSW) le haya contestado bien.
 */
import type { ZodType } from 'zod';
import { esquemaLogin } from '../../../backend/src/modulos/auth/auth.esquemas';
import {
  esquemaRegistroBiometrico,
  esquemaValidacion,
} from '../../../backend/src/modulos/biometria/biometria.esquemas';
import {
  esquemaAltaInsumo,
  esquemaModificacionInsumo,
} from '../../../backend/src/modulos/insumos/insumos.esquemas';
import {
  esquemaAltaPaciente,
  esquemaEgreso,
  esquemaModificacionPaciente,
  esquemaReingreso,
  esquemaTraslado,
} from '../../../backend/src/modulos/pacientes/pacientes.esquemas';
import {
  esquemaAltaPrescripcion,
  esquemaCambioEstado,
  esquemaModificacionPrescripcion,
} from '../../../backend/src/modulos/prescripciones/prescripciones.esquemas';
import { esquemaNoAdministrado } from '../../../backend/src/modulos/recordatorios/recordatorios.esquemas';
import {
  esquemaAdministracion,
  esquemaCorreccion,
  esquemaInsumos,
} from '../../../backend/src/modulos/suministros/suministros.esquemas';
import {
  esquemaAltaUsuario,
  esquemaModificacionUsuario,
  esquemaPermisosAdicionales,
} from '../../../backend/src/modulos/usuarios/usuarios.esquemas';

const ID = '\\d+';
const regla = (metodo: string, ruta: string, esquema: ZodType) => ({
  metodo,
  ruta: new RegExp(`^${ruta.replaceAll(':id', ID)}$`),
  esquema,
});

/** Una regla por cada ruta del backend que recibe un cuerpo (ver docs/endpoints.md). */
const REGLAS = [
  regla('POST', '/api/auth/login', esquemaLogin),
  regla('POST', '/api/pacientes', esquemaAltaPaciente),
  regla('PATCH', '/api/pacientes/:id', esquemaModificacionPaciente),
  regla('POST', '/api/pacientes/:id/reingresar', esquemaReingreso),
  regla('POST', '/api/pacientes/:id/trasladar', esquemaTraslado),
  regla('POST', '/api/pacientes/:id/egresar', esquemaEgreso),
  regla('POST', '/api/pacientes/:id/prescripciones', esquemaAltaPrescripcion),
  regla('PATCH', '/api/prescripciones/:id', esquemaModificacionPrescripcion),
  regla('POST', '/api/prescripciones/:id/estado', esquemaCambioEstado),
  regla('POST', '/api/suministros/medicamentos', esquemaAdministracion),
  regla('POST', '/api/suministros/insumos', esquemaInsumos),
  regla('PATCH', '/api/suministros/:id', esquemaCorreccion),
  regla('POST', '/api/usuarios', esquemaAltaUsuario),
  regla('PATCH', '/api/usuarios/:id', esquemaModificacionUsuario),
  regla('PUT', '/api/usuarios/:id/permisos-adicionales', esquemaPermisosAdicionales),
  regla('POST', '/api/insumos', esquemaAltaInsumo),
  regla('PATCH', '/api/insumos/:id', esquemaModificacionInsumo),
  regla('PUT', '/api/biometria/usuarios/:id', esquemaRegistroBiometrico),
  regla('POST', '/api/biometria/validar', esquemaValidacion),
  regla('POST', '/api/recordatorios/:id/no-administrar', esquemaNoAdministrado),
];

/** null si el cuerpo cumple el esquema del servidor (o la ruta no tiene cuerpo que validar). */
export function validarContrato(metodo: string, ruta: string, cuerpo: unknown): string | null {
  const r = REGLAS.find((x) => x.metodo === metodo && x.ruta.test(ruta));
  if (!r) return null;
  const resultado = r.esquema.safeParse(cuerpo);
  if (resultado.success) return null;
  const problemas = resultado.error.issues
    .map((i) => `${i.path.join('.') || '(cuerpo)'}: ${i.message}`)
    .join('; ');
  return `${metodo} ${ruta} no cumple el esquema del servidor → ${problemas}`;
}
