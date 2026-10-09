// Maquinaria de las capturas de los manuales (SOLO desarrollo): espera a que la pantalla cargue,
// tapa los nombres de usuario de las cuentas de prueba, dibuja marcadores numerados sobre los
// controles reales (círculo con número; recuadro para áreas), recorta a la zona útil y guarda
// el PNG. Los marcadores se dibujan con elementos posicionados sobre el getBoundingClientRect de
// cada control justo antes de la captura y se quitan enseguida.

// Las funciones taparEnPagina, destaparEnPagina y dibujarEnPagina corren dentro de la página.

import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as prettier from 'prettier';

/** Espera a que la pantalla termine de cargar: sin pedidos, sin indicadores, con las letras. */
export async function esperar(page, ms = 350) {
  await page.waitForLoadState('networkidle').catch(() => undefined);
  await page
    .locator(
      'main .MuiCircularProgress-root, main .MuiLinearProgress-root, [role="dialog"] .MuiCircularProgress-root',
    )
    .first()
    .waitFor({ state: 'detached', timeout: 10_000 })
    .catch(() => undefined);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(ms);
}

/** Tapa los nombres de usuario de las cuentas de prueba (texto y campos). Devuelve cuántos tapó. */
function taparEnPagina(nombres) {
  const patron = `(?<![\\p{L}\\p{N}_.@-])(${nombres.join('|')})(?![\\p{L}\\p{N}_@-])`;
  const re = new RegExp(patron, 'gu');
  const hay = new RegExp(patron, 'u');
  const registro = [];
  const recorrido = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) =>
      n.parentElement?.closest('script, style, #__marcadores') || !hay.test(n.nodeValue)
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT,
  });
  const nodos = [];
  while (recorrido.nextNode()) nodos.push(recorrido.currentNode);
  for (const nodo of nodos) {
    re.lastIndex = 0;
    const partes = [];
    let desde = 0;
    for (const m of nodo.nodeValue.matchAll(re)) {
      if (m.index > desde)
        partes.push(document.createTextNode(nodo.nodeValue.slice(desde, m.index)));
      const tapa = document.createElement('span');
      tapa.textContent = m[0];
      tapa.style.cssText =
        'color:transparent;text-shadow:0 0 7px rgba(0,0,0,.55);background:rgba(120,120,120,.18);border-radius:4px;user-select:none;';
      partes.push(tapa);
      desde = m.index + m[0].length;
    }
    if (desde < nodo.nodeValue.length)
      partes.push(document.createTextNode(nodo.nodeValue.slice(desde)));
    nodo.replaceWith(...partes);
    registro.push({ nodo, partes });
  }
  for (const campo of document.querySelectorAll('input, textarea')) {
    if (nombres.includes(campo.value)) {
      campo.dataset.filtroAnterior = campo.style.filter;
      campo.style.filter = 'blur(5px)';
      registro.push({ campo });
    }
  }
  window.__tapados = registro;
  return registro.length;
}

function destaparEnPagina() {
  for (const r of window.__tapados ?? []) {
    if (r.campo) r.campo.style.filter = r.campo.dataset.filtroAnterior ?? '';
    else if (r.partes[0]?.isConnected) {
      r.partes[0].before(r.nodo);
      r.partes.forEach((p) => p.remove());
    }
  }
  window.__tapados = [];
}

/** Dibuja los marcadores (coordenadas de la ventana) y devuelve lo que ocupan. */
function dibujarEnPagina({ marcas, color, ancho, alto }) {
  const D = 30;
  const capa = document.createElement('div');
  capa.id = '__marcadores';
  capa.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647;';
  const ocupado = [];
  for (const m of marcas) {
    let { x, y, w, h } = m;
    if (m.tipo === 'area') {
      const p = m.margen ?? 5;
      // Dentro de la ventana: una fila de una tabla con desplazamiento lateral sigue de largo.
      const x1 = Math.max(x - p, 3);
      const x2 = Math.min(x + w + p, ancho - 3);
      x = x1;
      w = x2 - x1;
      y -= p;
      h += 2 * p;
      const r = document.createElement('div');
      r.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;border:3px solid ${color};border-radius:10px;box-shadow:0 0 0 2px #fff,inset 0 0 0 2px #fff;box-sizing:border-box;`;
      capa.append(r);
    }
    ocupado.push({ x1: x, y1: y, x2: x + w, y2: y + h });
    const s = 5;
    const centros = {
      izq: [x - D / 2 - s, y + h / 2],
      der: [x + w + D / 2 + s, y + h / 2],
      arriba: [x + w / 2, y - D / 2 - s],
      abajo: [x + w / 2, y + h + D / 2 + s],
      tl: [x, y],
      tr: [x + w, y],
      bl: [x, y + h],
      br: [x + w, y + h],
      'arriba-izq': [x + D / 2, y - D / 2 - s],
      'arriba-der': [x + w - D / 2, y - D / 2 - s],
      'dentro-izq': [x + D / 2 + 8, y + h / 2],
      'dentro-der': [x + w - D / 2 - 8, y + h / 2],
    };
    const lado = m.lado ?? 'tr';
    let [cx, cy] = centros[lado];
    cx += m.dx ?? 0;
    cy += m.dy ?? 0;
    cx = Math.min(Math.max(cx, D / 2 + 3), ancho - D / 2 - 3);
    cy = Math.min(Math.max(cy, D / 2 + 3), alto - D / 2 - 3);
    const c = document.createElement('div');
    c.textContent = String(m.n);
    c.style.cssText = `position:absolute;left:${cx - D / 2}px;top:${cy - D / 2}px;width:${D}px;height:${D}px;border-radius:50%;background:${color};color:#fff;border:3px solid #fff;box-sizing:border-box;display:flex;align-items:center;justify-content:center;font:700 16px/1 Arial,Helvetica,sans-serif;box-shadow:0 1px 5px rgba(0,0,0,.5);`;
    capa.append(c);
    ocupado.push({
      x1: cx - D / 2 - 3,
      y1: cy - D / 2 - 3,
      x2: cx + D / 2 + 3,
      y2: cy + D / 2 + 3,
    });
  }
  document.body.append(capa);
  return ocupado;
}

/** El rectángulo de uno o varios locators (unidos), en coordenadas de la ventana. */
async function caja(loc, nombre, tipo = 'punto') {
  const lista = Array.isArray(loc) ? loc : [loc];
  const cajas = [];
  for (const l of lista) {
    const n = await l.count();
    if (n !== 1)
      throw new Error(`${nombre}: el selector coincide con ${n} elementos (tiene que ser 1)`);
    await l.waitFor({ state: 'visible', timeout: 10_000 });
    // Un campo se marca entero, con su etiqueta flotante (sobresale ~10 px arriba): el recuadro
    // del campo para un punto; con la ayuda de abajo, para un área.
    const b = await l.evaluate((el, tipo) => {
      const esCampo = el.matches('input, select, textarea');
      const campo = esCampo
        ? el.closest(tipo === 'area' ? '.MuiFormControl-root' : '.MuiInputBase-root')
        : null;
      const r = (campo ?? el).getBoundingClientRect();
      const arriba = campo ? 10 : 0;
      return { x: r.x, y: r.y - arriba, width: r.width, height: r.height + arriba };
    }, tipo);
    if (!b || b.width === 0) throw new Error(`${nombre}: no se ve en la pantalla`);
    const alto = l.page().viewportSize().height;
    if (b.y < 0 || b.y + b.height > alto + 1) {
      throw new Error(
        `${nombre}: queda fuera de la ventana (y ${Math.round(b.y)}–${Math.round(b.y + b.height)})`,
      );
    }
    cajas.push(b);
  }
  const x1 = Math.min(...cajas.map((b) => b.x));
  const y1 = Math.min(...cajas.map((b) => b.y));
  const x2 = Math.max(...cajas.map((b) => b.x + b.width));
  const y2 = Math.max(...cajas.map((b) => b.y + b.height));
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

/**
 * Prepara la función que saca las capturas de un manual:
 *   salida: carpeta de los PNG; solo: Set de números a guardar (o null, todos);
 *   tapar: nombres de usuario que no tienen que verse; color: el de los marcadores.
 * Devuelve { capturar, capturas, avisos }: capturas junta qué muestra cada una y qué señala
 * cada número (para referencias.json); avisos, lo que conviene revisar a mano.
 *
 * capturar() saca una captura: tapa los usuarios de prueba, dibuja los marcadores, recorta y guarda.
 *   marcas:  [{ n, loc | [loc, loc], que, tipo: 'punto' | 'area', lado?, dx?, dy?, margen? }]
 *   incluir: locators que tienen que entrar en el recorte aunque no lleven marcador.
 *   recorte: 'auto' (todo el ancho; alto según lo marcado e incluido), 'ventana' o
 *            { y1, y2 } en coordenadas de la ventana.
 */
export function crearCapturador({ salida, solo = null, tapar = [], color }) {
  const capturas = [];
  const avisos = [];

  async function capturar(
    page,
    archivo,
    muestra,
    { marcas = [], incluir = [], recorte = 'auto', margen = 18, desenfocar = true } = {},
  ) {
    const numero = archivo.slice(0, 2);
    // Un aviso de recordatorios nuevos en la franja no es parte de lo que se explica.
    const cerrarAviso = page.getByRole('button', { name: 'Cerrar el aviso' });
    if (await cerrarAviso.isVisible().catch(() => false)) await cerrarAviso.click();
    const vista = page.viewportSize();
    // Sin foco ni cursor encima: ni campos resaltados, ni filas en hover, ni tooltips.
    if (desenfocar) await page.evaluate(() => document.activeElement?.blur?.());
    await page.mouse.move(Math.round(vista.width / 2), 1);
    await esperar(page, 250);

    const medidas = [];
    for (const m of marcas)
      medidas.push({ ...m, ...(await caja(m.loc, `${archivo} · marcador ${m.n}`, m.tipo)) });
    const incluidas = [];
    for (const [i, l] of incluir.entries())
      incluidas.push(await caja(l, `${archivo} · incluir ${i + 1}`, 'area'));

    const tapados = await page.evaluate(taparEnPagina, tapar);
    const ocupado = await page.evaluate(dibujarEnPagina, {
      marcas: medidas.map(({ n, x, y, w, h, tipo, lado, dx, dy, margen: mg }) => ({
        n,
        x,
        y,
        w,
        h,
        tipo,
        lado,
        dx,
        dy,
        margen: mg,
      })),
      color,
      ancho: vista.width,
      alto: vista.height,
    });

    let y1;
    let y2;
    if (recorte === 'ventana') [y1, y2] = [0, vista.height];
    else if (typeof recorte === 'object') ({ y1, y2 } = recorte);
    else {
      const todo = [...ocupado, ...incluidas.map((b) => ({ y1: b.y, y2: b.y + b.h }))];
      y1 = Math.min(...todo.map((r) => r.y1)) - margen;
      y2 = Math.max(...todo.map((r) => r.y2)) + margen;
      // Sin diálogo abierto: con la página arriba de todo y lo marcado cerca del borde, desde la
      // barra (así se reconoce la pantalla); con la página desplazada, desde debajo de la barra y
      // de la franja fijas (lo que pasa por detrás no se ve entero).
      const { desplazada, dialogo, fijo } = await page.evaluate(() => {
        // La barra es fija y la franja de avisos, pegajosa (sticky) debajo de ella.
        const fijos = [...document.querySelectorAll('body *')]
          .filter((el) => ['fixed', 'sticky'].includes(getComputedStyle(el).position))
          .map((el) => el.getBoundingClientRect())
          .filter((r) => r.top < 120 && r.height < 200 && r.width > window.innerWidth / 2);
        return {
          desplazada: window.scrollY > 0,
          dialogo: [
            ...document.querySelectorAll('[role="dialog"], [role="listbox"], .MuiDrawer-modal'),
          ].some((el) => el.getBoundingClientRect().height > 0),
          fijo: Math.max(0, ...fijos.map((r) => r.bottom)),
        };
      });
      if (!dialogo && !desplazada && y1 < 170) y1 = 0;
      if (!dialogo && desplazada && y1 < fijo + 1) y1 = fijo + 1;
    }
    y1 = Math.max(0, Math.floor(y1));
    y2 = Math.min(vista.height, Math.ceil(y2));

    // Lo marcado tiene que entrar entero en el recorte.
    for (const r of ocupado) {
      if (r.y1 < y1 - 1 || r.y2 > y2 + 1) {
        avisos.push(
          `${archivo}: un marcador queda fuera del recorte (y ${Math.round(r.y1)}–${Math.round(r.y2)})`,
        );
      }
    }

    if (!solo || solo.has(numero)) {
      await page.screenshot({
        path: resolve(salida, archivo),
        clip: { x: 0, y: y1, width: vista.width, height: y2 - y1 },
        animations: 'disabled',
        caret: 'hide',
      });
      console.info(
        `  ✓ ${archivo}  (${vista.width}×${y2 - y1}${tapados ? `, ${tapados} usuario(s) de prueba tapado(s)` : ''})`,
      );
    }
    capturas.push({
      archivo,
      muestra,
      marcadores: marcas.map((m) => `${m.n}: ${m.que}`),
    });

    await page.evaluate(() => document.getElementById('__marcadores')?.remove());
    await page.evaluate(destaparEnPagina);
  }

  return { capturar, capturas, avisos };
}

/** Sube la página para que el elemento quede a `arriba` px del borde superior de la ventana. */
export async function subirHasta(page, loc, arriba = 120) {
  await loc.scrollIntoViewIfNeeded();
  const b = await loc.boundingBox();
  await page.evaluate((d) => window.scrollBy(0, d), b.y - arriba);
  await page.waitForTimeout(150);
}

/** La fila n de una tabla (o la última, si tiene menos). */
export async function filaHasta(tabla, n) {
  const filas = tabla.locator('tbody tr');
  return filas.nth(Math.max(0, Math.min(n, (await filas.count()) - 1)));
}

export const alInicio = (page) => page.evaluate(() => window.scrollTo(0, 0));

/**
 * Contexto de navegador con la sesión iniciada por la API (como las pruebas e2e): la ventana del
 * equipo, tema claro, sin animaciones, hora de Argentina y descargas aceptadas. Con sinSesion, el
 * mismo contexto sin ingresar (para la pantalla Ingresar).
 */
export async function nuevoContexto(
  navegador,
  { ui, viewport, telefono = false, usuario, clave, sinSesion = false },
) {
  const contexto = await navegador.newContext({
    viewport,
    deviceScaleFactor: 1,
    colorScheme: 'light',
    reducedMotion: 'reduce',
    locale: 'es-AR',
    timezoneId: 'America/Argentina/Buenos_Aires',
    acceptDownloads: true,
    ...(telefono ? { isMobile: true, hasTouch: true } : {}),
  });
  if (sinSesion) return { contexto, page: await contexto.newPage() };
  const r = await contexto.request.post(`${ui}/api/auth/login`, {
    data: { nombreUsuario: usuario, contrasena: clave },
  });
  if (!r.ok()) throw new Error(`No se pudo iniciar la sesión de ${usuario}: ${r.status()}`);
  return { contexto, page: await contexto.newPage() };
}

/** Ayudas para encontrar controles por lo que dicen (como los nombra el manual). */
export function buscadores(page) {
  return {
    menu: page.getByRole('navigation', { name: 'Menú principal' }),
    boton: (nombre, dentro = page) => dentro.getByRole('button', { name: nombre, exact: true }),
    dialogo: (nombre) => page.getByRole('dialog', { name: nombre }),
    campo: (nombre, dentro = page) => dentro.getByRole('textbox', { name: nombre, exact: true }),
    selector: (nombre, dentro = page) =>
      dentro.getByRole('combobox', { name: nombre, exact: true }),
    fila: (etiqueta) => page.getByRole('row', { name: etiqueta, exact: true }),
    alerta: (texto, dentro = page) => dentro.locator('.MuiAlert-root').filter({ hasText: texto }),
    titulo: (nombre) =>
      page.getByRole('heading', { level: 1, ...(nombre ? { name: nombre } : {}) }),
  };
}

/** Marcador dentro de un selector, a la derecha y antes de la flecha (no tapa lo elegido). */
export const DENTRO = { lado: 'dentro-der', dx: -34 };
/** Escribe referencias.json (qué muestra cada captura y qué señala cada número), con el formato del repo. */
export async function escribirReferencias(archivo, capturas) {
  const opciones = (await prettier.resolveConfig(archivo)) ?? {};
  const texto = await prettier.format(JSON.stringify(capturas), { ...opciones, filepath: archivo });
  writeFileSync(archivo, texto);
}
