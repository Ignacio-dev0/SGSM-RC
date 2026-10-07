// Servidor de la API simulado con MSW para las pruebas de pantallas.
import { setupServer } from 'msw/node';

export const servidor = setupServer();
