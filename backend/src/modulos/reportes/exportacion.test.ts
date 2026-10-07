import type ExcelJS from 'exceljs';
import { prisma } from '../../db';
import { reloj } from '../../comun/reloj';
import {
  abrirXlsx,
  binario,
  filaQueEmpiezaCon,
  filasDe,
  textoDelPdf,
} from '../../../tests/soporte/archivos';
import {
  PERIODO,
  sembrarDatosDeReportes,
  type DatosDeReportes,
} from '../../../tests/soporte/reportes';
import { agenteConRol, prepararBaseConSeguridad } from '../../../tests/soporte/sesion';

type Sesion = Awaited<ReturnType<typeof agenteConRol>>;

// 7 de octubre a las 12:00 de Argentina.
const AHORA = new Date('2026-10-07T15:00:00Z');
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Exportación a PDF y Excel (T603 · CU34) y sus permisos (T608). */
describe('exportar el reporte y las estadísticas (T603 · T608)', () => {
  let admin: Sesion;
  let datos: DatosDeReportes;

  beforeAll(async () => {
    await prepararBaseConSeguridad();
    datos = await sembrarDatosDeReportes();
  });
  beforeEach(async () => {
    jest.spyOn(reloj, 'ahora').mockReturnValue(AHORA);
    admin = await agenteConRol('ADMINISTRADOR');
  });
  afterEach(() => jest.restoreAllMocks());
  afterAll(() => prisma.$disconnect());

  const exportar = (
    que: 'suministros' | 'estadisticas',
    query: Record<string, string | number>,
    sesion = admin,
  ) =>
    sesion.agente
      .get(`/api/reportes/${que}/exportar`)
      .query({ ...PERIODO, ...query })
      .buffer(true)
      .parse(binario);

  const autor = () => `${admin.usuario.apellido}, ${admin.usuario.nombre}`;

  describe('reporte de suministros', () => {
    it('PDF: archivo descargable con encabezado, parámetros legibles, emisión, autor y totales', async () => {
      const res = await exportar('suministros', { formato: 'pdf', salaId: datos.salas.a });

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('application/pdf');
      expect(res.headers['content-disposition']).toBe(
        'attachment; filename="reporte-suministros-20261001-20261007.pdf"',
      );
      expect(res.headers['cache-control']).toBe('no-store');
      const pdf = res.body as Buffer;
      expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');

      const texto = textoDelPdf(pdf);
      expect(texto).toContain('Hospital El Dique · SGSM-RC');
      expect(texto).toContain('Reporte de suministros');
      expect(texto).toContain('Período: 01/10/2026 al 07/10/2026 (7 días)');
      expect(texto).toContain('Sala: Sala A');
      expect(texto).toContain('Tipo: Todos');
      expect(texto).toContain('Agrupado por: Paciente');
      expect(texto).toContain('Emitido el 07/10/2026 12:00 (hora de Argentina)');
      expect(texto).toContain(`Generado por: ${autor()}`);
      expect(texto).toMatch(/Alvarez, Ana\n3\n1\.003/);
      expect(texto).toMatch(/Total\n4\n1\.005/);
    });

    it('Excel: números como números, días como fechas y el total al final', async () => {
      const res = await exportar('suministros', { formato: 'xlsx', agruparPor: 'dia' });

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe(XLSX);
      expect(res.headers['content-disposition']).toBe(
        'attachment; filename="reporte-suministros-20261001-20261007.xlsx"',
      );
      const libro = await abrirXlsx(res.body);
      const hoja = libro.getWorksheet('Reporte') as ExcelJS.Worksheet;
      const filas = filasDe(hoja);
      expect(filas[0]).toEqual(['Hospital El Dique · SGSM-RC']);
      expect(filas[1]).toEqual(['Reporte de suministros']);
      expect(filaQueEmpiezaCon(hoja, 'Desde')).toEqual(['Desde', new Date('2026-10-01T00:00:00Z')]);
      expect(filaQueEmpiezaCon(hoja, 'Hasta')).toEqual(['Hasta', new Date('2026-10-07T00:00:00Z')]);
      expect(filaQueEmpiezaCon(hoja, 'Sala')).toEqual(['Sala', 'Todas']);
      expect(filaQueEmpiezaCon(hoja, 'Agrupado por')).toEqual(['Agrupado por', 'Día']);
      // La hora de Argentina tal cual (Excel no guarda zona horaria).
      expect(filaQueEmpiezaCon(hoja, 'Emitido')).toEqual([
        'Emitido',
        new Date('2026-10-07T12:00:00Z'),
      ]);
      expect(filaQueEmpiezaCon(hoja, 'Generado por')).toEqual(['Generado por', autor()]);
      expect(filaQueEmpiezaCon(hoja, 'Día')).toEqual(['Día', 'Suministros', 'Unidades']);
      const dias = filas.filter((f) => f[0] instanceof Date && typeof f[1] === 'number');
      expect(dias).toEqual([
        [new Date('2026-10-01T00:00:00Z'), 1, 4],
        [new Date('2026-10-02T00:00:00Z'), 3, 1003],
        [new Date('2026-10-03T00:00:00Z'), 2, 4],
        [new Date('2026-10-04T00:00:00Z'), 1, 2],
        [new Date('2026-10-06T00:00:00Z'), 1, 1],
      ]);
      expect(filaQueEmpiezaCon(hoja, 'Total')).toEqual(['Total', 8, 1014]);
    });

    it('Excel por insumo: tipo y unidad en sus columnas', async () => {
      const res = await exportar('suministros', {
        formato: 'xlsx',
        agruparPor: 'insumo',
        tipo: 'MEDICAMENTO',
      });
      const hoja = (await abrirXlsx(res.body)).getWorksheet('Reporte') as ExcelJS.Worksheet;
      expect(filaQueEmpiezaCon(hoja, 'Tipo')).toEqual(['Tipo', 'Medicamentos']);
      expect(filaQueEmpiezaCon(hoja, 'Insumo')).toEqual([
        'Insumo',
        'Tipo',
        'Unidad',
        'Suministros',
        'Unidades',
      ]);
      expect(filaQueEmpiezaCon(hoja, 'Paracetamol · Comprimidos 500 mg')).toEqual([
        'Paracetamol · Comprimidos 500 mg',
        'Medicamento',
        'comprimido',
        1,
        1,
      ]);
      expect(filaQueEmpiezaCon(hoja, 'Total')).toEqual(['Total', undefined, undefined, 3, 1001]);
    });

    it('cada exportación queda en la auditoría con sus parámetros', async () => {
      await exportar('suministros', { formato: 'pdf', salaId: datos.salas.b, tipo: 'INSUMO' });

      const [fila] = await prisma.auditoria.findMany({
        where: { accion: 'EXPORTAR' },
        orderBy: { id: 'desc' },
        take: 1,
      });
      expect(fila).toMatchObject({
        usuarioId: admin.usuario.id,
        accion: 'EXPORTAR',
        entidad: 'Reporte',
        entidadId: 'suministros',
        pacienteId: null,
        valorAnterior: null,
        valorNuevo: {
          formato: 'pdf',
          desde: '2026-10-01',
          hasta: '2026-10-07',
          salaId: datos.salas.b,
          tipo: 'INSUMO',
          agruparPor: 'paciente',
        },
        detalle:
          'Reporte de suministros en PDF · 01/10/2026 al 07/10/2026 · Sala: Sala B · Tipo: Insumos · Agrupado por: Paciente',
      });
    });
  });

  describe('estadísticas', () => {
    it('PDF: indicadores, recordatorios y tablas con el mismo encabezado', async () => {
      const res = await exportar('estadisticas', { formato: 'pdf' });

      expect(res.status).toBe(200);
      expect(res.headers['content-disposition']).toBe(
        'attachment; filename="estadisticas-20261001-20261007.pdf"',
      );
      const texto = textoDelPdf(res.body);
      expect(texto).toContain('Hospital El Dique · SGSM-RC');
      expect(texto).toContain('Estadísticas de suministros');
      expect(texto).toContain('Sala: Todas');
      expect(texto).toContain(`Generado por: ${autor()}`);
      expect(texto).toMatch(/Pacientes atendidos\n3/);
      expect(texto).toMatch(/Porcentaje atendido\n80 %/);
      expect(texto).toMatch(/Pañal para adultos · Paquete x 10\nInsumo\n4/);
      expect(texto).toMatch(/05\/10\/2026\n0\n0\n0/);
    });

    it('Excel: una hoja por tabla, con números y fechas reales', async () => {
      const res = await exportar('estadisticas', { formato: 'xlsx' });

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe(XLSX);
      expect(res.headers['content-disposition']).toBe(
        'attachment; filename="estadisticas-20261001-20261007.xlsx"',
      );
      const libro = await abrirXlsx(res.body);
      expect(libro.worksheets.map((h) => h.name)).toEqual([
        'Indicadores',
        'Recordatorios',
        'Insumos más usados',
        'Consumo por tipo',
        'Evolución diaria',
      ]);
      const indicadores = libro.getWorksheet('Indicadores') as ExcelJS.Worksheet;
      expect(filasDe(indicadores)[0]).toEqual(['Hospital El Dique · SGSM-RC']);
      expect(filaQueEmpiezaCon(indicadores, 'Suministros')).toEqual(['Suministros', 8]);
      expect(filaQueEmpiezaCon(indicadores, 'Pacientes atendidos')).toEqual([
        'Pacientes atendidos',
        3,
      ]);
      const recordatorios = libro.getWorksheet('Recordatorios') as ExcelJS.Worksheet;
      expect(filaQueEmpiezaCon(recordatorios, 'Atendidos a tiempo')).toEqual([
        'Atendidos a tiempo',
        2,
      ]);
      // El porcentaje es un número con formato de porcentaje: 0,8 = 80 %.
      expect(filaQueEmpiezaCon(recordatorios, 'Porcentaje atendido')).toEqual([
        'Porcentaje atendido',
        0.8,
      ]);
      const evolucion = libro.getWorksheet('Evolución diaria') as ExcelJS.Worksheet;
      const dias = filasDe(evolucion).filter((f) => f[0] instanceof Date && f.length === 4);
      expect(dias).toHaveLength(7);
      expect(dias[4]).toEqual([new Date('2026-10-05T00:00:00Z'), 0, 0, 0]);
    });

    it('queda en la auditoría', async () => {
      await exportar('estadisticas', { formato: 'xlsx', desde: '2026-10-02', hasta: '2026-10-02' });
      const fila = await prisma.auditoria.findFirst({
        where: { accion: 'EXPORTAR', entidadId: 'estadisticas' },
        orderBy: { id: 'desc' },
      });
      expect(fila).toMatchObject({
        entidad: 'Reporte',
        valorNuevo: {
          formato: 'xlsx',
          desde: '2026-10-02',
          hasta: '2026-10-02',
          salaId: null,
          tipo: null,
        },
        detalle:
          'Estadísticas de suministros en Excel · 02/10/2026 al 02/10/2026 · Sala: Todas · Tipo: Todos',
      });
    });
  });

  describe('nombre del archivo (D46 · ESC4)', () => {
    const nombre = (res: { headers: Record<string, string> }) =>
      /filename="(.+)"/.exec(res.headers['content-disposition'] ?? '')?.[1];

    it('lleva el período pedido (desde y hasta), no la fecha de emisión', async () => {
      const query = { desde: '2026-09-01', hasta: '2026-09-30' };
      expect(nombre(await exportar('suministros', { ...query, formato: 'pdf' }))).toBe(
        'reporte-suministros-20260901-20260930.pdf',
      );
      expect(nombre(await exportar('estadisticas', { ...query, formato: 'xlsx' }))).toBe(
        'estadisticas-20260901-20260930.xlsx',
      );
    });

    it('sin fechas, el período por defecto en días de Argentina (a las 22:00 sigue siendo hoy)', async () => {
      // 07/10 a las 22:00 de Argentina: en UTC ya es el 08/10.
      jest.spyOn(reloj, 'ahora').mockReturnValue(new Date('2026-10-08T01:00:00Z'));
      // Sesión iniciada a esa hora (la de las 12:00 ya venció por inactividad).
      const { agente } = await agenteConRol('ADMINISTRADOR');
      const res = await agente
        .get('/api/reportes/suministros/exportar')
        .query({ formato: 'xlsx' })
        .buffer(true)
        .parse(binario);
      expect(res.status).toBe(200);
      expect(nombre(res)).toBe('reporte-suministros-20261001-20261007.xlsx');
    });

    it('un solo día: desde y hasta iguales', async () => {
      const res = await exportar('suministros', {
        desde: '2026-10-03',
        hasta: '2026-10-03',
        formato: 'pdf',
      });
      expect(nombre(res)).toBe('reporte-suministros-20261003-20261003.pdf');
    });
  });

  describe('errores y permisos', () => {
    it('sin formato o con otro formato responde 400 y no audita', async () => {
      const antes = await prisma.auditoria.count({ where: { accion: 'EXPORTAR' } });
      const res = await admin.agente
        .get('/api/reportes/suministros/exportar')
        .query({ formato: 'csv' });
      expect(res.status).toBe(400);
      expect(res.body.error.detalles).toEqual([
        { campo: 'formato', mensaje: 'Elija el formato: pdf o xlsx' },
      ]);
      expect(await prisma.auditoria.count({ where: { accion: 'EXPORTAR' } })).toBe(antes);
    });

    it('una sala que no existe responde 404', async () => {
      const res = await admin.agente
        .get('/api/reportes/estadisticas/exportar')
        .query({ formato: 'pdf', salaId: 9999 });
      expect(res.status).toBe(404);
    });

    it.each(['suministros', 'estadisticas'] as const)(
      'un médico ve el reporte pero no lo exporta: 403 en %s (S17)',
      async (que) => {
        const medico = await agenteConRol('MEDICO');
        expect((await medico.agente.get(`/api/reportes/${que}`)).status).toBe(200);
        const res = await exportar(que, { formato: 'pdf' }, medico);
        expect(res.status).toBe(403);
      },
    );

    it('un enfermero no ve ni exporta: 403', async () => {
      const enfermero = await agenteConRol('ENFERMERO');
      expect((await enfermero.agente.get('/api/reportes/estadisticas')).status).toBe(403);
      expect((await exportar('suministros', { formato: 'xlsx' }, enfermero)).status).toBe(403);
    });

    it('un médico con el permiso adicional reportes.exportar exporta (CU05)', async () => {
      const medico = await agenteConRol('MEDICO', ['reportes.exportar']);
      expect((await exportar('suministros', { formato: 'pdf' }, medico)).status).toBe(200);
    });
  });
});
