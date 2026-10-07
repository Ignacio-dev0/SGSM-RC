import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CLAVE_RECORDATORIOS,
  recordatoriosApi,
  type ListaRecordatorios,
} from '../api/recordatorios';
import { useSesion } from '../auth/useSesion';
import { contarUrgentes } from '../paginas/recordatorios/urgencia';
import { useAhora } from '../utilidades/useAhora';
import { RegionAvisos, type Aviso } from './AvisoNuevos';
import {
  crearAvisador,
  crearAvisosAgrupados,
  guardarPreferenciaSonido,
  leerPreferenciaSonido,
  textoNuevos,
  type Avisador,
} from './avisos';
import {
  conectarTiempoReal,
  type ConexionTiempoReal,
  type EstadoConexion,
  type FabricaSocket,
} from './conexion';
import { ContextoTiempoReal, type ValorTiempoReal } from './contexto';
import { useTonoRepetido } from './useTonoRepetido';

/** Mientras no hay tiempo real, la lista se vuelve a pedir cada tanto. */
const CONSULTA_SIN_CONEXION_MS = 30_000;

/** Con la conexión abierta, igual se pide cada tanto: por si se perdió un aviso (E5-04). */
const CONSULTA_DE_SEGURIDAD_MS = 90_000;

/** Diferencias de reloj menores no cambian lo que se muestra (se redondea a minutos). */
const DESFASE_MINIMO_MS = 1_000;

/** Lo atrasado se vuelve urgente con el paso del tiempo: se recalcula cada tanto. */
const REFRESCO_URGENTES_MS = 30_000;

interface Props {
  children: ReactNode;
  /** Para pruebas: por defecto, el WebSocket del navegador. */
  fabrica?: FabricaSocket;
  /** Para pruebas: por defecto, Web Audio y navigator.vibrate. */
  avisador?: Avisador;
}

/**
 * Tiempo real de recordatorios para toda pantalla con sesión (T505 · docs/recordatorios.md).
 * - Se conecta solo si la sesión tiene `recordatorios.ver`.
 * - Cada mensaje invalida la lista de recordatorios (la fuente de verdad es la API) y, si algo
 *   venció, las notificaciones.
 * - La lista no depende solo del socket (E5-04): sin conexión se pide cada 30 s y, con conexión,
 *   cada 90 s; al volver la red o la pantalla se pide y se reconecta.
 * - Con la hora del servidor (`meta.ahora` y `momento`) calcula el desfase del reloj (R6).
 * - A quien atiende le avisa los recordatorios nuevos: texto siempre, tono y vibración si la
 *   tablet no los desactivó, como mucho cada 10 s (S16). Los nuevos llegan por el socket o, si no
 *   lo hubo (sin conexión o al volver de un corte), comparando la lista con la anterior (E5-03).
 * - Mientras haya urgentes o vencidos sin atender, el tono se repite cada 5 min (ESC3).
 * - 4001 dos veces o 4003: vuelve a pedir la sesión, que decide si sigue o va al ingreso.
 */
export function ProveedorTiempoReal({ children, fabrica, avisador: avisadorDePrueba }: Props) {
  const { usuario, tienePermiso, refrescarSesion } = useSesion();
  const cliente = useQueryClient();
  const puedeVer = tienePermiso('recordatorios.ver');
  const atiende = tienePermiso('recordatorios.atender');
  const usuarioId = usuario?.id;

  const [estado, setEstado] = useState<EstadoConexion>('conectando');
  const [desfaseMs, setDesfase] = useState(0);
  const [sonido, setSonido] = useState(leerPreferenciaSonido);
  const [aviso, setAviso] = useState<Aviso | null>(null);
  const conexion = useRef<ConexionTiempoReal | null>(null);
  const [avisador] = useState(() => avisadorDePrueba ?? crearAvisador());

  // Lo último de la sesión, la preferencia y la conexión, para lo que llega por el socket.
  const actual = useRef({ atiende, sonido, refrescarSesion, estado });
  actual.current = { atiende, sonido, refrescarSesion, estado };

  const [avisos] = useState(() =>
    crearAvisosAgrupados((nuevos) => {
      setAviso((anterior) => ({ texto: textoNuevos(nuevos), id: (anterior?.id ?? 0) + 1 }));
      if (actual.current.sonido) {
        avisador.tono();
        avisador.vibrar();
      }
    }),
  );
  useEffect(() => () => avisos.detener(), [avisos]);

  // La lista de todo el hospital: la misma consulta que la insignia (no pide dos veces).
  const lista = useQuery({
    queryKey: [CLAVE_RECORDATORIOS, {}],
    queryFn: () => recordatoriosApi.listar({}),
    enabled: puedeVer,
    placeholderData: keepPreviousData,
  });
  const ahoraServidorMs = useAhora(REFRESCO_URGENTES_MS).getTime() + desfaseMs;
  const hayUrgentes = puedeVer && contarUrgentes(lista.data?.data ?? [], ahoraServidorMs) > 0;

  // Los nuevos que no avisó el socket (E5-03): sin conexión, o lo que apareció durante un corte,
  // se ven al comparar la lista con la anterior. Con conexión, los avisa el socket (`nuevos`).
  const idsAnteriores = useRef<Set<number> | null>(null);
  const huboCorte = useRef(false);
  useEffect(() => {
    if (estado === 'sin-conexion') huboCorte.current = true;
  }, [estado]);
  useEffect(() => {
    const datos = lista.data?.data;
    if (!datos) return;
    const ids = new Set(datos.map((r) => r.id));
    const anteriores = idsAnteriores.current;
    idsAnteriores.current = ids;
    const sinSocket = huboCorte.current;
    if (actual.current.estado === 'conectado') huboCorte.current = false;
    if (!anteriores || !sinSocket || !actual.current.atiende) return;
    const nuevos = [...ids].filter((id) => !anteriores.has(id)).length;
    if (nuevos > 0) avisos.sumar(nuevos);
  }, [lista.data, avisos]);

  const registrarHoraServidor = useCallback((iso: string, horaLocalMs: number) => {
    const desfase = Date.parse(iso) - horaLocalMs;
    if (!Number.isFinite(desfase)) return;
    setDesfase((anterior) =>
      Math.abs(anterior - desfase) < DESFASE_MINIMO_MS ? anterior : desfase,
    );
  }, []);

  // `meta.ahora` de cada respuesta de la lista (la de la insignia o la del panel).
  useEffect(
    () =>
      cliente.getQueryCache().subscribe((evento) => {
        if (evento.type !== 'updated' || evento.action.type !== 'success') return;
        if (evento.query.queryKey[0] !== CLAVE_RECORDATORIOS) return;
        const datos = evento.query.state.data as ListaRecordatorios | undefined;
        if (datos?.meta?.ahora) {
          registrarHoraServidor(datos.meta.ahora, evento.query.state.dataUpdatedAt);
        }
      }),
    [cliente, registrarHoraServidor],
  );

  useEffect(() => {
    if (!puedeVer || usuarioId === undefined) return;
    setEstado('conectando');
    const c = conectarTiempoReal({
      ...(fabrica ? { fabrica } : {}),
      alCambiarEstado: setEstado,
      alMensaje: (mensaje) => {
        registrarHoraServidor(mensaje.momento, Date.now());
        void cliente.invalidateQueries({ queryKey: [CLAVE_RECORDATORIOS] });
        if (mensaje.tipo !== 'recordatorios') return;
        if (mensaje.vencidos > 0) void cliente.invalidateQueries({ queryKey: ['notificaciones'] });
        if (mensaje.nuevos > 0 && actual.current.atiende) avisos.sumar(mensaje.nuevos);
      },
      // Igual que ante un 401: la sesión decide si sigue (y con qué permisos) o va al ingreso.
      alTerminarSesion: () => void actual.current.refrescarSesion(),
      alPerderPermiso: () => void actual.current.refrescarSesion(),
    });
    conexion.current = c;
    return () => {
      c.cerrar();
      conexion.current = null;
    };
  }, [puedeVer, usuarioId, fabrica, cliente, registrarHoraServidor, avisos]);

  // La lista se pide cada 30 s sin conexión y cada 90 s con ella (E5-04). Pasar de "conectando" a
  // "conectado" no reinicia la cuenta: la cadencia es la misma.
  const cadenciaMs =
    estado === 'sin-conexion' ? CONSULTA_SIN_CONEXION_MS : CONSULTA_DE_SEGURIDAD_MS;
  useEffect(() => {
    if (!puedeVer) return;
    const id = setInterval(
      () => void cliente.invalidateQueries({ queryKey: [CLAVE_RECORDATORIOS] }),
      cadenciaMs,
    );
    return () => clearInterval(id);
  }, [puedeVer, cadenciaMs, cliente]);

  // Al volver la red o la pantalla (la tablet se despierta), no se espera la próxima vuelta: se
  // pide la lista (lo que pasó mientras dormía) y, si estaba esperando, se reconecta (E5-04).
  useEffect(() => {
    if (!puedeVer) return;
    const alVolver = () => {
      if (document.visibilityState === 'hidden') return;
      void cliente.invalidateQueries({ queryKey: [CLAVE_RECORDATORIOS] });
      conexion.current?.reconectarYa();
    };
    window.addEventListener('online', alVolver);
    document.addEventListener('visibilitychange', alVolver);
    return () => {
      window.removeEventListener('online', alVolver);
      document.removeEventListener('visibilitychange', alVolver);
    };
  }, [puedeVer, cliente]);

  // El navegador deja sonar el audio recién después de un toque (R7): se prepara con el primero.
  useEffect(() => {
    if (!atiende) return;
    const quitar = () => {
      window.removeEventListener('pointerdown', desbloquear, true);
      window.removeEventListener('keydown', desbloquear, true);
    };
    const desbloquear = () => {
      avisador.desbloquear();
      quitar();
    };
    window.addEventListener('pointerdown', desbloquear, true);
    window.addEventListener('keydown', desbloquear, true);
    return quitar;
  }, [atiende, avisador]);

  // Lo urgente sin atender vuelve a sonar cada 5 min para quien atiende (ESC3).
  useTonoRepetido(atiende && sonido && hayUrgentes, () => avisador.tono());

  const fijarSonido = useCallback(
    (activo: boolean) => {
      guardarPreferenciaSonido(activo);
      setSonido(activo);
      // Al activarlo suena una vez: confirma que esta tablet puede sonar.
      if (activo) avisador.tono();
    },
    [avisador],
  );

  const cerrarAviso = useCallback(() => setAviso(null), []);

  const valor = useMemo<ValorTiempoReal>(
    () => ({
      estado: puedeVer ? estado : 'inactivo',
      desfaseMs,
      sonido,
      fijarSonido,
      aviso: atiende ? aviso : null,
      cerrarAviso,
      hayUrgentes,
    }),
    [puedeVer, estado, desfaseMs, sonido, fijarSonido, atiende, aviso, cerrarAviso, hayUrgentes],
  );

  return (
    <ContextoTiempoReal.Provider value={valor}>
      {children}
      {atiende && <RegionAvisos aviso={aviso} />}
    </ContextoTiempoReal.Provider>
  );
}
