// Datos de ejemplo de E6 (reportes, estadísticas y descargas) para las pruebas de pantallas.
import { http, HttpResponse } from 'msw';
import type { Estadisticas, FilaReporte, ReporteSuministros } from '../api/reportes';
import type { Sala, UsuarioSesion } from '../api/tipos';
import { ADMIN, MEDICO } from './datos';
import { servidor } from './servidor';

/**
 * Los usuarios de datos.ts con los permisos que la semilla da en E6 (docs/reportes.md, S17):
 * el administrador ve, exporta y consulta la auditoría; el médico solo ve los reportes.
 */
export const ADMIN_E6: UsuarioSesion = {
  ...ADMIN,
  permisos: [...ADMIN.permisos, 'auditoria.ver', 'reportes.exportar', 'reportes.ver'],
};
export const MEDICO_E6: UsuarioSesion = {
  ...MEDICO,
  permisos: [...MEDICO.permisos, 'reportes.ver'],
};

/** "Ahora" de las pruebas de reportes: el 07/10/2026 a las 12:00 de Argentina. */
export const AHORA_REPORTES = '2026-10-07T15:00:00.000Z';

/** Fija "ahora" sin frenar los temporizadores: userEvent y MSW siguen funcionando. */
export function fijarHoy(iso = AHORA_REPORTES) {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(iso));
}

export const SALAS: Sala[] = [
  { id: 1, nombre: 'Sala A', piso: null, camas: 10, libres: 2 },
  { id: 2, nombre: 'Sala B', piso: '1', camas: 8, libres: 3 },
];

const fila = (f: Partial<FilaReporte> & Pick<FilaReporte, 'clave' | 'etiqueta'>): FilaReporte => ({
  id: null,
  suministros: 1,
  unidades: 1,
  tipo: null,
  unidad: null,
  ...f,
});

/** Una fila por grupo de cada agrupación (las de insumo son las del ejemplo del contrato). */
export const FILAS: Record<string, FilaReporte[]> = {
  paciente: [
    fila({ clave: '12', id: 12, etiqueta: 'Alvarez, Ana', suministros: 3, unidades: 502 }),
    fila({ clave: '7', id: 7, etiqueta: 'Benítez, Rosa', suministros: 2, unidades: 504 }),
  ],
  insumo: [
    fila({
      clave: '17|unidad',
      id: 17,
      etiqueta: 'Gasa estéril · Sobre x 1',
      suministros: 2,
      unidades: 5,
      tipo: 'INSUMO',
      unidad: 'unidad',
    }),
    fila({
      clave: '3|comprimido',
      id: 3,
      etiqueta: 'Paracetamol · Comprimidos 500 mg',
      suministros: 1,
      unidades: 1,
      tipo: 'MEDICAMENTO',
      unidad: 'comprimido',
    }),
    fila({
      clave: '3|mg',
      id: 3,
      etiqueta: 'Paracetamol · Comprimidos 500 mg',
      suministros: 2,
      unidades: 1000,
      tipo: 'MEDICAMENTO',
      unidad: 'mg',
    }),
  ],
  usuario: [
    fila({ clave: '3', id: 3, etiqueta: 'Acosta, Sofía', suministros: 4, unidades: 1005 }),
    fila({ clave: '4', id: 4, etiqueta: 'López, Lucas', suministros: 1, unidades: 1 }),
  ],
  dia: [
    fila({ clave: '2026-10-01', etiqueta: '01/10/2026', suministros: 2, unidades: 6 }),
    fila({ clave: '2026-10-02', etiqueta: '02/10/2026', suministros: 3, unidades: 1000 }),
  ],
};

/** Parámetros normalizados de un pedido, como los devuelve el servidor en `meta`. */
export function parametrosDe(pedido: URLSearchParams) {
  const salaId = pedido.get('salaId');
  return {
    desde: pedido.get('desde') ?? '2026-10-01',
    hasta: pedido.get('hasta') ?? '2026-10-07',
    salaId: salaId ? Number(salaId) : null,
    tipo: (pedido.get('tipo') as 'MEDICAMENTO' | 'INSUMO' | null) ?? null,
  };
}

/** El reporte de una agrupación con el total del contrato (5 suministros distintos). */
export function reporte(pedido: URLSearchParams, filas?: FilaReporte[]): ReporteSuministros {
  const agruparPor = (pedido.get('agruparPor') ?? 'paciente') as 'paciente';
  const data = filas ?? FILAS[agruparPor] ?? [];
  return {
    data,
    meta: {
      parametros: { ...parametrosDe(pedido), agruparPor },
      totales: data.length ? { suministros: 5, unidades: 1006 } : { suministros: 0, unidades: 0 },
    },
  };
}

export const ESTADISTICAS: Estadisticas['data'] = {
  totales: { suministros: 8, medicamentos: 3, insumos: 5, pacientes: 3 },
  insumosMasUsados: [
    {
      insumoId: 18,
      nombre: 'Pañal para adultos',
      presentacion: 'Paquete x 10',
      tipo: 'INSUMO',
      suministros: 4,
    },
    {
      insumoId: 3,
      nombre: 'Paracetamol',
      presentacion: 'Comprimidos 500 mg',
      tipo: 'MEDICAMENTO',
      suministros: 3,
    },
  ],
  consumoPorTipo: [
    { tipo: 'MEDICAMENTO', suministros: 3 },
    { tipo: 'INSUMO', suministros: 5 },
  ],
  evolucionDiaria: [
    { fecha: '2026-10-01', suministros: 1, medicamentos: 0, insumos: 1 },
    { fecha: '2026-10-02', suministros: 3, medicamentos: 2, insumos: 1 },
    { fecha: '2026-10-03', suministros: 0, medicamentos: 0, insumos: 0 },
  ],
  recordatorios: {
    total: 6,
    aTiempo: 2,
    tarde: 1,
    noAdministrados: 1,
    vencidosSinAtender: 1,
    pendientes: 1,
    atendidos: 4,
    porcentajeAtendido: 80,
  },
};

/** Estadísticas de un período sin ningún suministro ni recordatorio. */
export const ESTADISTICAS_VACIAS: Estadisticas['data'] = {
  totales: { suministros: 0, medicamentos: 0, insumos: 0, pacientes: 0 },
  insumosMasUsados: [],
  consumoPorTipo: [
    { tipo: 'MEDICAMENTO', suministros: 0 },
    { tipo: 'INSUMO', suministros: 0 },
  ],
  evolucionDiaria: [{ fecha: '2026-10-07', suministros: 0, medicamentos: 0, insumos: 0 }],
  recordatorios: {
    total: 0,
    aTiempo: 0,
    tarde: 0,
    noAdministrados: 0,
    vencidosSinAtender: 0,
    pendientes: 0,
    atendidos: 0,
    porcentajeAtendido: null,
  },
};

export const errorInterno = () =>
  HttpResponse.json(
    { error: { codigo: 'ERROR_INTERNO', mensaje: 'Error interno del servidor' } },
    { status: 500 },
  );

/**
 * Respuestas por defecto de la pantalla de reportes. Devuelve los pedidos que llegaron, para
 * revisar sus parámetros (el último es el que se está mostrando).
 */
export function prepararReportes(
  datos: { filas?: FilaReporte[]; estadisticas?: Estadisticas['data'] } = {},
) {
  const pedidos = { reporte: [] as URLSearchParams[], estadisticas: [] as URLSearchParams[] };
  servidor.use(
    http.get('*/api/salas', () => HttpResponse.json({ data: SALAS })),
    http.get('*/api/reportes/suministros', ({ request }) => {
      const p = new URL(request.url).searchParams;
      pedidos.reporte.push(p);
      return HttpResponse.json(reporte(p, datos.filas));
    }),
    http.get('*/api/reportes/estadisticas', ({ request }) => {
      const p = new URL(request.url).searchParams;
      pedidos.estadisticas.push(p);
      return HttpResponse.json({
        data: datos.estadisticas ?? ESTADISTICAS,
        meta: { parametros: parametrosDe(p), dias: 7 },
      });
    }),
  );
  return pedidos;
}

/** Respuesta de una exportación: el archivo con su nombre en Content-Disposition. */
export const archivo = (nombre: string) =>
  new HttpResponse(nombre.endsWith('.pdf') ? '%PDF-1.7' : 'PK', {
    headers: {
      'Content-Type': nombre.endsWith('.pdf')
        ? 'application/pdf'
        : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${nombre}"`,
      'Cache-Control': 'no-store',
    },
  });

/**
 * jsdom no baja archivos: se anotan los enlaces temporales que se tocan (con su nombre) y los
 * URL de objeto que se crean y se liberan.
 */
export function simularDescargas() {
  const enlaces: { href: string; download: string }[] = [];
  const creados: Blob[] = [];
  const crear = vi.fn((blob: Blob) => {
    creados.push(blob);
    return `blob:sgsm/${creados.length}`;
  });
  const liberar = vi.fn();
  const originales = { crear: URL.createObjectURL, liberar: URL.revokeObjectURL };
  URL.createObjectURL = crear;
  URL.revokeObjectURL = liberar;
  const clic = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    enlaces.push({ href: this.href, download: this.download });
  });
  return {
    enlaces,
    creados,
    liberar,
    restaurar: () => {
      URL.createObjectURL = originales.crear;
      URL.revokeObjectURL = originales.liberar;
      clic.mockRestore();
    },
  };
}

const matchMediaOriginal = window.matchMedia;

/** jsdom no evalúa media queries: simula un teléfono (< 600 px) y/o el movimiento reducido. */
export function simularPantalla({ telefono = false, movimientoReducido = false }) {
  window.matchMedia = ((consulta: string) => ({
    matches:
      (telefono && consulta.includes('599.95')) ||
      (movimientoReducido && consulta.includes('prefers-reduced-motion')),
    media: consulta,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}

/** Deshace fijarHoy y simularPantalla. */
export function restaurarReportes() {
  vi.useRealTimers();
  window.matchMedia = matchMediaOriginal;
}
