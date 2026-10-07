import { createContext, useContext } from 'react';
import { motorFaceApi } from './motorFaceApi';

/** Resultado de analizar un cuadro de la cámara. */
export interface Deteccion {
  /** Cantidad de rostros en el cuadro: la captura exige exactamente uno. */
  rostros: number;
  /** Patrón facial de 128 valores, cuando hay un solo rostro. */
  descriptor: number[] | null;
}

/** Lo que la pantalla necesita del reconocimiento facial; face-api queda detrás (T401, T402). */
export interface MotorFacial {
  cargar(): Promise<void>;
  detectar(video: HTMLVideoElement): Promise<Deteccion>;
}

export type ModoBiometria = 'camara' | 'simulado';

/**
 * Modo de la biometría: `camara` (por defecto) o `simulado` para demostraciones sin cámara,
 * configurado con VITE_BIOMETRIA_MODO. Se lee en cada uso para poder cambiarlo en las pruebas.
 */
export const modoBiometria = (): ModoBiometria =>
  import.meta.env.VITE_BIOMETRIA_MODO === 'simulado' ? 'simulado' : 'camara';

export const ContextoMotor = createContext<MotorFacial>(motorFaceApi);

export const useMotorFacial = () => useContext(ContextoMotor);
