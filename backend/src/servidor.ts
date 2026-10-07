import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { crearApp } from './app';
import { config } from './config';
import { cifrarPendientes } from './modulos/biometria/cifrado-biometrico';
import { iniciarTemporizador } from './modulos/recordatorios/temporizador';
import { iniciarTiempoReal } from './modulos/tiempo-real/tiempo-real';

export interface ServidorSgsm {
  servidor: http.Server;
  /** Puerto en el que quedó escuchando (útil con puerto 0). */
  puerto: number;
  /** Detiene el temporizador, cierra el tiempo real y deja de aceptar pedidos. */
  cerrar(): Promise<void>;
}

/**
 * Levanta el proceso completo: la API (crearApp), el tiempo real en /api/tiempo-real sobre el
 * mismo puerto y, si está encendido, el temporizador de recordatorios (T501). `crearApp()` no
 * arranca nada de esto: las pruebas de la API no corren el temporizador.
 *
 * Antes de escuchar cifra los datos biométricos pendientes (T705): así ningún rostro queda en
 * claro después de la migración, aunque nadie corra `npm run biometria:cifrar`.
 */
export async function levantarServidor({
  puerto = config.puerto,
  temporizador = config.recordatorios.temporizador,
  ciclo,
}: {
  puerto?: number;
  temporizador?: boolean;
  /** Reemplaza el ciclo del temporizador (pruebas). */
  ciclo?: () => Promise<unknown>;
} = {}): Promise<ServidorSgsm> {
  await revisarCifradoBiometrico();
  const servidor = http.createServer(crearApp());
  const tiempoReal = iniciarTiempoReal(servidor);
  await new Promise<void>((ok, falla) => {
    servidor.once('error', falla);
    servidor.listen(puerto, () => ok());
  });
  const recordatorios = temporizador ? iniciarTemporizador(ciclo ? { ciclo } : {}) : null;

  return {
    servidor,
    puerto: (servidor.address() as AddressInfo).port,
    async cerrar() {
      await recordatorios?.detener();
      await tiempoReal.cerrar();
      const cerrado = new Promise<void>((ok) => servidor.close(() => ok()));
      servidor.closeIdleConnections();
      await cerrado;
    },
  };
}

/** Si falla (por ejemplo, sin base) no impide arrancar: se reintenta en el próximo arranque. */
async function revisarCifradoBiometrico() {
  try {
    const { cifrados, ilegibles } = await cifrarPendientes();
    if (cifrados > 0) {
      console.info(`Biometría: ${cifrados} registro(s) cifrado(s) con la clave actual`);
    }
    if (ilegibles.length > 0) {
      console.error(
        `Biometría: ${ilegibles.length} registro(s) que no se pueden descifrar (usuarios ` +
          `${ilegibles.join(', ')}). Revisar BIOMETRIA_CLAVE y BIOMETRIA_CLAVE_ANTERIOR.`,
      );
    }
  } catch (e) {
    console.error('Biometría: no se pudo revisar el cifrado al arrancar', e);
  }
}
