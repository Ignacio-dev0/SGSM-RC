// Manual de enfermería · flujos 3 y 4: administrar un medicamento y registrar insumos.

import {
  DEMO,
  abrirTarea,
  avisar,
  campo,
  descartarSiPregunta,
  elegirOpcion,
  esperarPantalla,
  menu,
  quiero,
  subir,
  tarjeta,
  tarjetas,
} from './comun.mjs';
import { capturar } from './marcadores.mjs';

// ───────────────────────── Flujo 3: administrar un medicamento ─────────────────────────

/** El diálogo del rostro abierto, con lo que se confirma (modo demostración). */
export async function capturarRostro(page, archivo, que, detalleQue) {
  const dialogo = page.getByRole('dialog', { name: /Confirmar con su rostro/ });
  await dialogo.waitFor();
  await page.waitForTimeout(500);
  const simular = dialogo.getByRole('button', { name: /^Simular el rostro de/ });
  await capturar(
    page,
    archivo,
    que,
    [
      {
        n: 1,
        que: 'qué se está confirmando (título y operación)',
        loc: dialogo.locator('#titulo-validacion'),
        texto: true,
        tipo: 'area',
        pos: 'esq',
        pad: 10,
      },
      {
        n: 2,
        que: 'aviso «Modo demostración: el rostro se simula»',
        loc: dialogo.getByRole('note'),
        tipo: 'area',
        pos: 'esq',
      },
      {
        n: 3,
        que: detalleQue,
        loc: dialogo.getByRole('note').locator('xpath=following-sibling::div[1]'),
        tipo: 'area',
        pos: 'esq',
      },
      {
        n: 4,
        que: 'botón «Simular el rostro de …» (en la tablet real, la cámara)',
        loc: simular,
        pos: 'esq',
      },
      {
        n: 5,
        que: 'botón Cancelar',
        loc: dialogo.getByRole('button', { name: 'Cancelar' }),
        pos: 'izq',
      },
    ],
    { incluir: [dialogo] },
  );
  return dialogo;
}

export async function flujoAdministrar(page) {
  console.log('\nFlujo 3 · Administrar un medicamento');
  await abrirTarea(page, 'Administrar medicamento', 'Administrar medicamento');
  const selectorPaciente = page.getByRole('combobox', { name: 'Paciente' });
  await elegirOpcion(selectorPaciente, 'Arrieta');
  await page.getByText('Toque el medicamento que va a dar').waitFor();
  await esperarPantalla(page);
  const identidad = page.locator('section').filter({ hasText: DEMO.arrieta }).first();
  const lista = page
    .getByText('Toque el medicamento que va a dar')
    .locator('xpath=following-sibling::div[1]');
  const ayuda = page.getByText('Elija el medicamento que va a dar');
  await capturar(
    page,
    '11-administrar-elegir.png',
    'Administrar medicamento: paciente elegido y sus prescripciones vigentes para tocar',
    [
      {
        n: 1,
        que: 'selector Paciente (cama · apellido, nombre)',
        loc: campo(selectorPaciente),
        pos: 'dentro-der',
      },
      {
        n: 2,
        que: 'identificación del paciente: nombre, DNI, edad y cama',
        loc: identidad,
        tipo: 'area',
        pos: 'esq',
      },
      {
        n: 3,
        que: 'prescripciones vigentes con el estado de la toma (tocar la que se va a dar)',
        loc: lista,
        tipo: 'area',
        pos: 'esq',
      },
      {
        n: 4,
        que: 'botón Confirmar con mi rostro, deshabilitado hasta elegir, con el porqué',
        loc: [ayuda, page.getByRole('button', { name: 'Confirmar con mi rostro' })],
        tipo: 'area',
        pos: 'esq',
      },
    ],
    { desdeArriba: true },
  );

  // Toca la primera prescripción (como la persona).
  const primeraTarjeta = lista.locator('.MuiCardActionArea-root').first();
  await primeraTarjeta.click();
  await page.getByRole('heading', { name: 'Revise antes de confirmar' }).waitFor();
  await esperarPantalla(page);
  const elegida = lista
    .locator('.MuiCard-root')
    .filter({ has: page.locator('[aria-pressed="true"]') });
  await subir(page, elegida, 112);
  const formulario = page
    .getByRole('heading', { name: 'Revise antes de confirmar' })
    .locator('xpath=ancestor::div[contains(@class,"MuiPaper-root")][1]');
  const cantidad = page.getByRole('spinbutton', { name: /^Cantidad/ });
  const resumen = page.getByRole('region', { name: 'Revise antes de confirmar' });
  const confirmar = page.getByRole('button', { name: 'Confirmar con mi rostro' });
  await capturar(
    page,
    '12-administrar-revisar.png',
    'Administrar medicamento: prescripción elegida, cantidad y resumen para revisar antes de confirmar',
    [
      { n: 1, que: 'prescripción elegida (con el tilde)', loc: elegida, tipo: 'area', pos: 'esq' },
      {
        n: 2,
        que: 'campo Cantidad (viene con la dosis prescripta)',
        loc: campo(cantidad),
        pos: 'dentro-der',
      },
      {
        n: 3,
        que: 'campo Observaciones',
        loc: campo(page.getByRole('textbox', { name: 'Observaciones' })),
        pos: 'dentro-der',
      },
      {
        n: 4,
        que: 'resumen «Revise antes de confirmar»: paciente con DNI y cama, qué se da, vía y toma',
        loc: resumen,
        tipo: 'area',
        pos: 'esq-der',
        pad: 10,
      },
      { n: 5, que: 'botón Confirmar con mi rostro', loc: confirmar, pos: 'izq' },
    ],
    { incluir: [formulario] },
  );

  // El diálogo del rostro (modo demostración), abierto y sin confirmar.
  await confirmar.click();
  const dialogo = await capturarRostro(
    page,
    '13-confirmar-rostro.png',
    'Diálogo «Confirmar con su rostro» en modo demostración (la tablet real usa la cámara)',
    'lo que se registra: medicamento, dosis, vía y paciente con DNI y cama',
  );

  // "No se sabe si quedó registrada": se simula el rostro en el navegador y el registro se corta
  // antes de salir (no llega al servidor, no se guarda nada).
  if (quiero('14')) {
    await page.route('**/api/biometria/validar', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { valido: true, validacionToken: 'corte-simulado-manual', similitud: 0.9 },
        }),
      }),
    );
    await page.route('**/api/suministros/medicamentos', (route) =>
      route.request().method() === 'POST' ? route.abort('internetdisconnected') : route.continue(),
    );
    await dialogo.getByRole('button', { name: /^Simular el rostro de/ }).click();
    const alerta = page.getByRole('alert').filter({ hasText: 'No se sabe si quedó registrada' });
    await alerta.waitFor();
    await page.unroute('**/api/biometria/validar');
    await page.unroute('**/api/suministros/medicamentos');
    await esperarPantalla(page);
    await subir(page, alerta, 112);
    await capturar(
      page,
      '14-no-se-sabe.png',
      'Aviso «No se sabe si quedó registrada» (corte de conexión simulado: no se guardó nada)',
      [
        {
          n: 1,
          que: 'aviso «No se sabe si quedó registrada»',
          loc: alerta,
          tipo: 'area',
          pos: 'esq',
        },
        {
          n: 2,
          que: 'botón Ver el historial (revisar antes de volver a intentar)',
          loc: alerta.getByRole('button', { name: 'Ver el historial' }),
          pos: 'abajo',
        },
      ],
      { desdeArriba: true },
    );
  } else {
    await dialogo.getByRole('button', { name: 'Cancelar' }).click();
  }

  // Desde un recordatorio: el panel abre la misma pantalla con todo elegido.
  await menu(page).getByRole('link', { name: 'Recordatorios' }).click();
  await descartarSiPregunta(page);
  await page.getByRole('heading', { level: 1, name: 'Recordatorios' }).waitFor();
  await esperarPantalla(page);
  let delRecordatorio = tarjeta(page, DEMO.villafane, 'Paracetamol');
  if (!(await delRecordatorio.count())) {
    delRecordatorio = tarjetas(page)
      .filter({ has: page.getByRole('button', { name: /^Administrar / }) })
      .first();
  }
  const pacienteRecordatorio = (await delRecordatorio.getByRole('heading').textContent()).trim();
  await delRecordatorio.getByRole('button', { name: /^Administrar / }).click();
  await page.getByRole('heading', { name: 'Revise antes de confirmar' }).waitFor();
  await esperarPantalla(page);
  const tarjetaElegida = page
    .locator('.MuiCard-root')
    .filter({ has: page.locator('[aria-pressed="true"]') });
  await capturar(
    page,
    '15-desde-recordatorio.png',
    `Administrar medicamento abierto desde un recordatorio (${pacienteRecordatorio}): paciente y prescripción ya elegidos`,
    [
      {
        n: 1,
        que: 'flecha Volver (vuelve al panel de Recordatorios)',
        loc: page.getByRole('link', { name: 'Volver' }),
      },
      {
        n: 2,
        que: 'paciente del recordatorio',
        loc: campo(page.getByRole('combobox', { name: 'Paciente' })),
        pos: 'dentro-der',
      },
      {
        n: 3,
        que: 'identificación del paciente',
        loc: page.locator('section').filter({ hasText: 'DNI' }).first(),
        tipo: 'area',
        pos: 'esq',
      },
      {
        n: 4,
        que: 'prescripción del recordatorio, ya elegida',
        loc: tarjetaElegida,
        tipo: 'area',
        pos: 'esq',
      },
    ],
    { desdeArriba: true },
  );
  const filaToma = page
    .getByRole('region', { name: 'Revise antes de confirmar' })
    .locator('dd')
    .filter({ hasText: /recordatorio/ });
  if (!(await filaToma.count()))
    avisar('15-desde-recordatorio.png: el resumen no dice «(recordatorio)»');

  // "No se administró": el diálogo con el motivo escrito, sin registrar.
  await page.getByRole('link', { name: 'Volver' }).click();
  await descartarSiPregunta(page);
  await page.getByRole('heading', { level: 1, name: 'Recordatorios' }).waitFor();
  await esperarPantalla(page);
  let paraNoAdministrar = tarjeta(page, DEMO.arrieta, 'Clonazepam');
  if (!(await paraNoAdministrar.count())) {
    paraNoAdministrar = tarjetas(page)
      .filter({ has: page.getByRole('button', { name: /^No se administró/ }) })
      .first();
  }
  await paraNoAdministrar.getByRole('button', { name: /^No se administró/ }).click();
  const dialogoNo = page.getByRole('dialog', { name: 'No se administró' });
  await dialogoNo.waitFor();
  await dialogoNo
    .getByRole('textbox', { name: /Por qué no se administró/ })
    .fill('En ayunas para un estudio');
  await page.waitForTimeout(400);
  await capturar(
    page,
    '16-no-se-administro.png',
    'Diálogo «No se administró» con el motivo escrito (sin registrar)',
    [
      {
        n: 1,
        que: 'qué toma, de quién y que no se puede deshacer',
        loc: dialogoNo.locator('.MuiDialogContent-root p').first(),
        tipo: 'area',
        pos: 'esq',
        pad: 10,
      },
      {
        n: 2,
        que: 'campo «Por qué no se administró» (obligatorio)',
        loc: campo(dialogoNo.getByRole('textbox', { name: /Por qué no se administró/ })),
        pos: 'dentro-der',
      },
      {
        n: 3,
        que: 'botón Registrar',
        loc: dialogoNo.getByRole('button', { name: 'Registrar' }),
        pos: 'abajo',
      },
      {
        n: 4,
        que: 'botón Cancelar',
        loc: dialogoNo.getByRole('button', { name: 'Cancelar' }),
        pos: 'izq',
      },
    ],
    { incluir: [dialogoNo] },
  );
  await dialogoNo.getByRole('button', { name: 'Cancelar' }).click();
  await dialogoNo.waitFor({ state: 'hidden' });
}

// ───────────────────────── Flujo 4: registrar insumos ─────────────────────────

export async function flujoInsumos(page) {
  console.log('\nFlujo 4 · Registrar insumos');
  await abrirTarea(page, 'Registrar insumos', 'Registrar insumos');
  const selectorPaciente = page.getByRole('combobox', { name: 'Paciente' });
  await elegirOpcion(selectorPaciente, 'Olmedo');
  await page.getByRole('heading', { name: 'Catálogo' }).waitFor();
  await esperarPantalla(page);
  const catalogo = page.getByRole('heading', { name: 'Catálogo' }).locator('..');
  const botones = catalogo.getByRole('button', { name: /^Agregar / });
  const buscar = page.getByRole('searchbox', { name: 'Buscar insumo' });
  await capturar(
    page,
    '17-insumos-catalogo.png',
    'Registrar insumos: paciente elegido y catálogo de insumos para tocar',
    [
      { n: 1, que: 'selector Paciente', loc: campo(selectorPaciente), pos: 'dentro-der' },
      {
        n: 2,
        que: 'identificación del paciente',
        loc: page.locator('section').filter({ hasText: DEMO.olmedo }).first(),
        tipo: 'area',
        pos: 'esq',
      },
      { n: 3, que: 'campo Buscar insumo', loc: campo(buscar), pos: 'dentro-der' },
      {
        n: 4,
        que: 'insumos del catálogo (cada toque suma uno)',
        loc: botones.first().locator('..'),
        tipo: 'area',
        pos: 'esq',
      },
    ],
    { desdeArriba: true },
  );

  // Toca tres insumos (dos veces el primero), como al lado de la cama.
  const nombres = ['Gasa estéril', 'Apósito adhesivo', 'Guantes de examen'];
  let tocados = 0;
  for (const nombre of nombres) {
    const b = catalogo.getByRole('button', { name: new RegExp(`^Agregar ${nombre}`) }).first();
    if (await b.count()) {
      await b.click();
      tocados++;
    }
  }
  if (!tocados) {
    await botones.nth(0).click();
    await botones.nth(1).click();
  }
  await botones.first().click(); // uno más del primero: la cantidad pasa a 2
  await page.getByRole('textbox', { name: 'Observaciones' }).fill('Curación de la herida');
  await page.waitForTimeout(300);
  const lista = page.getByRole('list', { name: 'Insumos a registrar' });
  const panel = page.getByRole('heading', { name: 'Insumos a registrar' }).locator('..');
  await subir(page, page.getByRole('heading', { name: 'Insumos a registrar' }), 120);
  const filaUno = lista.getByRole('listitem').first();
  await capturar(
    page,
    '18-insumos-lista.png',
    'Registrar insumos: la lista de lo que se va a registrar, con cantidades y observaciones',
    [
      { n: 1, que: 'insumos a registrar con su cantidad', loc: lista, tipo: 'area', pos: 'esq' },
      {
        n: 2,
        que: 'cantidad de la fila con los botones restar uno, sumar uno y quitar',
        loc: [
          filaUno.getByRole('button', { name: /^Restar uno/ }),
          filaUno.getByRole('button', { name: /^Quitar/ }),
        ],
        tipo: 'area',
      },
      {
        n: 3,
        que: 'campo Observaciones',
        loc: campo(page.getByRole('textbox', { name: 'Observaciones' })),
        pos: 'dentro-der',
      },
      {
        n: 4,
        que: 'botón Confirmar con mi rostro',
        loc: page.getByRole('button', { name: 'Confirmar con mi rostro' }),
        pos: 'izq',
      },
    ],
    { incluir: [panel] },
  );

  await page.getByRole('button', { name: 'Confirmar con mi rostro' }).click();
  const dialogo = await capturarRostro(
    page,
    '19-insumos-rostro.png',
    'Confirmar con su rostro el registro de insumos (modo demostración, sin confirmar)',
    'los insumos con sus cantidades y el paciente con DNI y cama',
  );
  await dialogo.getByRole('button', { name: 'Cancelar' }).click();
  await dialogo.waitFor({ state: 'hidden' });
}
