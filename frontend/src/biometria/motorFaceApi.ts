import type * as FaceApiTipos from '@vladmandic/face-api';
import type { Deteccion, MotorFacial } from './motor';

/**
 * Motor de reconocimiento facial con @vladmandic/face-api (T401 · T402 · RF02), que corre en
 * el navegador de la tablet: el video nunca sale del dispositivo, solo el patrón de 128 valores.
 *
 * - Detector: TinyFaceDetector (liviano, pensado para dispositivos móviles).
 * - 68 puntos de referencia para alinear el rostro.
 * - Modelo de reconocimiento que genera el patrón (descriptor) de 128 valores.
 *
 * La librería (~1,3 MB con TensorFlow.js) se carga recién cuando se usa la cámara, y los
 * modelos se sirven desde /models (los copia scripts/copiar-modelos.mjs).
 */

type FaceApi = typeof FaceApiTipos;

let faceapi: FaceApi | null = null;
let cargando: Promise<void> | null = null;

async function cargar() {
  cargando ??= (async () => {
    const lib = await import('@vladmandic/face-api');
    await Promise.all([
      lib.nets.tinyFaceDetector.loadFromUri('/models'),
      lib.nets.faceLandmark68Net.loadFromUri('/models'),
      lib.nets.faceRecognitionNet.loadFromUri('/models'),
    ]);
    faceapi = lib;
  })();
  try {
    await cargando;
  } catch (e) {
    cargando = null;
    throw e;
  }
}

async function detectar(video: HTMLVideoElement): Promise<Deteccion> {
  if (!faceapi) await cargar();
  const lib = faceapi!;
  const opciones = new lib.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 });
  const resultados = await lib
    .detectAllFaces(video, opciones)
    .withFaceLandmarks()
    .withFaceDescriptors();
  return {
    rostros: resultados.length,
    descriptor: resultados.length === 1 ? Array.from(resultados[0]!.descriptor) : null,
  };
}

export const motorFaceApi: MotorFacial = { cargar, detectar };
