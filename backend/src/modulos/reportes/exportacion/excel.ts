import ExcelJS from 'exceljs';
import { ZONA_HORARIA } from '../../../comun/fechas';
import { ENCABEZADO, type Celda, type Documento, type Tabla } from './documento';

/**
 * Excel del reporte o las estadísticas (T603) con exceljs: una hoja por tabla, cada una con el
 * encabezado completo. Los números van como números y las fechas como fechas (D47), así se
 * pueden sumar, ordenar y filtrar en la planilla.
 */

const FORMATO_FECHA = 'dd/mm/yyyy';
const FORMATO_FECHA_HORA = 'dd/mm/yyyy hh:mm';
const FORMATO_PORCENTAJE = '0.0%';

/** 'AAAA-MM-DD' como fecha de Excel (sin hora ni zona). */
const fechaExcel = (fecha: string) => new Date(`${fecha}T00:00:00Z`);

const formatoLocal = new Intl.DateTimeFormat('sv-SE', {
  timeZone: ZONA_HORARIA,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

/**
 * Excel no guarda zona horaria: la fecha y hora se escribe con los números de la hora de
 * Argentina, que es lo que tiene que leer la persona.
 */
const fechaHoraExcel = (instante: Date) =>
  new Date(`${formatoLocal.format(instante).replace(' ', 'T')}Z`);

function escribirCelda(celda: ExcelJS.Cell, valor: Celda) {
  if (valor === null) return;
  if (typeof valor === 'string' || typeof valor === 'number') {
    celda.value = valor;
  } else if ('fecha' in valor) {
    celda.value = fechaExcel(valor.fecha);
    celda.numFmt = FORMATO_FECHA;
  } else if (valor.porcentaje !== null) {
    celda.value = valor.porcentaje / 100;
    celda.numFmt = FORMATO_PORCENTAJE;
  }
}

function agregarFila(hoja: ExcelJS.Worksheet, valores: Celda[], negrita = false) {
  const fila = hoja.addRow([]);
  valores.forEach((v, i) => escribirCelda(fila.getCell(i + 1), v));
  if (negrita) fila.font = { bold: true };
  return fila;
}

function encabezado(hoja: ExcelJS.Worksheet, doc: Documento) {
  hoja.addRow([ENCABEZADO]).font = { bold: true, size: 12 };
  hoja.addRow([doc.titulo]).font = { bold: true, size: 14 };
  agregarFila(hoja, ['Desde', { fecha: doc.desde }]);
  agregarFila(hoja, ['Hasta', { fecha: doc.hasta }]);
  for (const [etiqueta, valor] of doc.filtros) hoja.addRow([etiqueta, valor]);
  const emitido = hoja.addRow(['Emitido', fechaHoraExcel(doc.emitido)]);
  emitido.getCell(2).numFmt = FORMATO_FECHA_HORA;
  hoja.addRow(['Generado por', doc.autor]);
  hoja.addRow([]);
}

function hojaDeTabla(libro: ExcelJS.Workbook, doc: Documento, t: Tabla) {
  const hoja = libro.addWorksheet(t.hoja);
  encabezado(hoja, doc);
  hoja.addRow([t.titulo]).font = { bold: true, size: 12 };
  const titulos = hoja.addRow(t.columnas.map((c) => c.titulo));
  titulos.font = { bold: true };
  titulos.eachCell((c) => {
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8E8E8' } };
  });
  // La fila de títulos queda fija al bajar.
  hoja.views = [{ state: 'frozen', ySplit: titulos.number }];
  for (const f of t.filas) agregarFila(hoja, f);
  if (t.total) agregarFila(hoja, t.total, true);
  // La primera columna lleva también las etiquetas del encabezado.
  t.columnas.forEach((c, i) => {
    hoja.getColumn(i + 1).width = Math.max(i === 0 ? 22 : 12, c.ancho * 12);
  });
}

export async function documentoXlsx(doc: Documento): Promise<Buffer> {
  const libro = new ExcelJS.Workbook();
  libro.creator = doc.autor;
  libro.title = doc.titulo;
  libro.company = ENCABEZADO;
  libro.created = doc.emitido;
  for (const t of doc.tablas) hojaDeTabla(libro, doc, t);
  return Buffer.from(await libro.xlsx.writeBuffer());
}
