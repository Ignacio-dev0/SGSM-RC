import { useEffect, useRef, useState } from 'react';
import { Box } from '@mui/material';
import GridOnOutlinedIcon from '@mui/icons-material/GridOnOutlined';
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined';
import { mensajeDeError, type Archivo } from '../../api/cliente';
import type { Formato } from '../../api/reportes';
import { Alerta, type TipoAlerta } from '../../componentes/Alerta';
import { Boton } from '../../componentes/Boton';
import { NOMBRE_FORMATO } from './etiquetas';
import { diaYMes } from './formato';

/** Cuánto se espera para liberar el archivo: liberarlo enseguida corta la descarga en algunos navegadores. */
const LIBERAR_EN_MS = 10_000;
/** Desde cuándo se avisa que el archivo tarda y se ofrece cancelar (E6-15). */
const AVISAR_DEMORA_EN_MS = 10_000;

/**
 * Entrega al navegador un archivo bajado de la API con un enlace temporal y su nombre (el del
 * servidor). El enlace se quita enseguida y el archivo en memoria se libera después.
 */
export function bajarArchivo({ blob, nombre }: Archivo, liberarEn = LIBERAR_EN_MS) {
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombre;
  enlace.hidden = true;
  document.body.append(enlace);
  enlace.click();
  enlace.remove();
  setTimeout(() => URL.revokeObjectURL(url), liberarEn);
}

const ICONOS: Record<Formato, typeof PictureAsPdfOutlinedIcon> = {
  pdf: PictureAsPdfOutlinedIcon,
  xlsx: GridOnOutlinedIcon,
};

/** Texto que leen los lectores de pantalla pero no se ve. */
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

interface Resultado {
  tipo: TipoAlerta;
  texto: string;
  /** Los filtros con los que se mostró: al cambiarlos, el aviso se va. */
  clave: string;
}

interface Opciones {
  /** El período del archivo, para decirlo al terminar ("01/10 al 07/10"). */
  periodo: { desde: string; hasta: string };
  /** Cambia con los filtros a la vista: el aviso de cómo terminó se va al cambiarlos. */
  clave: string;
}

/** "(01/10 al 07/10)" o "(07/10)": de qué período es el archivo que se bajó. */
const periodoCorto = ({ desde, hasta }: Opciones['periodo']) =>
  desde === hasta ? `(${diaYMes(desde)})` : `(${diaYMes(desde)} al ${diaYMes(hasta)})`;

/**
 * Botones "Descargar PDF" y "Descargar Excel" (secundarios: la pantalla no tiene una acción
 * llena) y el aviso de cómo terminó. Mientras se arma el archivo, el botón dice "Preparando el
 * archivo…" con su indicador y el otro espera; a los 10 s se avisa que sigue y se puede cancelar.
 * Al terminar se dice qué se bajó y de qué período; si falla, el error del servidor queda a la
 * vista. Los avisos se van al cambiar los filtros (E6-15). Devuelve las partes por separado para
 * ubicar los botones junto al resumen y el aviso debajo.
 */
export function useDescarga(
  bajar: (formato: Formato, senal: AbortSignal) => Promise<Archivo>,
  { periodo, clave }: Opciones,
) {
  const [enCurso, setEnCurso] = useState<Formato | null>(null);
  const [demorada, setDemorada] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const control = useRef<AbortController | null>(null);
  // Los filtros de este momento, para fechar el aviso de una descarga que termina después.
  const claveActual = useRef(clave);
  useEffect(() => {
    claveActual.current = clave;
  }, [clave]);

  const descargar = async (formato: Formato) => {
    const esta = new AbortController();
    control.current = esta;
    const delPeriodo = periodoCorto(periodo);
    setEnCurso(formato);
    setResultado(null);
    setDemorada(false);
    const aviso = setTimeout(() => setDemorada(true), AVISAR_DEMORA_EN_MS);
    try {
      const archivo = await bajar(formato, esta.signal);
      // Cancelada mientras llegaba: no se entrega.
      if (esta.signal.aborted) return;
      bajarArchivo(archivo);
      setResultado({
        tipo: 'exito',
        texto: `Se descargó ${archivo.nombre} ${delPeriodo}.`,
        clave: claveActual.current,
      });
    } catch (e) {
      if (esta.signal.aborted) return;
      setResultado({
        tipo: 'error',
        texto: `No se pudo descargar el ${NOMBRE_FORMATO[formato]}. ${mensajeDeError(e)}`,
        clave: claveActual.current,
      });
    } finally {
      clearTimeout(aviso);
      if (control.current === esta) {
        control.current = null;
        setEnCurso(null);
        setDemorada(false);
      }
    }
  };

  const cancelar = () => {
    control.current?.abort();
    control.current = null;
    setEnCurso(null);
    setDemorada(false);
    setResultado({ tipo: 'info', texto: 'Se canceló la descarga.', clave: claveActual.current });
  };

  const botones = (
    <Box role="group" aria-label="Descargar" sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
      {(['pdf', 'xlsx'] as const).map((formato) => {
        const Icono = ICONOS[formato];
        return (
          <Boton
            key={formato}
            variante="secundario"
            startIcon={<Icono />}
            cargando={enCurso === formato}
            disabled={enCurso !== null && enCurso !== formato}
            onClick={() => void descargar(formato)}
          >
            {enCurso === formato
              ? 'Preparando el archivo…'
              : `Descargar ${NOMBRE_FORMATO[formato]}`}
          </Boton>
        );
      })}
      {/* El cambio de texto del botón no siempre se anuncia: se avisa aparte. */}
      <Box role="status" sx={SOLO_LECTOR}>
        {enCurso && 'Preparando el archivo…'}
      </Box>
    </Box>
  );

  const aviso =
    enCurso && demorada ? (
      <Alerta
        tipo="info"
        accion={
          <Boton variante="texto" onClick={cancelar}>
            Cancelar
          </Boton>
        }
      >
        {`Sigue preparándose el ${NOMBRE_FORMATO[enCurso]}… Con muchos datos puede tardar un poco más.`}
      </Alerta>
    ) : (
      resultado &&
      resultado.clave === clave && (
        <Alerta tipo={resultado.tipo} alCerrar={() => setResultado(null)}>
          {resultado.texto}
        </Alerta>
      )
    );

  return { botones, aviso, enCurso: enCurso !== null };
}
