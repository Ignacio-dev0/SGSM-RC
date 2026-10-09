// Guía del médico · capturas 16–27: estudios, recordatorios, reportes y teléfono.

import { campoDia } from './datos.mjs';
import { abrirFicha, campo, capturar, elegir, esperar, irAlInicio, quiere } from './pantalla.mjs';

export async function estudios(page) {
  if (!quiere('16', '17', '18', '19')) return;
  await abrirFicha(page, 'Olmedo');
  await page.getByRole('tab', { name: 'Estudios' }).click();
  const tarjeta = page.locator('li', { hasText: 'Hemograma y coagulograma' }).first();
  await tarjeta.waitFor();
  await esperar(page);
  const programar = page.getByRole('button', { name: 'Programar estudio' }).first();
  const reprogramar = page.getByRole('button', { name: 'Reprogramar Hemograma y coagulograma' });
  const cancelar = page.getByRole('button', { name: 'Cancelar estudio Hemograma y coagulograma' });
  await capturar(page, '16-estudios-pestana.png', {
    muestra: 'Pestaña Estudios de la ficha (Olmedo): el estudio programado con sus acciones',
    incluir: [page.getByRole('heading', { level: 1, name: /^Olmedo,/ })],
    marcas: [
      { n: 1, loc: page.getByRole('tab', { name: 'Estudios' }), que: 'Pestaña Estudios' },
      { n: 2, loc: programar, que: 'Botón Programar estudio', lado: 'esquina-der' },
      {
        n: 3,
        loc: tarjeta,
        que: 'Tarjeta del estudio: fecha y hora, preparación y quién lo programó',
      },
      { n: 4, loc: cancelar, que: 'Botón Cancelar estudio', lado: 'izq' },
      { n: 5, loc: reprogramar, que: 'Botón Reprogramar', lado: 'esquina-der' },
    ],
  });

  if (quiere('17')) {
    await programar.click();
    const dialogo = page.getByRole('dialog', { name: 'Programar estudio' });
    await dialogo.waitFor();
    await esperar(page);
    await elegir(dialogo.getByLabel('Tipo de estudio'), 'Tomografía computada');
    await dialogo.getByLabel('Fecha y hora').fill(campoDia(1, 10, 0));
    await dialogo.getByLabel('Nombre del estudio (opcional)').fill('TC de cadera derecha');
    await dialogo.getByLabel('Observaciones (opcional)').fill('Trasladar en camilla');
    await capturar(page, '17-programar-estudio.png', {
      muestra:
        'Diálogo Programar estudio lleno (tomografía para mañana a las 10:00), sin confirmar',
      incluir: [dialogo],
      marcas: [
        {
          n: 1,
          loc: campo(dialogo, 'Tipo de estudio'),
          que: 'Selector Tipo de estudio',
          lado: 'izq',
        },
        {
          n: 2,
          loc: campo(dialogo, 'Fecha y hora'),
          que: 'Campo Fecha y hora',
          lado: 'esquina-der',
        },
        {
          n: 3,
          loc: campo(dialogo, 'Nombre del estudio (opcional)'),
          que: 'Campo Nombre del estudio (se completa con el tipo)',
          lado: 'izq',
        },
        {
          n: 4,
          loc: campo(dialogo, 'Preparación (opcional)'),
          que: 'Campo Preparación (la del tipo; se puede cambiar o borrar)',
          lado: 'izq',
        },
        {
          n: 5,
          loc: dialogo.getByRole('button', { name: 'Programar estudio' }),
          que: 'Botón Programar estudio',
          lado: 'esquina-der',
        },
      ],
    });
    await dialogo.getByRole('button', { name: 'Cancelar' }).click();
    await dialogo.waitFor({ state: 'hidden' });
  }

  if (quiere('18')) {
    await reprogramar.click();
    const dialogo = page.getByRole('dialog', { name: 'Reprogramar estudio' });
    await dialogo.waitFor();
    await dialogo.getByLabel('Nueva fecha y hora').fill(campoDia(1, 8, 0));
    await capturar(page, '18-reprogramar-estudio.png', {
      muestra: 'Diálogo Reprogramar estudio con la hora nueva (mañana 08:00), sin confirmar',
      incluir: [dialogo],
      marcas: [
        {
          n: 1,
          loc: dialogo.getByText(/Está programado para el/),
          que: 'Para cuándo está programado ahora',
          lado: 'izq',
        },
        {
          n: 2,
          loc: campo(dialogo, 'Nueva fecha y hora'),
          que: 'Campo Nueva fecha y hora',
          lado: 'izq',
        },
        {
          n: 3,
          loc: dialogo.getByRole('button', { name: 'Reprogramar' }),
          que: 'Botón Reprogramar',
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

  if (quiere('19')) {
    await cancelar.click();
    const dialogo = page.getByRole('dialog', { name: 'Cancelar el estudio' });
    await dialogo.waitFor();
    await dialogo
      .getByLabel('Motivo de la cancelación')
      .fill('Se suspendió el turno del laboratorio');
    await capturar(page, '19-cancelar-estudio.png', {
      muestra: 'Diálogo Cancelar el estudio con su motivo, sin confirmar (no se puede deshacer)',
      incluir: [dialogo],
      marcas: [
        {
          n: 1,
          loc: dialogo.getByText(/^Se cancela/).locator('xpath=..'),
          que: 'Qué estudio se cancela, de quién, y que no se puede deshacer',
          lado: 'izq',
        },
        {
          n: 2,
          loc: campo(dialogo, 'Motivo de la cancelación'),
          que: 'Campo Motivo de la cancelación (obligatorio)',
          lado: 'izq',
        },
        {
          n: 3,
          loc: dialogo.getByRole('button', { name: 'Cancelar estudio' }),
          que: 'Botón Cancelar estudio',
          lado: 'esquina-der',
        },
        {
          n: 4,
          loc: dialogo.getByRole('button', { name: 'Volver' }),
          que: 'Botón Volver (no cancela nada)',
          lado: 'izq',
        },
      ],
    });
    await dialogo.getByRole('button', { name: 'Volver' }).click();
    await dialogo.waitFor({ state: 'hidden' });
  }
}

/** 20 · Recordatorios (el médico los ve, no los atiende). */
export async function recordatorios(page) {
  if (!quiere('20')) return;
  await irAlInicio(page);
  await page.getByRole('link', { name: /^Recordatorios: / }).click();
  await page.getByRole('heading', { level: 1, name: 'Recordatorios' }).waitFor();
  const lista = page.getByRole('list', { name: 'Recordatorios para atender' });
  await lista.waitFor();
  await esperar(page);
  const primera = lista.getByRole('listitem').first();
  await capturar(page, '20-recordatorios.png', {
    muestra:
      'Recordatorios: tomas y estudios de la próxima media hora, de lo más urgente a lo menos (solo lectura para el médico)',
    recorte: 'arriba',
    incluir: [lista.getByRole('listitem').nth(1)],
    marcas: [
      {
        n: 1,
        loc: page.getByRole('link', { name: /^Recordatorios: / }),
        que: 'Insignia de recordatorios (a un toque desde cualquier pantalla)',
      },
      {
        n: 2,
        loc: page.getByText(/para atender ·/),
        que: 'Cuántos hay, cuántos urgentes y la hora de actualización',
        lado: 'esquina-der',
      },
      {
        n: 3,
        loc: campo(page, 'Tipo', true),
        que: 'Filtro Tipo (tomas o estudios)',
        lado: 'esquina-der',
      },
      { n: 4, loc: campo(page, 'Sala', true), que: 'Filtro Sala', lado: 'esquina-der' },
      {
        n: 5,
        loc: primera,
        que: 'Tarjeta de un recordatorio: hora, prioridad, paciente, cama y qué toca',
      },
    ],
  });
}

/** 21–24 · Reportes y estadísticas (el médico los ve; el archivo se le pide a un administrador). */
export async function reportes(page) {
  if (!quiere('21', '22', '23', '24')) return;
  await irAlInicio(page);
  await page.getByRole('link', { name: /Ver reportes/ }).click();
  const titulo = page.getByRole('heading', { level: 1, name: 'Reportes' });
  await titulo.waitFor();
  const tabla = page.getByRole('table', { name: /Reporte de suministros por/ });
  await tabla.waitFor();
  await esperar(page);
  const filtros = page.getByRole('search', { name: 'Filtros' });
  await capturar(page, '21-reportes-filtros.png', {
    muestra: 'Reportes, pestaña Suministros: período y filtros (por defecto, los últimos 7 días)',
    incluir: [titulo],
    margen: 10,
    marcas: [
      {
        n: 1,
        loc: page.getByRole('tablist', { name: 'Secciones de los reportes' }),
        que: 'Pestañas Suministros y Estadísticas',
      },
      {
        n: 2,
        loc: filtros.getByRole('group').first(),
        que: 'Atajos de período: Hoy, 7 días, 30 días',
        lado: 'esquina-der',
      },
      {
        n: 3,
        loc: [campo(page, 'Desde'), campo(page, 'Hasta')],
        que: 'Campos Desde y Hasta (otro período)',
        lado: 'esquina-der',
      },
      {
        n: 4,
        loc: [campo(page, 'Sala'), campo(page, 'Tipo')],
        que: 'Filtros Sala y Tipo (medicamentos o insumos)',
        lado: 'esquina-der',
      },
      {
        n: 5,
        loc: campo(page, 'Agrupar por'),
        que: 'Selector Agrupar por (paciente, insumo, personal o día)',
        lado: 'esquina-der',
      },
    ],
  });

  if (quiere('22')) {
    const nota = page.getByText('Para descargar el archivo, pídaselo a un administrador.');
    // La tabla entera a la vista, con el resumen y la nota de arriba.
    await tabla.evaluate((el) => el.scrollIntoView({ block: 'end' }));
    await page.evaluate(() => window.scrollBy(0, 24));
    await page.waitForTimeout(200);
    await capturar(page, '22-reportes-resultado.png', {
      muestra:
        'Reportes: resumen del período, la nota para pedir el archivo y la tabla agrupada por paciente',
      margen: 8,
      marcas: [
        {
          n: 1,
          loc: page.getByText(/^Del \d\d\/\d\d\/\d{4} al/),
          que: 'Qué período, salas y tipos se están viendo',
          lado: 'izq',
        },
        {
          n: 2,
          loc: nota,
          que: 'Nota: el médico no descarga; el archivo (PDF o Excel) se le pide a un administrador',
          lado: 'izq',
        },
        {
          n: 3,
          loc: page.getByRole('link', { name: /Ver cada unidad por separado/ }),
          que: 'Enlace Ver cada unidad por separado',
          lado: 'izq',
        },
        { n: 4, loc: tabla, que: 'Tabla del reporte, con el total al pie' },
      ],
    });
  }

  if (quiere('23', '24')) {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.getByRole('tab', { name: 'Estadísticas' }).click();
    const indicadores = page.locator('[aria-label="Indicadores del período"]');
    await indicadores.first().waitFor();
    await esperar(page);
    await capturar(page, '23-reportes-estadisticas.png', {
      muestra:
        'Reportes, pestaña Estadísticas: el mismo período y los indicadores (suministros, pacientes, recordatorios atendidos)',
      incluir: [titulo],
      marcas: [
        { n: 1, loc: page.getByRole('tab', { name: 'Estadísticas' }), que: 'Pestaña Estadísticas' },
        {
          n: 2,
          loc: filtros.getByRole('group').first(),
          que: 'El mismo período y filtros que en Suministros',
          lado: 'esquina-der',
        },
        { n: 3, loc: indicadores.first(), que: 'Indicadores del período' },
        {
          n: 4,
          loc: page.getByText(/^Sobre los \d+ recordatorios/),
          que: 'Cómo se cuentan los recordatorios atendidos y a tiempo',
          lado: 'izq',
        },
      ],
    });

    if (quiere('24')) {
      const grafico = page.getByRole('region', { name: 'Medicamentos e insumos más usados' });
      const verTabla = grafico.getByRole('button', { name: /Ver como tabla/ });
      // El gráfico, justo debajo de la barra fija (sin texto cortado por encima).
      await grafico.evaluate((el) => {
        el.scrollIntoView({ block: 'start' });
        window.scrollBy(0, -130);
      });
      await page.waitForTimeout(200);
      await capturar(page, '24-reportes-grafico.png', {
        muestra:
          'Reportes, pestaña Estadísticas: un gráfico (los más usados del período) con su botón Ver como tabla',
        margen: 6,
        marcas: [
          { n: 1, loc: grafico, que: 'Gráfico con su título y qué muestra', lado: 'dentro-arriba' },
          {
            n: 2,
            loc: verTabla,
            que: 'Botón Ver como tabla (los mismos números, para leerlos exactos)',
            lado: 'izq',
          },
        ],
      });
    }
  }
}

// ───────────────────────── Recorridos (teléfono) ─────────────────────────

export async function telefono(page) {
  if (!quiere('25', '26', '27')) return;
  await irAlInicio(page);
  const abrirMenu = page.getByRole('button', { name: 'Abrir el menú' });
  await capturar(page, '25-telefono-inicio.png', {
    muestra: 'Inicio en el teléfono: el menú se abre con el botón de la barra',
    recorte: 'arriba',
    marcas: [
      { n: 1, loc: abrirMenu, que: 'Botón Abrir el menú', lado: 'abajo' },
      {
        n: 2,
        loc: page.getByRole('link', { name: /^Recordatorios: / }),
        que: 'Insignia de recordatorios',
        lado: 'abajo',
      },
      {
        n: 3,
        loc: page.getByRole('link', { name: /Buscar paciente/ }),
        que: 'Tarea Buscar paciente',
      },
      {
        n: 4,
        loc: page.getByRole('button', { name: 'Salir' }),
        que: 'Botón Salir (la flecha, sin texto)',
        lado: 'abajo',
      },
    ],
  });

  if (quiere('26')) {
    await abrirMenu.click();
    const menu = page.getByRole('navigation', { name: 'Menú principal' });
    await menu.waitFor();
    await page.waitForTimeout(400);
    await capturar(page, '26-telefono-menu.png', {
      muestra: 'Menú en cajón del teléfono, con el tema de la pantalla al pie',
      recorte: 'pantalla',
      marcas: [
        {
          n: 1,
          loc: menu.getByRole('link', { name: 'Recordatorios' }),
          que: 'Opción Recordatorios',
          lado: 'dentro',
          recuadro: false,
        },
        {
          n: 2,
          loc: menu.getByRole('link', { name: 'Pacientes' }),
          que: 'Opción Pacientes',
          lado: 'dentro',
          recuadro: false,
        },
        {
          n: 3,
          loc: menu.getByRole('link', { name: 'Reportes' }),
          que: 'Opción Reportes',
          lado: 'dentro',
          recuadro: false,
        },
        {
          n: 4,
          loc: page.getByText('Tema de la pantalla').locator('xpath=..'),
          que: 'Tema de la pantalla (claro u oscuro)',
          lado: 'arriba',
        },
      ],
    });
    await page.keyboard.press('Escape');
    await menu.waitFor({ state: 'hidden' });
  }

  if (quiere('27')) {
    await abrirFicha(page, 'Olmedo', true);
    await capturar(page, '27-telefono-ficha.png', {
      muestra: 'Ficha del paciente en el teléfono: las acciones pasan debajo del nombre',
      recorte: 'pantalla',
      marcas: [
        {
          n: 1,
          loc: page.getByRole('heading', { level: 1, name: /^Olmedo,/ }).locator('xpath=..'),
          que: 'Nombre, DNI, edad y cama',
          lado: 'izq-arriba',
        },
        {
          n: 2,
          loc: page.getByRole('button', { name: 'Trasladar' }),
          que: 'Botón Trasladar',
          lado: 'esquina-der',
        },
        {
          n: 3,
          loc: page.getByRole('button', { name: 'Dar de alta' }),
          que: 'Botón Dar de alta',
          lado: 'der',
        },
        {
          n: 4,
          loc: page.getByRole('tablist', { name: 'Secciones de la ficha' }),
          que: 'Pestañas de la ficha',
        },
      ],
    });
  }
}
