import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { crearApp } from './app';
import { config } from './config';
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
