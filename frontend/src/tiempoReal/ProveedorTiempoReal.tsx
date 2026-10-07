import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CLAVE_RECORDATORIOS, type ListaRecordatorios } from '../api/recordatorios';
import { useSesion } from '../auth/useSesion';
import { AvisoNuevos, type Aviso } from './AvisoNuevos';
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

/** Mientras no hay tiempo real, la lista se vuelve a pedir cada tanto. */
const CONSULTA_SIN_CONEXION_MS = 30_000;

/** Diferencias de reloj menores no cambian lo que se muestra (se redondea a minutos). */
const DESFASE_MINIMO_MS = 1_000;

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
 * - Sin conexión, vuelve a pedir la lista cada 30 s; al volver la red o la pantalla, reconecta.
 * - Con la hora del servidor (`meta.ahora` y `momento`) calcula el desfase del reloj (R6).
 * - A quien atiende le avisa los recordatorios nuevos: texto siempre, tono y vibración si la
 *   tablet no los desactivó, como mucho cada 10 s (S16).
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

  // Lo último de la sesión y la preferencia, para los avisos que llegan por el socket.
  const actual = useRef({ atiende, sonido, refrescarSesion });
  actual.current = { atiende, sonido, refrescarSesion };

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

  useEffect(() => {
    if (!puedeVer || estado !== 'sin-conexion') return;
    const id = setInterval(
      () => void cliente.invalidateQueries({ queryKey: [CLAVE_RECORDATORIOS] }),
      CONSULTA_SIN_CONEXION_MS,
    );
    return () => clearInterval(id);
  }, [puedeVer, estado, cliente]);

  // Al volver la red o la pantalla (la tablet se despierta), no se espera la próxima vuelta.
  useEffect(() => {
    const reintentar = () => {
      if (document.visibilityState !== 'hidden') conexion.current?.reconectarYa();
    };
    window.addEventListener('online', reintentar);
    document.addEventListener('visibilitychange', reintentar);
    return () => {
      window.removeEventListener('online', reintentar);
      document.removeEventListener('visibilitychange', reintentar);
    };
  }, []);

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
    () => ({ estado: puedeVer ? estado : 'inactivo', desfaseMs, sonido, fijarSonido }),
    [puedeVer, estado, desfaseMs, sonido, fijarSonido],
  );

  return (
    <ContextoTiempoReal.Provider value={valor}>
      {children}
      {atiende && <AvisoNuevos aviso={aviso} alCerrar={cerrarAviso} />}
    </ContextoTiempoReal.Provider>
  );
}
