import type { UseQueryResult } from '@tanstack/react-query';
import type { Paciente } from '../../api/tipos';

/**
 * Un fallo se muestra recién cuando termina de intentar: al tocar "Reintentar" se vuelve a ver
 * "Cargando", no el error viejo.
 */
export const falloElPaciente = (consulta: UseQueryResult<Paciente>) =>
  consulta.isError && !consulta.isFetching;

/** Por qué todavía no se puede guardar, o null si ya se ve al paciente (UX-06). */
export function motivoSinPaciente(consulta: UseQueryResult<Paciente>) {
  if (consulta.data) return null;
  return falloElPaciente(consulta)
    ? 'No se puede guardar sin los datos del paciente'
    : 'Esperando los datos del paciente…';
}
