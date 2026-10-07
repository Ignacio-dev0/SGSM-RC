import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { Alerta } from './Alerta';
import { Boton } from './Boton';
import { CampoTexto } from './CampoTexto';
import { Cargando, ErrorDeCarga } from './EstadoDeCarga';
import { ModalConfirmacion } from './ModalConfirmacion';
import { Selector } from './Selector';
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

describe('Boton', () => {
  it('ejecuta la acción al tocarlo', async () => {
    const alTocar = vi.fn();
    render(<Boton onClick={alTocar}>Guardar</Boton>);
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(alTocar).toHaveBeenCalledTimes(1);
  });

  it('mientras está cargando queda deshabilitado y lo anuncia', () => {
    render(<Boton cargando>Guardar</Boton>);
    const boton = screen.getByRole('button', { name: /Guardar/ });
    expect(boton).toBeDisabled();
    expect(boton).toHaveAttribute('aria-busy', 'true');
  });
});

describe('CampoTexto', () => {
  it('muestra el error asociado al campo', () => {
    render(
      <CampoTexto etiqueta="DNI" valor="" alCambiar={() => {}} error="El DNI es obligatorio" />,
    );
    const campo = screen.getByLabelText(/DNI/);
    expect(campo).toHaveAttribute('aria-invalid', 'true');
    expect(campo).toHaveAccessibleDescription('El DNI es obligatorio');
  });

  it('informa cada cambio de valor', async () => {
    function Envoltorio() {
      const [valor, setValor] = useState('');
      return <CampoTexto etiqueta="Apellido" valor={valor} alCambiar={setValor} />;
    }
    render(<Envoltorio />);
    await userEvent.type(screen.getByLabelText('Apellido'), 'Gómez');
    expect(screen.getByLabelText('Apellido')).toHaveValue('Gómez');
  });
});

describe('Selector', () => {
  it('devuelve el valor de la opción elegida', async () => {
    const alCambiar = vi.fn();
    render(
      <Selector
        etiqueta="Rol"
        valor=""
        alCambiar={alCambiar}
        opciones={[
          { valor: 'ENFERMERO', etiqueta: 'Enfermero' },
          { valor: 'MEDICO', etiqueta: 'Médico' },
        ]}
      />,
    );
    await userEvent.selectOptions(screen.getByLabelText('Rol'), 'Médico');
    expect(alCambiar).toHaveBeenCalledWith('MEDICO');
  });
});

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

describe('ModalConfirmacion', () => {
  it('confirma o cancela la acción', async () => {
    const alConfirmar = vi.fn();
    const alCancelar = vi.fn();
    render(
      <ModalConfirmacion
        abierto
        titulo="Dar de baja"
        mensaje="¿Confirma la baja del usuario?"
        textoConfirmar="Dar de baja"
        alConfirmar={alConfirmar}
        alCancelar={alCancelar}
      />,
    );
    const dialogo = screen.getByRole('dialog', { name: 'Dar de baja' });
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Cancelar' }));
    expect(alCancelar).toHaveBeenCalled();
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Dar de baja' }));
    expect(alConfirmar).toHaveBeenCalledWith(undefined);
  });

  it('cuando pide motivo no deja confirmar sin escribirlo', async () => {
    const alConfirmar = vi.fn();
    render(
      <ModalConfirmacion
        abierto
        titulo="Corregir"
        mensaje="Indique el motivo"
        textoConfirmar="Confirmar"
        pedirMotivo
        alConfirmar={alConfirmar}
        alCancelar={() => {}}
      />,
    );
    const confirmar = screen.getByRole('button', { name: 'Confirmar' });
    expect(confirmar).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/Motivo/), 'Error de carga');
    await userEvent.click(confirmar);
    expect(alConfirmar).toHaveBeenCalledWith('Error de carga');
  });

  it('el motivo necesita al menos 3 letras (como pide el servidor) y lo dice', async () => {
    render(
      <ModalConfirmacion
        abierto
        titulo="Corregir"
        mensaje="Indique el motivo"
        textoConfirmar="Confirmar"
        pedirMotivo
        ayudaMotivo="Por ejemplo: error de carga"
        alConfirmar={() => {}}
        alCancelar={() => {}}
      />,
    );
    const motivo = screen.getByLabelText(/Motivo/);
    expect(motivo).toHaveAccessibleDescription('Por ejemplo: error de carga');
    await userEvent.type(motivo, 'ab');
    expect(motivo).toHaveAccessibleDescription('Escriba al menos 3 letras');
    expect(screen.getByRole('button', { name: 'Confirmar' })).toBeDisabled();
    await userEvent.type(motivo, 'c');
    expect(screen.getByRole('button', { name: 'Confirmar' })).toBeEnabled();
  });

  it('no se cierra tocando afuera: hay que elegir Cancelar (o Escape)', async () => {
    const alCancelar = vi.fn();
    render(
      <ModalConfirmacion
        abierto
        titulo="Dar de alta"
        mensaje="¿Confirma?"
        textoConfirmar="Dar de alta"
        pedirMotivo
        alConfirmar={() => {}}
        alCancelar={alCancelar}
      />,
    );
    await userEvent.type(screen.getByLabelText(/Motivo/), 'Alta médica');
    await userEvent.click(document.querySelector('.MuiBackdrop-root')!);
    expect(alCancelar).not.toHaveBeenCalled();
    // Tocar afuera saca el foco del diálogo y MUI se lo devuelve a los pocos milisegundos: se espera
    // a que vuelva, o Escape se manda al <body> (a veces sí y a veces no, según el momento).
    await waitFor(() => expect(document.body).not.toHaveFocus());
    await userEvent.keyboard('{Escape}');
    expect(alCancelar).toHaveBeenCalled();
  });

  it('se puede bloquear la confirmación desde afuera (por ejemplo, falta un dato)', () => {
    render(
      <ModalConfirmacion
        abierto
        titulo="Trasladar"
        mensaje="Elija la cama"
        textoConfirmar="Trasladar"
        confirmarDeshabilitado
        alConfirmar={() => {}}
        alCancelar={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: 'Trasladar' })).toBeDisabled();
  });
});

describe('estados de carga', () => {
  it('Cargando se anuncia como estado con su texto', () => {
    render(<Cargando texto="Cargando la ficha…" />);
    expect(screen.getByRole('status')).toHaveTextContent('Cargando la ficha…');
  });

  it('ErrorDeCarga dice qué no se pudo cargar, por qué, y deja reintentar', async () => {
    const alReintentar = vi.fn();
    render(
      <ErrorDeCarga
        que="la ficha del paciente"
        error={new Error('No hay conexión con el servidor.')}
        alReintentar={alReintentar}
      />,
    );
    const alerta = screen.getByRole('alert');
    expect(alerta).toHaveTextContent(
      'No se pudo cargar la ficha del paciente. No hay conexión con el servidor.',
    );
    await userEvent.click(within(alerta).getByRole('button', { name: 'Reintentar' }));
    expect(alReintentar).toHaveBeenCalled();
  });
});

describe('Alerta', () => {
  it('los errores se anuncian como alerta', () => {
    render(<Alerta tipo="error">No se pudo guardar</Alerta>);
    expect(screen.getByRole('alert')).toHaveTextContent('No se pudo guardar');
  });

  it('los mensajes informativos se anuncian como estado y se pueden cerrar', async () => {
    const alCerrar = vi.fn();
    render(
      <Alerta tipo="exito" titulo="Listo" alCerrar={alCerrar}>
        Paciente registrado
      </Alerta>,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Paciente registrado');
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(alCerrar).toHaveBeenCalled();
  });
});
