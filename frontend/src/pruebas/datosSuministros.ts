// Datos de ejemplo de los módulos de suministros para las pruebas de pantallas.
import { http, HttpResponse } from 'msw';
import type { Insumo, Prescripcion, Suministro } from '../api/tipos';
import { listaDePacientes, paciente } from './datosPacientes';
import { servidor } from './servidor';

/** Momento relativo a ahora, en ISO: las pantallas calculan "toca ahora", "atrasada"… */
export const enMinutos = (minutos: number) => new Date(Date.now() + minutos * 60_000).toISOString();

export const vigente: Prescripcion = {
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
  observaciones: null,
  estado: 'VIGENTE',
  motivoCambioEstado: null,
  prescriptor: 'Ferreyra, Martín',
  creadoEn: '2026-10-07T11:00:00.000Z',
  proximaToma: enMinutos(10),
  ultimasAdministraciones: [],
};

export const otraVigente = (
  id: number,
  nombre: string,
  dosis: number,
  extra: Partial<Prescripcion> = {},
): Prescripcion => ({
  ...vigente,
  id,
  medicamento: { ...vigente.medicamento, id, nombre },
  dosis,
  ...extra,
});

export const conPrescripciones = (...prescripciones: Prescripcion[]) =>
  servidor.use(
    http.get('*/api/pacientes/7/prescripciones', () => HttpResponse.json({ data: prescripciones })),
  );

export const INSUMOS: Insumo[] = [
  {
    id: 20,
    nombre: 'Gasa estéril',
    tipo: 'INSUMO',
    unidadMedida: 'unidad',
    presentacion: '',
    activo: true,
  },
  {
    id: 21,
    nombre: 'Pañal talle M',
    tipo: 'INSUMO',
    unidadMedida: 'unidad',
    presentacion: 'x10',
    activo: true,
  },
];

export const suministro = (extra: Partial<Suministro> = {}): Suministro => ({
  id: 90,
  tipo: 'MEDICAMENTO',
  fechaHora: new Date(Date.now() - 3_600_000).toISOString(),
  paciente: { id: 7, apellido: 'Benítez', nombre: 'Rosa', dni: '30111222', cama: 'A-01' },
  usuario: { id: 3, nombre: 'Acosta, Sofía' },
  prescripcion: {
    id: 40,
    medicamento: 'Paracetamol',
    dosis: 500,
    unidadDosis: 'mg',
    frecuenciaHoras: 8,
  },
  tomaProgramada: new Date(Date.now() - 3_600_000).toISOString(),
  detalles: [
    { insumoId: 1, insumo: 'Paracetamol', tipoInsumo: 'MEDICAMENTO', cantidad: 500, unidad: 'mg' },
  ],
  observaciones: null,
  validadoBiometricamente: true,
  corregido: false,
  motivoCorreccion: null,
  corregidoEn: null,
  corregidoPor: null,
  corregibleHasta: new Date(Date.now() + 23 * 3_600_000).toISOString(),
  ...extra,
});

export const validarRostro = () =>
  servidor.use(
    http.post('*/api/biometria/validar', () =>
      HttpResponse.json({ data: { valido: true, validacionToken: 'tok-ok', similitud: 0.9 } }),
    ),
  );

/** Respuestas por defecto de la API para las pantallas de suministros, en modo de demostración. */
export function prepararSuministros() {
  vi.stubEnv('VITE_BIOMETRIA_MODO', 'simulado');
  servidor.use(
    http.get('*/api/pacientes', () => listaDePacientes([paciente()])),
    http.get('*/api/pacientes/7', () => HttpResponse.json({ data: paciente() })),
    http.get('*/api/pacientes/7/prescripciones', () => HttpResponse.json({ data: [vigente] })),
    http.get('*/api/insumos', () => HttpResponse.json({ data: INSUMOS })),
    http.get('*/api/suministros/responsables', () =>
      HttpResponse.json({ data: [{ id: 3, nombre: 'Acosta, Sofía' }] }),
    ),
  );
}
