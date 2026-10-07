import { expect, test, type Page } from '@playwright/test';
import { esperarPantalla, ingresar } from './soporte';

/**
 * Barrido de operabilidad con los datos REALES de la semilla, contra el servidor real: en cada
 * registro editable, guardar sin tocar no falla ni cambia nada, y corregir y deshacer deja el
 * dato como estaba. Usa el cuerpo que arma cada pantalla (por eso va por la interfaz).
 * Modifica la base de desarrollo y la deja como estaba (quedan las entradas de auditoría).
 */
test.beforeEach(({}, info) => {
  test.skip(info.project.name !== 'pc', 'El barrido se corre una vez, en PC');
});
test.describe.configure({ mode: 'serial' });

const leer = async (page: Page, ruta: string) => {
  const r = await page.request.get(ruta);
  expect(r.ok(), `GET ${ruta}`).toBe(true);
  return ((await r.json()) as { data: unknown }).data;
};

/** Saca lo que cambia solo con el tiempo o con el uso (no con la edición). */
const estable = (dato: unknown) => {
  const { actualizadoEn: _a, ultimoAcceso: _u, ...resto } = dato as Record<string, unknown>;
  return resto;
};

test('pacientes: guardar sin tocar, y corregir y deshacer la obra social', async ({ page }) => {
  await ingresar(page, 'admin');
  const lista = (await leer(page, '/api/pacientes?estado=INTERNADO&porPagina=100')) as {
    id: number;
  }[];
  expect(lista.length).toBeGreaterThan(0);

  for (const { id } of lista) {
    const antes = await leer(page, `/api/pacientes/${id}`);
    await page.goto(`/pacientes/${id}/editar`);
    await esperarPantalla(page);
    await page.getByRole('button', { name: 'Guardar' }).click();
    await expect(page.getByText('Los cambios se guardaron')).toBeVisible();
    expect.soft(estable(await leer(page, `/api/pacientes/${id}`))).toEqual(estable(antes));
  }

  const id = lista[0]!.id;
  const original = (await leer(page, `/api/pacientes/${id}`)) as { obraSocial: string | null };
  const obraSocial = async (valor: string) => {
    await page.goto(`/pacientes/${id}/editar`);
    await esperarPantalla(page);
    await page.getByLabel(/^Obra social/).fill(valor);
    await page.getByRole('button', { name: 'Guardar' }).click();
    await expect(page.getByText('Los cambios se guardaron')).toBeVisible();
  };
  await obraSocial('OSDE (prueba de barrido)');
  expect(((await leer(page, `/api/pacientes/${id}`)) as typeof original).obraSocial).toBe(
    'OSDE (prueba de barrido)',
  );
  await obraSocial(original.obraSocial ?? '');
  expect(((await leer(page, `/api/pacientes/${id}`)) as typeof original).obraSocial).toBe(
    original.obraSocial,
  );
});

test('usuarios: guardar sin tocar no cambia nada', async ({ page }) => {
  await ingresar(page, 'admin');
  const lista = (await leer(page, '/api/usuarios?porPagina=100')) as { id: number }[];
  expect(lista.length).toBeGreaterThan(0);

  for (const { id } of lista) {
    const antes = await leer(page, `/api/usuarios/${id}`);
    await page.goto(`/usuarios/${id}`);
    await esperarPantalla(page);
    await page.getByRole('button', { name: 'Guardar' }).click();
    await expect(page.getByText('Los cambios se guardaron')).toBeVisible();
    expect.soft(estable(await leer(page, `/api/usuarios/${id}`))).toEqual(estable(antes));
  }
});

test('catálogo: guardar sin tocar cada medicamento e insumo no cambia nada', async ({ page }) => {
  await ingresar(page, 'admin');
  const lista = (await leer(page, '/api/insumos?activo=true')) as { id: number; nombre: string }[];
  expect(lista.length).toBeGreaterThan(0);
  await page.goto('/catalogo');
  await esperarPantalla(page);

  for (const insumo of lista) {
    const antes = await leer(page, `/api/insumos/${insumo.id}`);
    await page.getByRole('cell', { name: insumo.nombre, exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Guardar' }).click();
    await expect(page.getByText(`Se guardaron los cambios de ${insumo.nombre}`)).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect.soft(await leer(page, `/api/insumos/${insumo.id}`)).toEqual(antes);
  }
});

test('prescripciones: sin cambios no se puede guardar, y corregir y deshacer la dosis', async ({
  page,
}) => {
  await ingresar(page, 'medico');
  const lista = (await leer(page, '/api/pacientes/1/prescripciones?estado=VIGENTE')) as {
    id: number;
    dosis: number;
  }[];
  expect(lista.length).toBeGreaterThan(0);
  const { id, dosis } = lista[0]!;

  await page.goto(`/prescripciones/${id}`);
  await esperarPantalla(page);
  await expect(page.getByRole('button', { name: 'Guardar cambios' })).toBeDisabled();

  const cambiarDosis = async (valor: number, motivo: string) => {
    await page.getByLabel(/^Dosis/).fill(String(valor));
    await page.getByRole('button', { name: 'Guardar cambios' }).click();
    const dialogo = page.getByRole('dialog', { name: /Guardar cambios/ });
    await dialogo.getByLabel(/Motivo del cambio/).fill(motivo);
    await dialogo.getByRole('button', { name: 'Guardar' }).click();
    await expect(page.getByText('Los cambios se guardaron')).toBeVisible();
  };
  await cambiarDosis(dosis * 2, 'Prueba de barrido: corrección');
  expect(((await leer(page, `/api/prescripciones/${id}`)) as { dosis: number }).dosis).toBe(
    dosis * 2,
  );
  await cambiarDosis(dosis, 'Prueba de barrido: se deshace la corrección');
  expect(((await leer(page, `/api/prescripciones/${id}`)) as { dosis: number }).dosis).toBe(dosis);
});
