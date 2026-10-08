// Datos de ejemplo del módulo de prescripciones para las pruebas de pantallas.
import { http, HttpResponse } from 'msw';
import type { Insumo, Prescripcion } from '../api/tipos';
import { paciente, simularCatalogosDePacientes } from './datosPacientes';
import { servidor } from './servidor';

export const MEDICAMENTOS: Insumo[] = [
  {
    id: 1,
    nombre: 'Paracetamol',
    tipo: 'MEDICAMENTO',
    unidadMedida: 'mg',
    presentacion: 'Comprimidos 500 mg',
    activo: true,
  },
  {
    id: 2,
    nombre: 'Enalapril',
    tipo: 'MEDICAMENTO',
    unidadMedida: 'mg',
    presentacion: 'Comprimidos 10 mg',
    activo: true,
  },
];

export const prescripcion = (extra: Partial<Prescripcion> = {}): Prescripcion => ({
  id: 40,
  pacienteId: 7,
  medicamento: {
    id: 1,
    nombre: 'Paracetamol',
    presentacion: 'Comprimidos 500 mg',
    unidadMedida: 'mg',
  },
  dosis: 500,
  unidadDosis: 'mg',
  frecuenciaHoras: 8,
  via: 'ORAL',
  fechaInicio: '2026-10-07T11:00:00.000Z',
  fechaFin: null,
  observaciones: 'Si fiebre',
  estado: 'VIGENTE',
  motivoCambioEstado: null,
  prescriptor: 'Ferreyra, Martín',
  creadoEn: '2026-10-07T11:00:00.000Z',
  proximaToma: '2026-10-07T19:00:00.000Z',
  ultimasAdministraciones: [
    { id: 3, fechaHora: '2026-10-07T11:05:00.000Z', cantidad: 500, usuario: 'Acosta, Sofía' },
  ],
  agenda: ['2026-10-07T19:00:00.000Z', '2026-10-08T03:00:00.000Z', '2026-10-08T11:00:00.000Z'],
  ...extra,
});

/** 15:00 en Argentina del 7/10: las 19:00 UTC de la prescripción de ejemplo son "hoy 16:00". */
export const AHORA = '2026-10-07T18:00:00.000Z';

/** Fija "ahora" sin frenar los temporizadores: userEvent y MSW siguen funcionando. */
export function fijarAhora(iso = AHORA) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(iso));
}

/** jsdom no evalúa media queries: simula una pantalla de menos de md (900 px). */
const matchMediaOriginal = window.matchMedia;
export function simularPantallaAngosta() {
  window.matchMedia = ((consulta: string) => ({
    matches: consulta.includes('899.95'),
    media: consulta,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}

export const errorDelServidor = () =>
  HttpResponse.json(
    { error: { codigo: 'ERROR_INTERNO', mensaje: 'Error inesperado del servidor' } },
    { status: 500 },
  );

/** Respuestas por defecto de la API para las pantallas de prescripciones. */
export function prepararPrescripciones() {
  simularCatalogosDePacientes();
  servidor.use(
    http.get('*/api/pacientes/7', () => HttpResponse.json({ data: paciente() })),
    http.get('*/api/insumos', () => HttpResponse.json({ data: MEDICAMENTOS })),
  );
}

/** Deshace fijarAhora y simularPantallaAngosta. */
export function restaurarPruebas() {
  vi.useRealTimers();
  window.matchMedia = matchMediaOriginal;
}
