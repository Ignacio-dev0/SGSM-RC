import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { Alerta } from './Alerta';
import { Boton } from './Boton';
import { CampoTexto } from './CampoTexto';
import { ModalConfirmacion } from './ModalConfirmacion';
import { Selector } from './Selector';
import { Tabla } from './Tabla';

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
