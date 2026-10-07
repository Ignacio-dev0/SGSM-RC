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

/** Sin tildes ni mayúsculas, como busca el servidor ("ben" encuentra a "Benítez"). */
const normalizar = (t: string) => t.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** Lo que devolvería el servidor al buscar por `texto` (apellido, nombre o comienzo del DNI). */
const buscarPor = <T extends { apellido: string; nombre: string; dni: string }>(
  lista: T[],
  pedido: URLSearchParams,
) => {
  const texto = normalizar(pedido.get('texto') ?? '');
  return lista.filter(
    (x) =>
      !texto || normalizar(`${x.apellido} ${x.nombre}`).includes(texto) || x.dni.startsWith(texto),
  );
};

/**
 * Respuestas por defecto de la pantalla de auditoría: las entradas, sus opciones y la búsqueda del
 * personal y de los pacientes de los filtros. Devuelve los pedidos que llegaron (el último es el
 * que se ve); los de las búsquedas quedan en `pedidos.personal` y `pedidos.pacientes`.
 */
export function prepararAuditoria(entradas: EntradaAuditoria[] = ENTRADAS) {
  const pedidos = Object.assign([] as URLSearchParams[], {
    personal: [] as URLSearchParams[],
    pacientes: [] as URLSearchParams[],
  });
  servidor.use(
    http.get('*/api/auditoria', ({ request }) => {
      pedidos.push(new URL(request.url).searchParams);
      return paginaDeAuditoria(entradas);
    }),
    http.get('*/api/auditoria/opciones', () => HttpResponse.json({ data: OPCIONES })),
    http.get('*/api/usuarios', ({ request }) => {
      const p = new URL(request.url).searchParams;
      pedidos.personal.push(p);
      const data = buscarPor(USUARIOS, p);
      return HttpResponse.json({
        data,
        meta: { pagina: 1, porPagina: 10, total: data.length, totalPaginas: 1 },
      });
    }),
    http.get('*/api/pacientes', ({ request }) => {
      const p = new URL(request.url).searchParams;
      pedidos.pacientes.push(p);
      return listaDePacientes(buscarPor(PACIENTES, p));
    }),
  );
  return pedidos;
}
