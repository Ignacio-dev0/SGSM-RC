import { leerCsv } from './csv';
import {
  COLUMNAS_CATALOGO,
  COLUMNAS_PERSONAL,
  COLUMNAS_SALAS,
  validarCatalogo,
  validarPersonal,
  validarSalas,
} from './filas';

const salas = (texto: string) => validarSalas(leerCsv(texto, COLUMNAS_SALAS).filas);
const catalogo = (texto: string) => validarCatalogo(leerCsv(texto, COLUMNAS_CATALOGO).filas);
const personal = (texto: string) => validarPersonal(leerCsv(texto, COLUMNAS_PERSONAL).filas);

/**
 * Validación fila por fila de los CSV del instalador (T803 · D103): cada error dice la fila y el
 * campo; los datos de una persona siguen las mismas reglas que el alta desde la aplicación.
 */
describe('filas de salas.csv (sala,cama)', () => {
  it('una fila por cama; los espacios de más no cuentan', () => {
    expect(salas('sala,cama\nSala  A ,A-01\nSala A,A-02\nSala B,1\n')).toEqual({
      filas: [
        { fila: 2, sala: 'Sala A', cama: 'A-01' },
        { fila: 3, sala: 'Sala A', cama: 'A-02' },
        { fila: 4, sala: 'Sala B', cama: '1' },
      ],
      errores: [],
    });
  });

  it('todos los errores juntos, con la fila, el campo y lo que dice (recortado)', () => {
    expect(
      salas(`sala,cama\n,A-01\nSala A,\n${'S'.repeat(61)},1\nSala A,A-123456789\n`).errores,
    ).toEqual([
      'Fila 2, sala: Escriba el nombre de la sala',
      'Fila 3, cama: Escriba el número o nombre de la cama',
      `Fila 4, sala: El nombre de la sala puede tener hasta 60 caracteres (dice "${'S'.repeat(40)}…")`,
      'Fila 5, cama: La cama puede tener hasta 10 caracteres (dice "A-123456789")',
    ]);
  });

  it('una cama repetida o una sala escrita de dos maneras es un error', () => {
    expect(salas('sala,cama\nSala A,A-01\nSala B,B-01\nSala A,a-01\nsala a,A-02\n')).toEqual({
      filas: [],
      errores: [
        'Fila 4, cama: la cama "a-01" de "Sala A" ya está en la fila 2',
        'Fila 5, sala: "sala a" está escrita distinto que "Sala A" en la fila 2: escríbala igual en todas las filas',
      ],
    });
  });
});

describe('filas de catalogo.csv (tipo,nombre,presentacion,unidad)', () => {
  it('el tipo se escribe como se lee (Medicamento, insumo) y la presentación puede ir vacía', () => {
    expect(
      catalogo(
        'tipo,nombre,presentacion,unidad\nMedicamento,Amoxicilina,Cápsulas 500 mg,mg\ninsumo,Barbijo,,unidad\n',
      ),
    ).toEqual({
      filas: [
        {
          fila: 2,
          tipo: 'MEDICAMENTO',
          nombre: 'Amoxicilina',
          presentacion: 'Cápsulas 500 mg',
          unidadMedida: 'mg',
        },
        { fila: 3, tipo: 'INSUMO', nombre: 'Barbijo', presentacion: '', unidadMedida: 'unidad' },
      ],
      errores: [],
    });
  });

  it('las mismas reglas que el alta del catálogo, con la fila y el campo del archivo', () => {
    expect(
      catalogo(
        `tipo,nombre,presentacion,unidad\nRemedio,Amoxicilina,,mg\nINSUMO,A,,unidad\nINSUMO,Gasa,,\nINSUMO,Gasa,${'x'.repeat(121)},u\n`,
      ).errores,
    ).toEqual([
      'Fila 2, tipo: Escriba Medicamento o Insumo (dice "Remedio")',
      'Fila 3, nombre: Ingrese el nombre (dice "A")',
      'Fila 4, unidad: Ingrese la unidad de medida',
      `Fila 5, presentacion: Puede tener hasta 120 caracteres (dice "${'x'.repeat(40)}…")`,
    ]);
  });

  it('el mismo nombre y presentación dos veces es un error', () => {
    expect(
      catalogo(
        'tipo,nombre,presentacion,unidad\nINSUMO,Gasa,Sobre x 1,unidad\nINSUMO,gasa,sobre x 1,unidad\n',
      ).errores,
    ).toEqual(['Fila 3, nombre: "gasa · sobre x 1" ya está en la fila 2']);
  });
});

describe('filas de personal.csv (usuario,nombre,apellido,dni,rol,email)', () => {
  const ENCABEZADO = 'usuario,nombre,apellido,dni,rol,email';

  it('rol en palabras, usuario en minúsculas, DNI con puntos y email opcional', () => {
    expect(
      personal(
        `${ENCABEZADO}\nJPerez,Juana,Pérez,30.111.222,Médica,\nmgomez,Mario,Gómez,25111222,enfermero,mgomez@ejemplo.test\nadmin2,Ana,Díaz,28111222,ADMINISTRADOR,\n`,
      ),
    ).toEqual({
      filas: [
        {
          fila: 2,
          nombreUsuario: 'jperez',
          nombre: 'Juana',
          apellido: 'Pérez',
          dni: '30111222',
          rol: 'MEDICO',
          email: null,
        },
        {
          fila: 3,
          nombreUsuario: 'mgomez',
          nombre: 'Mario',
          apellido: 'Gómez',
          dni: '25111222',
          rol: 'ENFERMERO',
          email: 'mgomez@ejemplo.test',
        },
        {
          fila: 4,
          nombreUsuario: 'admin2',
          nombre: 'Ana',
          apellido: 'Díaz',
          dni: '28111222',
          rol: 'ADMINISTRADOR',
          email: null,
        },
      ],
      errores: [],
    });
  });

  it('las mismas reglas que el alta de usuarios, en el orden de las columnas del archivo', () => {
    expect(
      personal(
        `${ENCABEZADO}\njuan perez,Juan,Pérez,30111222,Médico,\nana,A,Díaz,3011,Enfermera,ana@\n`,
      ).errores,
    ).toEqual([
      'Fila 2, usuario: El usuario debe tener entre 3 y 30 letras, números, puntos o guiones, sin espacios (dice "juan perez")',
      'Fila 3, nombre: Ingrese el nombre (dice "A")',
      'Fila 3, dni: El DNI debe tener 7 u 8 dígitos, sin puntos (dice "3011")',
      'Fila 3, email: El email no es válido (dice "ana@")',
    ]);
  });

  it('un rol que no existe dice cuáles hay', () => {
    expect(personal(`${ENCABEZADO}\nana,Ana,Díaz,30111222,Kinesióloga,\n`).errores).toEqual([
      'Fila 2, rol: Escriba Administrador, Médico o Enfermero (dice "Kinesióloga")',
    ]);
  });

  it('un usuario o un DNI repetido en el archivo es un error', () => {
    expect(
      personal(
        `${ENCABEZADO}\nana,Ana,Díaz,30111222,Médico,\nANA,Ana,Ruiz,30111333,Médico,\nbeto,Beto,Paz,30.111.222,Enfermero,\n`,
      ).errores,
    ).toEqual([
      'Fila 3, usuario: el usuario "ana" ya está en la fila 2',
      'Fila 4, dni: el DNI 30111222 ya está en la fila 2',
    ]);
  });
});
