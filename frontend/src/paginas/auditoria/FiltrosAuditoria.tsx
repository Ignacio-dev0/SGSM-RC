import { Box } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { auditoriaApi, type EntradaAuditoria } from '../../api/auditoria';
import { mensajeDeError } from '../../api/cliente';
import { useSesion } from '../../auth/useSesion';
import { CampoTexto } from '../../componentes/CampoTexto';
import { Selector, type OpcionSelector } from '../../componentes/Selector';
import { BuscadorEnServidor } from './BuscadorEnServidor';
import { accionEnPalabras, entidadEnPalabras } from './palabras';

/** Un `type` (no `interface`): useFiltrosEnUrl pide un registro de textos. */
export type ValoresFiltros = {
  desde: string;
  hasta: string;
  /** personas, sistema o '' (todos). */
  origen: string;
  usuarioId: string;
  pacienteId: string;
  accion: string;
  entidad: string;
};

/** Quién hizo los movimientos (ESC2): por defecto, las personas; el sistema genera muchos. */
const OPCIONES_ORIGEN: OpcionSelector[] = [
  { valor: 'personas', etiqueta: 'Personas' },
  { valor: 'sistema', etiqueta: 'Sistema' },
  { valor: '', etiqueta: 'Todos' },
];

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
  /** Los movimientos a la vista, para nombrar al paciente o usuario de un enlace guardado. */
  entradas: EntradaAuditoria[];
}

/**
 * Filtros de la auditoría (T607): fechas, origen, usuario, paciente, acción y sobre qué. Las
 * acciones y lo que se tocó son lo que hay en la base (`/api/auditoria/opciones`), dicho en
 * palabras. El usuario y el paciente se buscan en el servidor mientras se escribe (E6-09); el
 * usuario usa la lista del personal, que pide `usuarios.gestionar`: sin ese permiso no se ofrece.
 */
export function FiltrosAuditoria({ valores, alCambiar, errores, entradas }: Props) {
  const { tienePermiso } = useSesion();
  const verPersonal = tienePermiso('usuarios.gestionar');
  const verPacientes = tienePermiso('pacientes.ver');
  const opciones = useQuery({
    queryKey: ['auditoria', 'opciones'],
    queryFn: auditoriaApi.opciones,
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
          lg: 'repeat(4, minmax(0, 1fr))',
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
      <Selector
        etiqueta="Origen"
        valor={valores.origen}
        alCambiar={(v) => alCambiar({ origen: v })}
        opciones={OPCIONES_ORIGEN}
      />
      {verPersonal && (
        <BuscadorEnServidor
          etiqueta="Quién lo hizo"
          clave="personal"
          valor={valores.usuarioId}
          etiquetaDelValor={usuarioVisto?.nombre ?? `Persona n.º ${valores.usuarioId}`}
          buscar={async (texto) => {
            const r = await auditoriaApi.personal(texto);
            return {
              total: r.meta.total,
              sugerencias: r.data.map((u) => ({
                valor: String(u.id),
                etiqueta: `${u.apellido}, ${u.nombre}`,
              })),
            };
          }}
          alCambiar={(v) => alCambiar({ usuarioId: v })}
          ayuda="Escriba el apellido, el nombre o el DNI."
        />
      )}
      {verPacientes && (
        <BuscadorEnServidor
          etiqueta="Paciente"
          clave="pacientes"
          valor={valores.pacienteId}
          etiquetaDelValor={
            pacienteVisto
              ? `${pacienteVisto.nombre}${pacienteVisto.dni ? ` · DNI ${pacienteVisto.dni}` : ''}`
              : `Paciente n.º ${valores.pacienteId}`
          }
          buscar={async (texto) => {
            const r = await auditoriaApi.pacientes(texto);
            return {
              total: r.meta.total,
              sugerencias: r.data.map((p) => ({
                valor: String(p.id),
                etiqueta: `${p.apellido}, ${p.nombre} · DNI ${p.dni}`,
              })),
            };
          }}
          alCambiar={(v) => alCambiar({ pacienteId: v })}
          ayuda="Escriba el apellido, el nombre o el DNI (también de quienes ya se fueron)."
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
      {/* E6-08: "Sobre qué", la misma palabra que la columna. */}
      <Selector
        etiqueta="Sobre qué"
        valor={valores.entidad}
        alCambiar={(v) => alCambiar({ entidad: v })}
        textoVacio={opciones.isLoading ? 'Cargando…' : 'Todo'}
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
        error={errorDeLista('opciones', opciones)}
        alReintentar={() => void opciones.refetch()}
        reintentando={opciones.isFetching}
      />
    </Box>
  );
}
