// Ayudantes para las pruebas de exportación (E6): bajar el archivo y leer lo que tiene adentro.
import type { Stream } from 'node:stream';
import zlib from 'node:zlib';
import ExcelJS from 'exceljs';

/** Parser de supertest que junta la respuesta binaria en un Buffer (PDF, xlsx). */
export function binario(res: Stream, listo: (err: Error | null, cuerpo: Buffer) => void) {
  const partes: Buffer[] = [];
  res.on('data', (parte: Buffer) => partes.push(parte));
  res.on('end', () => listo(null, Buffer.concat(partes)));
}

const winAnsi = new TextDecoder('windows-1252');

/**
 * Texto de un PDF hecho con pdfkit y sus fuentes estándar: descomprime cada flujo y junta lo que
 * dibujan los operadores TJ (el texto va en hexadecimal, cortado donde hay ajuste de espaciado).
 * Una línea por cada texto dibujado.
 */
export function textoDelPdf(pdf: Buffer): string {
  const crudo = pdf.toString('latin1');
  const lineas: string[] = [];
  for (const flujo of crudo.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    let contenido: string;
    try {
      contenido = zlib.inflateSync(Buffer.from(flujo[1] ?? '', 'latin1')).toString('latin1');
    } catch {
      contenido = flujo[1] ?? '';
    }
    for (const tj of contenido.matchAll(/\[(.*?)\]\s*TJ/g)) {
      const partes = [...(tj[1] ?? '').matchAll(/<([0-9a-fA-F]*)>/g)];
      lineas.push(partes.map((h) => winAnsi.decode(Buffer.from(h[1] ?? '', 'hex'))).join(''));
    }
  }
  return lineas.join('\n');
}

/** Vuelve a abrir un .xlsx con exceljs, como lo abriría una planilla de cálculo. */
export async function abrirXlsx(archivo: Buffer) {
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(archivo as unknown as ExcelJS.Buffer);
  return libro;
}

/** Valores de una hoja, fila por fila (desde la 1), para buscar celdas por su etiqueta. */
export function filasDe(hoja: ExcelJS.Worksheet): unknown[][] {
  const filas: unknown[][] = [];
  hoja.eachRow({ includeEmpty: true }, (fila, n) => {
    filas[n - 1] = (fila.values as unknown[]).slice(1);
  });
  return Array.from(filas, (f) => f ?? []);
}

/** La fila cuya primera celda es `etiqueta`. */
export const filaQueEmpiezaCon = (hoja: ExcelJS.Worksheet, etiqueta: string) =>
  filasDe(hoja).find((f) => f[0] === etiqueta);
