import { Box } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { auditoriaApi, type EntradaAuditoria } from '../../api/auditoria';
import { mensajeDeError } from '../../api/cliente';
import { pacientesApi } from '../../api/pacientes';
import { useSesion } from '../../auth/useSesion';
import { CampoTexto } from '../../componentes/CampoTexto';
import { Selector, type OpcionSelector } from '../../componentes/Selector';
import { accionEnPalabras, entidadEnPalabras } from './palabras';

/** Un `type` (no `interface`): useFiltrosEnUrl pide un registro de textos. */
export type ValoresFiltros = {
  desde: string;
  hasta: string;
  usuarioId: string;
  pacienteId: string;
  accion: string;
  entidad: string;
};

/** Una lista del servidor que falló: lo dice en el selector, que ofrece reintentar. */
const errorDeLista = (que: string, consulta: { isError: boolean; error: unknown }) =>
  consulta.isError
    ? `No se pudo cargar la lista de ${que}. ${mensajeDeError(consulta.error)}`
    : undefined;

/**
 * El valor elegido (por ejemplo, de un enlace guardado) siempre está entre las opciones, aunque la
 * lista no lo traiga: así el selector no queda en blanco con un filtro aplicado.
 */
function conElegido(opciones: OpcionSelector[], valor: string, etiqueta: string) {
  if (!valor || opciones.some((o) => o.valor === valor)) return opciones;
  return [...opciones, { valor, etiqueta }];
}

const ordenadas = (opciones: OpcionSelector[]) =>
  [...opciones].sort((a, b) => a.etiqueta.localeCompare(b.etiqueta, 'es'));

interface Props {
  valores: ValoresFiltros;
  alCambiar: (cambios: Partial<ValoresFiltros>) => void;
  /** Error de las fechas: el del cliente o el del servidor. */
  errores: { desde?: string; hasta?: string };
  /** Las entradas a la vista, para nombrar al paciente o usuario elegidos que no estén en las listas. */
  entradas: EntradaAuditoria[];
}

/**
 * Filtros de la auditoría (T607): fechas, usuario, paciente, acción y entidad. Las acciones y las
 * entidades son las que hay en la base (`/api/auditoria/opciones`), dichas en palabras. El filtro
 * de usuario usa la lista del personal, que pide `usuarios.gestionar`: sin ese permiso no se ofrece.
 */
export function FiltrosAuditoria({ valores, alCambiar, errores, entradas }: Props) {
  const { tienePermiso } = useSesion();
  const verPersonal = tienePermiso('usuarios.gestionar');
  const verPacientes = tienePermiso('pacientes.ver');
  const opciones = useQuery({
    queryKey: ['auditoria', 'opciones'],
    queryFn: auditoriaApi.opciones,
  });
  const personal = useQuery({
    queryKey: ['auditoria', 'personal'],
    queryFn: auditoriaApi.personal,
    enabled: verPersonal,
  });
  // Todos los pacientes, también los que ya se fueron: la auditoría es de toda la historia.
  const pacientes = useQuery({
    queryKey: ['auditoria', 'pacientes'],
    queryFn: () => pacientesApi.buscar({ porPagina: 100 }),
    enabled: verPacientes,
  });

  const pacienteVisto = entradas.find(
    (e) => String(e.paciente?.id) === valores.pacienteId,
  )?.paciente;
  const usuarioVisto = entradas.find((e) => String(e.usuario.id) === valores.usuarioId)?.usuario;

  return (
    <Box
      role="search"
      aria-label="Filtros"
      sx={{
        display: 'grid',
        gap: 2,
        gridTemplateColumns: {
          xs: 'minmax(0, 1fr)',
          sm: 'repeat(2, minmax(0, 1fr))',
          lg: 'repeat(3, minmax(0, 1fr))',
        },
        mb: 2,
      }}
    >
      <CampoTexto
        etiqueta="Desde"
        type="date"
        valor={valores.desde}
        alCambiar={(v) => alCambiar({ desde: v })}
        error={errores.desde}
        slotProps={{ inputLabel: { shrink: true } }}
      />
      <CampoTexto
        etiqueta="Hasta"
        type="date"
        valor={valores.hasta}
        alCambiar={(v) => alCambiar({ hasta: v })}
        error={errores.hasta}
        slotProps={{ inputLabel: { shrink: true } }}
      />
      {verPersonal && (
        <Selector
          etiqueta="Usuario"
          valor={valores.usuarioId}
          alCambiar={(v) => alCambiar({ usuarioId: v })}
          textoVacio={personal.isLoading ? 'Cargando el personal…' : 'Todos'}
          opciones={conElegido(
            (personal.data?.data ?? []).map((u) => ({
              valor: String(u.id),
              etiqueta: `${u.apellido}, ${u.nombre}`,
            })),
            valores.usuarioId,
            usuarioVisto?.nombre ?? `Usuario n.º ${valores.usuarioId}`,
          )}
          error={errorDeLista('personal', personal)}
          alReintentar={() => void personal.refetch()}
          reintentando={personal.isFetching}
        />
      )}
      {verPacientes && (
        <Selector
          etiqueta="Paciente"
          valor={valores.pacienteId}
          alCambiar={(v) => alCambiar({ pacienteId: v })}
          textoVacio={pacientes.isLoading ? 'Cargando pacientes…' : 'Todos'}
          opciones={conElegido(
            (pacientes.data?.data ?? []).map((p) => ({
              valor: String(p.id),
              etiqueta: `${p.apellido}, ${p.nombre} · DNI ${p.dni}`,
            })),
            valores.pacienteId,
            pacienteVisto
              ? `${pacienteVisto.nombre}${pacienteVisto.dni ? ` · DNI ${pacienteVisto.dni}` : ''}`
              : `Paciente n.º ${valores.pacienteId}`,
          )}
          error={errorDeLista('pacientes', pacientes)}
          alReintentar={() => void pacientes.refetch()}
          reintentando={pacientes.isFetching}
        />
      )}
      <Selector
        etiqueta="Acción"
        valor={valores.accion}
        alCambiar={(v) => alCambiar({ accion: v })}
        textoVacio={opciones.isLoading ? 'Cargando acciones…' : 'Todas'}
        opciones={conElegido(
          ordenadas(
            (opciones.data?.acciones ?? []).map((a) => ({
              valor: a,
              etiqueta: accionEnPalabras(a),
            })),
          ),
          valores.accion,
          accionEnPalabras(valores.accion),
        )}
        error={errorDeLista('acciones', opciones)}
        alReintentar={() => void opciones.refetch()}
        reintentando={opciones.isFetching}
      />
      <Selector
        etiqueta="Entidad"
        valor={valores.entidad}
        alCambiar={(v) => alCambiar({ entidad: v })}
        textoVacio={opciones.isLoading ? 'Cargando entidades…' : 'Todas'}
        opciones={conElegido(
          ordenadas(
            (opciones.data?.entidades ?? []).map((e) => ({
              valor: e,
              etiqueta: entidadEnPalabras(e),
            })),
          ),
          valores.entidad,
          entidadEnPalabras(valores.entidad),
        )}
        error={errorDeLista('entidades', opciones)}
        alReintentar={() => void opciones.refetch()}
        reintentando={opciones.isFetching}
      />
    </Box>
  );
}
