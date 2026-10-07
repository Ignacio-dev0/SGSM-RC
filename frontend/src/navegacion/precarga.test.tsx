import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ADMIN } from '../pruebas/datos';
import { renderizarApp } from '../pruebas/renderizar';
import { seccionesDe } from './precarga';

// Anota qué código de pantalla (o librería pesada) se descargó y cuándo.
const descargados = vi.hoisted(() => new Set<string>());
vi.mock('../paginas/reportes/Reportes', async (original) => {
  descargados.add('reportes');
  return original();
});
vi.mock('../paginas/auditoria/Auditoria', async (original) => {
  descargados.add('auditoria');
  return original();
});
vi.mock('@vladmandic/face-api', () => {
  descargados.add('face-api');
  return {};
});

const pantallas = [
  { ruta: '/reportes', precargar: () => {} },
  { ruta: '/usuarios', precargar: () => {} },
];

describe('precarga de pantallas al apuntar a un enlace (T702 · RNF03)', () => {
  it('reconoce la sección de un enlace, también sus subpantallas, sin confundir prefijos', () => {
    expect(seccionesDe('/reportes', pantallas)).toEqual([pantallas[0]]);
    expect(seccionesDe('/usuarios/3/permisos', pantallas)).toEqual([pantallas[1]]);
    expect(seccionesDe('/reportesviejos', pantallas)).toEqual([]);
    expect(seccionesDe('/', pantallas)).toEqual([]);
  });

  // Va primero: los módulos quedan cargados para el resto del archivo.
  it('el Inicio no descarga reportes, auditoría ni el reconocimiento facial, ni pide la cámara', async () => {
    const getUserMedia = vi.fn();
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia },
      configurable: true,
    });
    renderizarApp('/', ADMIN);
    await screen.findByRole('heading', { name: /Hola, Laura/ });
    await act(() => new Promise((r) => setTimeout(r, 50)));

    expect([...descargados]).toEqual([]);
    expect(getUserMedia).not.toHaveBeenCalled();
    Reflect.deleteProperty(navigator, 'mediaDevices');
  });

  it('al pasar el puntero por Reportes en el menú, descarga esa pantalla antes del toque', async () => {
    renderizarApp('/', ADMIN);
    const menu = await screen.findByRole('navigation', { name: 'Menú principal' });

    await userEvent.hover(within(menu).getByRole('link', { name: 'Reportes' }));
    await waitFor(() => expect(descargados).toContain('reportes'));
    expect(descargados).not.toContain('auditoria');
  });

  it('al llegar con el teclado a una tarea del Inicio, descarga su pantalla', async () => {
    renderizarApp('/', ADMIN);
    const tarea = await screen.findByRole('link', { name: /Ver quién cambió algo/ });

    act(() => tarea.focus());
    await waitFor(() => expect(descargados).toContain('auditoria'));
    expect(descargados).not.toContain('face-api');
  });
});
