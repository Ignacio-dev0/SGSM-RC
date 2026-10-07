import PDFDocument from 'pdfkit';
import { fechaHoraLegible } from '../../../comun/fechas';
import {
  ENCABEZADO,
  celdaComoTexto,
  periodoLegible,
  type Celda,
  type Documento,
  type Tabla,
} from './documento';

/**
 * PDF del reporte o las estadísticas (T603) con pdfkit: A4 vertical, fuentes estándar (no hay
 * que embeber nada) y solo tablas, sin gráficos (fuera de E6). Las tablas largas siguen en la
 * página siguiente repitiendo la fila de títulos; al pie, "Página n de m".
 */

const MARGEN = 40;
const RELLENO = 4;
const CUERPO = 9;
const GRIS = '#555555';
const FONDO_TITULOS = '#e8e8e8';
const LINEA = '#bbbbbb';

type Pdf = PDFKit.PDFDocument;

/** Ancho útil de la página. */
const anchoUtil = (pdf: Pdf) => pdf.page.width - MARGEN * 2;

/** Hasta dónde se puede escribir sin pisar el pie de página. */
const limiteInferior = (pdf: Pdf) => pdf.page.height - MARGEN - 20;

function anchosDe(pdf: Pdf, tabla: Tabla) {
  const total = tabla.columnas.reduce((s, c) => s + c.ancho, 0);
  return tabla.columnas.map((c) => (c.ancho / total) * anchoUtil(pdf));
}

function encabezado(pdf: Pdf, doc: Documento) {
  pdf.fillColor(GRIS).font('Helvetica-Bold').fontSize(10).text(ENCABEZADO, MARGEN, MARGEN);
  pdf.moveDown(0.3).fillColor('black').fontSize(18).text(doc.titulo);
  pdf.moveDown(0.4).font('Helvetica').fontSize(10);
  pdf.text(`Período: ${periodoLegible(doc)}`);
  for (const [etiqueta, valor] of doc.filtros) pdf.text(`${etiqueta}: ${valor}`);
  pdf.text(`Emitido el ${fechaHoraLegible(doc.emitido)} (hora de Argentina)`);
  pdf.text(`Generado por: ${doc.autor}`);
  const y = pdf.y + 8;
  pdf
    .moveTo(MARGEN, y)
    .lineTo(MARGEN + anchoUtil(pdf), y)
    .strokeColor(LINEA)
    .stroke();
  pdf.y = y + 12;
}

type Estilo = { negrita?: boolean; fondo?: string };

function altoDeFila(pdf: Pdf, t: Tabla, celdas: Celda[], { negrita = false }: Estilo = {}) {
  const anchos = anchosDe(pdf, t);
  pdf.font(negrita ? 'Helvetica-Bold' : 'Helvetica').fontSize(CUERPO);
  const altos = celdas.map((c, i) =>
    pdf.heightOfString(celdaComoTexto(c) || ' ', { width: anchos[i]! - 2 * RELLENO }),
  );
  return Math.max(...altos) + 2 * RELLENO;
}

/** Dibuja una fila y devuelve dónde termina. Una llamada a text() por celda. */
function fila(pdf: Pdf, t: Tabla, celdas: Celda[], y: number, estilo: Estilo = {}) {
  const anchos = anchosDe(pdf, t);
  const alto = altoDeFila(pdf, t, celdas, estilo);
  if (estilo.fondo) pdf.rect(MARGEN, y, anchoUtil(pdf), alto).fill(estilo.fondo);
  pdf
    .font(estilo.negrita ? 'Helvetica-Bold' : 'Helvetica')
    .fontSize(CUERPO)
    .fillColor('black');
  let x = MARGEN;
  celdas.forEach((celda, i) => {
    const texto = celdaComoTexto(celda);
    const ancho = anchos[i]!;
    if (texto) {
      pdf.text(texto, x + RELLENO, y + RELLENO, {
        width: ancho - 2 * RELLENO,
        align: t.columnas[i]?.numerica ? 'right' : 'left',
      });
    }
    x += ancho;
  });
  pdf
    .moveTo(MARGEN, y + alto)
    .lineTo(MARGEN + anchoUtil(pdf), y + alto)
    .strokeColor(LINEA)
    .lineWidth(0.5)
    .stroke();
  return y + alto;
}

const TITULOS: Estilo = { negrita: true, fondo: FONDO_TITULOS };

function tabla(pdf: Pdf, t: Tabla) {
  const titulos = t.columnas.map((c) => c.titulo);
  // El título de la tabla no queda solo al pie de una página.
  if (pdf.y + 60 > limiteInferior(pdf)) pdf.addPage();
  pdf.font('Helvetica-Bold').fontSize(12).fillColor('black').text(t.titulo, MARGEN, pdf.y);
  let y = fila(pdf, t, titulos, pdf.y + 4, TITULOS);

  if (t.filas.length === 0) {
    pdf
      .font('Helvetica')
      .fontSize(CUERPO)
      .text('Sin datos en el período', MARGEN + RELLENO, y + RELLENO);
    pdf.y += 14;
    return;
  }
  const filas: [Celda[], Estilo][] = t.filas.map((f) => [f, {}]);
  if (t.total) filas.push([t.total, { negrita: true }]);
  for (const [celdas, estilo] of filas) {
    // Si no entra, sigue en otra página con la fila de títulos repetida.
    if (y + altoDeFila(pdf, t, celdas, estilo) > limiteInferior(pdf)) {
      pdf.addPage();
      y = fila(pdf, t, titulos, MARGEN, TITULOS);
    }
    y = fila(pdf, t, celdas, y, estilo);
  }
  pdf.y = y + 18;
}

function numerarPaginas(pdf: Pdf) {
  const { start, count } = pdf.bufferedPageRange();
  for (let i = start; i < start + count; i++) {
    pdf.switchToPage(i);
    // Sin margen inferior para que el pie no abra otra página.
    const margen = pdf.page.margins.bottom;
    pdf.page.margins.bottom = 0;
    pdf
      .font('Helvetica')
      .fontSize(8)
      .fillColor(GRIS)
      .text(`Página ${i - start + 1} de ${count}`, MARGEN, pdf.page.height - MARGEN + 10, {
        width: anchoUtil(pdf),
        align: 'center',
        lineBreak: false,
      });
    pdf.page.margins.bottom = margen;
  }
}

export function documentoPdf(doc: Documento): Promise<Buffer> {
  const pdf = new PDFDocument({
    size: 'A4',
    margin: MARGEN,
    bufferPages: true,
    info: { Title: doc.titulo, Author: doc.autor, Creator: ENCABEZADO },
  });
  const partes: Buffer[] = [];
  const listo = new Promise<Buffer>((resolver, rechazar) => {
    pdf.on('data', (parte: Buffer) => partes.push(parte));
    pdf.on('end', () => resolver(Buffer.concat(partes)));
    pdf.on('error', rechazar);
  });
  encabezado(pdf, doc);
  for (const t of doc.tablas) tabla(pdf, t);
  numerarPaginas(pdf);
  pdf.end();
  return listo;
}
