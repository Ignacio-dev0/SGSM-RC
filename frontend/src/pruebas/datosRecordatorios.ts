// Datos de ejemplo de recordatorios y del tiempo real para las pruebas de pantallas.
import { http, HttpResponse, type WebSocketHandlerConnection } from 'msw';
import type { MetaRecordatorios, Recordatorio } from '../api/recordatorios';
import { SALAS } from './datosPacientes';
import { canalTiempoReal, servidor } from './servidor';

/** Hora del servidor en las pruebas: 12:00 en Argentina del 7/10. */
export const AHORA_SERVIDOR = '2026-10-07T15:00:00.000Z';

/** `minutos` después (o antes, si es negativo) de la hora del servidor, en ISO. */
export const aLos = (minutos: number) =>
  new Date(Date.parse(AHORA_SERVIDOR) + minutos * 60_000).toISOString();

/** Toma de Paracetamol de Rosa Benítez atrasada 8 min (11:52), prioridad ALTA. */
export const recordatorio = (extra: Partial<Recordatorio> = {}): Recordatorio => ({
  id: 12,
  tipo: 'MEDICAMENTO',
  estado: 'PENDIENTE',
  prioridad: 'ALTA',
  fechaHoraObjetivo: aLos(-8),
  generadoEn: aLos(-38),
  vencidoEn: null,
  paciente: { id: 7, apellido: 'Benítez', nombre: 'Rosa', dni: '30111222' },
  cama: { numero: 'A-01', sala: { id: 1, nombre: 'Sala A – Neurorrehabilitación' } },
  prescripcion: {
    id: 40,
    medicamento: 'Paracetamol',
    presentacion: 'Comprimidos 500 mg',
    dosis: 500,
    unidadDosis: 'mg',
    via: 'ORAL',
    frecuenciaHoras: 8,
  },
  estudio: null,
  atendidoEn: null,
  atendidoPor: null,
  suministroId: null,
  motivoNoAdministrado: null,
  ...extra,
});

/**
 * Recordatorio del estudio 60 de Rosa Benítez (el de datosEstudios.ts): Rx de tórax en 5 min
 * (12:05). Los de estudio tienen siempre prioridad MEDIA y no traen prescripción.
 */
export const recordatorioDeEstudio = (extra: Partial<Recordatorio> = {}): Recordatorio =>
  recordatorio({
    id: 20,
    tipo: 'ESTUDIO',
    prioridad: 'MEDIA',
    fechaHoraObjetivo: aLos(5),
    generadoEn: aLos(-25),
    prescripcion: null,
    estudio: {
      id: 60,
      nombre: 'Rx de tórax frente y perfil',
      tipoEstudio: 'Radiografía',
      preparacion: 'Retirar alhajas y objetos metálicos',
    },
    ...extra,
  });

/** Cuatro tomas como las ordena el servidor (por urgencia): una de cada nivel. */
export const RECORDATORIOS: Recordatorio[] = [
  recordatorio({
    id: 10,
    estado: 'VENCIDO',
    fechaHoraObjetivo: aLos(-45),
    generadoEn: aLos(-75),
    vencidoEn: aLos(-15),
    paciente: { id: 8, apellido: 'Gómez', nombre: 'Juan', dni: '28999111' },
    cama: { numero: 'B-03', sala: { id: 2, nombre: 'Sala B – Traumatología' } },
    prescripcion: {
      id: 41,
      medicamento: 'Enalapril',
      presentacion: 'Comprimidos 10 mg',
      dosis: 10,
      unidadDosis: 'mg',
      via: 'ORAL',
      frecuenciaHoras: 12,
    },
  }),
  recordatorio(),
  recordatorio({
    id: 13,
    prioridad: 'MEDIA',
    fechaHoraObjetivo: aLos(12),
    paciente: { id: 9, apellido: 'Luna', nombre: 'Ana', dni: '33444555' },
    cama: { numero: 'A-04', sala: { id: 1, nombre: 'Sala A – Neurorrehabilitación' } },
    prescripcion: {
      id: 42,
      medicamento: 'Ceftriaxona',
      presentacion: 'Frasco ampolla 1 g',
      dosis: 1000,
      unidadDosis: 'mg',
      via: 'INTRAVENOSA',
      frecuenciaHoras: 12,
    },
  }),
  recordatorio({
    id: 14,
    prioridad: 'BAJA',
    fechaHoraObjetivo: aLos(25),
    paciente: { id: 7, apellido: 'Benítez', nombre: 'Rosa', dni: '30111222' },
    prescripcion: {
      id: 43,
      medicamento: 'Omeprazol',
      presentacion: 'Cápsulas 20 mg',
      dosis: 20,
      unidadDosis: 'mg',
      via: 'ORAL',
      frecuenciaHoras: 24,
    },
  }),
];

/** Respuesta de GET /api/recordatorios con su `meta` calculada como en el servidor. */
export const respuestaRecordatorios = (
  data: Recordatorio[],
  meta: Partial<MetaRecordatorios> = {},
) =>
  HttpResponse.json({
    data,
    meta: {
      total: data.length,
      urgentes: data.filter((r) => r.prioridad === 'ALTA' || r.estado === 'VENCIDO').length,
      ahora: AHORA_SERVIDOR,
      ...meta,
    },
  });

/** La lista para atender (y las salas del filtro). */
export function simularRecordatorios(
  data: Recordatorio[] = RECORDATORIOS,
  meta: Partial<MetaRecordatorios> = {},
) {
  servidor.use(
    http.get('*/api/recordatorios', () => respuestaRecordatorios(data, meta)),
    http.get('*/api/salas', () => HttpResponse.json({ data: SALAS })),
  );
}

export type ClienteTiempoReal = WebSocketHandlerConnection['client'];

/**
 * Anota cada conexión de tiempo real que abre la pantalla. La respuesta por defecto (`conectado`)
 * sigue corriendo después de `alConectar`, salvo que este cierre la conexión.
 */
export function registrarConexiones(
  alConectar?: (cliente: ClienteTiempoReal, numero: number) => void,
) {
  const conexiones: ClienteTiempoReal[] = [];
  servidor.use(
    canalTiempoReal.addEventListener('connection', ({ client }) => {
      conexiones.push(client);
      alConectar?.(client, conexiones.length);
    }),
  );
  return conexiones;
}

/** Aviso del tiempo real a todas las conexiones: algo cambió en los recordatorios. */
export const avisarCambio = (nuevos = 0, vencidos = 0, momento = AHORA_SERVIDOR) =>
  canalTiempoReal.broadcast(JSON.stringify({ tipo: 'recordatorios', nuevos, vencidos, momento }));

/** Fija la hora de la tablet sin frenar los temporizadores (MSW y userEvent siguen andando). */
export function fijarHoraTablet(iso = AHORA_SERVIDOR) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(iso));
}
