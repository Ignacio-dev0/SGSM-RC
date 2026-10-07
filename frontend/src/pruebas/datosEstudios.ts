// Datos de ejemplo de los estudios (E5 · fase 3) para las pruebas de pantallas.
import { http, HttpResponse } from 'msw';
import type { Estudio, TipoEstudio } from '../api/estudios';
import { campoFechaHora } from '../utilidades/campoFechaHora';
import { paciente } from './datosPacientes';
import { servidor } from './servidor';

export const TIPOS_ESTUDIO: TipoEstudio[] = [
  { id: 1, nombre: 'Laboratorio', preparacionPorDefecto: 'Ayuno de 8 horas' },
  { id: 2, nombre: 'Radiografía', preparacionPorDefecto: 'Retirar alhajas y objetos metálicos' },
  { id: 3, nombre: 'Interconsulta', preparacionPorDefecto: null },
];

/** Un estudio programado de Rosa Benítez: Rx de tórax el 08/10 a las 10:00 de Argentina. */
export const estudio = (extra: Partial<Estudio> = {}): Estudio => ({
  id: 60,
  pacienteId: 7,
  tipoEstudio: { id: 2, nombre: 'Radiografía' },
  nombre: 'Rx de tórax frente y perfil',
  fechaHora: '2026-10-08T13:00:00.000Z',
  preparacion: 'Retirar alhajas y objetos metálicos',
  observaciones: 'Trasladar en silla de ruedas',
  estado: 'PROGRAMADO',
  motivoCancelacion: null,
  realizadoEn: null,
  confirmadoPor: null,
  observacionesRealizacion: null,
  creadoPor: { id: 2, nombre: 'Ferreyra, Martín' },
  creadoEn: '2026-10-07T12:00:00.000Z',
  ...extra,
});

export const REALIZADO = estudio({
  id: 62,
  tipoEstudio: { id: 4, nombre: 'Ecografía' },
  nombre: 'Ecografía abdominal',
  fechaHora: '2026-10-06T13:00:00.000Z',
  preparacion: null,
  observaciones: null,
  estado: 'REALIZADO',
  realizadoEn: '2026-10-06T13:05:00.000Z',
  confirmadoPor: { id: 3, nombre: 'Acosta, Sofía' },
  observacionesRealizacion: 'Sin novedad',
});

export const CANCELADO = estudio({
  id: 63,
  tipoEstudio: { id: 3, nombre: 'Interconsulta' },
  nombre: 'Interconsulta con fonoaudiología',
  fechaHora: '2026-10-05T15:00:00.000Z',
  preparacion: null,
  observaciones: null,
  estado: 'CANCELADO',
  motivoCancelacion: 'Se suspendió el turno',
});

/** Como los ordena el servidor (D35): programados (el más próximo arriba) y después el resto. */
export const ESTUDIOS: Estudio[] = [
  estudio(),
  estudio({
    id: 61,
    tipoEstudio: { id: 1, nombre: 'Laboratorio' },
    nombre: 'Hemograma completo',
    fechaHora: '2026-10-09T11:00:00.000Z',
    preparacion: 'Ayuno de 8 horas',
    observaciones: null,
  }),
  REALIZADO,
  CANCELADO,
];

/** Error de la API con su código, como lo responde el backend. */
export const errorApi = (status: number, codigo: string, mensaje = 'Error de la API') =>
  HttpResponse.json({ error: { codigo, mensaje } }, { status });

/**
 * Responde la lista de estudios del paciente 7 (y cada uno por su id). Devuelve cuántas veces se
 * pidió la lista, para comprobar que se vuelve a pedir después de cada acción.
 */
export function conEstudios(...estudios: Estudio[]) {
  const pedidos = { lista: 0 };
  servidor.use(
    http.get('*/api/pacientes/7/estudios', () => {
      pedidos.lista++;
      return HttpResponse.json({ data: estudios });
    }),
    http.get('*/api/estudios/:id', ({ params }) => {
      const e = estudios.find((x) => x.id === Number(params.id));
      return e
        ? HttpResponse.json({ data: e })
        : errorApi(404, 'NO_ENCONTRADO', 'El estudio no existe');
    }),
  );
  return pedidos;
}

/** Cuenta los pedidos de recordatorios (la insignia de la barra): se renuevan tras cada acción. */
export function contarRecordatorios() {
  const pedidos = { total: 0 };
  servidor.use(
    http.get('*/api/recordatorios', () => {
      pedidos.total++;
      return HttpResponse.json({
        data: [],
        meta: { total: 0, urgentes: 0, ahora: new Date().toISOString() },
      });
    }),
  );
  return pedidos;
}

export const validarRostro = () =>
  servidor.use(
    http.post('*/api/biometria/validar', () =>
      HttpResponse.json({ data: { valido: true, validacionToken: 'tok-ok', similitud: 0.9 } }),
    ),
  );

/** Respuestas por defecto para la pestaña de estudios, con la biometría simulada. */
export function prepararEstudios() {
  vi.stubEnv('VITE_BIOMETRIA_MODO', 'simulado');
  servidor.use(
    http.get('*/api/pacientes/7', () => HttpResponse.json({ data: paciente() })),
    http.get('*/api/tipos-estudio', () => HttpResponse.json({ data: TIPOS_ESTUDIO })),
  );
  conEstudios(...ESTUDIOS);
}

/** Deshace prepararEstudios. */
export function restaurarEstudios() {
  vi.unstubAllEnvs();
}

/** "AAAA-MM-DDTHH:mm" en hora de Argentina, `horas` después de ahora (para el campo datetime-local). */
export const localEnHoras = (horas: number) =>
  campoFechaHora(new Date(Date.now() + horas * 3_600_000));
