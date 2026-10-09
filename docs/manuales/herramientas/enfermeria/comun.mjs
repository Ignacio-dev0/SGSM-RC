// Manual de enfermería: configuración, usuario de prueba, navegador y comunes de la interfaz.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = resolve(AQUI, '../../../..');
export const SALIDA = resolve(AQUI, '../../img/enfermeria');
export const BASE = (process.env.SGSM_INTERFAZ ?? 'http://localhost:4173').replace(/\/$/, '');
export const TABLET = { width: 768, height: 1024 };
export const TELEFONO = { width: 375, height: 812 };
const ZONA = 'America/Argentina/Buenos_Aires';

/** Color de los marcadores: magenta, que no usa la interfaz (verde azulado y ámbar). */
export const COLOR = '#C2185B';
export const RADIO = 15;

/** Pacientes de preparar-datos.mjs: lo que no sea de ellos no debería salir en una captura. */
export const DEMO = {
  olmedo: 'Olmedo, Ramiro Teodoro',
  villafane: 'Villafañe, Herminia',
  arrieta: 'Arrieta, Teodoro Julián',
};
const NOMBRES_DEMO = Object.values(DEMO);

const argSolo = process.argv.indexOf('--solo');
const SOLO = argSolo > 0 ? process.argv[argSolo + 1].split(',').map((s) => s.trim()) : null;
export const quiero = (archivo) => !SOLO || SOLO.some((p) => archivo.startsWith(p));

export const referencias = [];
export const avisos = [];
export const avisar = (texto) => {
  avisos.push(texto);
  console.log(`  ! ${texto}`);
};

// ───────────────────────── Usuario de prueba ─────────────────────────

function credenciales() {
  let usuario = process.env.E2E_USUARIO_ENFERMERO;
  let clave = process.env.E2E_CLAVE_ENFERMERO;
  if (!usuario || !clave) {
    const soporte = readFileSync(resolve(RAIZ, 'e2e/soporte.ts'), 'utf8');
    usuario ??= /E2E_USUARIO_ENFERMERO \?\? '([^']+)'/.exec(soporte)?.[1];
    clave ??= /E2E_CLAVE_ENFERMERO \?\? '([^']+)'/.exec(soporte)?.[1];
  }
  if (!usuario || !clave) throw new Error('No encuentro el usuario de prueba de enfermería');
  return { usuario, clave };
}
export const CUENTA = credenciales();

// ───────────────────────── Navegador ─────────────────────────

export async function nuevoContexto(navegador, viewport = TABLET) {
  const contexto = await navegador.newContext({
    viewport,
    deviceScaleFactor: 1,
    colorScheme: 'light',
    locale: 'es-AR',
    timezoneId: ZONA,
    reducedMotion: 'reduce',
    ...(viewport.width < 600 ? { hasTouch: true } : {}),
  });
  const page = await contexto.newPage();
  // Un "¿Salir de la página?" del navegador no tiene que trabar el recorrido.
  page.on('dialog', (d) => void d.accept().catch(() => undefined));
  return { contexto, page };
}

/** Ingreso por la API (como las pruebas e2e): para los contextos que no muestran el ingreso. */
export async function ingresarPorApi(contexto) {
  const r = await contexto.request.post(`${BASE}/api/auth/login`, {
    data: { nombreUsuario: CUENTA.usuario, contrasena: CUENTA.clave },
  });
  if (!r.ok()) throw new Error(`No se pudo ingresar por la API: ${r.status()}`);
}

/** Espera a que la pantalla termine de cargar: sin pedidos pendientes ni indicadores girando. */
export async function esperarPantalla(page, extra = 300) {
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => undefined);
  await page
    .waitForFunction(
      () =>
        ![...document.querySelectorAll('.MuiCircularProgress-root, .MuiLinearProgress-root')].some(
          (el) => {
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.height > 0;
          },
        ) && !/Cargando/.test(document.querySelector('main')?.innerText ?? ''),
      null,
      { timeout: 12_000 },
    )
    .catch(() => avisar(`La pantalla ${page.url()} siguió mostrando "Cargando"`));
  await page.waitForTimeout(extra);
}

/** Sube el elemento hasta `arriba` px del borde superior (deja libre la barra y la franja). */
export async function subir(page, loc, arriba = 112) {
  await loc.first().scrollIntoViewIfNeeded();
  const caja = await loc.first().boundingBox();
  if (!caja) throw new Error('No se puede llevar a la vista un elemento invisible');
  await page.evaluate((dy) => window.scrollBy(0, dy), caja.y - arriba);
  await page.waitForTimeout(250);
}

export async function arriba(page) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(150);
}

/** Elige en un selector nativo la opción cuyo texto contiene `texto`. */
export async function elegirOpcion(select, texto) {
  const opciones = await select.locator('option').allTextContents();
  const etiqueta = opciones.find((o) => o.includes(texto));
  if (!etiqueta) {
    throw new Error(
      `No está la opción «${texto}» (hay: ${opciones.join(' | ')}). ¿Faltan los datos de demostración?`,
    );
  }
  await select.selectOption({ label: etiqueta });
}

/** El campo entero (marco, etiqueta y ayuda) de un control de formulario de MUI. */
export const campo = (control) =>
  control.locator(
    'xpath=ancestor::div[contains(concat(" ", normalize-space(@class), " "), " MuiFormControl-root ")][1]',
  );

/** Si aparece "¿Descartar lo cargado?", se descarta (nada de lo cargado se guarda). */
export async function descartarSiPregunta(page) {
  const descartar = page.getByRole('button', { name: 'Descartar' });
  const pregunta = await descartar
    .waitFor({ state: 'visible', timeout: 1500 })
    .then(() => true)
    .catch(() => false);
  if (pregunta) {
    await descartar.click();
    await descartar.waitFor({ state: 'hidden' });
  }
}

// ───────────────────────── Comunes de la interfaz ─────────────────────────

export const menu = (page) => page.getByRole('navigation', { name: 'Menú principal' });
export const insignia = (page) => page.getByRole('link', { name: /^Recordatorios:/ });
export const botonSalir = (page) => page.getByRole('button', { name: 'Salir' });
export const tarea = (page, nombre) => page.getByRole('link', { name: new RegExp(`^${nombre}`) });

async function irAlInicio(page) {
  await menu(page).getByRole('link', { name: 'Inicio' }).click();
  await descartarSiPregunta(page);
  await page.getByRole('heading', { level: 1, name: /^Hola,/ }).waitFor();
  await esperarPantalla(page);
}

/** Desde el Inicio, la tarea con ese nombre (como lo haría la persona). */
export async function abrirTarea(page, nombre, titulo) {
  await irAlInicio(page);
  await tarea(page, nombre).click();
  await page.getByRole('heading', { level: 1, name: titulo }).waitFor();
  await esperarPantalla(page);
}

/** Tarjetas del panel de recordatorios. */
export const tarjetas = (page) =>
  page.getByRole('list', { name: /para atender/ }).getByRole('listitem');

/** La tarjeta de una toma o un estudio de ese paciente (y, si se indica, ese medicamento). */
export function tarjeta(page, paciente, que) {
  let t = tarjetas(page).filter({ has: page.getByRole('heading', { name: paciente }) });
  if (que) t = t.filter({ hasText: que });
  return t.first();
}

export async function verificarPanel(page) {
  const nombres = await tarjetas(page).getByRole('heading').allTextContents();
  const ajenos = [...new Set(nombres.filter((n) => !NOMBRES_DEMO.includes(n.trim())))];
  if (ajenos.length) {
    avisar(
      `En el panel hay recordatorios de pacientes que no son de la demostración: ${ajenos.join(', ')}`,
    );
  }
  return nombres;
}

/** Nivel de urgencia que muestra cada tarjeta (el texto de su chip). */
export async function niveles(page) {
  return tarjetas(page).evaluateAll((lis) =>
    lis.map((li) => li.querySelector('.MuiChip-label')?.textContent?.trim() ?? ''),
  );
}
