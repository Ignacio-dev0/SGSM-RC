// Datos de ejemplo de la consulta de auditoría (E6 · T607) para las pruebas de pantallas.
import { http, HttpResponse } from 'msw';
import type { EntradaAuditoria, OpcionesAuditoria } from '../api/auditoria';
import type { Usuario } from '../api/tipos';
import { listaDePacientes, paciente } from './datosPacientes';
import { servidor } from './servidor';

export const entrada = (extra: Partial<EntradaAuditoria> = {}): EntradaAuditoria => ({
  id: 812,
  fechaHora: '2026-10-02T02:30:00.000Z',
  accion: 'TRASLADAR',
  entidad: 'Paciente',
  entidadId: '12',
  usuario: { id: 4, nombre: 'López, Lucas' },
  paciente: { id: 12, nombre: 'Alvarez, Ana', dni: '30111222' },
  valorAnterior: { cama: 'Sala A · A-01' },
  valorNuevo: { cama: 'Sala A · A-02' },
  detalle: null,
  ...extra,
});

/** Las dos entradas del ejemplo del contrato (docs/reportes.md). */
export const ENTRADAS: EntradaAuditoria[] = [
  entrada(),
  entrada({
    id: 811,
    fechaHora: '2026-10-02T02:00:00.000Z',
    accion: 'GENERAR',
    entidad: 'Recordatorio',
    entidadId: '301',
    usuario: { id: null, nombre: 'Sistema' },
    valorAnterior: null,
    valorNuevo: { tipo: 'MEDICAMENTO', prescripcionId: 40, prioridad: 'MEDIA' },
  }),
];

export const OPCIONES: OpcionesAuditoria = {
  acciones: ['ARCHIVAR', 'CREAR', 'EXPORTAR', 'GENERAR', 'TRASLADAR'],
  entidades: ['Paciente', 'Prescripcion', 'Recordatorio', 'Reporte'],
};

const usuario = (id: number, apellido: string, nombre: string): Usuario => ({
  id,
  nombreUsuario: nombre.toLowerCase(),
  dni: `2000000${id}`,
  nombre,
  apellido,
  email: null,
  matricula: null,
  rol: { codigo: 'ENFERMERO', nombre: 'Enfermero' },
  activo: true,
  fechaBaja: null,
  bloqueadoHasta: null,
  ultimoAcceso: null,
  tieneBiometria: true,
  permisosDelRol: [],
  permisosAdicionales: [],
});

export const USUARIOS = [usuario(3, 'Acosta', 'Sofía'), usuario(4, 'López', 'Lucas')];

export const PACIENTES = [
  paciente({ id: 12, apellido: 'Alvarez', nombre: 'Ana', dni: '30111222' }),
  paciente({
    id: 7,
    apellido: 'Benítez',
    nombre: 'Rosa',
    dni: '20333444',
    estado: 'EGRESADO',
    cama: null,
  }),
];

export const paginaDeAuditoria = (
  data: EntradaAuditoria[],
  meta: Partial<{ pagina: number; porPagina: number; total: number; totalPaginas: number }> = {},
) =>
  HttpResponse.json({
    data,
    meta: { pagina: 1, porPagina: 50, total: data.length, totalPaginas: 1, ...meta },
  });

/**
 * Respuestas por defecto de la pantalla de auditoría: las entradas, sus opciones, el personal y
 * los pacientes de los filtros. Devuelve los pedidos que llegaron (el último es el que se ve).
 */
export function prepararAuditoria(entradas: EntradaAuditoria[] = ENTRADAS) {
  const pedidos: URLSearchParams[] = [];
  servidor.use(
    http.get('*/api/auditoria', ({ request }) => {
      pedidos.push(new URL(request.url).searchParams);
      return paginaDeAuditoria(entradas);
    }),
    http.get('*/api/auditoria/opciones', () => HttpResponse.json({ data: OPCIONES })),
    http.get('*/api/usuarios', () =>
      HttpResponse.json({
        data: USUARIOS,
        meta: { pagina: 1, porPagina: 100, total: USUARIOS.length, totalPaginas: 1 },
      }),
    ),
    http.get('*/api/pacientes', () => listaDePacientes(PACIENTES)),
  );
  return pedidos;
}
