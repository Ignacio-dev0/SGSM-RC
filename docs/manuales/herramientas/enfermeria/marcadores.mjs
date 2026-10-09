// Manual de enfermería: marcadores numerados, tapar el usuario y guardar cada captura.

import { resolve } from 'node:path';
import { COLOR, CUENTA, RADIO, SALIDA, avisar, quiero, referencias } from './comun.mjs';

// ───────────────────────── Marcadores ─────────────────────────

/**
 * Rectángulo que cubre a todos los elementos de `loc` (uno o varios locators). Un campo de MUI
 * incluye su etiqueta flotante (que sobresale arriba del borde); con `texto`, solo lo escrito.
 */
async function cajaDe(loc, { texto = false } = {}) {
  const lista = Array.isArray(loc) ? loc : [loc];
  const cajas = [];
  for (const l of lista) {
    const n = await l.count();
    if (n === 0) throw new Error(`No aparece en la pantalla: ${l}`);
    if (n > 1) throw new Error(`Hay ${n} elementos para un solo marcador: ${l}`);
    await l.waitFor({ state: 'visible', timeout: 8000 });
    const b = await l.evaluate((el, soloTexto) => {
      let rs = [el.getBoundingClientRect()];
      if (soloTexto) {
        const rango = document.createRange();
        rango.selectNodeContents(el);
        rs = [rango.getBoundingClientRect()];
      }
      if (el.classList.contains('MuiFormControl-root')) {
        const etiqueta = el.querySelector(':scope > label');
        if (etiqueta && getComputedStyle(etiqueta).display !== 'none')
          rs.push(etiqueta.getBoundingClientRect());
      }
      let x = Math.min(...rs.map((r) => r.left));
      let y = Math.min(...rs.map((r) => r.top));
      let x2 = Math.max(...rs.map((r) => r.right));
      let y2 = Math.max(...rs.map((r) => r.bottom));
      // Solo la parte que se ve: una fila de una tabla con desplazamiento lateral sigue más allá.
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const st = getComputedStyle(p);
        if (!/(auto|scroll|hidden|clip)/.test(`${st.overflowX} ${st.overflowY}`)) continue;
        const r = p.getBoundingClientRect();
        if (/(auto|scroll|hidden|clip)/.test(st.overflowX)) {
          x = Math.max(x, r.left);
          x2 = Math.min(x2, r.right);
        }
        if (/(auto|scroll|hidden|clip)/.test(st.overflowY)) {
          y = Math.max(y, r.top);
          y2 = Math.min(y2, r.bottom);
        }
      }
      x = Math.max(x, 0);
      x2 = Math.min(x2, document.documentElement.clientWidth);
      return { x, y, width: x2 - x, height: y2 - y };
    }, texto);
    if (!b.width || !b.height) throw new Error(`No tiene caja: ${l}`);
    cajas.push(b);
  }
  const x = Math.min(...cajas.map((b) => b.x));
  const y = Math.min(...cajas.map((b) => b.y));
  const x2 = Math.max(...cajas.map((b) => b.x + b.width));
  const y2 = Math.max(...cajas.map((b) => b.y + b.height));
  return { x, y, width: x2 - x, height: y2 - y };
}

/**
 * Dónde puede ir el círculo:
 *   izq / der: afuera del control, a la altura de su centro;
 *   arriba / abajo: afuera, alineado a su izquierda (arriba-der / abajo-der: a su derecha);
 *   esq / esq-der: sobre la esquina superior del marco (para recuadros de áreas);
 *   dentro-der: adentro, cerca del borde derecho (campos anchos con lugar libre a la derecha);
 *   borde-abajo: sobre el borde inferior del marco, centrado;
 *   borde-izq / borde-der: sobre el borde de `en` (la tarjeta que lo contiene), a la altura del control.
 */
function centro(b, pos, pad, contenedor) {
  const G = 8;
  switch (pos) {
    case 'izq':
      return { cx: b.x - pad - RADIO - G, cy: b.y + b.height / 2 };
    case 'der':
      return { cx: b.x + b.width + pad + RADIO + G, cy: b.y + b.height / 2 };
    case 'arriba':
      return { cx: b.x + RADIO, cy: b.y - pad - RADIO - G };
    case 'abajo':
      return { cx: b.x + RADIO, cy: b.y + b.height + pad + RADIO + G };
    case 'abajo-der':
      return { cx: b.x + b.width - RADIO, cy: b.y + b.height + pad + RADIO + G };
    case 'arriba-der':
      return { cx: b.x + b.width - RADIO, cy: b.y - pad - RADIO - G };
    case 'esq-der':
      return { cx: b.x + b.width + pad, cy: b.y - pad };
    case 'dentro-der':
      return { cx: b.x + b.width - RADIO - 48, cy: b.y + b.height / 2 };
    case 'borde-abajo':
      return { cx: b.x + b.width / 2, cy: b.y + b.height + pad };
    case 'borde-izq':
      return contenedor && { cx: contenedor.x, cy: b.y + b.height / 2 };
    case 'borde-der':
      return contenedor && { cx: contenedor.x + contenedor.width, cy: b.y + b.height / 2 };
    default:
      return { cx: b.x - pad, cy: b.y - pad };
  }
}

/** Primero sobre la esquina del marco (no deja dudas de a qué control va), después alrededor. */
const CANDIDATOS = {
  punto: [
    'esq',
    'izq',
    'esq-der',
    'der',
    'arriba',
    'abajo',
    'arriba-der',
    'abajo-der',
    'dentro-der',
  ],
  area: ['esq', 'esq-der', 'izq', 'der', 'arriba', 'abajo', 'arriba-der', 'abajo-der'],
};

/**
 * Lo que un círculo no debería tapar: cada texto visible (el que queda arriba de todo, no el que
 * está detrás de un diálogo), lo escrito en los campos y los íconos. Y el menú lateral fijo.
 */
async function obstaculos(page) {
  return page.evaluate(() => {
    const rects = [];
    const arribaDeTodo = (el, x, y) => {
      const top = document.elementFromPoint(x, y);
      return Boolean(top && (top === el || el.contains(top) || top.contains(el)));
    };
    const recorrido = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = recorrido.nextNode(); n; n = recorrido.nextNode()) {
      const el = n.parentElement;
      if (!el || !n.textContent.trim() || el.closest('#marcas-manual, #tachado-manual')) continue;
      const rango = document.createRange();
      rango.selectNodeContents(n);
      for (const r of rango.getClientRects()) {
        if (r.width < 1 || r.height < 1) continue;
        if (!arribaDeTodo(el, r.left + r.width / 2, r.top + r.height / 2)) continue;
        rects.push([r.left, r.top, r.right, r.bottom]);
      }
    }
    const lienzo = document.createElement('canvas').getContext('2d');
    for (const el of document.querySelectorAll(
      'input:not([type=checkbox]):not([type=radio]), select, textarea',
    )) {
      const valor =
        el.tagName === 'SELECT' ? el.options[el.selectedIndex]?.text : el.value || el.placeholder;
      const r = el.getBoundingClientRect();
      if (!valor || r.width < 1 || !arribaDeTodo(el, r.left + 4, r.top + r.height / 2)) continue;
      const st = getComputedStyle(el);
      lienzo.font = st.font;
      const izq = r.left + parseFloat(st.paddingLeft);
      rects.push([
        izq,
        r.top + 4,
        Math.min(r.right, izq + lienzo.measureText(valor).width),
        r.bottom - 4,
      ]);
    }
    for (const el of document.querySelectorAll(
      'svg, .MuiSwitch-root, .MuiChip-root, .MuiBadge-badge',
    )) {
      const r = el.getBoundingClientRect();
      if (
        r.width < 1 ||
        r.height < 1 ||
        !arribaDeTodo(el, r.left + r.width / 2, r.top + r.height / 2)
      )
        continue;
      rects.push([r.left, r.top, r.right, r.bottom]);
    }
    const riel = document.querySelector('nav[aria-label="Menú principal"]');
    const rr = riel?.getBoundingClientRect();
    const esRiel = rr && rr.left <= 0 && rr.width < 140 && !riel.closest('.MuiDrawer-modal');
    return { rects, rielDerecha: esRiel ? rr.right : 0 };
  });
}

const contiene = (a, b) => a[0] <= b[0] && a[1] <= b[1] && a[2] >= b[2] && a[3] >= b[3];
const interseccion = (a, b) =>
  Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0])) *
  Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));

/**
 * Dibuja los marcadores sobre la página: un círculo numerado (magenta, borde blanco) y el marco del
 * control (línea llena para un control, de trazos para un área). De las posiciones posibles (la
 * pedida en `pos` primero; con `fijo`, solo esa) el círculo va en la que menos tapa: texto, íconos,
 * otros círculos o el marco de otro control; a igualdad, la que viene antes. Avisa si igual tapa algo.
 */
async function marcar(page, marcas) {
  const viewport = page.viewportSize();
  const { rects, rielDerecha } = await obstaculos(page);
  // Primero todos los marcos: un círculo no debe caer sobre el marco de otro control.
  const marcos = [];
  for (const m of marcas) {
    const b = await cajaDe(m.loc, { texto: m.texto });
    const tipo = m.tipo ?? 'punto';
    if (b.y < -1 || b.y + b.height > viewport.height + 1) {
      throw new Error(
        `El marcador ${m.n} (${m.que}) queda fuera de la pantalla: subilo antes de capturar`,
      );
    }
    // El marco no sale de la ventana (un control pegado al borde lo tendría cortado).
    const pedido = m.pad ?? (tipo === 'area' ? 7 : 4);
    const pad = Math.max(
      1,
      Math.min(pedido, b.x, b.y, viewport.width - b.x - b.width, viewport.height - b.y - b.height),
    );
    marcos.push({
      m,
      b,
      tipo,
      pad,
      caja: [b.x - pad, b.y - pad, b.x + b.width + pad, b.y + b.height + pad],
    });
  }
  const dibujos = [];
  for (const { m, b, tipo, pad } of marcos) {
    const contenedor = m.en ? await cajaDe(m.en) : null;
    // A la derecha del menú lateral, el círculo no se mete en él.
    const x0 = b.x >= rielDerecha ? rielDerecha + 1 : 0;
    const orden = [
      ...(m.pos ? [m.pos] : []),
      ...(m.en ? ['borde-izq', 'borde-der'] : []),
      ...(m.fijo ? [] : CANDIDATOS[tipo]),
    ];
    const propio = [b.x - pad, b.y - pad, b.x + b.width + pad, b.y + b.height + pad];
    let mejor = null;
    for (const [indice, pos] of [...new Set(orden)].entries()) {
      const c = centro(b, pos, pad, contenedor);
      if (!c) continue;
      const cx = Math.min(Math.max(c.cx, x0 + RADIO + 1), viewport.width - RADIO - 2);
      const cy = Math.min(Math.max(c.cy, RADIO + 2), viewport.height - RADIO - 2);
      const caja = [cx - RADIO + 2, cy - RADIO + 2, cx + RADIO - 2, cy + RADIO - 2];
      let puntaje = rects.reduce((t, r) => t + interseccion(caja, r), 0);
      for (const d of dibujos) {
        puntaje +=
          50 * interseccion(caja, [d.cx - RADIO, d.cy - RADIO, d.cx + RADIO, d.cy + RADIO]);
      }
      // Lejos de su marco y sobre el de otro control, se leería como de ese otro. Pegado a su propio
      // marco (en una esquina) no hay duda, aunque roce el de al lado.
      const pegado = interseccion(caja, propio) > 0;
      for (const o of marcos) {
        if (o.m === m || interseccion(caja, o.caja) === 0) continue;
        const anidados = contiene(o.caja, propio) || contiene(propio, o.caja);
        // Cruzar el borde de un marco anidado confunde de quién es el número.
        if (anidados) puntaje += contiene(o.caja, caja) ? 0 : 30;
        else puntaje += pegado ? 3 : 300;
      }
      // Ante la duda, el orden de preferencia.
      puntaje += 3 * indice;
      // Afuera del control se lee mejor (salvo las posiciones que van adentro a propósito).
      if (
        !['dentro-der', 'borde-izq', 'borde-der', 'borde-abajo', 'esq', 'esq-der'].includes(pos)
      ) {
        puntaje += 0.2 * interseccion(caja, propio);
      }
      // Corrido por no entrar en la ventana: se aleja de donde se pidió.
      puntaje += 0.5 * (Math.abs(cx - c.cx) + Math.abs(cy - c.cy));
      if (!mejor || puntaje < mejor.puntaje) mejor = { cx, cy, pos, puntaje };
    }
    if (mejor.puntaje >= 40) {
      avisar(
        `el marcador ${m.n} (${m.que}) tapa algo (${Math.round(mejor.puntaje)} puntos, en ${mejor.pos})`,
      );
    }
    dibujos.push({
      n: m.n,
      que: m.que,
      tipo,
      ...b,
      cx: mejor.cx,
      cy: mejor.cy,
      pos: mejor.pos,
      pad,
    });
  }
  // Círculos que se tapan entre sí.
  for (let i = 0; i < dibujos.length; i++) {
    for (let j = i + 1; j < dibujos.length; j++) {
      const d = Math.hypot(dibujos[i].cx - dibujos[j].cx, dibujos[i].cy - dibujos[j].cy);
      if (d < 2 * RADIO + 2) {
        avisar(`los marcadores ${dibujos[i].n} y ${dibujos[j].n} se tapan (${Math.round(d)} px)`);
      }
    }
  }
  await page.evaluate(
    ({ dibujos, COLOR, RADIO }) => {
      const capa = document.createElement('div');
      capa.id = 'marcas-manual';
      capa.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647;';
      for (const d of dibujos) {
        const marco = document.createElement('div');
        marco.style.cssText = [
          'position:absolute',
          `left:${d.x - d.pad}px`,
          `top:${d.y - d.pad}px`,
          `width:${d.width + 2 * d.pad}px`,
          `height:${d.height + 2 * d.pad}px`,
          `border:3px ${d.tipo === 'area' ? 'dashed' : 'solid'} ${COLOR}`,
          'border-radius:10px',
          'box-sizing:border-box',
          'box-shadow:0 0 0 1px rgba(255,255,255,.9), inset 0 0 0 1px rgba(255,255,255,.9)',
        ].join(';');
        capa.appendChild(marco);
      }
      for (const d of dibujos) {
        const c = document.createElement('div');
        c.textContent = String(d.n);
        c.style.cssText = [
          'position:absolute',
          `left:${d.cx - RADIO}px`,
          `top:${d.cy - RADIO}px`,
          `width:${2 * RADIO}px`,
          `height:${2 * RADIO}px`,
          'border-radius:50%',
          `background:${COLOR}`,
          'color:#fff',
          'border:3px solid #fff',
          'box-sizing:border-box',
          'display:flex',
          'align-items:center',
          'justify-content:center',
          'font:700 15px/1 Arial, Helvetica, sans-serif',
          'box-shadow:0 1px 4px rgba(0,0,0,.5)',
        ].join(';');
        capa.appendChild(c);
      }
      document.body.appendChild(capa);
    },
    { dibujos, COLOR, RADIO },
  );
  return dibujos;
}

async function quitarMarcas(page) {
  await page.evaluate(() => {
    document.getElementById('marcas-manual')?.remove();
    document.getElementById('tachado-manual')?.remove();
  });
}

/**
 * Tapa el usuario de prueba donde la pantalla lo muestra ("Simular el rostro de …" del modo
 * demostración): una barra gris sobre esas letras, sin tocar el DOM de la aplicación.
 */
async function taparUsuario(page) {
  const tapadas = await page.evaluate((usuario) => {
    const capa = document.createElement('div');
    capa.id = 'tachado-manual';
    capa.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483646;';
    let n = 0;
    const recorrido = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let nodo = recorrido.nextNode(); nodo; nodo = recorrido.nextNode()) {
      const texto = nodo.textContent ?? '';
      // Solo donde la pantalla muestra el usuario: el botón del rostro simulado.
      if (!nodo.parentElement?.closest('button')?.textContent?.startsWith('Simular el rostro de'))
        continue;
      let desde = texto.indexOf(usuario);
      while (desde >= 0) {
        const rango = document.createRange();
        rango.setStart(nodo, desde);
        rango.setEnd(nodo, desde + usuario.length);
        for (const r of rango.getClientRects()) {
          if (r.width === 0) continue;
          const barra = document.createElement('div');
          barra.style.cssText = `position:absolute;left:${r.left - 2}px;top:${r.top + 1}px;width:${r.width + 4}px;height:${r.height - 2}px;background:#455a64;border-radius:4px;`;
          capa.appendChild(barra);
          n++;
        }
        desde = texto.indexOf(usuario, desde + usuario.length);
      }
    }
    document.body.appendChild(capa);
    return n;
  }, CUENTA.usuario);
  return tapadas;
}

/**
 * Saca la foto con los marcadores y la guarda. `recorte`:
 *   undefined → alto justo para lo marcado (y `incluir`) con margen, ancho completo;
 *   'pantalla' → la ventana entera;
 *   { y0, y1 } → esa franja (ancho completo).
 * Con `desdeArriba` el recorte empieza en 0 (muestra la barra superior).
 */
export async function capturar(page, archivo, que, marcas, opciones = {}) {
  if (!quiero(archivo)) return;
  const { recorte, incluir = [], desdeArriba = false, margen = 20 } = opciones;
  // Sin foco: un campo enfocado se dibuja resaltado y el texto no lo explica.
  await page.evaluate(() =>
    document.activeElement instanceof HTMLElement ? document.activeElement.blur() : null,
  );
  await page.mouse.move(1, 1);
  const tapadas = await taparUsuario(page);
  const dibujos = await marcar(page, marcas);
  const viewport = page.viewportSize();

  let clip;
  if (recorte === 'pantalla') {
    clip = { x: 0, y: 0, width: viewport.width, height: viewport.height };
  } else if (recorte && typeof recorte === 'object') {
    clip = { x: 0, y: recorte.y0, width: viewport.width, height: recorte.y1 - recorte.y0 };
  } else {
    const ys = [];
    for (const d of dibujos) {
      ys.push(d.y - d.pad - 4, d.y + d.height + d.pad + 4, d.cy - RADIO - 4, d.cy + RADIO + 4);
    }
    for (const l of incluir) {
      const b = await cajaDe(l);
      ys.push(b.y, b.y + b.height);
    }
    const y0 = desdeArriba ? 0 : Math.max(0, Math.floor(Math.min(...ys) - margen));
    const y1 = Math.min(viewport.height, Math.ceil(Math.max(...ys) + margen));
    clip = { x: 0, y: y0, width: viewport.width, height: y1 - y0 };
  }
  // Ningún marcador cortado por el recorte.
  for (const d of dibujos) {
    const arriba = Math.min(d.y - d.pad, d.cy - RADIO);
    const abajo = Math.max(d.y + d.height + d.pad, d.cy + RADIO);
    if (arriba < clip.y - 1 || abajo > clip.y + clip.height + 1) {
      throw new Error(
        `${archivo}: el marcador ${d.n} (${d.que}) queda fuera del recorte (marca ${Math.round(arriba)}–${Math.round(abajo)}, recorte ${Math.round(clip.y)}–${Math.round(clip.y + clip.height)})`,
      );
    }
  }
  if (dibujos.length > 6) avisar(`${archivo}: ${dibujos.length} marcadores (más de 6 se leen mal)`);

  const ruta = resolve(SALIDA, archivo);
  await page.screenshot({ path: ruta, clip, animations: 'disabled', caret: 'hide' });
  await quitarMarcas(page);
  referencias.push({
    archivo: `img/enfermeria/${archivo}`,
    muestra: que,
    tamano: { w: Math.round(clip.width), h: Math.round(clip.height) },
    ...(tapadas ? { tapado: 'el usuario de prueba (barra gris)' } : {}),
    marcadores: dibujos.map((d) => ({ n: d.n, tipo: d.tipo, que_es: d.que })),
  });
  console.log(
    `  ✓ ${archivo} (${Math.round(clip.width)}×${Math.round(clip.height)}) · ${dibujos.map((d) => `${d.n} ${d.que}`).join(' · ')}`,
  );
}
