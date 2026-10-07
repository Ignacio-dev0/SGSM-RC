import { useState } from 'react';
import { Box } from '@mui/material';
import GridOnOutlinedIcon from '@mui/icons-material/GridOnOutlined';
import PictureAsPdfOutlinedIcon from '@mui/icons-material/PictureAsPdfOutlined';
import { mensajeDeError, type Archivo } from '../../api/cliente';
import type { Formato } from '../../api/reportes';
import { Alerta } from '../../componentes/Alerta';
import { Boton } from '../../componentes/Boton';
import { NOMBRE_FORMATO } from './etiquetas';

/** Cuánto se espera para liberar el archivo: liberarlo enseguida corta la descarga en algunos navegadores. */
const LIBERAR_EN_MS = 10_000;

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
  tipo: 'exito' | 'error';
  texto: string;
}

/**
 * Botones "Descargar PDF" y "Descargar Excel" (secundarios: la pantalla no tiene una acción
 * llena) y el aviso de cómo terminó. Mientras se arma el archivo, el botón dice "Preparando el
 * archivo…" con su indicador y el otro espera; si falla, el error del servidor queda a la vista.
 * Devuelve las dos partes por separado para ubicar los botones junto al resumen y el aviso debajo.
 */
export function useDescarga(bajar: (formato: Formato) => Promise<Archivo>) {
  const [enCurso, setEnCurso] = useState<Formato | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  const descargar = async (formato: Formato) => {
    setEnCurso(formato);
    setResultado(null);
    try {
      const archivo = await bajar(formato);
      bajarArchivo(archivo);
      setResultado({ tipo: 'exito', texto: `Se descargó ${archivo.nombre}.` });
    } catch (e) {
      setResultado({
        tipo: 'error',
        texto: `No se pudo descargar el ${NOMBRE_FORMATO[formato]}. ${mensajeDeError(e)}`,
      });
    } finally {
      setEnCurso(null);
    }
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

  const aviso = resultado && (
    <Alerta tipo={resultado.tipo} alCerrar={() => setResultado(null)}>
      {resultado.texto}
    </Alerta>
  );

  return { botones, aviso };
}
