// Guía del médico · capturas 00–08: ingreso, Inicio y búsqueda, internar, ficha, traslado y alta.

import { egresadaLista, permitido } from './api.mjs';
import { EGRESADA, NUEVO, WEB } from './datos.mjs';
import {
  abrirFicha,
  asomar,
  campo,
  capturar,
  elegir,
  esperar,
  irAlInicio,
  problemas,
  quiere,
} from './pantalla.mjs';

// ───────────────────────── Recorridos (tablet) ─────────────────────────

/** 00 · Pantalla de ingreso (sin sesión; los campos quedan vacíos). */
export async function pantallaDeIngreso(page) {
  if (!quiere('00')) return;
  await page.goto(`${WEB}/ingresar`);
  await page.getByRole('heading', { level: 1, name: 'Ingresar' }).waitFor();
  await esperar(page);
  await capturar(page, '00-ingresar.png', {
    muestra: 'Pantalla Ingresar, con los campos vacíos',
    incluir: [page.getByRole('heading', { level: 1, name: 'Ingresar' })],
    marcas: [
      { n: 1, loc: campo(page, 'Usuario', true), que: 'Campo Usuario', lado: 'izq' },
      { n: 2, loc: campo(page, 'Contraseña', true), que: 'Campo Contraseña', lado: 'izq' },
      {
        n: 3,
        loc: page.getByRole('button', { name: 'Mostrar contraseña' }),
        que: 'Ojo: muestra u oculta la contraseña',
        lado: 'esquina-der',
      },
      {
        n: 4,
        loc: page.getByText('Recordar mi usuario en esta tablet').locator('xpath=..'),
        que: 'Recordar mi usuario en esta tablet',
        lado: 'izq',
      },
      {
        n: 5,
        loc: page.getByRole('button', { name: 'Ingresar' }),
        que: 'Botón Ingresar',
        lado: 'izq',
      },
    ],
  });
}

/** 01–02 · Inicio y búsqueda de pacientes. */
export async function inicioYBusqueda(page) {
  if (!quiere('01', '02')) return;
  await irAlInicio(page);
  const menu = page.getByRole('navigation', { name: 'Menú principal' });
  await capturar(page, '01-inicio.png', {
    muestra:
      'Inicio del médico: las tareas del día, el menú lateral y la insignia de recordatorios',
    recorte: 'arriba',
    marcas: [
      {
        n: 1,
        loc: page.getByRole('link', { name: /Buscar paciente/ }),
        que: 'Tarea Buscar paciente',
      },
      {
        n: 2,
        loc: page.getByRole('link', { name: /Internar paciente/ }),
        que: 'Tarea Internar paciente',
      },
      { n: 3, loc: page.getByRole('link', { name: /Ver reportes/ }), que: 'Tarea Ver reportes' },
      {
        n: 4,
        loc: page.getByRole('link', { name: /^Recordatorios: / }),
        que: 'Insignia de recordatorios en la barra: el reloj con un número (cuántos hay para atender)',
        lado: 'abajo',
        recuadro: false,
      },
      {
        n: 5,
        loc: menu,
        que: 'Menú lateral (Inicio, Recordatorios, Pacientes, Suministros, Reportes)',
        lado: 'abajo',
      },
      {
        n: 6,
        loc: page.getByRole('link', { name: /Ver lo que se registró/ }),
        que: 'Tarea Ver lo que se registró (la misma pantalla que Suministros en el menú)',
        lado: 'esquina-der',
      },
      {
        n: 7,
        loc: page.getByRole('button', { name: /^Tema de la pantalla/ }),
        que: 'Botón Tema de la pantalla (claro, oscuro o igual que el dispositivo)',
        lado: 'abajo',
        recuadro: false,
      },
      {
        n: 8,
        loc: page.getByRole('button', { name: /^Notificaciones/ }),
        que: 'Campana de Notificaciones',
        lado: 'abajo',
        recuadro: false,
      },
    ],
  });

  await page.getByRole('link', { name: /Buscar paciente/ }).click();
  await page.getByRole('heading', { level: 1, name: 'Pacientes' }).waitFor();
  await esperar(page);
  await page.getByLabel('Buscar por apellido, DNI o cama').fill('Olmedo');
  await page.getByRole('row', { name: /Abrir Olmedo/ }).waitFor();
  await expectFilas(page, 1);
  await capturar(page, '02-buscar-paciente.png', {
    muestra: 'Pacientes: búsqueda por apellido, DNI o cama, con los filtros de sala y estado',
    incluir: [
      page.getByRole('heading', { level: 1, name: 'Pacientes' }),
      page.getByText(/^Página \d+ de \d+/),
    ],
    marcas: [
      {
        n: 1,
        loc: campo(page, 'Buscar por apellido, DNI o cama'),
        que: 'Campo Buscar por apellido, DNI o cama',
        lado: 'esquina-der',
      },
      { n: 2, loc: campo(page, 'Sala', true), que: 'Filtro Sala', lado: 'esquina-der' },
      {
        n: 3,
        loc: campo(page, 'Estado', true),
        que: 'Filtro Estado (Internados, Egresados, Todos)',
        lado: 'esquina-der',
      },
      {
        n: 4,
        loc: page.getByRole('row', { name: /Abrir Olmedo/ }),
        que: 'Fila del paciente: se toca para abrir su ficha',
      },
      {
        n: 5,
        loc: page.getByRole('button', { name: 'Internar paciente' }),
        que: 'Botón Internar paciente',
      },
    ],
  });
}

async function expectFilas(page, n) {
  const tabla = page.getByRole('table', { name: 'Pacientes' });
  for (let i = 0; i < 40; i++) {
    if ((await tabla.locator('tbody tr').count()) === n) return;
    await page.waitForTimeout(150);
  }
}

/** Llena los datos personales del formulario de internación. */
async function llenarDatosPersonales(page, d) {
  await page.getByLabel('DNI').fill(d.dni);
  await page.getByLabel('Nombre', { exact: false }).first().fill(d.nombre);
  await page.getByLabel('Apellido').fill(d.apellido);
  await page.getByLabel('Fecha de nacimiento').fill(d.fechaNacimiento);
  await page.getByLabel('Sexo').selectOption({ label: d.sexo });
  if (d.obraSocial) await page.getByLabel('Obra social').fill(d.obraSocial);
  if (d.numeroAfiliado) await page.getByLabel('N.º de afiliado').fill(d.numeroAfiliado);
}

/** 03–05 · Internar en una cama libre y aviso de reingreso. */
export async function internar(page) {
  if (!quiere('03', '04', '05')) return;
  await irAlInicio(page);
  await page.getByRole('link', { name: /Internar paciente/ }).click();
  const titulo = page.getByRole('heading', { level: 1, name: 'Internar paciente' });
  await titulo.waitFor();
  await esperar(page);
  await llenarDatosPersonales(page, NUEVO);
  await page.getByLabel('Diagnóstico').fill(NUEVO.diagnostico);
  await page.getByLabel('Contacto de emergencia').fill(NUEVO.contacto);
  await page.getByLabel('Teléfono de emergencia').fill(NUEVO.telefono);
  await elegir(page.getByRole('combobox', { name: /^Cama/ }), NUEVO.cama);
  await page.evaluate(() => window.scrollTo(0, 0));
  await capturar(page, '03-internar-datos.png', {
    muestra: 'Internar paciente: datos personales de un paciente nuevo (ficticio), sin guardar',
    incluir: [titulo],
    marcas: [
      { n: 1, loc: campo(page, 'DNI'), que: 'Campo DNI (7 u 8 dígitos, sin puntos)', lado: 'izq' },
      { n: 2, loc: campo(page, 'Nombre'), que: 'Campo Nombre', lado: 'izq' },
      { n: 3, loc: campo(page, 'Apellido'), que: 'Campo Apellido', lado: 'izq' },
      {
        n: 4,
        loc: campo(page, 'Fecha de nacimiento'),
        que: 'Campo Fecha de nacimiento',
        lado: 'izq',
      },
      { n: 5, loc: campo(page, 'Sexo'), que: 'Selector Sexo', lado: 'izq' },
    ],
  });

  const botonInternar = page.getByRole('button', { name: 'Internar', exact: true });
  await asomar(page.getByRole('combobox', { name: /^Cama/ }));
  await capturar(page, '04-internar-cama.png', {
    muestra:
      'Internar paciente: datos clínicos, elección de la cama libre y botón Internar (sin tocarlo)',
    incluir: [page.getByRole('heading', { level: 2, name: 'Datos clínicos y contacto' })],
    marcas: [
      {
        n: 1,
        loc: [
          campo(page, 'Diagnóstico'),
          campo(page, 'Observaciones'),
          campo(page, 'Contacto de emergencia'),
          campo(page, 'Teléfono de emergencia'),
        ],
        que: 'Datos clínicos y de contacto (opcionales): Diagnóstico, Observaciones, Contacto y Teléfono de emergencia',
        lado: 'izq',
      },
      {
        n: 2,
        loc: campo(page, 'Cama'),
        que: 'Selector Cama: solo ofrece camas libres',
        lado: 'izq',
      },
      { n: 3, loc: botonInternar, que: 'Botón Internar', lado: 'esquina-der' },
      {
        n: 4,
        loc: page.getByRole('button', { name: 'Cancelar' }),
        que: 'Botón Cancelar',
        lado: 'izq',
      },
    ],
  });

  if (!quiere('05')) return;
  if (!(await egresadaLista())) {
    problemas.push('05: la paciente egresada no está; no se intentó el reingreso');
    return;
  }
  await irAlInicio(page);
  await page.getByRole('link', { name: /Internar paciente/ }).click();
  await titulo.waitFor();
  await esperar(page);
  await llenarDatosPersonales(page, {
    ...EGRESADA,
    sexo: 'Femenino',
  });
  await elegir(page.getByRole('combobox', { name: /^Cama/ }), 'C-03');
  permitido.reingreso = true;
  await botonInternar.click();
  const aviso = page.locator('.MuiAlert-root', { hasText: 'ya estuvo internado' });
  await aviso.waitFor();
  permitido.reingreso = false;
  await page.evaluate(() => window.scrollTo(0, 0));
  await capturar(page, '05-reingreso-aviso.png', {
    muestra:
      'Internar con el DNI de una paciente que ya estuvo internada (ficticia): aviso con Registrar reingreso, sin tocarlo',
    incluir: [titulo],
    marcas: [
      { n: 1, loc: aviso, que: 'Aviso «El paciente ya estuvo internado»' },
      {
        n: 2,
        loc: page.getByRole('button', { name: 'Registrar reingreso' }),
        que: 'Botón Registrar reingreso',
        lado: 'esquina-der',
      },
      {
        n: 3,
        loc: campo(page, 'DNI'),
        que: 'El DNI que se escribió (el de la paciente egresada)',
        lado: 'izq',
      },
    ],
  });
}

/** 06–08 · Ficha del paciente, cambiar de cama y dar de alta (diálogos sin confirmar). */
export async function fichaTrasladoAlta(page) {
  if (!quiere('06', '07', '08')) return;
  await abrirFicha(page, 'Olmedo');
  const encabezado = page.getByRole('heading', { level: 1, name: /^Olmedo,/ }).locator('xpath=..');
  await page.locator('li', { hasText: 'Ketorolac' }).first().waitFor();
  await capturar(page, '06-ficha-paciente.png', {
    muestra: 'Ficha del paciente (Olmedo): identificación, acciones, pestañas y sus prescripciones',
    marcas: [
      { n: 1, loc: encabezado, que: 'Nombre, DNI, edad y cama del paciente', lado: 'esquina-der' },
      {
        n: 2,
        loc: page.getByRole('button', { name: 'Trasladar' }),
        que: 'Botón Trasladar (cambiar de cama)',
      },
      {
        n: 3,
        loc: page.getByRole('button', { name: 'Dar de alta' }),
        que: 'Botón Dar de alta',
        lado: 'esquina-der',
      },
      {
        n: 4,
        loc: page.getByRole('tablist', { name: 'Secciones de la ficha' }),
        que: 'Pestañas Datos, Prescripciones, Estudios, Historial',
      },
      {
        n: 5,
        loc: page.getByRole('button', { name: 'Nueva prescripción' }),
        que: 'Botón Nueva prescripción',
      },
      {
        n: 6,
        loc: page.locator('li', { hasText: 'Ketorolac' }).first(),
        que: 'Tarjeta de una prescripción: se toca para ver el detalle',
      },
    ],
  });

  if (quiere('07')) {
    await page.getByRole('button', { name: 'Trasladar' }).click();
    const dialogo = page.getByRole('dialog', { name: 'Trasladar de cama' });
    await dialogo.waitFor();
    await esperar(page);
    await elegir(dialogo.getByLabel('Cama nueva'), 'B-05');
    await capturar(page, '07-trasladar.png', {
      muestra: 'Diálogo Trasladar de cama con la cama nueva elegida, sin confirmar',
      incluir: [dialogo],
      marcas: [
        {
          n: 1,
          loc: dialogo.getByText(/Cama actual/),
          que: 'Paciente y cama actual (queda libre al trasladar)',
          lado: 'izq',
        },
        {
          n: 2,
          loc: campo(dialogo, 'Cama nueva'),
          que: 'Selector Cama nueva (solo camas libres)',
          lado: 'izq',
        },
        {
          n: 3,
          loc: dialogo.getByRole('button', { name: 'Trasladar' }),
          que: 'Botón Trasladar',
          lado: 'esquina-der',
        },
        {
          n: 4,
          loc: dialogo.getByRole('button', { name: 'Cancelar' }),
          que: 'Botón Cancelar',
          lado: 'izq',
        },
      ],
    });
    await dialogo.getByRole('button', { name: 'Cancelar' }).click();
    await dialogo.waitFor({ state: 'hidden' });
  }

  if (quiere('08')) {
    await page.getByRole('button', { name: 'Dar de alta' }).click();
    const dialogo = page.getByRole('dialog', { name: 'Dar de alta al paciente' });
    await dialogo.waitFor();
    await dialogo.getByLabel('Motivo del egreso').fill('Alta médica');
    await capturar(page, '08-dar-de-alta.png', {
      muestra: 'Diálogo Dar de alta al paciente con fecha y motivo, sin confirmar',
      incluir: [dialogo],
      marcas: [
        {
          n: 1,
          loc: dialogo.getByText(/Se liberará la cama/).locator('xpath=..'),
          que: 'A quién se da de alta, qué pasa (cama, prescripciones, estudios) y cómo se reingresa',
          lado: 'izq',
        },
        {
          n: 2,
          loc: campo(dialogo, 'Fecha y hora de egreso'),
          que: 'Campo Fecha y hora de egreso (viene con la hora actual)',
          lado: 'izq',
        },
        {
          n: 3,
          loc: campo(dialogo, 'Motivo del egreso'),
          que: 'Campo Motivo del egreso (obligatorio)',
          lado: 'izq',
        },
        {
          n: 4,
          loc: dialogo.getByRole('button', { name: 'Dar de alta' }),
          que: 'Botón Dar de alta',
          lado: 'esquina-der',
        },
        {
          n: 5,
          loc: dialogo.getByRole('button', { name: 'Cancelar' }),
          que: 'Botón Cancelar',
          lado: 'izq',
        },
      ],
    });
    await dialogo.getByRole('button', { name: 'Cancelar' }).click();
    await dialogo.waitFor({ state: 'hidden' });
  }
}

/** 09–10 · Indicar un medicamento (formulario lleno, sin guardar). */
