import { useEffect, useRef, useState } from 'react';
import { Box, Paper, Typography } from '@mui/material';
import { modoBiometria, useMotorFacial } from '../../biometria/motor';
import { Alerta } from '../../componentes/Alerta';
import { Boton } from '../../componentes/Boton';
import { EncabezadoPagina } from '../../componentes/EncabezadoPagina';

interface Metricas {
  detecciones: number;
  conUnRostro: number;
  tiempoTotalMs: number;
  ultimoMs: number;
  rostros: number;
  brillo: number | null;
  /** Distancia entre dos patrones seguidos del mismo rostro: cuánto "tiembla" el patrón. */
  variacion: number | null;
}

const INICIALES: Metricas = {
  detecciones: 0,
  conUnRostro: 0,
  tiempoTotalMs: 0,
  ultimoMs: 0,
  rostros: 0,
  brillo: null,
  variacion: null,
};

/** Brillo promedio (0–255) de una muestra reducida del cuadro. */
function brilloDe(video: HTMLVideoElement) {
  const lienzo = document.createElement('canvas');
  lienzo.width = 32;
  lienzo.height = 24;
  const ctx = lienzo.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, 32, 24);
  const { data } = ctx.getImageData(0, 0, 32, 24);
  let suma = 0;
  let n = 0;
  for (let i = 0; i < data.length; i += 4) {
    suma += 0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!;
    n++;
  }
  return n ? suma / n : null;
}

const distancia = (a: number[], b: number[]) => Math.hypot(...a.map((v, i) => v - b[i]!));

function Metrica({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Typography variant="body2" color="text.secondary">
        {etiqueta}
      </Typography>
      <Typography variant="h5" component="p" aria-label={etiqueta}>
        {valor}
      </Typography>
    </Paper>
  );
}

/**
 * Prueba de concepto del reconocimiento facial (T401 · RF02): pensada para correrla en la tablet
 * real del hospital y medir tiempo de detección, estabilidad y comportamiento con poca luz.
 * Los resultados esperados y cómo interpretarlos están en docs/biometria.md.
 */
export function PruebaReconocimiento() {
  const motor = useMotorFacial();
  const video = useRef<HTMLVideoElement>(null);
  const [activa, setActiva] = useState(false);
  const [m, setM] = useState<Metricas>(INICIALES);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!activa) return;
    let cancelado = false;
    let flujo: MediaStream | null = null;
    let temporizador: ReturnType<typeof setTimeout> | undefined;
    let anterior: number[] | null = null;

    (async () => {
      try {
        flujo = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user' },
          audio: false,
        });
        if (cancelado || !video.current) return;
        video.current.srcObject = flujo;
        await video.current.play();
        await motor.cargar();
        const ciclo = async () => {
          if (cancelado || !video.current) return;
          const inicio = performance.now();
          const d = await motor.detectar(video.current);
          const ms = performance.now() - inicio;
          const brillo = brilloDe(video.current);
          const variacion = d.descriptor && anterior ? distancia(d.descriptor, anterior) : null;
          anterior = d.descriptor;
          if (cancelado) return;
          setM((x) => ({
            detecciones: x.detecciones + 1,
            conUnRostro: x.conUnRostro + (d.rostros === 1 ? 1 : 0),
            tiempoTotalMs: x.tiempoTotalMs + ms,
            ultimoMs: ms,
            rostros: d.rostros,
            brillo,
            variacion: variacion ?? x.variacion,
          }));
          temporizador = setTimeout(() => void ciclo(), 300);
        };
        void ciclo();
      } catch {
        if (!cancelado) setError('No se pudo usar la cámara. Revise los permisos del navegador.');
      }
    })();

    return () => {
      cancelado = true;
      clearTimeout(temporizador);
      flujo?.getTracks().forEach((t) => t.stop());
    };
  }, [activa, motor]);

  if (modoBiometria() === 'simulado') {
    return (
      <>
        <EncabezadoPagina titulo="Prueba de reconocimiento facial" volverA="/biometria" />
        <Alerta tipo="info">
          La prueba de concepto necesita el modo cámara (VITE_BIOMETRIA_MODO=camara) y, en lo
          posible, la tablet real del hospital.
        </Alerta>
      </>
    );
  }

  const promedio = m.detecciones ? m.tiempoTotalMs / m.detecciones : 0;
  const luz =
    m.brillo === null
      ? '—'
      : m.brillo < 60
        ? 'Poca luz'
        : m.brillo > 220
          ? 'Demasiada luz'
          : 'Buena';

  return (
    <>
      <EncabezadoPagina
        titulo="Prueba de reconocimiento facial"
        subtitulo="Mida cómo funciona el reconocimiento en este dispositivo antes de usarlo en una sala."
        volverA="/biometria"
        acciones={
          <Boton
            onClick={() => {
              setM(INICIALES);
              setActiva((a) => !a);
            }}
          >
            {activa ? 'Detener' : 'Iniciar prueba'}
          </Boton>
        }
      />
      {error && <Alerta tipo="error">{error}</Alerta>}
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
        <Box
          sx={{ bgcolor: 'grey.900', borderRadius: 3, overflow: 'hidden', aspectRatio: '4 / 3' }}
        >
          <video
            ref={video}
            muted
            playsInline
            style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }}
          />
        </Box>
        <Box
          sx={{ display: 'grid', gap: 2, gridTemplateColumns: '1fr 1fr', alignContent: 'start' }}
        >
          <Metrica etiqueta="Detecciones" valor={String(m.detecciones)} />
          <Metrica etiqueta="Tiempo promedio de detección" valor={`${Math.round(promedio)} ms`} />
          <Metrica etiqueta="Última detección" valor={`${Math.round(m.ultimoMs)} ms`} />
          <Metrica
            etiqueta="Con un solo rostro"
            valor={`${m.detecciones ? Math.round((100 * m.conUnRostro) / m.detecciones) : 0} %`}
          />
          <Metrica etiqueta="Rostros en cuadro" valor={String(m.rostros)} />
          <Metrica etiqueta="Luz" valor={luz} />
          <Metrica
            etiqueta="Variación del patrón"
            valor={m.variacion === null ? '—' : m.variacion.toFixed(3)}
          />
        </Box>
      </Box>
    </>
  );
}
