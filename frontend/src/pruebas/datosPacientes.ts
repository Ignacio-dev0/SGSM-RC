// Datos de ejemplo del módulo de pacientes para las pruebas de pantallas.
import { http, HttpResponse } from 'msw';
import type { Cama, HistorialPaciente, Paciente, Sala } from '../api/tipos';
import { servidor } from './servidor';

export const paciente = (extra: Partial<Paciente> = {}): Paciente => ({
  id: 7,
  dni: '30111222',
  nombre: 'Rosa',
  apellido: 'Benítez',
  fechaNacimiento: '1948-03-15',
  sexo: 'FEMENINO',
  obraSocial: 'IOMA',
  numeroAfiliado: null,
  diagnostico: 'ACV isquémico',
  contactoEmergenciaNombre: 'Carlos Benítez',
  contactoEmergenciaTelefono: '221 555-1234',
  observaciones: null,
  estado: 'INTERNADO',
  fechaIngreso: '2026-10-01T13:00:00.000Z',
  fechaEgreso: null,
  motivoEgreso: null,
  cama: {
    id: 1,
    numero: 'A-01',
    sala: { id: 1, nombre: 'Sala A – Neurorrehabilitación' },
    desde: '2026-10-01T13:00:00.000Z',
  },
  ...extra,
});

export const CAMAS_LIBRES: Cama[] = [
  {
    id: 2,
    numero: 'A-02',
    habilitada: true,
    sala: { id: 1, nombre: 'Sala A – Neurorrehabilitación' },
    ocupada: false,
    paciente: null,
  },
  {
    id: 9,
    numero: 'B-01',
    habilitada: true,
    sala: { id: 2, nombre: 'Sala B – Traumatología' },
    ocupada: false,
    paciente: null,
  },
];

export const SALAS: Sala[] = [
  { id: 1, nombre: 'Sala A – Neurorrehabilitación', piso: 'PB', camas: 8, libres: 3 },
  { id: 2, nombre: 'Sala B – Traumatología', piso: 'PB', camas: 8, libres: 5 },
];

export const HISTORIAL: HistorialPaciente = {
  asignaciones: [
    {
      id: 2,
      cama: 'Sala B – Traumatología · B-01',
      motivo: 'TRASLADO',
      fechaDesde: '2026-10-05T12:00:00.000Z',
      fechaHasta: null,
      asignadoPor: 'Ferreyra, Martín',
      liberadoPor: null,
    },
    {
      id: 1,
      cama: 'Sala A – Neurorrehabilitación · A-01',
      motivo: 'INGRESO',
      fechaDesde: '2026-10-01T13:00:00.000Z',
      fechaHasta: '2026-10-05T12:00:00.000Z',
      asignadoPor: 'Ferreyra, Martín',
      liberadoPor: 'Ferreyra, Martín',
    },
  ],
  modificaciones: [
    {
      id: 30,
      fechaHora: '2026-10-03T14:00:00.000Z',
      accion: 'MODIFICAR',
      entidad: 'Paciente',
      usuario: 'Ferreyra, Martín',
      valorAnterior: { obraSocial: 'IOMA' },
      valorNuevo: { obraSocial: 'PAMI' },
      detalle: null,
    },
  ],
  suministros: [
    {
      id: 5,
      fechaHora: '2026-10-04T11:00:00.000Z',
      tipo: 'INSUMOS',
      prescripcionId: null,
      usuario: 'Acosta, Sofía',
      corregido: false,
      detalles: [{ insumo: 'Gasa estéril 10 x 10 cm', cantidad: 2, unidad: 'unidad' }],
    },
  ],
};

/** Respuestas habituales del módulo: camas libres y salas. */
export function simularCatalogosDePacientes() {
  servidor.use(
    http.get('*/api/camas', () => HttpResponse.json({ data: CAMAS_LIBRES })),
    http.get('*/api/salas', () => HttpResponse.json({ data: SALAS })),
  );
}

export const listaDePacientes = (data: Paciente[]) =>
  HttpResponse.json({
    data,
    meta: { pagina: 1, porPagina: 20, total: data.length, totalPaginas: 1 },
  });
