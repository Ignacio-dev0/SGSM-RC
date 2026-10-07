import { useEffect, useRef, useState } from 'react';
import { Box, CircularProgress, Typography } from '@mui/material';
import FaceRetouchingNaturalIcon from '@mui/icons-material/FaceRetouchingNatural';
import { Alerta } from '../componentes/Alerta';
import { Boton } from '../componentes/Boton';
import { modoBiometria, useMotorFacial } from './motor';
import { FOTO_SIMULADA, descriptorDesconocido, descriptorSimulado } from './simulado';

export interface RostroCapturado {
  descriptor: number[];
  /** Foto JPEG en data URL (para registrar la foto de referencia). */
  foto: string;
}

interface Props {
  /** Nombre de usuario de la persona: en modo demostración se simula su rostro. */
  persona: string;
  alCapturar: (r: RostroCapturado) => void;
}

type Estado = 'iniciando' | 'buscando' | 'varios' | 'listo' | 'error';

const MENSAJES: Record<Exclude<Estado, 'error'>, string> = {
  iniciando: 'Encendiendo la cámara…',
  buscando: 'Mire a la cámara, con buena luz y la cara descubierta.',
  varios: 'Hay más de un rostro: quede solo usted frente a la tablet.',
  listo: 'Rostro capturado.',
};

/** Detecciones seguidas con un solo rostro antes de capturar (evita capturas movidas). */
const DETECCIONES_ESTABLES = 2;
const INTERVALO_MS = 250;

function fotoDelVideo(video: HTMLVideoElement) {
  const ancho = Math.min(480, video.videoWidth || 480);
  const alto = Math.round(ancho * ((video.videoHeight || 360) / (video.videoWidth || 480)));
  const lienzo = document.createElement('canvas');
  lienzo.width = ancho;
  lienzo.height = alto;
  lienzo.getContext('2d')?.drawImage(video, 0, 0, ancho, alto);
  return lienzo.toDataURL('image/jpeg', 0.85);
}

function CapturaConCamara({ alCapturar }: Pick<Props, 'alCapturar'>) {
  const motor = useMotorFacial();
  const video = useRef<HTMLVideoElement>(null);
  const alCapturarRef = useRef(alCapturar);
  alCapturarRef.current = alCapturar;
  const [estado, setEstado] = useState<Estado>('iniciando');
  const [error, setError] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    let cancelado = false;
    let flujo: MediaStream | null = null;
    let temporizador: ReturnType<typeof setTimeout> | undefined;

    (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('sin cámara');
        flujo = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 640 } },
          audio: false,
        });
        if (cancelado || !video.current) return;
        video.current.srcObject = flujo;
        await video.current.play();
        await motor.cargar();
        if (cancelado) return;
        setEstado('buscando');

        let seguidas = 0;
        const ciclo = async () => {
          if (cancelado || !video.current) return;
          const d = await motor.detectar(video.current);
          if (cancelado) return;
          if (d.rostros === 1 && d.descriptor) {
            seguidas++;
            if (seguidas >= DETECCIONES_ESTABLES) {
              setEstado('listo');
              alCapturarRef.current({
                descriptor: d.descriptor,
                foto: fotoDelVideo(video.current),
              });
              return;
            }
          } else {
            seguidas = 0;
            setEstado(d.rostros > 1 ? 'varios' : 'buscando');
          }
          temporizador = setTimeout(() => void ciclo(), INTERVALO_MS);
        };
        void ciclo();
      } catch {
        if (cancelado) return;
        setEstado('error');
        setError(
          'No se pudo encender la cámara. Revise que la tablet le haya dado permiso a esta página para usarla y que no la esté usando otra aplicación. Si sigue sin funcionar, avise al área de sistemas.',
        );
      }
    })();

    return () => {
      cancelado = true;
      clearTimeout(temporizador);
      flujo?.getTracks().forEach((t) => t.stop());
    };
  }, [motor, intento]);

  const reintentar = () => {
    setError(null);
    setEstado('iniciando');
    setIntento((i) => i + 1);
  };

  return (
    <Box sx={{ display: 'grid', gap: 2, justifyItems: 'center' }}>
      <Box
        sx={{
          position: 'relative',
          width: '100%',
          maxWidth: 420,
          aspectRatio: '4 / 3',
          bgcolor: 'grey.900',
          borderRadius: 3,
          overflow: 'hidden',
          border: 4,
          borderColor:
            estado === 'varios'
              ? 'warning.main'
              : estado === 'listo'
                ? 'success.main'
                : 'transparent',
        }}
      >
        <video
          ref={video}
          muted
          playsInline
          aria-label="Vista de la cámara"
          style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }}
        />
        {estado === 'iniciando' && (
          <CircularProgress
            sx={{ position: 'absolute', inset: 0, m: 'auto', color: 'common.white' }}
          />
        )}
      </Box>
      {error ? (
        <Alerta
          tipo="error"
          accion={
            <Boton variante="texto" onClick={reintentar}>
              Reintentar
            </Boton>
          }
        >
          {error}
        </Alerta>
      ) : (
        <Typography role="status" sx={{ fontWeight: 700, textAlign: 'center' }}>
          {MENSAJES[estado as keyof typeof MENSAJES]}
        </Typography>
      )}
    </Box>
  );
}

function CapturaSimulada({ persona, alCapturar }: Props) {
  return (
    <Box sx={{ display: 'grid', gap: 2 }}>
      <Alerta tipo="info" titulo="Modo de demostración">
        Esta instalación no usa la cámara: elija qué rostro simular.
      </Alerta>
      <Boton
        startIcon={<FaceRetouchingNaturalIcon />}
        onClick={() => alCapturar({ descriptor: descriptorSimulado(persona), foto: FOTO_SIMULADA })}
      >
        Simular el rostro de {persona}
      </Boton>
      <Boton
        variante="secundario"
        onClick={() => alCapturar({ descriptor: descriptorDesconocido(), foto: FOTO_SIMULADA })}
      >
        Simular otro rostro
      </Boton>
    </Box>
  );
}

/**
 * Captura del rostro (T402 · CU07): usa la cámara frontal, exige un solo rostro y entrega el
 * patrón de 128 valores y una foto. En modo demostración simula el rostro sin cámara.
 */
export function CapturaRostro(props: Props) {
  return modoBiometria() === 'simulado' ? (
    <CapturaSimulada {...props} />
  ) : (
    <CapturaConCamara alCapturar={props.alCapturar} />
  );
}
