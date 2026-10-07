import type { UseQueryResult } from '@tanstack/react-query';
import type { Paciente } from '../../api/tipos';
import { Cargando, ErrorDeCarga } from '../../componentes/EstadoDeCarga';
import { IdentidadPaciente } from '../pacientes/IdentidadPaciente';
import { falloElPaciente } from './estadoDelPaciente';

/**
 * Quién es el paciente de la pantalla (UX-06): la ficha con su identidad o, mientras no la
 * tengamos, "Cargando" o el error con "Reintentar". Nunca queda un hueco que se pueda confundir
 * con que no hace falta saber de quién se trata.
 */
export function IdentidadOEstado({ consulta }: { consulta: UseQueryResult<Paciente> }) {
  if (consulta.data) return <IdentidadPaciente paciente={consulta.data} />;
  if (falloElPaciente(consulta)) {
    return (
      <ErrorDeCarga
        que="los datos del paciente"
        error={consulta.error}
        alReintentar={() => void consulta.refetch()}
      />
    );
  }
  return <Cargando texto="Cargando los datos del paciente…" />;
}
