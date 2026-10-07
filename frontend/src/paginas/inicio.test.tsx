import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { ADMIN, ENFERMERO, MEDICO } from '../pruebas/datos';
import { listaDePacientes, paciente } from '../pruebas/datosPacientes';
import { simularRecordatorios } from '../pruebas/datosRecordatorios';
import { prepararReportes } from '../pruebas/datosReportes';
import { renderizarApp } from '../pruebas/renderizar';
import { servidor } from '../pruebas/servidor';

describe('inicio por rol: las tareas del día con las palabras de quien las hace', () => {
  it('enfermería ve primero las tomas para dar ahora, administrar medicamento, registrar insumos y buscar paciente', async () => {
    renderizarApp('/', ENFERMERO);
    await screen.findByRole('heading', { name: /Hola, Sofía/ });

    const enInicio = tareasDeLaPantalla();
    expect(enInicio.slice(0, 4)).toEqual([
      expect.stringMatching(/^Tomas y estudios para atender/),
      expect.stringMatching(/^Administrar medicamento/),
      expect.stringMatching(/^Registrar insumos/),
      expect.stringMatching(/^Buscar paciente/),
    ]);
    expect(screen.queryByRole('link', { name: /Internar paciente/ })).not.toBeInTheDocument();
  });

  it('el médico ve internar y buscar paciente, pero no administrar', async () => {
    renderizarApp('/', MEDICO);
    expect(await screen.findByRole('link', { name: /Internar paciente/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Buscar paciente/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Administrar medicamento/ })).not.toBeInTheDocument();
  });

  it('administración ve sus tareas de gestión', async () => {
    renderizarApp('/', ADMIN);
    expect(await screen.findByRole('link', { name: /Nuevo usuario/ })).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /Registrar el rostro del personal/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Agregar al catálogo/ })).toBeInTheDocument();
  });

  it('desde el inicio se llega a las tomas para dar ahora en un toque', async () => {
    simularRecordatorios([]);
    renderizarApp('/', ENFERMERO);

    await userEvent.click(
      await screen.findByRole('link', { name: /Tomas y estudios para atender/ }),
    );
    expect(
      await screen.findByRole('heading', { name: 'Recordatorios', level: 1 }),
    ).toBeInTheDocument();
  });

  it('desde el inicio se llega a administrar medicamento en un toque', async () => {
    servidor.use(http.get('*/api/pacientes', () => listaDePacientes([paciente()])));
    renderizarApp('/', ENFERMERO);

    await userEvent.click(await screen.findByRole('link', { name: /Administrar medicamento/ }));
    expect(
      await screen.findByRole('heading', { name: 'Administrar medicamento' }),
    ).toBeInTheDocument();
  });
});

/** Tareas de la pantalla (sin los enlaces del menú), en el orden en que aparecen. */
const tareasDeLaPantalla = () =>
  within(screen.getByRole('main'))
    .getAllByRole('link')
    .map((l) => l.textContent ?? '');

/** Contenedor de la grilla y tarjeta de una tarea, a partir de su enlace. */
const tarjetaDe = (nombre: RegExp) => {
  const enlace = screen.getByRole('link', { name: nombre });
  const tarjeta = enlace.closest('.MuiCard-root') as HTMLElement;
  return { tarjeta, celda: tarjeta.parentElement as HTMLElement };
};

describe('tareas de gestión primero para quien administra (F34)', () => {
  it('el administrador ve primero sus tareas de gestión y después las clínicas', async () => {
    renderizarApp('/', ADMIN);
    await screen.findByRole('heading', { name: /Hola, Laura/ });

    expect(tareasDeLaPantalla()).toEqual([
      expect.stringMatching(/^Nuevo usuario/),
      expect.stringMatching(/^Registrar el rostro del personal/),
      expect.stringMatching(/^Agregar al catálogo/),
      expect.stringMatching(/^Ver quién cambió algo/),
      expect.stringMatching(/^Tomas y estudios para atender/),
      expect.stringMatching(/^Administrar medicamento/),
      expect.stringMatching(/^Registrar insumos/),
      expect.stringMatching(/^Buscar paciente/),
      expect.stringMatching(/^Internar paciente/),
      expect.stringMatching(/^Ver lo que se registró/),
      expect.stringMatching(/^Ver reportes/),
    ]);
  });

  it('el orden de enfermería y de medicina no cambia', async () => {
    renderizarApp('/', MEDICO);
    await screen.findByRole('heading', { name: /Hola, Martín/ });

    expect(tareasDeLaPantalla()).toEqual([
      expect.stringMatching(/^Buscar paciente/),
      expect.stringMatching(/^Internar paciente/),
      expect.stringMatching(/^Ver lo que se registró/),
      expect.stringMatching(/^Ver reportes/),
    ]);
  });
});

describe('reportes desde el inicio (E6)', () => {
  // Reportes se descarga al abrirla (con los gráficos): se carga antes, como si ya estuviera en
  // la caché del navegador, para que la espera del título no incluya la descarga.
  beforeAll(async () => {
    await import('./reportes/Reportes');
  });

  it('quien ve reportes tiene "Ver reportes" al final de sus tareas y llega en un toque', async () => {
    prepararReportes();
    renderizarApp('/', MEDICO);
    await screen.findByRole('heading', { name: /Hola, Martín/ });

    expect(tareasDeLaPantalla()).toEqual([
      expect.stringMatching(/^Buscar paciente/),
      expect.stringMatching(/^Internar paciente/),
      expect.stringMatching(/^Ver lo que se registró/),
      expect.stringMatching(/^Ver reportes/),
    ]);
    await userEvent.click(screen.getByRole('link', { name: /Ver reportes/ }));
    expect(await screen.findByRole('heading', { name: 'Reportes', level: 1 })).toBeInTheDocument();
  });

  it('enfermería no la tiene', async () => {
    renderizarApp('/', ENFERMERO);
    await screen.findByRole('heading', { name: /Hola, Sofía/ });
    expect(screen.queryByRole('link', { name: /Ver reportes/ })).not.toBeInTheDocument();
  });

  it('para el administrador va después de las clínicas, no entre las de gestión', async () => {
    renderizarApp('/', ADMIN);
    await screen.findByRole('heading', { name: /Hola, Laura/ });
    expect(tareasDeLaPantalla().at(-1)).toMatch(/^Ver reportes/);
    expect(tareasDeLaPantalla()[0]).toMatch(/^Nuevo usuario/);
  });
});

// E6-19: la auditoría también se ofrece desde el inicio, con las palabras de quien la usa.
describe('auditoría desde el inicio (E6)', () => {
  it('el administrador tiene "Ver quién cambió algo" con su gestión y llega a la Auditoría en un toque', async () => {
    servidor.use(
      http.get('*/api/auditoria', () =>
        HttpResponse.json({
          data: [],
          meta: { pagina: 1, porPagina: 50, total: 0, totalPaginas: 0 },
        }),
      ),
      http.get('*/api/auditoria/opciones', () =>
        HttpResponse.json({ data: { acciones: [], entidades: [] } }),
      ),
    );
    renderizarApp('/', ADMIN);
    await screen.findByRole('heading', { name: /Hola, Laura/ });

    const gestion = tareasDeLaPantalla().slice(0, 4);
    expect(gestion.at(-1)).toMatch(/^Ver quién cambió algo/);
    await userEvent.click(screen.getByRole('link', { name: /Ver quién cambió algo/ }));
    expect(await screen.findByRole('heading', { name: 'Auditoría', level: 1 })).toBeInTheDocument();
  });

  it('el médico y enfermería no la tienen', async () => {
    renderizarApp('/', MEDICO);
    await screen.findByRole('heading', { name: /Hola, Martín/ });
    expect(screen.queryByRole('link', { name: /Ver quién cambió algo/ })).not.toBeInTheDocument();
  });
});

describe('la tarea más frecuente del rol se destaca (F34)', () => {
  it('es la primera, ocupa toda la fila y lleva borde del color principal', async () => {
    renderizarApp('/', ENFERMERO);
    await screen.findByRole('heading', { name: /Hola, Sofía/ });

    const { tarjeta, celda } = tarjetaDe(/Tomas y estudios para atender/);
    expect(tarjeta).toHaveAttribute('data-destacada', 'true');
    expect(celda).toHaveClass('MuiGrid-grid-xs-12');
    expect(celda).not.toHaveClass('MuiGrid-grid-sm-6');
    expect(celda).not.toHaveClass('MuiGrid-grid-lg-4');

    const clase = [...tarjeta.classList].find((c) => c.startsWith('css-'))!;
    const css = [...document.querySelectorAll('style')].map((e) => e.textContent).join('');
    const inicio = css.indexOf(`.${clase}{`);
    expect(inicio).toBeGreaterThanOrEqual(0);
    const regla = css.slice(inicio, css.indexOf('}', inicio));
    expect(regla).toContain('border-color:var(--mui-palette-primary-main)');
  });

  it('las demás tareas siguen en la grilla de dos o tres columnas, sin destacar', async () => {
    renderizarApp('/', ENFERMERO);
    await screen.findByRole('heading', { name: /Hola, Sofía/ });

    for (const nombre of [
      /Administrar medicamento/,
      /Registrar insumos/,
      /Buscar paciente/,
      /Ver lo que se registró/,
    ]) {
      const { tarjeta, celda } = tarjetaDe(nombre);
      expect(tarjeta).not.toHaveAttribute('data-destacada');
      expect(celda).toHaveClass('MuiGrid-grid-sm-6');
      expect(celda).toHaveClass('MuiGrid-grid-lg-4');
    }
    expect(document.querySelectorAll('[data-destacada]')).toHaveLength(1);
  });

  it('para el administrador, la destacada es la primera tarea de gestión', async () => {
    renderizarApp('/', ADMIN);
    await screen.findByRole('heading', { name: /Hola, Laura/ });

    expect(tarjetaDe(/Nuevo usuario/).tarjeta).toHaveAttribute('data-destacada', 'true');
    expect(tarjetaDe(/Administrar medicamento/).tarjeta).not.toHaveAttribute('data-destacada');
    expect(tarjetaDe(/Tomas y estudios para atender/).tarjeta).not.toHaveAttribute(
      'data-destacada',
    );
  });
});

describe('título del documento y foco al abrir el inicio (UX-14)', () => {
  it('el título del documento es "Inicio · SGSM-RC" y el foco queda en el saludo', async () => {
    renderizarApp('/', ENFERMERO);
    const saludo = await screen.findByRole('heading', { name: /Hola, Sofía/ });

    expect(document.title).toBe('Inicio · SGSM-RC');
    expect(saludo).toHaveAttribute('tabindex', '-1');
    expect(saludo).toHaveFocus();
  });
});
