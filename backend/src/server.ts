import { crearApp } from './app';
import { config } from './config';

crearApp().listen(config.puerto, () => {
  console.info(`SGSM-RC API escuchando en http://localhost:${config.puerto}`);
});
