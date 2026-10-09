// Manual de enfermería · flujo 1: ingresar, inactividad y Salir (más el menú en el teléfono).

import {
  BASE,
  CUENTA,
  TELEFONO,
  botonSalir,
  campo,
  esperarPantalla,
  ingresarPorApi,
  insignia,
  menu,
  nuevoContexto,
  quiero,
  tarea,
} from './comun.mjs';
import { capturar } from './marcadores.mjs';

// ───────────────────────── Flujo 1: ingresar, inactividad y Salir ─────────────────────────

export async function flujoIngreso(page) {
  console.log('\nFlujo 1 · Ingresar a la tablet');
  await page.goto(`${BASE}/`);
  await page.getByRole('heading', { name: 'Ingresar' }).waitFor();
  await esperarPantalla(page);
  const usuario = page.getByRole('textbox', { name: 'Usuario' });
  const contrasena = page.getByLabel('Contraseña', { exact: true });
  await capturar(
    page,
    '01-ingresar.png',
    'Pantalla de ingreso de la tablet, sin datos cargados',
    [
      { n: 1, que: 'campo Usuario', loc: campo(usuario), pos: 'izq' },
      { n: 2, que: 'campo Contraseña', loc: campo(contrasena), pos: 'izq' },
      {
        n: 3,
        que: 'botón del ojo: Mostrar contraseña',
        loc: page.getByRole('button', { name: 'Mostrar contraseña' }),
        pos: 'der',
      },
      {
        n: 4,
        que: 'casilla «Recordar mi usuario en esta tablet»',
        loc: page.locator('label', { hasText: 'Recordar mi usuario' }),
        pos: 'izq',
      },
      {
        n: 5,
        que: 'botón Ingresar',
        loc: page.getByRole('button', { name: 'Ingresar' }),
        pos: 'izq',
      },
    ],
    { incluir: [page.locator('form')] },
  );

  // Ingresa como la persona (la captura ya se sacó: el usuario no queda en ninguna imagen).
  await usuario.fill(CUENTA.usuario);
  await contrasena.fill(CUENTA.clave);
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await page.getByRole('heading', { level: 1, name: /^Hola,/ }).waitFor();
  await esperarPantalla(page, 600);

  await capturar(
    page,
    '02-inicio.png',
    'Inicio de enfermería con sus tareas, el menú lateral y la barra superior',
    [
      {
        n: 1,
        que: 'tarea «Tomas y estudios para atender» (la principal)',
        loc: tarea(page, 'Tomas y estudios para atender'),
        tipo: 'area',
        pos: 'esq',
        fijo: true,
      },
      {
        n: 2,
        que: 'tarea «Administrar medicamento»',
        loc: tarea(page, 'Administrar medicamento'),
        tipo: 'area',
        pos: 'esq',
        fijo: true,
      },
      {
        n: 3,
        que: 'tarea «Registrar insumos»',
        loc: tarea(page, 'Registrar insumos'),
        tipo: 'area',
        pos: 'esq',
        fijo: true,
      },
      {
        n: 4,
        que: 'tarea «Buscar paciente»',
        loc: tarea(page, 'Buscar paciente'),
        tipo: 'area',
        pos: 'esq',
        fijo: true,
      },
      {
        n: 5,
        que: 'menú lateral (Inicio, Recordatorios, Pacientes, Suministros)',
        loc: menu(page).getByRole('list'),
        tipo: 'area',
        pos: 'abajo',
      },
      // Pegado a la esquina del botón, dentro de la barra (abajo caería sobre la franja de demostración).
      {
        n: 6,
        que: 'botón Salir (cierra la sesión)',
        loc: botonSalir(page),
        pos: 'esq-der',
        fijo: true,
      },
    ],
    { desdeArriba: true },
  );
}

/** Aviso del último minuto y cierre por inactividad: se adelanta el reloj del navegador. */
export async function flujoInactividad(navegador) {
  if (!quiero('03') && !quiero('04')) return;
  console.log('\nFlujo 1 · Aviso de inactividad (reloj adelantado en el navegador)');
  const { contexto, page } = await nuevoContexto(navegador);
  await ingresarPorApi(contexto);
  await page.clock.install();
  await page.goto(`${BASE}/`);
  await page.getByRole('heading', { level: 1, name: /^Hola,/ }).waitFor();
  await esperarPantalla(page);
  const minutos = await page.evaluate(async () => {
    const r = await fetch('/api/auth/sesion', { credentials: 'same-origin' });
    const j = await r.json();
    return j.data?.inactividadMinutos ?? 15;
  });
  // Hasta el último minuto sin tocar nada.
  await page.clock.fastForward((minutos - 1) * 60_000);
  const aviso = page.getByRole('alertdialog', { name: '¿Sigue ahí?' });
  await aviso.waitFor();
  await page.waitForTimeout(400);
  await capturar(
    page,
    '03-aviso-inactividad.png',
    `Aviso «¿Sigue ahí?» un minuto antes de cerrar la sesión por inactividad (${minutos} min sin tocar la pantalla)`,
    [
      {
        n: 1,
        que: 'cuenta regresiva del cierre',
        loc: aviso.locator('.MuiDialogContent-root p'),
        tipo: 'area',
        pos: 'izq',
        pad: 10,
      },
      {
        n: 2,
        que: 'botón Seguir trabajando',
        loc: aviso.getByRole('button', { name: 'Seguir trabajando' }),
        pos: 'abajo',
      },
      {
        n: 3,
        que: 'botón Cerrar sesión',
        loc: aviso.getByRole('button', { name: 'Cerrar sesión' }),
        pos: 'izq',
      },
    ],
    { incluir: [aviso] },
  );

  // Pasa el minuto: la sesión se cierra sola y el ingreso dice por qué.
  await page.clock.fastForward(61_000);
  await page.getByRole('heading', { name: 'Ingresar' }).waitFor();
  await esperarPantalla(page);
  const alerta = page
    .getByRole('alert')
    .or(page.getByRole('status'))
    .filter({ hasText: 'inactividad' })
    .first();
  await alerta.waitFor();
  await capturar(
    page,
    '04-sesion-cerrada.png',
    'Ingreso después del cierre por inactividad, con el aviso de que los recordatorios quedaron apagados',
    [
      {
        n: 1,
        que: 'aviso: se cerró la sesión por inactividad y los avisos de recordatorios quedan apagados',
        loc: alerta,
        tipo: 'area',
        pos: 'izq',
      },
      {
        n: 2,
        que: 'botón Ingresar (volver a entrar)',
        loc: page.getByRole('button', { name: 'Ingresar' }),
        pos: 'izq',
      },
    ],
    { incluir: [page.locator('form')] },
  );
  await contexto.close();
}

/** En el teléfono: la barra cambia y el menú va en un cajón. */
export async function flujoTelefono(navegador) {
  if (!quiero('05') && !quiero('06')) return;
  console.log('\nFlujo 1 · En el teléfono (375×812)');
  const { contexto, page } = await nuevoContexto(navegador, TELEFONO);
  await ingresarPorApi(contexto);
  await page.goto(`${BASE}/`);
  await page.getByRole('heading', { level: 1, name: /^Hola,/ }).waitFor();
  await esperarPantalla(page, 600);
  const abrirMenu = page.getByRole('button', { name: 'Abrir el menú' });
  await capturar(
    page,
    '05-telefono-inicio.png',
    'Inicio en el teléfono: la barra superior con el botón del menú, la insignia y Salir',
    [
      // La barra del teléfono no tiene lugar libre: los círculos van sobre el borde de abajo del botón
      // (tapan un poco la franja de demostración, no el ícono).
      {
        n: 1,
        que: 'botón del menú (abre el cajón)',
        loc: abrirMenu,
        pos: 'borde-abajo',
        fijo: true,
      },
      {
        n: 2,
        que: 'insignia de recordatorios',
        loc: insignia(page),
        pos: 'borde-abajo',
        fijo: true,
      },
      {
        n: 3,
        que: 'botón Salir (solo el ícono)',
        loc: page.getByRole('button', { name: 'Salir' }),
        pos: 'borde-abajo',
        fijo: true,
      },
      {
        n: 4,
        que: 'tarea «Tomas y estudios para atender»',
        loc: tarea(page, 'Tomas y estudios para atender'),
        tipo: 'area',
        pos: 'esq',
      },
    ],
    { desdeArriba: true, incluir: [tarea(page, 'Administrar medicamento')] },
  );

  await abrirMenu.click();
  const cajon = page
    .locator('.MuiDrawer-paper')
    .filter({ has: page.getByRole('navigation', { name: 'Menú principal' }) });
  await cajon.waitFor();
  await page.waitForTimeout(600);
  await capturar(
    page,
    '06-telefono-menu.png',
    'Menú abierto en el teléfono (cajón lateral)',
    [
      {
        n: 1,
        que: 'opciones del menú',
        loc: cajon.getByRole('navigation', { name: 'Menú principal' }).getByRole('list'),
        tipo: 'area',
        pos: 'der',
      },
      {
        n: 2,
        que: 'Tema de la pantalla (claro u oscuro)',
        loc: cajon.getByText('Tema de la pantalla').locator('..'),
        tipo: 'area',
        pos: 'arriba',
      },
    ],
    { recorte: 'pantalla' },
  );
  await contexto.close();
}
