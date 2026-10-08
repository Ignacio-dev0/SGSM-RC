import { useEffect, useRef, useState, type FocusEvent } from 'react';
import { createPortal } from 'react-dom';
import { Box, IconButton } from '@mui/material';
import AlarmOutlinedIcon from '@mui/icons-material/AlarmOutlined';
import CloseIcon from '@mui/icons-material/Close';
import { useLocation, useNavigate } from 'react-router-dom';
import { Boton } from '../componentes/Boton';
import { useDialogoAbierto } from '../utilidades/useDialogoAbierto';

export interface Aviso {
  texto: string;
  /** Cambia con cada aviso: el lector de pantalla lo anuncia aunque el texto se repita. */
  id: number;
}

/** Fuera de la vista pero leído por el lector de pantalla (el aviso visible está en la franja). */
const SOLO_LECTOR = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  m: '-1px',
  p: 0,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
} as const;

/** Cuánto queda a la vista el aviso; la insignia de la barra sigue mostrando la cantidad. */
export const DURACION_AVISO_MS = 15_000;

interface Props {
  aviso: Aviso | null;
  alCerrar: () => void;
  /** Hay urgentes o vencidos sin atender: el aviso queda hasta que se lo cierre (E5-06). */
  fijo?: boolean;
}

/**
 * Aviso de recordatorios nuevos para quien atiende, a la vista en cualquier pantalla. Va en la
 * franja fija bajo la barra superior (como el aviso de demostración): no tapa los botones de
 * abajo ni los diálogos, que quedan por encima (E5-05). Lleva a la lista y se puede cerrar.
 *
 * Se cierra solo a los 15 s, salvo que haya urgentes (queda hasta cerrarlo). No corre mientras el
 * puntero o el foco están adentro, ni mientras un diálogo lo tapa: al volver, cuenta 15 s de nuevo
 * (E5-06). El anuncio para el lector de pantalla lo hace `RegionAvisos`.
 */
export function AvisoNuevos({ aviso, alCerrar, fijo = false }: Props) {
  const navegar = useNavigate();
  const { pathname } = useLocation();
  const enLaLista = pathname === '/recordatorios';
  const [puntero, setPuntero] = useState(false);
  const [foco, setFoco] = useState(false);
  const tapado = useDialogoAbierto() !== null;

  useEffect(() => {
    if (!aviso || fijo || puntero || foco || tapado) return;
    const id = setTimeout(alCerrar, DURACION_AVISO_MS);
    return () => clearTimeout(id);
  }, [aviso, alCerrar, fijo, puntero, foco, tapado]);

  if (!aviso) return null;

  const alSalirElFoco = (e: FocusEvent<HTMLElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFoco(false);
  };

  return (
    <Box
      role="group"
      aria-label="Recordatorios nuevos"
      onPointerEnter={() => setPuntero(true)}
      onPointerLeave={() => setPuntero(false)}
      onFocus={() => setFoco(true)}
      onBlur={alSalirElFoco}
      sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', columnGap: 1 }}
    >
      <AlarmOutlinedIcon sx={{ color: 'warning.main' }} />
      <Box component="span" sx={{ fontSize: '1.0625rem', flex: '1 1 auto' }}>
        {aviso.texto}
      </Box>
      {!enLaLista && (
        <Boton
          variante="texto"
          onClick={() => {
            alCerrar();
            navegar('/recordatorios');
          }}
        >
          Ver recordatorios
        </Boton>
      )}
      <IconButton aria-label="Cerrar el aviso" title="Cerrar el aviso" onClick={alCerrar}>
        <CloseIcon />
      </IconButton>
    </Box>
  );
}

/**
 * Región `aria-live` del aviso, siempre presente (vacía si no hay aviso) para que el lector de
 * pantalla lo anuncie al aparecer, sin interrumpir. Vive fuera de la aplicación: MUI marca
 * `aria-hidden` todo lo que está al lado de un diálogo o de un cajón abierto, y desde ahí no se
 * oiría (E5-05). Con un diálogo abierto se anuncia desde adentro de él (lo de afuera de un diálogo
 * modal puede no leerse); si no, desde el body, y si algo le pone `aria-hidden`, se lo quita.
 */
export function RegionAvisos({ aviso }: { aviso: Aviso | null }) {
  const dialogo = useDialogoAbierto();
  const ref = useRef<HTMLDivElement>(null);
  const destino = dialogo ?? document.body;

  useEffect(() => {
    const region = ref.current;
    if (!region) return;
    const destapar = () => {
      if (region.getAttribute('aria-hidden') === 'true') region.removeAttribute('aria-hidden');
    };
    destapar();
    const observador = new MutationObserver(destapar);
    observador.observe(region, { attributes: true, attributeFilter: ['aria-hidden'] });
    return () => observador.disconnect();
  }, [destino]);

  return createPortal(
    // Sin role="status": con la región siempre presente, competiría con los mensajes de estado de
    // cada pantalla. aria-live alcanza para que se anuncie sin interrumpir.
    <Box ref={ref} aria-live="polite" aria-atomic="true" data-avisos-recordatorios sx={SOLO_LECTOR}>
      {aviso && <span key={aviso.id}>{aviso.texto}</span>}
    </Box>,
    destino,
  );
}
