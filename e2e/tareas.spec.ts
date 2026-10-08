import { expect, test } from '@playwright/test';
import { esperarPantalla, ingresar } from './soporte';

/**
 * Tareas núcleo de PRODUCT.md: cada una arranca en el inicio y avanza SOLO tocando lo que la
 * interfaz ofrece, con las palabras de quien la hace. Prueba que la tarea se encuentra, no solo
 * que funciona. No guarda nada (el ciclo con guardado está en ciclo.spec.ts).
 */
test.beforeEach(({}, info) => {
  test.skip(info.project.name !== 'pc', 'Las tareas se recorren una vez, en PC');
});

test('T1 · darle a un paciente la medicación que le toca', async ({ page }) => {
  await ingresar(page, 'enfermero');
  await page.goto('/');
  await page.getByRole('link', { name: /Administrar medicamento/ }).click();
  await page.getByLabel('Paciente').selectOption({ label: 'A-01 · Benítez, Rosa' });
  await page.getByRole('button', { name: /Paracetamol/ }).click();
  await expect(page.getByRole('region', { name: 'Revise antes de confirmar' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Confirmar con mi rostro' })).toBeVisible();
});

test('T2 · anotar los insumos que usé con un paciente', async ({ page }) => {
  await ingresar(page, 'enfermero');
  await page.goto('/');
  await page.getByRole('link', { name: /Registrar insumos/ }).click();
  await page.getByLabel('Paciente').selectOption({ label: 'A-01 · Benítez, Rosa' });
  await page.getByRole('button', { name: /Agregar Gasa estéril/ }).click();
  await expect(page.getByRole('list', { name: 'Insumos a registrar' })).toContainText('Gasa');
});

test('T3 · ver qué medicación le toca a un paciente y a qué hora', async ({ page }) => {
  await ingresar(page, 'enfermero');
  await page.goto('/');
  await page.getByRole('link', { name: /Buscar paciente/ }).click();
  await page
    .getByRole('cell', { name: /Benítez/ })
    .first()
    .click();
  // La ficha abre en Prescripciones: medicamento, dosis y próxima toma a la vista.
  const tabla = page.getByRole('table', { name: 'Prescripciones' });
  await expect(tabla).toContainText('Paracetamol');
  await expect(tabla).toContainText(/\d\d:\d\d/);
});

test('T4 · encontrar a un paciente por su cama o apellido', async ({ page }) => {
  await ingresar(page, 'enfermero');
  await page.goto('/');
  await page.getByRole('link', { name: /Buscar paciente/ }).click();
  await page.getByLabel(/Buscar/).fill('a-01');
  await esperarPantalla(page);
  await page
    .getByRole('cell', { name: /Benítez/ })
    .first()
    .click();
  await expect(page.getByRole('heading', { name: 'Benítez, Rosa' })).toBeVisible();
});

test('T5 · corregir algo que cargué mal', async ({ page }) => {
  await ingresar(page, 'enfermero');
  await page.goto('/');
  await page.getByRole('link', { name: /Ver lo que se registró/ }).click();
  await page.getByRole('table', { name: 'Suministros' }).getByRole('row').nth(1).click();
  await expect(
    page.getByRole('dialog', { name: /Suministro/ }).getByRole('button', { name: 'Corregir' }),
  ).toBeVisible();
});

test('T6 · internar a un paciente en una cama libre', async ({ page }) => {
  await ingresar(page, 'medico');
  await page.goto('/');
  await page.getByRole('link', { name: /Internar paciente/ }).click();
  await expect(page.getByRole('heading', { name: 'Internar paciente' })).toBeVisible();
  await expect(page.getByLabel(/^Cama/)).toBeVisible();
});

test('T7 · indicar un medicamento a un paciente', async ({ page }) => {
  await ingresar(page, 'medico');
  await page.goto('/');
  await page.getByRole('link', { name: /Buscar paciente/ }).click();
  await page
    .getByRole('cell', { name: /Benítez/ })
    .first()
    .click();
  await page.getByRole('button', { name: /Nueva prescripción/ }).click();
  await expect(page.getByRole('heading', { name: 'Nueva prescripción' })).toBeVisible();
});

test('T8 · cambiar o suspender una indicación', async ({ page }) => {
  await ingresar(page, 'medico');
  await page.goto('/');
  await page.getByRole('link', { name: /Buscar paciente/ }).click();
  await page
    .getByRole('cell', { name: /Benítez/ })
    .first()
    .click();
  await page.getByRole('table', { name: 'Prescripciones' }).getByRole('row').nth(1).click();
  await expect(page.getByRole('button', { name: 'Suspender' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Guardar cambios' })).toBeVisible();
});

test('T9 · dar de alta a un paciente', async ({ page }) => {
  await ingresar(page, 'medico');
  await page.goto('/');
  await page.getByRole('link', { name: /Buscar paciente/ }).click();
  await page
    .getByRole('cell', { name: /Benítez/ })
    .first()
    .click();
  await page.getByRole('button', { name: 'Dar de alta' }).click();
  await expect(page.getByRole('dialog', { name: /Dar de alta/ })).toContainText('Benítez, Rosa');
});

test('T10 · dar de alta a un enfermero nuevo y registrar su cara', async ({ page }) => {
  await ingresar(page, 'admin');
  await page.goto('/');
  await page.getByRole('link', { name: /Nuevo usuario/ }).click();
  await expect(page.getByRole('heading', { name: 'Nuevo usuario' })).toBeVisible();
  // Después de guardar se llega a la ficha del usuario; desde ahí, su rostro. Para no crear
  // un usuario en cada corrida, se entra a la ficha de uno existente por el menú.
  await page
    .getByRole('navigation', { name: 'Menú principal' })
    .getByRole('link', { name: 'Usuarios' })
    .click();
  await page.getByRole('cell', { name: 'enfermero', exact: true }).click();
  await page.getByRole('link', { name: /Rostro/ }).click();
  await expect(
    page.getByRole('button', { name: /Registrar rostro|Actualizar rostro/ }),
  ).toBeVisible();
});

test('T11 · ver qué tomas y estudios hay que atender ahora', async ({ page }) => {
  await ingresar(page, 'enfermero');
  await page.goto('/');
  await page.getByRole('link', { name: /Tomas y estudios para atender/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Recordatorios' })).toBeVisible();
  // También a un toque desde cualquier pantalla: la insignia de la barra.
  await expect(page.getByRole('link', { name: /^Recordatorios: \d+ para atender/ })).toBeVisible();
});

test('T13 · programar un estudio (médico)', async ({ page }) => {
  await ingresar(page, 'medico');
  await page.goto('/');
  await page.getByRole('link', { name: /Buscar paciente/ }).click();
  await page
    .getByRole('cell', { name: /Benítez/ })
    .first()
    .click();
  await page.getByRole('tab', { name: 'Estudios' }).click();
  await page.getByRole('button', { name: 'Programar estudio' }).first().click();
  const dialogo = page.getByRole('dialog', { name: 'Programar estudio' });
  await expect(dialogo.getByLabel('Tipo de estudio')).toBeVisible();
  await expect(dialogo.getByLabel('Fecha y hora')).toBeVisible();
});

test('T14 · ver cuánto se usó en un período (y descargarlo, el administrador)', async ({
  page,
}) => {
  await ingresar(page, 'admin');
  await page.goto('/');
  await page.getByRole('link', { name: /Ver reportes/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Reportes' })).toBeVisible();
  await page.getByRole('button', { name: '30 días' }).click();
  await expect(page.getByRole('table', { name: /Reporte de suministros por/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Descargar PDF' })).toBeVisible();
  await page.getByRole('tab', { name: 'Estadísticas' }).click();
  await expect(page.getByRole('button', { name: /Ver como tabla/ }).first()).toBeVisible();
});

test('T14 · el médico ve los reportes sin descargar', async ({ page }) => {
  await ingresar(page, 'medico');
  await page.goto('/');
  await page.getByRole('link', { name: /Ver reportes/ }).click();
  await page.getByRole('button', { name: '30 días' }).click();
  await expect(page.getByRole('table', { name: /Reporte de suministros por/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Descargar PDF' })).toHaveCount(0);
  await expect(page.getByText(/pídaselo a un administrador/)).toBeVisible();
});

test('T15 · averiguar quién cambió algo y cuándo', async ({ page }) => {
  await ingresar(page, 'admin');
  await page.goto('/');
  await page.getByRole('link', { name: /Ver quién cambió algo/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Auditoría' })).toBeVisible();
  const tabla = page.getByRole('table', { name: 'Movimientos' });
  await expect(tabla).toBeVisible();
  // Lo que cambió: se filtran los movimientos que modificaron algo y se abre el primero.
  await page.getByLabel('Acción').selectOption({ label: 'Modificó' });
  await esperarPantalla(page);
  await tabla.getByRole('row').nth(1).click();
  await expect(page.getByRole('table', { name: 'Antes y después' })).toBeVisible();
});
