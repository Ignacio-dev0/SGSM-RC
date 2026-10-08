// Listas para armar datos verosímiles en el volumen (T702). Ninguna persona es real.

/** Apellidos frecuentes en Argentina, del más al menos común (se eligen con pesos de Zipf). */
// prettier-ignore
export const APELLIDOS = [
  'González', 'Rodríguez', 'Gómez', 'Fernández', 'López', 'Díaz', 'Martínez', 'Pérez',
  'García', 'Sánchez', 'Romero', 'Sosa', 'Álvarez', 'Torres', 'Ruiz', 'Ramírez', 'Flores',
  'Acosta', 'Benítez', 'Medina', 'Suárez', 'Herrera', 'Aguirre', 'Pereyra', 'Gutiérrez',
  'Giménez', 'Molina', 'Silva', 'Castro', 'Rojas', 'Ortiz', 'Núñez', 'Luna', 'Juárez',
  'Cabrera', 'Ríos', 'Ferreyra', 'Godoy', 'Morales', 'Domínguez', 'Moreno', 'Peralta', 'Vega',
  'Carrizo', 'Quiroga', 'Castillo', 'Ledesma', 'Muñoz', 'Ojeda', 'Ponce', 'Vera', 'Vázquez',
  'Villalba', 'Cardozo', 'Navarro', 'Coronel', 'Figueroa', 'Correa', 'Cáceres', 'Vargas',
  'Paz', 'Mansilla', 'Ibáñez', 'Arias', 'Bustos', 'Ramos', 'Rivero', 'Mendoza', 'Chávez',
  'Maldonado', 'Méndez', 'Ávila', 'Toledo', 'Duarte', 'Campos', 'Bravo', 'Miranda', 'Escobar',
  'Zárate', 'Barrios',
];

// prettier-ignore
export const NOMBRES_FEMENINOS = [
  'María', 'Ana', 'Rosa', 'Laura', 'Silvia', 'Graciela', 'Marta', 'Norma', 'Susana', 'Claudia',
  'Patricia', 'Mónica', 'Beatriz', 'Liliana', 'Alicia', 'Carolina', 'Valeria', 'Lucía', 'Sofía',
  'Julieta', 'Florencia', 'Gabriela', 'Romina', 'Daniela', 'Elena', 'Teresa', 'Inés', 'Noemí',
];

// prettier-ignore
export const NOMBRES_MASCULINOS = [
  'Juan', 'Carlos', 'José', 'Luis', 'Jorge', 'Miguel', 'Roberto', 'Daniel', 'Héctor', 'Ricardo',
  'Oscar', 'Raúl', 'Alberto', 'Eduardo', 'Mario', 'Hugo', 'Sergio', 'Pablo', 'Martín', 'Diego',
  'Lucas', 'Matías', 'Nicolás', 'Facundo', 'Gustavo', 'Néstor', 'Rubén', 'Ramón',
];

// prettier-ignore
export const OBRAS_SOCIALES = [
  'PAMI', 'IOSFA', 'OSDE', 'Swiss Medical', 'OSECAC', 'IOMA', 'Galeno', 'Medifé', 'OSPRERA',
  'Sin obra social',
];

// prettier-ignore
export const DIAGNOSTICOS = [
  'ACV isquémico con hemiparesia derecha', 'ACV hemorrágico con hemiparesia izquierda',
  'Traumatismo encefalocraneano', 'Lesión medular dorsal incompleta', 'Lesión medular cervical',
  'Fractura de cadera operada', 'Reemplazo total de rodilla', 'Amputación transfemoral',
  'Amputación transtibial', 'Politraumatismo', 'Síndrome de Guillain-Barré',
  'Enfermedad de Parkinson avanzada', 'Esclerosis múltiple', 'Desacondicionamiento post UTI',
  'Neumonía con desacondicionamiento', 'Rehabilitación respiratoria post COVID',
];

// prettier-ignore
export const MOTIVOS_EGRESO = [
  'Alta médica', 'Alta médica', 'Alta médica', 'Alta con internación domiciliaria',
  'Derivación a otro centro', 'Alta voluntaria',
];

export const SALAS = [
  { nombre: 'Sala A – Neurorrehabilitación', piso: 'PB', prefijo: 'A' },
  { nombre: 'Sala B – Traumatología', piso: 'PB', prefijo: 'B' },
  { nombre: 'Sala C – Cuidados intermedios', piso: '1', prefijo: 'C' },
  { nombre: 'Sala D – Lesiones medulares', piso: '1', prefijo: 'D' },
  { nombre: 'Sala E – Rehabilitación respiratoria', piso: '2', prefijo: 'E' },
  { nombre: 'Sala F – Amputados y ortopedia', piso: '2', prefijo: 'F' },
];

/** Medicamentos: nombre, unidad de la dosis y dosis habitual. */
// prettier-ignore
export const MEDICAMENTOS: [string, string, number][] = [
  ['Paracetamol', 'mg', 500], ['Ibuprofeno', 'mg', 400], ['Enalapril', 'mg', 10],
  ['Omeprazol', 'mg', 20], ['Metformina', 'mg', 850], ['Baclofeno', 'mg', 10],
  ['Clonazepam', 'mg', 0.5], ['Enoxaparina', 'mg', 40], ['Insulina NPH', 'UI', 10],
  ['Ceftriaxona', 'g', 1], ['Ketorolac', 'mg', 30], ['Diclofenac', 'mg', 75],
  ['Solución fisiológica', 'ml', 500], ['Amoxicilina', 'mg', 500], ['Amlodipina', 'mg', 5],
  ['Atorvastatina', 'mg', 20], ['Losartán', 'mg', 50], ['Furosemida', 'mg', 40],
  ['Espironolactona', 'mg', 25], ['Levotiroxina', 'mcg', 50], ['Pregabalina', 'mg', 75],
  ['Gabapentina', 'mg', 300], ['Tramadol', 'mg', 50], ['Morfina', 'mg', 5],
  ['Dexametasona', 'mg', 4], ['Metoclopramida', 'mg', 10], ['Ondansetrón', 'mg', 4],
  ['Pantoprazol', 'mg', 40], ['Lactulosa', 'ml', 15], ['Sertralina', 'mg', 50],
  ['Escitalopram', 'mg', 10], ['Quetiapina', 'mg', 25], ['Risperidona', 'mg', 1],
  ['Haloperidol', 'mg', 2.5], ['Lorazepam', 'mg', 1], ['Diazepam', 'mg', 5],
  ['Levetiracetam', 'mg', 500], ['Carbamazepina', 'mg', 200], ['Ácido valproico', 'mg', 500],
  ['Fenitoína', 'mg', 100], ['Ácido acetilsalicílico', 'mg', 100], ['Clopidogrel', 'mg', 75],
  ['Acenocumarol', 'mg', 4], ['Heparina sódica', 'UI', 5000], ['Vancomicina', 'g', 1],
  ['Ciprofloxacina', 'mg', 500], ['Cefalexina', 'mg', 500], ['Nitrofurantoína', 'mg', 100],
  ['Tizanidina', 'mg', 2], ['Bisoprolol', 'mg', 5],
];

export const PRESENTACIONES_MEDICAMENTO = [
  'Comprimidos x 20',
  'Comprimidos x 30',
  'Ampolla x 1',
  'Frasco x 100 ml',
];

/** Insumos no medicinales: nombre y unidad en la que se registra. */
// prettier-ignore
export const INSUMOS: [string, string][] = [
  ['Pañal para adultos talle M', 'unidad'], ['Pañal para adultos talle G', 'unidad'],
  ['Guantes de examen', 'par'], ['Gasa estéril 10 x 10 cm', 'unidad'],
  ['Apósito adhesivo', 'unidad'], ['Jeringa 5 ml', 'unidad'], ['Jeringa 10 ml', 'unidad'],
  ['Aguja 21G', 'unidad'], ['Sonda vesical', 'unidad'], ['Bolsa colectora de orina', 'unidad'],
  ['Cánula nasal de oxígeno', 'unidad'], ['Máscara de oxígeno', 'unidad'],
  ['Filtro antibacteriano HME', 'unidad'], ['Catéter intravenoso 20G', 'unidad'],
  ['Equipo de venoclisis', 'unidad'], ['Venda elástica', 'unidad'], ['Algodón', 'paquete'],
  ['Cinta hipoalergénica', 'rollo'], ['Apósito hidrocoloide', 'unidad'],
  ['Electrodos de ECG', 'unidad'], ['Sonda nasogástrica', 'unidad'],
  ['Pañal para adultos talle XG', 'unidad'], ['Guantes estériles', 'par'],
  ['Bajalenguas', 'unidad'], ['Protector de colchón', 'unidad'],
];

export const PRESENTACIONES_INSUMO = ['Unidad', 'Caja x 10', 'Caja x 50', 'Paquete x 100'];

/** Tipos de estudio de la semilla y los nombres con que se programan. */
// prettier-ignore
export const TIPOS_ESTUDIO: [string, string | null, string[]][] = [
  ['Análisis de laboratorio', 'Ayuno de 8 horas', ['Hemograma y función renal', 'Glucemia', 'Ionograma']],
  ['Radiografía', null, ['Rx de tórax', 'Rx de cadera', 'Rx de columna lumbar']],
  ['Ecografía abdominal', 'Ayuno de 6 horas', ['Ecografía abdominal']],
  ['Electrocardiograma', null, ['Electrocardiograma']],
  ['Tomografía computada', 'Consultar si requiere contraste', ['TC de cerebro', 'TC de tórax']],
  ['Resonancia magnética', 'Retirar objetos metálicos', ['RM de columna', 'RM de cerebro']],
  ['Videodeglución', 'Ayuno de 4 horas', ['Videodeglución']],
  ['Interconsulta', null, ['Interconsulta con cardiología', 'Interconsulta con urología']],
];

export const MOTIVOS_NO_ADMINISTRADO = [
  'Paciente en ayunas para un estudio',
  'El paciente rechazó la medicación',
  'Paciente en sesión de kinesiología',
  'Vómitos: se avisó al médico',
  'Paciente dormido, se reprograma',
];

export const MOTIVOS_CANCELACION_ESTUDIO = [
  'El paciente no estaba en condiciones',
  'Equipo fuera de servicio',
  'Se reprogramó en otro centro',
  'Indicación suspendida por el médico',
];

export const OBSERVACIONES_SUMINISTRO = [
  'Paciente refiere dolor',
  'Se administró con el desayuno',
  'Tolera bien la vía oral',
  'Cambio de pañal y control de piel',
];
