import { leerCsv } from './csv';

const COLUMNAS = { obligatorias: ['sala', 'cama'] };
const PERSONAL = { obligatorias: ['usuario', 'dni'], opcionales: ['email'] };

/** Lector de los CSV del instalador (T803 · D103): lo que guarda Excel o un editor de texto. */
describe('leer un CSV del instalador', () => {
  it('separado por comas: una fila por registro, numeradas como en la planilla', () => {
    expect(leerCsv('sala,cama\nSala A,A-01\nSala A,A-02\n', COLUMNAS)).toEqual({
      filas: [
        { numero: 2, valores: { sala: 'Sala A', cama: 'A-01' } },
        { numero: 3, valores: { sala: 'Sala A', cama: 'A-02' } },
      ],
      errores: [],
    });
  });

  it('separado por punto y coma (Excel en español), con BOM y fin de línea de Windows', () => {
    const r = leerCsv('\uFEFFsala;cama\r\nSala B;B-01\r\n', COLUMNAS);
    expect(r.errores).toEqual([]);
    expect(r.filas).toEqual([{ numero: 2, valores: { sala: 'Sala B', cama: 'B-01' } }]);
  });

  it('entre comillas: separadores, comillas dobladas y saltos de línea dentro del valor', () => {
    const r = leerCsv(
      'sala,cama\n"Sala A, ala norte","A-""1"""\n"Sala\nC",C-1\nSala D,D-1',
      COLUMNAS,
    );
    expect(r.errores).toEqual([]);
    expect(r.filas).toEqual([
      { numero: 2, valores: { sala: 'Sala A, ala norte', cama: 'A-"1"' } },
      { numero: 3, valores: { sala: 'Sala\nC', cama: 'C-1' } },
      { numero: 4, valores: { sala: 'Sala D', cama: 'D-1' } },
    ]);
  });

  it('el encabezado no distingue mayúsculas, tildes ni espacios; el orden de las columnas no importa', () => {
    const r = leerCsv(' Cama , SALA \nA-01,Sala A\n', COLUMNAS);
    expect(r.filas).toEqual([{ numero: 2, valores: { sala: 'Sala A', cama: 'A-01' } }]);
    expect(
      leerCsv('presentación,nombre\nx,y\n', { obligatorias: ['nombre', 'presentacion'] }).filas,
    ).toEqual([{ numero: 2, valores: { presentacion: 'x', nombre: 'y' } }]);
  });

  it('saltea las filas vacías sin cambiar la numeración de las demás', () => {
    const r = leerCsv('sala,cama\n\nSala A,A-01\n,\n  ,  \nSala A,A-02\n', COLUMNAS);
    expect(r.filas.map((f) => f.numero)).toEqual([3, 6]);
  });

  it('una columna opcional puede faltar o venir vacía; las celdas que faltan al final quedan vacías', () => {
    expect(leerCsv('usuario,dni\nana,30111222\n', PERSONAL).filas).toEqual([
      { numero: 2, valores: { usuario: 'ana', dni: '30111222' } },
    ]);
    expect(leerCsv('usuario,dni,email\nana,30111222\n', PERSONAL).filas).toEqual([
      { numero: 2, valores: { usuario: 'ana', dni: '30111222', email: '' } },
    ]);
  });

  it.each([
    ['vacío', '', 'El archivo está vacío'],
    ['solo con el encabezado', 'sala,cama\n\n', 'El archivo no tiene filas con datos'],
    ['sin una columna', 'sala\nSala A\n', 'Fila 1: falta la columna "cama"'],
    [
      'con una columna desconocida',
      'sala,cama,piso\nA,1,PB\n',
      'Fila 1: la columna "piso" no es de este archivo (se esperan: sala, cama)',
    ],
    [
      'con una columna repetida',
      'sala,cama,Sala\nA,1,B\n',
      'Fila 1: la columna "sala" está dos veces',
    ],
    [
      'con más valores que columnas',
      'sala,cama\nSala A,A-01,sobra\n',
      'Fila 2: tiene 3 valores y el encabezado tiene 2 columnas',
    ],
    [
      'con una comilla sin cerrar',
      'sala,cama\n"Sala A,A-01\n',
      'Fila 2: hay una comilla sin cerrar',
    ],
  ])('un archivo %s es un error claro', (_caso, contenido, error) => {
    const r = leerCsv(contenido, COLUMNAS);
    expect(r.errores).toEqual([error]);
    expect(r.filas).toEqual([]);
  });

  it('un archivo que no está en UTF-8 (CSV común de Excel) pide guardarlo como "CSV UTF-8"', () => {
    // "Sala Pediatría" en Windows-1252: la í es el byte 0xED.
    const latin1 = Buffer.concat([
      Buffer.from('sala,cama\nSala Pediatr'),
      Buffer.from([0xed]),
      Buffer.from('a,P-01\n'),
    ]);
    expect(leerCsv(latin1, COLUMNAS)).toEqual({
      filas: [],
      errores: [
        'El archivo no está en UTF-8: en Excel, "Guardar como" → "CSV UTF-8 (delimitado por comas)"',
      ],
    });
  });

  it('acepta el contenido como Buffer en UTF-8', () => {
    expect(leerCsv(Buffer.from('sala,cama\nSala Pediatría,P-01\n'), COLUMNAS).filas).toEqual([
      { numero: 2, valores: { sala: 'Sala Pediatría', cama: 'P-01' } },
    ]);
  });
});
