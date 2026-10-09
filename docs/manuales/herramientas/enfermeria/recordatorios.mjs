// Manual de enfermería · flujo 2: tomas y estudios para atender, y "Sin conexión en tiempo real".

import {
  BASE,
  TABLET,
  abrirTarea,
  arriba,
  avisar,
  campo,
  esperarPantalla,
  ingresarPorApi,
  insignia,
  niveles,
  nuevoContexto,
  quiero,
  subir,
  tarea,
  tarjetas,
  verificarPanel,
} from './comun.mjs';
import { capturar } from './marcadores.mjs';

// ───────────────────────── Flujo 2: tomas y estudios para atender ─────────────────────────

export async function flujoRecordatorios(page) {
  console.log('\nFlujo 2 · Tomas y estudios para atender');
  await abrirTarea(page, 'Tomas y estudios para atender', 'Recordatorios');
  await tarjetas(page).first().waitFor();
  await verificarPanel(page);
  console.log(`  niveles en el panel: ${(await niveles(page)).join(', ')}`);

  const subtitulo = page.getByText(/para atender ·|Actualizada a las/).first();
  const tipo = page.getByRole('combobox', { name: 'Tipo' });
  const sala = page.getByRole('combobox', { name: 'Sala' });
  const pantalla = page.locator('label', { hasText: 'Mantener la pantalla encendida' });
  const hayPantalla = (await pantalla.count()) > 0;
  if (!hayPantalla) avisar('El navegador no ofrece «Mantener la pantalla encendida»: no se marca');
  const primera = tarjetas(page).first();
  await capturar(
    page,
    '07-recordatorios.png',
    'Panel de Recordatorios: lo que hay para atender, de lo más urgente a lo menos',
    [
      {
        n: 1,
        que: 'insignia de recordatorios en la barra (cuántos hay para atender)',
        loc: insignia(page),
      },
      {
        n: 2,
        que: 'resumen: cuántos para atender, cuántos urgentes y hora de actualización',
        loc: subtitulo,
        texto: true,
        pos: 'der',
        pad: 6,
      },
      {
        n: 3,
        que: 'interruptor Sonido de avisos',
        loc: page.locator('label', { hasText: 'Sonido de avisos' }),
      },
      ...(hayPantalla
        ? [{ n: 4, que: 'interruptor Mantener la pantalla encendida', loc: pantalla }]
        : []),
      {
        n: hayPantalla ? 5 : 4,
        que: 'filtros Tipo (tomas o estudios) y Sala',
        loc: [campo(tipo), campo(sala)],
        tipo: 'area',
      },
      {
        n: hayPantalla ? 6 : 5,
        que: 'tarjeta de un recordatorio',
        loc: primera,
        tipo: 'area',
        pos: 'esq',
      },
    ],
    { desdeArriba: true },
  );

  // Una tarjeta de toma, de cerca. Se prefiere una que tenga Administrar (no un estudio).
  const toma = tarjetas(page)
    .filter({ has: page.getByRole('button', { name: /^Administrar / }) })
    .first();
  await subir(page, toma, 120);
  const fila = toma;
  const bloques = toma.locator(':scope > div');
  await capturar(
    page,
    '08-tarjeta-toma.png',
    'Tarjeta de una toma en el panel de Recordatorios',
    [
      {
        n: 1,
        que: 'hora de la toma y cuánto falta (o cuánto pasó)',
        loc: bloques.nth(0).locator(':scope > div').first(),
        pos: 'borde-izq',
        en: toma,
      },
      {
        n: 2,
        que: 'nivel de urgencia (Urgente, Pronto, Programada o Vencida)',
        loc: toma.locator('.MuiChip-root'),
        pos: 'abajo',
      },
      {
        n: 3,
        que: 'paciente: nombre, DNI, cama y sala',
        loc: bloques.nth(1),
        pos: 'borde-izq',
        en: toma,
      },
      {
        n: 4,
        que: 'medicamento, dosis, vía y presentación',
        loc: bloques.nth(2),
        pos: 'borde-izq',
        en: toma,
      },
      {
        n: 5,
        que: 'botón No se administró',
        loc: toma.getByRole('button', { name: /^No se administró/ }),
        pos: 'borde-izq',
        en: toma,
      },
      {
        n: 6,
        que: 'botón Administrar',
        loc: toma.getByRole('button', { name: /^Administrar / }),
        pos: 'borde-izq',
        en: toma,
      },
    ],
    { incluir: [fila] },
  );

  // Los niveles de urgencia que haya ahora, un marcador en el chip de una tarjeta de cada uno. El
  // panel va de lo más urgente a lo menos: se toman las tarjetas de cada cambio de nivel (la última
  // de un nivel y la primera del siguiente), que quedan cerca y entran en la misma foto.
  const todas = await tarjetas(page).all();
  const conNivel = [];
  for (const t of todas) {
    const chip = t.locator('.MuiChip-root');
    const nivel = (await chip.textContent())?.trim();
    if (nivel) conNivel.push({ nivel, chip, tarjeta: t });
  }
  const orden = [...new Set(conNivel.map((c) => c.nivel))];
  const elegidas = orden.map((nivel, i) => {
    const delNivel = conNivel.filter((c) => c.nivel === nivel);
    return i < orden.length - 1 ? delNivel.at(-1) : delNivel[0];
  });
  await subir(page, elegidas[0].tarjeta, 112);
  const vistos = new Map();
  for (const e of elegidas) {
    const b = await e.tarjeta.boundingBox();
    if (b && b.y + b.height <= TABLET.height) vistos.set(e.nivel, e);
  }
  const marcasNiveles = [...vistos.entries()].map(([nivel, { chip }], i) => ({
    n: i + 1,
    que: `nivel «${nivel}»`,
    loc: chip,
    pos: 'abajo',
  }));
  if (vistos.size < 4 && quiero('09')) {
    avisar(
      `09-niveles-urgencia.png muestra ${[...vistos.keys()].join(', ')}: los otros niveles no estaban en el panel a esta hora`,
    );
  }
  // Las tarjetas completas de esos niveles (y las de su misma fila).
  await capturar(
    page,
    '09-niveles-urgencia.png',
    `Niveles de urgencia en las tarjetas del panel (a esta hora: ${[...vistos.keys()].join(', ')})`,
    marcasNiveles,
    {
      incluir: [...vistos.values()].map((v) => v.tarjeta),
    },
  );

  // Una toma vencida (pasaron 60 min desde que apareció sin atenderse), si a esta hora hay alguna.
  // Va al final de la numeración porque depende de la hora (casi nunca coincide con las otras).
  const vencida = tarjetas(page)
    .filter({ has: page.locator('.MuiChip-root', { hasText: /^Vencid[ao]$/ }) })
    .filter({ has: page.getByRole('button', { name: /^Administrar / }) })
    .first();
  if (await vencida.count()) {
    await subir(page, vencida, 120);
    const bl = vencida.locator(':scope > div');
    await capturar(
      page,
      '28-recordatorio-vencido.png',
      'Tarjeta de una toma vencida: pasó la hora sin atenderse y todavía se puede atender',
      [
        {
          n: 1,
          que: 'hora de la toma y cuánto hace que pasó',
          loc: bl.nth(0).locator(':scope > div').first(),
          pos: 'borde-izq',
          en: vencida,
        },
        { n: 2, que: 'nivel «Vencida»', loc: vencida.locator('.MuiChip-root'), pos: 'abajo' },
        {
          n: 3,
          que: 'botón No se administró',
          loc: vencida.getByRole('button', { name: /^No se administró/ }),
          pos: 'borde-izq',
          en: vencida,
        },
        {
          n: 4,
          que: 'botón Administrar (se puede atender tarde)',
          loc: vencida.getByRole('button', { name: /^Administrar / }),
          pos: 'borde-izq',
          en: vencida,
        },
      ],
      { incluir: [vencida] },
    );
  } else if (quiero('28')) {
    avisar(
      'No hay tomas vencidas a esta hora: 28-recordatorio-vencido.png no se saca (queda la de una corrida anterior, si la hay)',
    );
  }
  await arriba(page);
}

/** "Sin conexión en tiempo real": el navegador cierra el WebSocket apenas se abre. */
export async function flujoSinConexion(navegador) {
  if (!quiero('10')) return;
  console.log('\nFlujo 2 · Sin conexión en tiempo real (WebSocket cortado en el navegador)');
  const { contexto, page } = await nuevoContexto(navegador);
  await ingresarPorApi(contexto);
  await page.routeWebSocket(/\/api\/tiempo-real/, (ws) => {
    ws.close({ code: 1000, reason: 'Corte simulado para el manual' });
  });
  await page.goto(`${BASE}/`);
  await page.getByRole('heading', { level: 1, name: /^Hola,/ }).waitFor();
  await esperarPantalla(page);
  await tarea(page, 'Tomas y estudios para atender').click();
  await page.getByRole('heading', { level: 1, name: 'Recordatorios' }).waitFor();
  const franja = page.getByRole('status').filter({ hasText: 'Sin conexión en tiempo real' });
  await franja.waitFor({ timeout: 15_000 });
  await esperarPantalla(page);
  await capturar(
    page,
    '10-sin-conexion.png',
    'Panel sin conexión en tiempo real: la franja lo avisa y la insignia lleva el ícono de sin señal',
    [
      {
        n: 1,
        que: 'insignia con el ícono de sin señal',
        loc: page.getByRole('link', { name: /sin avisos en tiempo real/ }),
      },
      {
        n: 2,
        que: 'franja «Sin conexión en tiempo real: la lista y los avisos se actualizan cada 30 s»',
        loc: franja,
        tipo: 'area',
        pos: 'esq',
      },
    ],
    { desdeArriba: true, incluir: [page.getByRole('combobox', { name: 'Tipo' })] },
  );
  await contexto.close();
}
