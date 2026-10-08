import type { APIRequestContext, Page } from '@playwright/test';

export type Rol = 'enfermero' | 'medico' | 'admin';

/**
 * Usuarios de prueba de la semilla de desarrollo (backend/src/semillas/usuarios-prueba.ts). Se
 * pueden cambiar con variables de entorno si la base tiene otros.
 */
const CREDENCIALES: Record<Rol, { usuario: string; clave: string }> = {
  enfermero: {
    usuario: process.env.E2E_USUARIO_ENFERMERO ?? 'enfermero',
    clave: process.env.E2E_CLAVE_ENFERMERO ?? 'Enfermero2026',
  },
  medico: {
    usuario: process.env.E2E_USUARIO_MEDICO ?? 'medico',
    clave: process.env.E2E_CLAVE_MEDICO ?? 'Medico2026',
  },
  admin: {
    usuario: process.env.E2E_USUARIO_ADMIN ?? 'admin',
    clave: process.env.E2E_CLAVE_ADMIN ?? 'Admin2026',
  },
};

/** Inicia sesión por la API (la cookie queda en el contexto del navegador). */
export async function ingresar(page: Page, rol: Rol) {
  await ingresarPorApi(page.request, rol);
}

/** Inicia sesión en un contexto de pedidos aparte (otro usuario en la misma prueba). */
export async function ingresarPorApi(api: APIRequestContext, rol: Rol) {
  const { usuario, clave } = CREDENCIALES[rol];
  const r = await api.post('/api/auth/login', {
    data: { nombreUsuario: usuario, contrasena: clave },
  });
  if (!r.ok()) throw new Error(`No se pudo ingresar como ${rol}: ${r.status()}`);
}

/** Espera a que la pantalla termine de cargar (sin pedidos pendientes ni indicadores). */
export async function esperarPantalla(page: Page) {
  await page.waitForLoadState('networkidle');
  await page
    .locator('main [role="status"] .MuiCircularProgress-root')
    .first()
    .waitFor({ state: 'detached', timeout: 10_000 })
    .catch(() => undefined);
}

export interface Medicion {
  /** La página entera se desplaza de costado. */
  scrollHorizontal: boolean;
  /** Elementos que salen por la derecha fuera de un contenedor con desplazamiento. */
  fuera: string[];
  /** Contenedores con desplazamiento lateral que no son tablas ni pestañas. */
  desplazables: string[];
  /** Controles táctiles de menos de 44 px de alto o de ancho. */
  tactilesChicos: string[];
}

/** Mide desbordes y tamaños táctiles de la pantalla actual. */
export function medir(page: Page): Promise<Medicion> {
  return page.evaluate(() => {
    const ancho = document.documentElement.clientWidth;
    const describir = (el: Element) => {
      const texto = (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 40);
      return `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''} «${texto}»`;
    };
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
    };
    const dentroDeDesplazable = (el: Element) => {
      for (let p = el.parentElement; p; p = p.parentElement) {
        const s = getComputedStyle(p);
        if (/(auto|scroll|hidden)/.test(s.overflowX) && p.scrollWidth > p.clientWidth) return true;
      }
      return false;
    };
    const todos = [...document.querySelectorAll('body *')].filter(visible);

    const fuera = todos
      .filter((el) => el.getBoundingClientRect().right > ancho + 1 && !dentroDeDesplazable(el))
      .slice(0, 5)
      .map(describir);

    const desplazables = todos
      .filter((el) => {
        const s = getComputedStyle(el);
        return (
          /(auto|scroll)/.test(s.overflowX) &&
          el.scrollWidth > el.clientWidth + 1 &&
          !el.closest('.MuiTableContainer-root, .MuiTabs-scroller')
        );
      })
      .slice(0, 5)
      .map(describir);

    const controles = [
      ...document.querySelectorAll(
        'button, a[href], [role="tab"], [role="button"], select, .MuiInputBase-root',
      ),
    ].filter((el) => visible(el) && !el.closest('[aria-hidden="true"]'));
    const tactilesChicos = controles
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.height < 44 || r.width < 44;
      })
      .slice(0, 8)
      .map((el) => {
        const r = el.getBoundingClientRect();
        return `${describir(el)} ${Math.round(r.width)}×${Math.round(r.height)}`;
      });

    return {
      scrollHorizontal: document.documentElement.scrollWidth > ancho,
      fuera,
      desplazables,
      tactilesChicos,
    };
  });
}

/**
 * Si la interfaz está en modo demostración (rostro simulado). Espera a que la pantalla con sesión
 * esté armada (la barra superior): preguntar antes daba falso y salteaba la prueba sin motivo.
 */
export async function enModoDemostracion(page: Page) {
  await page.getByRole('banner').waitFor();
  return page.getByText(/Modo demostración/).isVisible();
}
