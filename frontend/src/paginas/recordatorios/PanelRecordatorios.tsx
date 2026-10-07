import { useState } from 'react';
import { Box, FormControlLabel, Switch, Typography } from '@mui/material';
import WifiOffOutlinedIcon from '@mui/icons-material/WifiOffOutlined';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api, ErrorApi } from '../../api/cliente';
import {
  CLAVE_RECORDATORIOS,
  recordatoriosApi,
  useRecordatorios,
  type Recordatorio,
} from '../../api/recordatorios';
import type { Sala } from '../../api/tipos';
import { useSesion } from '../../auth/useSesion';
import { Alerta, type TipoAlerta } from '../../componentes/Alerta';
import { EncabezadoPagina } from '../../componentes/EncabezadoPagina';
import { Cargando, ErrorDeCarga } from '../../componentes/EstadoDeCarga';
import { Selector } from '../../componentes/Selector';
import { tinte } from '../../tema';
import { useTiempoReal } from '../../tiempoReal/contexto';
import { formatearHora, sinCortes } from '../../utilidades/formato';
import { GrillaDeFiltros, Recargando } from '../../utilidades/listado';
import { useAhora } from '../../utilidades/useAhora';
import { useFiltrosEnUrl } from '../../utilidades/useFiltrosEnUrl';
import { DialogoNoAdministrado } from './DialogoNoAdministrado';
import { TarjetaRecordatorio } from './TarjetaRecordatorio';
import { nombrePaciente } from './urgencia';

/** Vista inicial: todo el hospital (S13). La sala elegida va en la URL. */
const FILTROS_INICIALES = { salaId: '' };

/** "Faltan" y "Atrasada" se recalculan solos cada tanto. */
const REFRESCO_MS = 30_000;

interface Resultado {
  tipo: TipoAlerta;
  texto: string;
}

/** Errores de "No se administró" que no se arreglan reintentando: se cierra el diálogo y se avisa. */
function resultadoDeError(e: unknown): Resultado | null {
  if (!(e instanceof ErrorApi)) return null;
  if (e.estado === 409) {
    const estado = (e.detalles as { estado?: string } | undefined)?.estado;
    return {
      tipo: 'advertencia',
      texto:
        estado === 'CANCELADO'
          ? 'Ese recordatorio se canceló: la prescripción cambió o el paciente se fue de alta.'
          : 'Ese recordatorio ya fue atendido por otra persona.',
    };
  }
  if (e.estado === 422) {
    return {
      tipo: 'error',
      texto:
        'Es el recordatorio de un estudio: se atiende confirmando el estudio, no con «No se administró».',
    };
  }
  return null;
}

const urgentes = (n: number) => (n === 1 ? '1 urgente' : `${n} urgentes`);

/** Franja mientras no hay tiempo real: la lista sigue al día, pero cada 30 s y sin avisos. */
function FranjaSinConexion() {
  return (
    <Box
      role="status"
      sx={(t) => ({
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        mb: 2,
        px: 2,
        py: 1,
        borderRadius: 1,
        border: 1,
        borderColor: 'warning.main',
        backgroundColor: tinte(t, 'warning', 0.14),
        color: 'text.primary',
        fontWeight: 700,
        fontSize: { xs: '0.9rem', sm: '0.95rem' },
        lineHeight: 1.35,
      })}
    >
      <WifiOffOutlinedIcon sx={{ color: 'warning.main' }} />
      {sinCortes('Sin conexión en tiempo real: la lista se actualiza cada 30 s')}
    </Box>
  );
}

/**
 * Recordatorios para atender (T506 · T507 · CU24–CU26): las tomas de todo el hospital por
 * urgencia (el servidor ya las ordena), filtrables por sala. Desde cada tarjeta se administra (abre
 * la administración con el paciente y la prescripción elegidos) o se registra por qué no se dio.
 * La lista se actualiza sola con el tiempo real (ProveedorTiempoReal).
 */
export function PanelRecordatorios() {
  const navegar = useNavigate();
  const cliente = useQueryClient();
  const { tienePermiso } = useSesion();
  const atiende = tienePermiso('recordatorios.atender');
  const administra = atiende && tienePermiso('suministros.registrar');
  const { estado, desfaseMs, sonido, fijarSonido } = useTiempoReal();
  const ahoraServidorMs = useAhora(REFRESCO_MS).getTime() + desfaseMs;

  // Las salas salen de /api/salas (pacientes.ver); sin ese permiso no se ofrece el filtro.
  const verSalas = tienePermiso('pacientes.ver');
  const salas = useQuery({
    queryKey: ['salas'],
    queryFn: () => api.get<Sala[]>('/api/salas'),
    enabled: verSalas,
  });
  const filtros = useFiltrosEnUrl(FILTROS_INICIALES);
  const { salaId } = filtros.valores;
  const consulta = useRecordatorios(salaId ? { salaId: Number(salaId) } : {});
  const nombreSala = salas.data?.find((s) => String(s.id) === salaId)?.nombre;

  const [eligiendo, setEligiendo] = useState<Recordatorio | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const noAdministrar = useMutation({
    mutationFn: ({ r, motivo }: { r: Recordatorio; motivo: string }) =>
      recordatoriosApi.noAdministrar(r.id, motivo),
    onSuccess: (_atendido, { r }) => {
      setEligiendo(null);
      setResultado({
        tipo: 'exito',
        texto: `Se registró que no se administró ${r.prescripcion?.medicamento ?? 'la toma'} a ${nombrePaciente(r)}.`,
      });
    },
    onError: (e) => {
      const r = resultadoDeError(e);
      if (!r) return;
      setEligiendo(null);
      setResultado(r);
    },
    // Lo atendido (o lo que otra persona ya atendió) sale de la lista.
    onSettled: () => void cliente.invalidateQueries({ queryKey: [CLAVE_RECORDATORIOS] }),
  });

  const abrirNoAdministrar = (r: Recordatorio) => {
    noAdministrar.reset();
    setResultado(null);
    setEligiendo(r);
  };

  const administrar = (r: Recordatorio) => {
    if (!r.prescripcion) return;
    navegar(
      `/suministros/medicamento?pacienteId=${r.paciente.id}&prescripcionId=${r.prescripcion.id}`,
    );
  };

  const data = consulta.data;
  const actualizada = data ? `Actualizada a las ${formatearHora(data.meta.ahora)}` : undefined;
  const subtitulo = data
    ? data.meta.total > 0
      ? `${data.meta.total} para atender · ${urgentes(data.meta.urgentes)} · ${actualizada}`
      : actualizada
    : undefined;
  const errorEnDialogo =
    noAdministrar.isError && !resultadoDeError(noAdministrar.error) ? noAdministrar.error : null;

  return (
    <>
      <EncabezadoPagina
        titulo="Recordatorios"
        subtitulo={subtitulo}
        acciones={
          atiende && (
            <FormControlLabel
              control={<Switch checked={sonido} onChange={(e) => fijarSonido(e.target.checked)} />}
              label="Sonido de avisos"
              sx={{ minHeight: 56, mx: 0 }}
            />
          )
        }
      />

      {estado === 'sin-conexion' && <FranjaSinConexion />}

      {verSalas && (
        <GrillaDeFiltros columnas="minmax(0, 360px)">
          <Selector
            etiqueta="Sala"
            valor={salaId}
            alCambiar={(v) => filtros.fijar({ salaId: v })}
            textoVacio="Todas"
            opciones={(salas.data ?? []).map((s) => ({ valor: String(s.id), etiqueta: s.nombre }))}
          />
        </GrillaDeFiltros>
      )}

      {resultado && (
        <Alerta tipo={resultado.tipo} alCerrar={() => setResultado(null)}>
          {resultado.texto}
        </Alerta>
      )}

      {consulta.isError && (
        // Un fallo de carga nunca se lee como "no hay tomas"; si había una lista, queda con su hora.
        <ErrorDeCarga
          que="los recordatorios"
          error={consulta.error}
          alReintentar={() => void consulta.refetch()}
        />
      )}

      {!data ? (
        !consulta.isError && <Cargando texto="Cargando recordatorios…" />
      ) : data.data.length === 0 ? (
        !consulta.isError && (
          <Box sx={{ py: 3 }}>
            <Typography sx={{ fontWeight: 700 }}>
              {nombreSala
                ? `No hay tomas para atender ahora en ${nombreSala}.`
                : 'No hay tomas para atender ahora.'}
            </Typography>
            <Typography color="text.secondary">
              {actualizada}. La lista se actualiza sola cuando aparece una toma.
            </Typography>
          </Box>
        )
      ) : (
        <Recargando activo={consulta.isFetching && consulta.isPlaceholderData}>
          <Box
            component="ul"
            aria-label="Tomas para atender"
            sx={{
              listStyle: 'none',
              m: 0,
              p: 0,
              display: 'grid',
              gap: 2,
              // Una columna en teléfono; en tablet y PC, tantas como entren de 300 px.
              gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 300px), 1fr))',
            }}
          >
            {data.data.map((r) => (
              <TarjetaRecordatorio
                key={r.id}
                r={r}
                ahoraServidorMs={ahoraServidorMs}
                atiende={atiende}
                administra={administra}
                alAdministrar={administrar}
                alNoAdministrar={abrirNoAdministrar}
              />
            ))}
          </Box>
        </Recargando>
      )}

      <DialogoNoAdministrado
        recordatorio={eligiendo}
        cargando={noAdministrar.isPending}
        error={errorEnDialogo}
        alConfirmar={(motivo) => eligiendo && noAdministrar.mutate({ r: eligiendo, motivo })}
        alCancelar={() => setEligiendo(null)}
      />
    </>
  );
}
