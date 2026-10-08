import { config } from './config';
import { levantarServidor } from './servidor';

// Punto de entrada (npm run dev / node dist/server.js): todo el arranque está en servidor.ts.
levantarServidor()
  .then(({ puerto, cerrar }) => {
    console.info(`SGSM-RC API escuchando en http://localhost:${puerto}`);
    console.info(
      config.recordatorios.temporizador
        ? `Temporizador de recordatorios: cada ${config.recordatorios.intervaloSegundos} s`
        : 'Temporizador de recordatorios apagado (RECORDATORIOS_TEMPORIZADOR=false)',
    );
    const apagar = () => {
      cerrar().finally(() => process.exit(0));
    };
    process.once('SIGTERM', apagar);
    process.once('SIGINT', apagar);
  })
  .catch((e: unknown) => {
    console.error('No se pudo iniciar la API', e);
    process.exit(1);
  });
