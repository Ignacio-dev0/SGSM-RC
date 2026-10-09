// Manual de enfermería · flujos 5 y 6: paciente, ficha, corrección, estudio, alergias y "No se administró".

import { capturarRostro } from './administrar.mjs';
import {
  DEMO,
  TABLET,
  abrirTarea,
  arriba,
  avisar,
  campo,
  descartarSiPregunta,
  esperarPantalla,
  menu,
  quiero,
  subir,
  tarjeta,
} from './comun.mjs';
import { capturar } from './marcadores.mjs';

// ───────────────────────── Flujo 5: paciente, ficha, corrección y estudio ─────────────────────────

async function buscarPaciente(page, texto) {
  await abrirTarea(page, 'Buscar paciente', 'Pacientes');
  const buscar = page.getByRole('searchbox', { name: 'Buscar por apellido, DNI o cama' });
  await buscar.fill(texto);
  await page.waitForTimeout(700);
  await esperarPantalla(page);
  return buscar;
}

export async function flujoPaciente(page) {
  console.log('\nFlujo 5 · Buscar un paciente, su ficha, corregir y confirmar un estudio');
  const buscar = await buscarPaciente(page, 'Olmedo');
  const fila = page
    .getByRole('row', { name: `Abrir ${DEMO.olmedo}` })
    .or(page.getByRole('button', { name: `Abrir ${DEMO.olmedo}` }))
    .first();
  await fila.waitFor();
  await capturar(
    page,
    '20-buscar-paciente.png',
    'Buscar paciente: búsqueda por apellido, DNI o cama, con filtros de sala y estado',
    [
      { n: 1, que: 'campo Buscar por apellido, DNI o cama', loc: campo(buscar), pos: 'dentro-der' },
      {
        n: 2,
        que: 'filtro Sala',
        loc: campo(page.getByRole('combobox', { name: 'Sala' })),
        pos: 'dentro-der',
      },
      {
        n: 3,
        que: 'filtro Estado (Internados, Egresados o Todos)',
        loc: campo(page.getByRole('combobox', { name: 'Estado' })),
        pos: 'dentro-der',
      },
      {
        n: 4,
        que: 'fila del paciente encontrado (tocar para abrir la ficha)',
        loc: fila,
        tipo: 'area',
        pos: 'esq',
      },
    ],
    { desdeArriba: true, incluir: [page.getByText(/^Página \d+ de \d+/).first()] },
  );

  await fila.click();
  await page.getByRole('heading', { level: 1, name: DEMO.olmedo }).waitFor();
  await esperarPantalla(page, 600);
  const pestanas = page.getByRole('tablist', { name: 'Secciones de la ficha' });
  const prescripciones = page
    .getByRole('list', { name: 'Prescripciones' })
    .or(page.getByRole('tabpanel'))
    .first();
  const tarjetaP = page.locator('[aria-labelledby$="-titulo"]').first().locator('..');
  const encabezado = page.getByRole('heading', { level: 1, name: DEMO.olmedo }).locator('..');
  await capturar(
    page,
    '21-ficha-prescripciones.png',
    'Ficha del paciente, pestaña Prescripciones: cada medicamento con su próxima toma y Administrar',
    [
      {
        n: 1,
        que: 'paciente: nombre, DNI, edad y cama',
        loc: encabezado,
        tipo: 'area',
        pos: 'esq',
      },
      {
        n: 2,
        que: 'botones Administrar medicamento y Registrar insumos',
        loc: [
          page.getByRole('button', { name: 'Administrar medicamento' }),
          page.getByRole('button', { name: 'Registrar insumos' }),
        ],
        tipo: 'area',
        pos: 'esq',
      },
      {
        n: 3,
        que: 'pestañas Datos, Prescripciones, Estudios e Historial',
        loc: pestanas,
        tipo: 'area',
        pos: 'esq',
      },
      {
        n: 4,
        que: 'próxima toma y última administración',
        loc: tarjetaP.getByText(/Próxima:|Última:/).first(),
        pos: 'borde-izq',
        en: tarjetaP,
      },
      {
        n: 5,
        que: 'botón Administrar de esa prescripción',
        loc: tarjetaP.getByRole('button', { name: /^Administrar / }),
        pos: 'borde-izq',
        en: tarjetaP,
      },
    ],
    { desdeArriba: true, incluir: [tarjetaP] },
  );
  void prescripciones;

  // Historial → Suministros.
  await pestanas.getByRole('tab', { name: 'Historial' }).click();
  await esperarPantalla(page);
  const subpestana = page.getByRole('tab', { name: /^Suministros/ });
  await subpestana.click();
  await esperarPantalla(page);
  const tabla = page
    .getByRole('table', { name: 'Suministros' })
    .or(page.getByRole('list', { name: 'Suministros' }))
    .first();
  const filaKetorolac = page
    .getByRole('row', { name: /^Abrir el registro/ })
    .or(page.getByRole('button', { name: /^Abrir el registro/ }))
    .filter({ hasText: 'Ketorolac' })
    .first();
  await filaKetorolac.waitFor();
  await capturar(
    page,
    '22-ficha-historial.png',
    'Ficha del paciente, pestaña Historial: los suministros registrados, para abrir y corregir',
    [
      {
        n: 1,
        que: 'pestaña Historial',
        loc: pestanas.getByRole('tab', { name: 'Historial' }),
        pos: 'abajo',
      },
      {
        n: 2,
        que: 'fechas Desde y Hasta',
        loc: [campo(page.getByLabel('Desde')), campo(page.getByLabel('Hasta'))],
        tipo: 'area',
        pos: 'esq',
      },
      { n: 3, que: 'pestaña Suministros del historial', loc: subpestana, pos: 'der' },
      {
        n: 4,
        que: 'un registro (tocar para abrirlo)',
        loc: filaKetorolac,
        tipo: 'area',
        pos: 'esq',
      },
    ],
    { desdeArriba: true, incluir: [tabla] },
  );

  // Abrir el registro y corregir (sin confirmar).
  await filaKetorolac.click();
  const detalle = page.getByRole('dialog', { name: /^Suministro del/ });
  await detalle.waitFor();
  await page.waitForTimeout(500);
  const corregir = detalle.getByRole('button', { name: 'Corregir' });
  if (!(await corregir.count())) {
    throw new Error(
      'El registro no ofrece Corregir: ¿pasaron 24 h desde preparar-datos.mjs? Volver a correrlo.',
    );
  }
  await capturar(
    page,
    '23-suministro-detalle.png',
    'Detalle de un registro de administración, con Corregir (dentro de las 24 h)',
    [
      {
        n: 1,
        que: 'datos del registro: paciente, quién registró, prescripción, detalle',
        loc: detalle.locator('.MuiDialogContent-root > div').last(),
        tipo: 'area',
        pos: 'esq',
        pad: 10,
      },
      { n: 2, que: 'botón Corregir', loc: corregir, pos: 'izq' },
      {
        n: 3,
        que: 'botón Cerrar',
        loc: detalle.getByRole('button', { name: 'Cerrar' }),
        pos: 'abajo',
      },
    ],
    { incluir: [detalle] },
  );

  await corregir.click();
  const cantidad = detalle.getByRole('spinbutton', { name: /^Cantidad/ });
  await cantidad.waitFor();
  await cantidad.fill('15');
  await detalle
    .getByRole('textbox', { name: /^Motivo de la corrección/ })
    .fill('Se cargó la dosis completa y se dio la mitad');
  await page.waitForTimeout(300);
  const confirmarCorreccion = detalle.getByRole('button', {
    name: 'Confirmar corrección con mi rostro',
  });
  await capturar(
    page,
    '24-corregir.png',
    'Corrección de un registro: nueva cantidad y motivo, antes de confirmar con el rostro',
    [
      { n: 1, que: 'campo Cantidad corregida', loc: campo(cantidad), pos: 'der' },
      {
        n: 2,
        que: 'campo Motivo de la corrección (obligatorio)',
        loc: campo(detalle.getByRole('textbox', { name: /^Motivo de la corrección/ })),
        pos: 'dentro-der',
      },
      {
        n: 3,
        que: 'botón Confirmar corrección con mi rostro',
        loc: confirmarCorreccion,
        pos: 'abajo',
      },
      {
        n: 4,
        que: 'botón Cancelar (deja el registro como estaba)',
        loc: detalle.getByRole('button', { name: 'Cancelar' }),
        pos: 'izq',
      },
    ],
    { incluir: [detalle] },
  );

  await confirmarCorreccion.click();
  const rostro = await capturarRostro(
    page,
    '25-corregir-rostro.png',
    'Confirmar con su rostro la corrección (modo demostración, sin confirmar): antes, después y motivo',
    'la corrección: paciente, antes, después y motivo',
  );
  await rostro.getByRole('button', { name: 'Cancelar' }).click();
  await rostro.waitFor({ state: 'hidden' });
  await detalle.getByRole('button', { name: 'Cancelar' }).click();
  await detalle.getByRole('button', { name: 'Cerrar' }).click();
  await detalle.waitFor({ state: 'hidden' });

  // Confirmar que se realizó un estudio: el de hoy (Villafañe), desde su ficha.
  await buscarPaciente(page, 'Villafañe');
  await page
    .getByRole('row', { name: `Abrir ${DEMO.villafane}` })
    .or(page.getByRole('button', { name: `Abrir ${DEMO.villafane}` }))
    .first()
    .click();
  await page.getByRole('heading', { level: 1, name: DEMO.villafane }).waitFor();
  await esperarPantalla(page);
  const pestanasV = page.getByRole('tablist', { name: 'Secciones de la ficha' });
  await pestanasV.getByRole('tab', { name: 'Estudios' }).click();
  await esperarPantalla(page);
  const botonConfirmar = page.getByRole('button', { name: /^Confirmar que se realizó/ }).first();
  await botonConfirmar.waitFor();
  const tarjetaEstudio = botonConfirmar.locator(
    'xpath=ancestor::*[contains(@class,"MuiPaper-root")][1]',
  );
  await capturar(
    page,
    '26-ficha-estudios.png',
    'Ficha del paciente, pestaña Estudios: el estudio programado con Confirmar que se realizó',
    [
      // Sobre la esquina de la pestaña: abajo quedaba al lado del título «Programados».
      {
        n: 1,
        que: 'pestaña Estudios',
        loc: pestanasV.getByRole('tab', { name: 'Estudios' }),
        pos: 'esq',
        fijo: true,
      },
      {
        n: 2,
        que: 'estudio programado: nombre, fecha y hora',
        loc: tarjetaEstudio,
        tipo: 'area',
        pos: 'esq',
      },
      { n: 3, que: 'botón Confirmar que se realizó', loc: botonConfirmar, pos: 'izq' },
    ],
    { desdeArriba: true },
  );

  await botonConfirmar.click();
  const dialogoEstudio = page.getByRole('dialog', { name: 'Confirmar que se realizó el estudio' });
  await dialogoEstudio.waitFor();
  await dialogoEstudio.getByRole('region', { name: 'Revise antes de confirmar' }).waitFor();
  await page.waitForTimeout(500);
  await capturar(
    page,
    '27-confirmar-estudio.png',
    'Confirmar que se realizó el estudio: resumen, observaciones y Confirmar con mi rostro (sin confirmar)',
    [
      {
        n: 1,
        que: 'qué se confirma: estudio, fecha y hora, preparación y paciente',
        loc: dialogoEstudio.getByRole('region', { name: 'Revise antes de confirmar' }),
        tipo: 'area',
        pos: 'esq',
      },
      {
        n: 2,
        que: 'campo Observaciones (opcional)',
        loc: campo(dialogoEstudio.getByRole('textbox', { name: /^Observaciones/ })),
        pos: 'dentro-der',
      },
      {
        n: 3,
        que: 'botón Confirmar con mi rostro',
        loc: dialogoEstudio.getByRole('button', { name: 'Confirmar con mi rostro' }),
        pos: 'abajo',
      },
      {
        n: 4,
        que: 'botón Cancelar',
        loc: dialogoEstudio.getByRole('button', { name: 'Cancelar' }),
        pos: 'izq',
      },
    ],
    { incluir: [dialogoEstudio] },
  );
  await dialogoEstudio.getByRole('button', { name: 'Cancelar' }).click();
}

// ───────────────── Flujo 6: alergias en Datos y "No se administró" en el historial ─────────────────

/** Alergia ficticia de Olmedo: solo en lo que recibe el navegador para la captura 29, no en la base. */
const ALERGIA = 'Alérgico a la penicilina.';
/** Motivo del "No se administró" que se muestra en la captura 30 (se registra con --registrar-no-administrado). */
const MOTIVO_NO_ADMINISTRADO = 'Lo rechazó: refiere náuseas';
const REGISTRAR_NO_ADMINISTRADO = process.argv.includes('--registrar-no-administrado');

async function abrirFicha(page, apellido, nombre) {
  await buscarPaciente(page, apellido);
  await page
    .getByRole('row', { name: `Abrir ${nombre}` })
    .or(page.getByRole('button', { name: `Abrir ${nombre}` }))
    .first()
    .click();
  await page.getByRole('heading', { level: 1, name: nombre }).waitFor();
  await esperarPantalla(page);
  return page.getByRole('tablist', { name: 'Secciones de la ficha' });
}

/** La fila del "No se administró" de Arrieta con el motivo de la captura, en Historial › Modificaciones. */
async function filaNoAdministrado(page) {
  const pestanas = await abrirFicha(page, 'Arrieta', DEMO.arrieta);
  await pestanas.getByRole('tab', { name: 'Historial' }).click();
  await esperarPantalla(page);
  const subpestana = page.getByRole('tab', { name: /^Modificaciones/ });
  await subpestana.click();
  await esperarPantalla(page);
  const fila = page
    .getByRole('row')
    .filter({ hasText: 'NO_ADMINISTRAR' })
    .filter({ hasText: MOTIVO_NO_ADMINISTRADO })
    .first();
  return {
    fila,
    subpestana,
    historial: pestanas.getByRole('tab', { name: 'Historial' }),
    existe: (await fila.count()) > 0,
  };
}

/**
 * Registra DE VERDAD un "No se administró" en una toma de Arrieta, desde su tarjeta en
 * Recordatorios, como lo haría la enfermera. Solo con --registrar-no-administrado y solo si
 * todavía no hay uno con ese motivo (una vez por base).
 */
async function registrarNoAdministrado(page) {
  await menu(page).getByRole('link', { name: 'Recordatorios' }).click();
  await descartarSiPregunta(page);
  await page.getByRole('heading', { level: 1, name: 'Recordatorios' }).waitFor();
  await esperarPantalla(page);
  let t = tarjeta(page, DEMO.arrieta, 'Baclofeno');
  if (!(await t.count())) t = tarjeta(page, DEMO.arrieta);
  if (!(await t.count()))
    throw new Error('No hay ninguna toma de Arrieta en Recordatorios: correr preparar-datos.mjs');
  await t.getByRole('button', { name: /^No se administró/ }).click();
  const dialogo = page.getByRole('dialog', { name: 'No se administró' });
  await dialogo.waitFor();
  await dialogo
    .getByRole('textbox', { name: /Por qué no se administró/ })
    .fill(MOTIVO_NO_ADMINISTRADO);
  await dialogo.getByRole('button', { name: 'Registrar' }).click();
  await dialogo.waitFor({ state: 'hidden' });
  await page
    .getByText(/^Se registró que no se administró/)
    .first()
    .waitFor();
  console.log('  · se registró «No se administró» en una toma de Arrieta');
}

export async function flujoFichaExtra(page) {
  if (!quiero('29') && !quiero('30')) return;
  console.log('\nFlujo 6 · Alergias en la pestaña Datos y «No se administró» en el historial');

  if (quiero('29')) {
    // La alergia se agrega en la respuesta que ve el navegador (la base no cambia).
    const conAlergia = async (route) => {
      if (route.request().method() !== 'GET') return route.continue();
      const respuesta = await route.fetch();
      const json = await respuesta.json();
      if (
        json?.data?.apellido === 'Olmedo' &&
        !String(json.data.observaciones ?? '').startsWith(ALERGIA)
      ) {
        json.data.observaciones = `${ALERGIA} ${json.data.observaciones ?? ''}`.trim();
      }
      await route.fulfill({ response: respuesta, json });
    };
    await page.route(/\/api\/pacientes\/\d+(\?.*)?$/, conAlergia);
    const pestanas = await abrirFicha(page, 'Olmedo', DEMO.olmedo);
    await pestanas.getByRole('tab', { name: 'Datos' }).click();
    await esperarPantalla(page);
    const panel = page.getByRole('tabpanel');
    await panel.getByText(ALERGIA, { exact: false }).waitFor();
    const observaciones = panel.getByText('Observaciones', { exact: true }).locator('..');
    await capturar(
      page,
      '29-ficha-datos.png',
      'Ficha del paciente, pestaña Datos: las alergias, si el médico las anotó, están en Observaciones (alergia ficticia)',
      [
        {
          n: 1,
          que: 'pestaña Datos',
          loc: pestanas.getByRole('tab', { name: 'Datos' }),
          pos: 'esq',
          fijo: true,
        },
        {
          n: 2,
          que: 'Observaciones (donde el médico anota, por ejemplo, las alergias)',
          loc: observaciones,
          tipo: 'area',
          pos: 'esq',
        },
      ],
      { desdeArriba: true, incluir: [panel] },
    );
    await page.unroute(/\/api\/pacientes\/\d+(\?.*)?$/, conAlergia);
  }

  if (quiero('30')) {
    let { fila, subpestana, historial, existe } = await filaNoAdministrado(page);
    if (!existe) {
      if (!REGISTRAR_NO_ADMINISTRADO) {
        avisar(
          '30-historial-no-administrado.png no se saca: falta un «No se administró» con el motivo de la captura (correr con --registrar-no-administrado)',
        );
        return;
      }
      await registrarNoAdministrado(page);
      ({ fila, subpestana, historial, existe } = await filaNoAdministrado(page));
      if (!existe)
        throw new Error('No aparece el «No se administró» recién registrado en Modificaciones');
    }
    // Desde arriba (el paciente y sus pestañas) hasta el renglón, si entra; si no, solo el renglón.
    await arriba(page);
    const caja = await fila.boundingBox();
    const entra = caja && caja.y + caja.height <= TABLET.height - 4;
    if (!entra) await subir(page, fila, 120);
    const celdas = fila.getByRole('cell');
    const base = entra ? 2 : 0;
    await capturar(
      page,
      '30-historial-no-administrado.png',
      'Historial › Modificaciones: el renglón de un «No se administró», con el motivo en Detalle',
      [
        ...(entra
          ? [
              { n: 1, que: 'pestaña Historial', loc: historial, pos: 'esq', fijo: true },
              { n: 2, que: 'solapa Modificaciones del historial', loc: subpestana, pos: 'der' },
            ]
          : []),
        { n: base + 1, que: 'Acción «NO_ADMINISTRAR»', loc: celdas.nth(1), pos: 'esq' },
        {
          n: base + 2,
          que: 'Detalle: el motivo (después de «motivoNoAdministrado»)',
          loc: celdas.nth(2),
          tipo: 'area',
          pos: 'esq',
        },
        {
          n: base + 3,
          que: 'Usuario: quién lo registró',
          loc: celdas.nth(3),
          pos: 'esq-der',
          fijo: true,
        },
      ],
      { incluir: [fila], margen: 6, desdeArriba: entra },
    );
  }
}
