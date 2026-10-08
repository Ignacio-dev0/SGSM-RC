// La tarjeta de un recordatorio con guantes: "No se administró" lejos de Administrar (F9).
import { screen, within } from '@testing-library/react';
import { ENFERMERO } from '../../pruebas/datos';
import {
  fijarHoraTablet,
  recordatorio,
  simularRecordatorios,
} from '../../pruebas/datosRecordatorios';
import { renderizarApp } from '../../pruebas/renderizar';

beforeEach(() => fijarHoraTablet());
afterEach(() => vi.useRealTimers());

/** CSS que emotion generó para las clases del elemento (jsdom no calcula el diseño). */
const cssDe = (el: Element) => {
  const css = [...document.querySelectorAll('style')].map((e) => e.textContent ?? '').join('');
  return [...el.classList]
    .filter((c) => c.startsWith('css-'))
    .map((c) => css.match(new RegExp(String.raw`\.${c}\{([^}]*)\}`))?.[1] ?? '')
    .join(';');
};

/** El gap en píxeles: el tema lo escribe como "calc(2 * var(--mui-spacing))" (8 px por unidad). */
function separacionEnPx(css: string) {
  const enUnidades = /gap:calc\((\d+(?:\.\d+)?) \* var\(--mui-spacing\)\)/.exec(css);
  if (enUnidades) return Number(enUnidades[1]) * 8;
  return Number(/gap:(\d+)px/.exec(css)?.[1] ?? 0);
}

describe('acciones de la tarjeta, al alcance con guantes (F9)', () => {
  it('"No se administró" tiene 56 px de alto y queda a 16 px o más de Administrar', async () => {
    simularRecordatorios([recordatorio()]);
    renderizarApp('/recordatorios', ENFERMERO);

    const lista = await screen.findByRole('list', { name: 'Recordatorios para atender' });
    const [tarjeta] = await within(lista).findAllByRole('listitem');
    const noSeAdministro = within(tarjeta!).getByRole('button', { name: /^No se administró/ });
    const administrar = within(tarjeta!).getByRole('button', { name: /^Administrar/ });

    expect(cssDe(noSeAdministro)).toMatch(/min-height:56px/);
    // Los dos en la misma botonera, separados al menos 16 px (también si se apilan).
    const botonera = noSeAdministro.parentElement!;
    expect(botonera).toBe(administrar.parentElement);
    expect(separacionEnPx(cssDe(botonera))).toBeGreaterThanOrEqual(16);
    // La jerarquía de DESIGN.md: lo menos frecuente como texto, la acción con contorno, al final.
    expect(noSeAdministro).toHaveClass('MuiButton-text');
    expect(administrar).toHaveClass('MuiButton-outlined');
    expect(within(botonera).getAllByRole('button').at(-1)).toBe(administrar);
  });
});

describe('observaciones de la prescripción en la tarjeta (F7)', () => {
  const tarjetaCon = async (observaciones: string | null) => {
    const r = recordatorio();
    simularRecordatorios([{ ...r, prescripcion: { ...r.prescripcion!, observaciones } }]);
    renderizarApp('/recordatorios', ENFERMERO);
    const lista = await screen.findByRole('list', { name: 'Recordatorios para atender' });
    const [tarjeta] = await within(lista).findAllByRole('listitem');
    return tarjeta!;
  };

  it('las muestra si la prescripción las tiene (se leen sin abrir nada)', async () => {
    const tarjeta = await tarjetaCon('Solo si la temperatura supera 38 °C');
    expect(tarjeta).toHaveTextContent('Observaciones: Solo si la temperatura supera 38 °C');
  });

  it('sin observaciones no muestra nada', async () => {
    expect(await tarjetaCon(null)).not.toHaveTextContent(/Observaciones/);
  });
});
