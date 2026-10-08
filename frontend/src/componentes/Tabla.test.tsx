import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TAMANO_TACTIL_MINIMO } from '../tema';
import { Tabla } from './Tabla';

/**
 * jsdom no evalúa media queries: simula un teléfono (hasta 600 px, breakpoints.down('sm')) o una
 * tablet. Con null devuelve el estado original (sin matchMedia: pantalla grande, como en el resto).
 */
const matchMediaOriginal = window.matchMedia;
function simularPantalla(tipo: 'telefono' | 'tablet' | null) {
  if (tipo === null) {
    window.matchMedia = matchMediaOriginal;
    return;
  }
  window.matchMedia = ((consulta: string) => ({
    matches: tipo === 'telefono' && consulta.includes('599.95'),
    media: consulta,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}

describe('Tabla', () => {
  const columnas = [
    { titulo: 'Apellido', valor: (f: { id: number; apellido: string }) => f.apellido },
    { titulo: 'Código', valor: (f: { id: number; apellido: string }) => `#${f.id}` },
  ];

  it('muestra los encabezados y una fila por elemento', () => {
    render(
      <Tabla
        titulo="Pacientes"
        columnas={columnas}
        filas={[
          { id: 1, apellido: 'Pérez' },
          { id: 2, apellido: 'Gómez' },
        ]}
        claveFila={(f) => f.id}
      />,
    );
    const tabla = screen.getByRole('table', { name: 'Pacientes' });
    expect(within(tabla).getByRole('columnheader', { name: 'Apellido' })).toBeInTheDocument();
    expect(within(tabla).getAllByRole('row')).toHaveLength(3);
    expect(within(tabla).getByRole('cell', { name: '#2' })).toBeInTheDocument();
  });

  it('muestra un mensaje cuando no hay resultados', () => {
    render(
      <Tabla
        titulo="Pacientes"
        columnas={columnas}
        filas={[]}
        claveFila={(f) => f.id}
        mensajeVacio="No se encontraron pacientes"
      />,
    );
    expect(screen.getByText('No se encontraron pacientes')).toBeInTheDocument();
  });

  it('avisa qué fila se tocó', async () => {
    const alTocarFila = vi.fn();
    render(
      <Tabla
        titulo="Pacientes"
        columnas={columnas}
        filas={[{ id: 7, apellido: 'Ruiz' }]}
        claveFila={(f) => f.id}
        alTocarFila={alTocarFila}
      />,
    );
    await userEvent.click(screen.getByRole('cell', { name: 'Ruiz' }));
    expect(alTocarFila).toHaveBeenCalledWith({ id: 7, apellido: 'Ruiz' });
  });

  it('las filas tocables también se abren con el teclado', async () => {
    const alTocarFila = vi.fn();
    render(
      <Tabla
        titulo="Pacientes"
        columnas={columnas}
        filas={[{ id: 7, apellido: 'Ruiz' }]}
        claveFila={(f) => f.id}
        alTocarFila={alTocarFila}
      />,
    );
    await userEvent.tab();
    expect(screen.getAllByRole('row')[1]).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    expect(alTocarFila).toHaveBeenCalledWith({ id: 7, apellido: 'Ruiz' });
  });

  it('si la consulta falló muestra el error y no "no hay resultados"', () => {
    render(
      <Tabla
        titulo="Pacientes"
        columnas={columnas}
        filas={[]}
        claveFila={(f) => f.id}
        mensajeVacio="No se encontraron pacientes"
        error="No hay conexión con el servidor."
      />,
    );
    expect(screen.queryByText('No se encontraron pacientes')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('No hay conexión con el servidor.');
  });

  it('pagina los resultados', async () => {
    const alCambiarPagina = vi.fn();
    render(
      <Tabla
        titulo="Pacientes"
        columnas={columnas}
        filas={[{ id: 1, apellido: 'Pérez' }]}
        claveFila={(f) => f.id}
        paginacion={{ pagina: 1, porPagina: 20, total: 45, alCambiarPagina }}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /siguiente/i }));
    expect(alCambiarPagina).toHaveBeenCalledWith(2);
  });

  // E6-10: dónde se está y cuánto falta, sin contar a mano; y a dónde va la vista al pasar de página.
  describe('paginación (E6-10)', () => {
    const muchas = (props: { paginacionArriba?: boolean; tituloVisible?: 'h2' | 'h3' } = {}) => {
      const alCambiarPagina = vi.fn();
      const vista = render(
        <Tabla
          titulo="Movimientos"
          columnas={columnas}
          filas={[{ id: 1, apellido: 'Pérez' }]}
          claveFila={(f) => f.id}
          paginacion={{ pagina: 2, porPagina: 50, total: 120, alCambiarPagina }}
          {...props}
        />,
      );
      return { alCambiarPagina, ...vista };
    };

    it('dice la página, cuántas hay y qué filas se ven, como estado para el lector de pantalla', () => {
      muchas();
      expect(screen.getByRole('status')).toHaveTextContent('Página 2 de 3 · 51–100 de 120');
    });

    it('lleva a la primera y a la última página, con nombres que dicen a dónde', async () => {
      const { alCambiarPagina } = muchas();
      await userEvent.click(screen.getByRole('button', { name: 'Última página' }));
      expect(alCambiarPagina).toHaveBeenCalledWith(3);
      await userEvent.click(screen.getByRole('button', { name: 'Primera página' }));
      expect(alCambiarPagina).toHaveBeenCalledWith(1);
      expect(screen.getByRole('button', { name: 'Página anterior' })).toBeEnabled();
      expect(screen.getByRole('button', { name: 'Página siguiente' })).toBeEnabled();
    });

    it('en la primera página no se puede ir más atrás', () => {
      const alCambiarPagina = vi.fn();
      render(
        <Tabla
          titulo="Movimientos"
          columnas={columnas}
          filas={[{ id: 1, apellido: 'Pérez' }]}
          claveFila={(f) => f.id}
          paginacion={{ pagina: 1, porPagina: 50, total: 120, alCambiarPagina }}
        />,
      );
      expect(screen.getByRole('button', { name: 'Primera página' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Página anterior' })).toBeDisabled();
    });

    it('con paginacionArriba también está arriba de las filas (y el estado se anuncia una vez)', () => {
      muchas({ paginacionArriba: true });
      expect(screen.getAllByRole('button', { name: 'Página siguiente' })).toHaveLength(2);
      expect(screen.getAllByText('Página 2 de 3 · 51–100 de 120')).toHaveLength(2);
      expect(screen.getAllByRole('status')).toHaveLength(1);
      const [arriba] = screen.getAllByRole('button', { name: 'Página siguiente' });
      expect(
        arriba!.compareDocumentPosition(screen.getByRole('table')) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });

    it('con el título a la vista, al cambiar de página el foco va al título', async () => {
      muchas({ tituloVisible: 'h2', paginacionArriba: true });
      const titulo = screen.getByRole('heading', { name: 'Movimientos', level: 2 });
      expect(screen.getByRole('table', { name: 'Movimientos' })).toBeInTheDocument();

      const abajo = screen.getAllByRole('button', { name: 'Página siguiente' }).at(-1)!;
      await userEvent.click(abajo);

      expect(titulo).toHaveFocus();
    });

    it('sin título a la vista, el foco va a la tabla, que se llama como ella', async () => {
      muchas();
      await userEvent.click(screen.getByRole('button', { name: 'Página siguiente' }));
      expect(screen.getByRole('table', { name: 'Movimientos' })).toHaveFocus();
    });
  });

  describe('filas tocables en la tabla', () => {
    const filas = [
      { id: 1, apellido: 'Pérez' },
      { id: 2, apellido: 'Ruiz' },
    ];

    it('llevan al final un chevron decorativo y un encabezado solo para lectores', () => {
      render(
        <Tabla
          titulo="Pacientes"
          columnas={columnas}
          filas={filas}
          claveFila={(f) => f.id}
          alTocarFila={() => {}}
        />,
      );
      const tabla = screen.getByRole('table', { name: 'Pacientes' });
      const chevrones = within(tabla).getAllByTestId('ChevronRightIcon');
      expect(chevrones).toHaveLength(2);
      chevrones.forEach((c) => expect(c).toHaveAttribute('aria-hidden', 'true'));
      // Cada fila suma una celda; el encabezado extra se lee ("Abrir") pero no se ve.
      expect(within(within(tabla).getAllByRole('row')[1]!).getAllByRole('cell')).toHaveLength(3);
      const abrir = within(tabla).getByRole('columnheader', { name: 'Abrir' });
      // Oculto de verdad: 1 px (no el 100 % que da `width: 1` en sx) y contenido dentro de su celda,
      // para que no ensanche la página cuando la tabla se desplaza hacia los costados.
      expect(within(abrir).getByText('Abrir')).toHaveStyle({
        position: 'absolute',
        width: '1px',
        height: '1px',
      });
      expect(abrir).toHaveStyle({ position: 'relative' });
    });

    it('sin alTocarFila no hay columna extra ni chevron', () => {
      render(
        <Tabla titulo="Pacientes" columnas={columnas} filas={filas} claveFila={(f) => f.id} />,
      );
      const tabla = screen.getByRole('table', { name: 'Pacientes' });
      expect(within(tabla).queryByTestId('ChevronRightIcon')).not.toBeInTheDocument();
      expect(within(tabla).queryByRole('columnheader', { name: 'Abrir' })).not.toBeInTheDocument();
      expect(within(within(tabla).getAllByRole('row')[1]!).getAllByRole('cell')).toHaveLength(2);
    });

    it('con etiquetaFila la fila tiene ese nombre accesible y se sigue abriendo con el teclado', async () => {
      const alTocarFila = vi.fn();
      render(
        <Tabla
          titulo="Pacientes"
          columnas={columnas}
          filas={filas}
          claveFila={(f) => f.id}
          alTocarFila={alTocarFila}
          etiquetaFila={(f) => `Abrir ${f.apellido}`}
        />,
      );
      const fila = screen.getByRole('row', { name: 'Abrir Ruiz' });
      await userEvent.tab();
      await userEvent.tab();
      expect(fila).toHaveFocus();
      await userEvent.keyboard('{Enter}');
      expect(alTocarFila).toHaveBeenCalledWith({ id: 2, apellido: 'Ruiz' });
    });

    it('sin etiquetaFila la fila conserva su contenido como nombre', () => {
      render(
        <Tabla
          titulo="Pacientes"
          columnas={columnas}
          filas={filas}
          claveFila={(f) => f.id}
          alTocarFila={() => {}}
        />,
      );
      expect(screen.getByRole('row', { name: /Ruiz/ })).toBeInTheDocument();
    });
  });

  describe('en una pantalla que no es de teléfono', () => {
    afterEach(() => simularPantalla(null));

    it('sigue siendo una tabla, sin tarjetas', () => {
      simularPantalla('tablet');
      render(
        <Tabla
          titulo="Pacientes"
          columnas={columnas}
          filas={[{ id: 1, apellido: 'Pérez' }]}
          claveFila={(f) => f.id}
        />,
      );
      expect(screen.getByRole('table', { name: 'Pacientes' })).toBeInTheDocument();
      expect(screen.queryByRole('list')).not.toBeInTheDocument();
    });
  });

  describe('en un teléfono', () => {
    type Paciente = { id: number; apellido: string };
    const filas: Paciente[] = [
      { id: 1, apellido: 'Pérez' },
      { id: 2, apellido: 'Gómez' },
    ];

    beforeEach(() => simularPantalla('telefono'));
    afterEach(() => simularPantalla(null));

    function tarjetaDe(apellido: string) {
      const lista = screen.getByRole('list', { name: 'Pacientes' });
      const tarjeta = within(lista)
        .getAllByRole('listitem')
        .find((t) => within(t).queryByText(apellido));
      if (!tarjeta) throw new Error(`No hay tarjeta de ${apellido}`);
      return tarjeta;
    }

    it('muestra una tarjeta por fila en una lista con el nombre de la tabla, sin tabla', () => {
      render(
        <Tabla titulo="Pacientes" columnas={columnas} filas={filas} claveFila={(f) => f.id} />,
      );
      const lista = screen.getByRole('list', { name: 'Pacientes' });
      expect(within(lista).getAllByRole('listitem')).toHaveLength(2);
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
    });

    it('la primera columna es el título y el resto son pares "título: valor"', () => {
      render(
        <Tabla titulo="Pacientes" columnas={columnas} filas={filas} claveFila={(f) => f.id} />,
      );
      const tarjeta = tarjetaDe('Pérez');
      expect(within(tarjeta).getByText('Pérez')).toHaveStyle({ fontWeight: '700' });
      // El título de la primera columna no se repite como par.
      expect(within(tarjeta).queryByText('Apellido')).not.toBeInTheDocument();
      expect(within(tarjeta).getByRole('term')).toHaveTextContent('Código');
      expect(within(tarjeta).getByRole('definition')).toHaveTextContent('#1');
      // Cada tarjeta trae sus propios datos.
      expect(within(tarjetaDe('Gómez')).getByRole('definition')).toHaveTextContent('#2');
    });

    it('una columna sin valor para esa fila no deja un par vacío', () => {
      render(
        <Tabla
          titulo="Pacientes"
          columnas={[...columnas, { titulo: 'Acción', valor: (f: Paciente) => f.id === 1 && 'Ir' }]}
          filas={filas}
          claveFila={(f) => f.id}
        />,
      );
      expect(within(tarjetaDe('Pérez')).getAllByRole('term')).toHaveLength(2);
      expect(within(tarjetaDe('Gómez')).getAllByRole('term')).toHaveLength(1);
    });

    it('sin alTocarFila la tarjeta no es un botón', () => {
      render(
        <Tabla titulo="Pacientes" columnas={columnas} filas={filas} claveFila={(f) => f.id} />,
      );
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    it('con alTocarFila toda la tarjeta es un botón con el título como nombre y alto táctil', async () => {
      const alTocarFila = vi.fn();
      render(
        <Tabla
          titulo="Pacientes"
          columnas={columnas}
          filas={[{ id: 7, apellido: 'Ruiz' }]}
          claveFila={(f) => f.id}
          alTocarFila={alTocarFila}
        />,
      );
      const boton = screen.getByRole('button', { name: 'Ruiz' });
      expect(boton).toHaveAccessibleDescription(/Código.*#7/);
      expect(screen.getByRole('listitem')).toHaveStyle({ minHeight: `${TAMANO_TACTIL_MINIMO}px` });
      await userEvent.click(boton);
      expect(alTocarFila).toHaveBeenCalledWith({ id: 7, apellido: 'Ruiz' });
    });

    it('la tarjeta tocable muestra un chevron decorativo a la derecha; sin alTocarFila no', () => {
      const { unmount } = render(
        <Tabla
          titulo="Pacientes"
          columnas={columnas}
          filas={filas}
          claveFila={(f) => f.id}
          alTocarFila={() => {}}
        />,
      );
      const chevrones = screen.getAllByTestId('ChevronRightIcon');
      expect(chevrones).toHaveLength(2);
      chevrones.forEach((c) => expect(c).toHaveAttribute('aria-hidden', 'true'));
      unmount();
      render(
        <Tabla titulo="Pacientes" columnas={columnas} filas={filas} claveFila={(f) => f.id} />,
      );
      expect(screen.queryByTestId('ChevronRightIcon')).not.toBeInTheDocument();
    });

    it('con etiquetaFila el botón de la tarjeta lleva ese nombre', async () => {
      const alTocarFila = vi.fn();
      render(
        <Tabla
          titulo="Pacientes"
          columnas={columnas}
          filas={filas}
          claveFila={(f) => f.id}
          alTocarFila={alTocarFila}
          etiquetaFila={(f) => `Abrir ${f.apellido}`}
        />,
      );
      await userEvent.click(screen.getByRole('button', { name: 'Abrir Gómez' }));
      expect(alTocarFila).toHaveBeenCalledWith({ id: 2, apellido: 'Gómez' });
    });

    it('tocar el texto de la tarjeta también la abre', async () => {
      const alTocarFila = vi.fn();
      render(
        <Tabla
          titulo="Pacientes"
          columnas={columnas}
          filas={[{ id: 7, apellido: 'Ruiz' }]}
          claveFila={(f) => f.id}
          alTocarFila={alTocarFila}
        />,
      );
      await userEvent.click(screen.getByText('#7'));
      await userEvent.click(screen.getByText('Ruiz'));
      expect(alTocarFila).toHaveBeenCalledTimes(2);
      expect(alTocarFila).toHaveBeenLastCalledWith({ id: 7, apellido: 'Ruiz' });
    });

    it('las tarjetas se abren con el teclado: Enter y Espacio', async () => {
      const alTocarFila = vi.fn();
      render(
        <Tabla
          titulo="Pacientes"
          columnas={columnas}
          filas={[{ id: 7, apellido: 'Ruiz' }]}
          claveFila={(f) => f.id}
          alTocarFila={alTocarFila}
        />,
      );
      await userEvent.tab();
      expect(screen.getByRole('button', { name: 'Ruiz' })).toHaveFocus();
      await userEvent.keyboard('{Enter}');
      expect(alTocarFila).toHaveBeenCalledTimes(1);
      await userEvent.keyboard(' ');
      expect(alTocarFila).toHaveBeenCalledTimes(2);
      expect(alTocarFila).toHaveBeenLastCalledWith({ id: 7, apellido: 'Ruiz' });
    });

    describe('con un control dentro de la tarjeta', () => {
      function conControl(alAdministrar: () => void) {
        const alTocarFila = vi.fn();
        render(
          <Tabla
            titulo="Pacientes"
            columnas={[
              ...columnas,
              {
                titulo: 'Acción',
                valor: (f: Paciente) => (
                  <button
                    type="button"
                    onClick={alAdministrar}
                    aria-label={`Administrar ${f.apellido}`}
                  >
                    Administrar
                  </button>
                ),
              },
            ]}
            filas={[{ id: 7, apellido: 'Ruiz' }]}
            claveFila={(f) => f.id}
            alTocarFila={alTocarFila}
          />,
        );
        return alTocarFila;
      }

      it('el control no queda dentro del botón de la tarjeta (no hay botón dentro de botón)', () => {
        conControl(() => {});
        const tarjeta = screen.getByRole('button', { name: 'Ruiz' });
        const control = screen.getByRole('button', { name: 'Administrar Ruiz' });
        expect(tarjeta).not.toContainElement(control);
        expect(control.parentElement?.closest('button')).toBeNull();
      });

      it('tocarlo hace lo suyo y no abre la tarjeta, aunque no corte la propagación', async () => {
        const alAdministrar = vi.fn();
        const alTocarFila = conControl(alAdministrar);
        await userEvent.click(screen.getByRole('button', { name: 'Administrar Ruiz' }));
        expect(alAdministrar).toHaveBeenCalledTimes(1);
        expect(alTocarFila).not.toHaveBeenCalled();
      });

      it('con el teclado: Tab llega a la tarjeta y luego al control, y Enter en él no abre la tarjeta', async () => {
        const alAdministrar = vi.fn();
        const alTocarFila = conControl(alAdministrar);
        await userEvent.tab();
        expect(screen.getByRole('button', { name: 'Ruiz' })).toHaveFocus();
        await userEvent.tab();
        expect(screen.getByRole('button', { name: 'Administrar Ruiz' })).toHaveFocus();
        await userEvent.keyboard('{Enter}');
        expect(alAdministrar).toHaveBeenCalledTimes(1);
        expect(alTocarFila).not.toHaveBeenCalled();
      });
    });

    it('si la consulta falló muestra el error y no "no hay resultados"', () => {
      render(
        <Tabla
          titulo="Pacientes"
          columnas={columnas}
          filas={[]}
          claveFila={(f) => f.id}
          mensajeVacio="No se encontraron pacientes"
          error="No hay conexión con el servidor."
        />,
      );
      expect(screen.queryByText('No se encontraron pacientes')).not.toBeInTheDocument();
      expect(screen.getByRole('alert')).toHaveTextContent('No hay conexión con el servidor.');
    });

    it('sin resultados muestra el mensaje y no una lista vacía', () => {
      render(
        <Tabla
          titulo="Pacientes"
          columnas={columnas}
          filas={[]}
          claveFila={(f) => f.id}
          mensajeVacio="No se encontraron pacientes"
        />,
      );
      expect(screen.getByText('No se encontraron pacientes')).toBeInTheDocument();
      expect(screen.queryByRole('list')).not.toBeInTheDocument();
    });

    it('mientras carga muestra la barra de progreso', () => {
      render(
        <Tabla
          titulo="Pacientes"
          columnas={columnas}
          filas={[]}
          claveFila={(f) => f.id}
          cargando
        />,
      );
      expect(screen.getByRole('progressbar', { name: 'Cargando' })).toBeInTheDocument();
      expect(screen.queryByText('No hay resultados')).not.toBeInTheDocument();
    });

    it('pagina los resultados debajo de las tarjetas', async () => {
      const alCambiarPagina = vi.fn();
      render(
        <Tabla
          titulo="Pacientes"
          columnas={columnas}
          filas={filas}
          claveFila={(f) => f.id}
          paginacion={{ pagina: 1, porPagina: 20, total: 45, alCambiarPagina }}
        />,
      );
      await userEvent.click(screen.getByRole('button', { name: /siguiente/i }));
      expect(alCambiarPagina).toHaveBeenCalledWith(2);
    });
  });
});
