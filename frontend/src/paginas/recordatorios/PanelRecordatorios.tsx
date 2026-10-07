import { useEffect, useRef, useState } from 'react';
import { Box, FormControlLabel, Switch, Typography } from '@mui/material';
import WifiOffOutlinedIcon from '@mui/icons-material/WifiOffOutlined';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import { api, ErrorApi, mensajeDeError } from '../../api/cliente';
import {
  CLAVE_RECORDATORIOS,
  recordatoriosApi,
  useRecordatorios,
  type Recordatorio,
  type TipoRecordatorio,
} from '../../api/recordatorios';
import type { Sala } from '../../api/tipos';
import { useSesion } from '../../auth/useSesion';
import { Alerta, type TipoAlerta } from '../../componentes/Alerta';
import { EncabezadoPagina } from '../../componentes/EncabezadoPagina';
import { Boton } from '../../componentes/Boton';
import { Cargando, ErrorDeCarga } from '../../componentes/EstadoDeCarga';
import { Selector } from '../../componentes/Selector';
import { tinte } from '../../tema';
import { useTiempoReal } from '../../tiempoReal/contexto';
import { formatearHora, sinCortes } from '../../utilidades/formato';
import { GrillaDeFiltros, Recargando } from '../../utilidades/listado';
import { useAhora } from '../../utilidades/useAhora';
import { useFiltrosEnUrl } from '../../utilidades/useFiltrosEnUrl';
import { useConfirmacionEstudio } from '../estudios/ConfirmacionEstudio';
import { DialogoNoAdministrado } from './DialogoNoAdministrado';
import { TarjetaRecordatorio } from './TarjetaRecordatorio';
import { contarUrgentes, nombrePaciente } from './urgencia';
import { useMantenerPantalla } from './useMantenerPantalla';

/** Vista inicial: todo el hospital (S13), tomas y estudios. El tipo y la sala van en la URL. */
const FILTROS_INICIALES = { tipo: '', salaId: '' };

/** Cómo se nombra lo que se ve, según el filtro por tipo ('' = todos). */
const TEXTOS_TIPO: Record<'' | TipoRecordatorio, { lista: string; vacio: string; nuevo: string }> =
  {
    '': {
      lista: 'Recordatorios para atender',
      vacio: 'No hay tomas ni estudios para atender ahora',
      nuevo: 'una toma o un estudio',
    },
    MEDICAMENTO: {
      lista: 'Tomas para atender',
      vacio: 'No hay tomas para atender ahora',
      nuevo: 'una toma',
    },
    ESTUDIO: {
      lista: 'Estudios para atender',
      vacio: 'No hay estudios para atender ahora',
      nuevo: 'un estudio',
    },
  };

const OPCIONES_TIPO = [
  { valor: 'MEDICAMENTO', etiqueta: 'Tomas' },
  { valor: 'ESTUDIO', etiqueta: 'Estudios' },
];

/** Un tipo que no existe en la URL (escrito a mano) se ignora: no se manda al servidor. */
const tipoValido = (v: string): '' | TipoRecordatorio =>
  v === 'MEDICAMENTO' || v === 'ESTUDIO' ? v : '';

/** "Faltan" y "Atrasada" se recalculan solos cada tanto. */
const REFRESCO_MS = 30_000;

/** Dónde se recuerda en la tablet la última sala elegida en el panel (ESC5). */
const CLAVE_SALA = 'sgsm.salaRecordatorios';

function leerSalaRecordada() {
  try {
    return localStorage.getItem(CLAVE_SALA) ?? '';
  } catch {
    return '';
  }
}

/** '' (Todas) la olvida. Sin almacenamiento (modo privado), no se recuerda y listo. */
function recordarSala(salaId: string) {
  try {
    if (salaId) localStorage.setItem(CLAVE_SALA, salaId);
    else localStorage.removeItem(CLAVE_SALA);
  } catch {
    // Sin almacenamiento: el filtro funciona igual, solo que no se recuerda.
  }
}

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
          : // Pudo ser la misma persona desde otra tablet (E5-14); el historial dice quién.
            'Ya estaba atendido (por usted o por otra persona). Revise el historial.',
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

/**
 * Franja mientras no hay tiempo real: la lista sigue al día cada 30 s y, a quien atiende, los
 * avisos de nuevos también llegan con esa demora (E5-03).
 */
function FranjaSinConexion({ conAvisos }: { conAvisos: boolean }) {
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
      {sinCortes(
        conAvisos
          ? 'Sin conexión en tiempo real: la lista y los avisos se actualizan cada 30 s.'
          : 'Sin conexión en tiempo real: la lista se actualiza cada 30 s.',
      )}
    </Box>
  );
}

/**
 * Recordatorios para atender (T506 · T507 · CU24–CU26): las tomas y los estudios de todo el
 * hospital por urgencia (el servidor ya los ordena), filtrables por tipo y por sala. Desde cada
 * tarjeta de toma se administra (abre la administración con el paciente y la prescripción
 * elegidos, y desde ahí se vuelve al panel) o se registra por qué no se dio; desde cada tarjeta de
 * estudio se confirma con el rostro que se realizó (T513). La lista se actualiza sola con el tiempo
 * real (ProveedorTiempoReal).
 */
export function PanelRecordatorios() {
  const navegar = useNavigate();
  const ubicacion = useLocation();
  const cliente = useQueryClient();
  const { tienePermiso } = useSesion();
  const atiende = tienePermiso('recordatorios.atender');
  const administra = atiende && tienePermiso('suministros.registrar');
  const confirmaEstudios = tienePermiso('estudios.confirmar');
  const { estado, desfaseMs, sonido, fijarSonido } = useTiempoReal();
  const ahoraServidorMs = useAhora(REFRESCO_MS).getTime() + desfaseMs;
  const pantalla = useMantenerPantalla();

  // Las salas salen de /api/salas (pacientes.ver); sin ese permiso no se ofrece el filtro.
  const verSalas = tienePermiso('pacientes.ver');
  const salas = useQuery({
    queryKey: ['salas'],
    queryFn: () => api.get<Sala[]>('/api/salas'),
    enabled: verSalas,
  });
  const filtros = useFiltrosEnUrl(FILTROS_INICIALES);
  const tipo = tipoValido(filtros.valores.tipo);
  // Una sala que no está en la lista (escrita a mano, o recordada y dada de baja) se ignora, como
  // el tipo (E5-17). Mientras la lista llega (o si no llega) se usa la de la dirección.
  const salaPedida = verSalas ? filtros.valores.salaId : '';
  const salaId =
    salaPedida && salas.data && !salas.data.some((s) => String(s.id) === salaPedida)
      ? ''
      : salaPedida;

  // Sin sala en la dirección, la última elegida en esta tablet (ESC5): al abrir el panel o al
  // llegar desde el menú o la insignia; no en los cambios de filtro propios (REPLACE).
  const tipoNavegacion = useNavigationType();
  const aplicarSalaRecordada = useRef(() => {});
  aplicarSalaRecordada.current = () => {
    if (!verSalas || filtros.valores.salaId) return;
    const recordada = leerSalaRecordada();
    if (recordada) filtros.fijar({ salaId: recordada });
  };
  useEffect(() => {
    if (tipoNavegacion !== 'REPLACE') aplicarSalaRecordada.current();
  }, [ubicacion.key, tipoNavegacion]);
  const elegirSala = (v: string) => {
    recordarSala(v);
    filtros.fijar({ salaId: v });
  };
  const hayFiltros = tipo !== '' || salaId !== '';
  const quitarFiltros = () => {
    recordarSala('');
    filtros.quitarFiltros();
  };
  // Sin filtros es la misma consulta que la insignia (['recordatorios', {}]).
  const consulta = useRecordatorios({
    ...(tipo ? { tipo } : {}),
    ...(salaId ? { salaId: Number(salaId) } : {}),
  });
  const nombreSala = salas.data?.find((s) => String(s.id) === salaId)?.nombre;
  const textos = TEXTOS_TIPO[tipo];

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

  // Al terminar, el hook ya renueva ['recordatorios']: el estudio confirmado sale de la lista.
  const { abrirConfirmacion, dialogoConfirmacion } = useConfirmacionEstudio({
    alTerminar: ({ tipo: t, texto }) => setResultado({ tipo: t, texto }),
  });
  const confirmarEstudio = (r: Recordatorio) => {
    if (!r.estudio) return;
    setResultado(null);
    const { apellido, nombre, dni } = r.paciente;
    abrirConfirmacion(r.estudio.id, {
      paciente: { apellido, nombre, dni, cama: r.cama?.numero ?? null },
    });
  };

  const administrar = (r: Recordatorio) => {
    if (!r.prescripcion) return;
    // `desde` hace que la administración ofrezca volver al panel; `toma`, que hable de la toma del
    // recordatorio aunque esté atrasada (E5-01). El estado lleva los filtros de ahora, para volver
    // a la misma vista (por ejemplo, la sala propia).
    const destino = new URLSearchParams({
      pacienteId: String(r.paciente.id),
      prescripcionId: String(r.prescripcion.id),
      desde: 'recordatorios',
      toma: r.fechaHoraObjetivo,
    });
    navegar(`/suministros/medicamento?${destino.toString()}`, {
      state: { volverA: `/recordatorios${ubicacion.search}` },
    });
  };

  const data = consulta.data;
  const actualizada = data ? `Actualizada a las ${formatearHora(data.meta.ahora)}` : undefined;
  const subtitulo = data
    ? data.meta.total > 0
      ? `${data.meta.total} para atender · ${urgentes(contarUrgentes(data.data, ahoraServidorMs))} · ${actualizada}`
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
          (atiende || pantalla.soportado) && (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', columnGap: 3 }}>
              {atiende && (
                <FormControlLabel
                  control={
                    <Switch checked={sonido} onChange={(e) => fijarSonido(e.target.checked)} />
                  }
                  label="Sonido de avisos"
                  sx={{ minHeight: 56, mx: 0 }}
                />
              )}
              {pantalla.soportado && (
                // Para dejar el panel a la vista en el office (ESC2); solo si el navegador lo permite.
                <FormControlLabel
                  control={
                    <Switch
                      checked={pantalla.activo}
                      onChange={(e) => pantalla.fijar(e.target.checked)}
                    />
                  }
                  label="Mantener la pantalla encendida"
                  sx={{ minHeight: 56, mx: 0 }}
                />
              )}
            </Box>
          )
        }
      />

      {estado === 'sin-conexion' && <FranjaSinConexion conAvisos={atiende} />}

      <GrillaDeFiltros columnas="minmax(0, 640px)">
        {/* Los dos filtros van juntos: de a dos desde tablet (la grilla pondría el primero solo). */}
        <Box
          sx={{
            display: 'grid',
            gap: 2,
            gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))' },
          }}
        >
          <Selector
            etiqueta="Tipo"
            valor={tipo}
            alCambiar={(v) => filtros.fijar({ tipo: v })}
            textoVacio="Todos"
            opciones={OPCIONES_TIPO}
          />
          {verSalas && (
            <Selector
              etiqueta="Sala"
              valor={salaId}
              alCambiar={elegirSala}
              textoVacio={salas.isLoading ? 'Cargando salas…' : 'Todas'}
              opciones={(salas.data ?? []).map((s) => ({
                valor: String(s.id),
                etiqueta: s.nombre,
              }))}
              // Si la lista no llegó, lo dice y deja pedirla de nuevo ahí mismo (E5-08).
              error={
                salas.isError
                  ? `No se pudo cargar la lista de salas. ${mensajeDeError(salas.error)}`
                  : undefined
              }
              errorDeCarga={salas.isError}
              alReintentar={() => void salas.refetch()}
              reintentando={salas.isFetching}
            />
          )}
        </Box>
      </GrillaDeFiltros>

      {resultado && (
        // Toma el foco: la tarjeta con el botón que abrió el diálogo suele salir de la lista al
        // recargarse, y el foco caería en la página.
        <Alerta tipo={resultado.tipo} alCerrar={() => setResultado(null)} enfocar>
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
              {textos.vacio}
              {nombreSala && ` en ${nombreSala}`}.
            </Typography>
            <Typography color="text.secondary">
              {actualizada}. La lista se actualiza sola cuando aparece {textos.nuevo}.
            </Typography>
            {hayFiltros && (
              // Como en los otros listados: lo que falta puede estar fuera del filtro (E5-17).
              <Box
                role="group"
                aria-label="Qué puede hacer ahora"
                sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 2 }}
              >
                <Boton variante="secundario" onClick={quitarFiltros}>
                  Quitar filtros
                </Boton>
              </Box>
            )}
          </Box>
        )
      ) : (
        <Recargando activo={consulta.isFetching && consulta.isPlaceholderData}>
          <Box
            component="ul"
            // Sin viñetas, Safari (VoiceOver) deja de anunciarla como lista: se declara (E5-12).
            role="list"
            aria-label={textos.lista}
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
                confirmaEstudios={confirmaEstudios}
                alAdministrar={administrar}
                alNoAdministrar={abrirNoAdministrar}
                alConfirmarEstudio={confirmarEstudio}
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
      {dialogoConfirmacion}
    </>
  );
}
