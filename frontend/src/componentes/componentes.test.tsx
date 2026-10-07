import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { Alerta } from './Alerta';
import { Boton } from './Boton';
import { CampoTexto } from './CampoTexto';
import { Cargando, ErrorDeCarga } from './EstadoDeCarga';
import { ModalConfirmacion } from './ModalConfirmacion';
import { Selector } from './Selector';

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

  // F25: una sola acción llena por pantalla; la de peligro abre la confirmación, con contorno.
  it('el botón de peligro va con contorno rojo, no relleno', () => {
    render(<Boton variante="peligro">Dar de baja</Boton>);
    const boton = screen.getByRole('button', { name: 'Dar de baja' });
    expect(boton).toHaveClass('MuiButton-outlined', 'MuiButton-colorError');
    expect(boton).not.toHaveClass('MuiButton-contained');
  });

  it('peligroConfirmar es el rojo relleno que solo vive dentro de la confirmación', () => {
    render(<Boton variante="peligroConfirmar">Dar de baja</Boton>);
    const boton = screen.getByRole('button', { name: 'Dar de baja' });
    expect(boton).toHaveClass('MuiButton-contained', 'MuiButton-colorError');
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
    // El mínimo se dice desde el principio, junto al ejemplo (F52): no recién al fallar.
    expect(motivo).toHaveAccessibleDescription('Por ejemplo: error de carga (mínimo 3 letras)');
    await userEvent.type(motivo, 'ab');
    expect(motivo).toHaveAccessibleDescription('Escriba al menos 3 letras');
    expect(screen.getByRole('button', { name: 'Confirmar' })).toBeDisabled();
    await userEvent.type(motivo, 'c');
    expect(screen.getByRole('button', { name: 'Confirmar' })).toBeEnabled();
  });

  it('sin ejemplo propio, el requisito del motivo igual está visible antes de escribir (F52)', () => {
    render(
      <ModalConfirmacion
        abierto
        titulo="Corregir"
        mensaje="Indique el motivo"
        textoConfirmar="Confirmar"
        pedirMotivo
        alConfirmar={() => {}}
        alCancelar={() => {}}
      />,
    );
    expect(screen.getByLabelText(/Motivo/)).toHaveAccessibleDescription(
      'Escriba el motivo (mínimo 3 letras)',
    );
  });

  describe('máximo del motivo (como el esquema del servidor)', () => {
    const conMotivo = (extra: { maxMotivo?: number } = {}) =>
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
          {...extra}
        />,
      );

    it('por defecto acepta hasta 255 caracteres: no deja escribir más', async () => {
      conMotivo();
      const motivo = screen.getByLabelText(/Motivo/);
      expect(motivo).toHaveAttribute('maxlength', '255');

      await userEvent.click(motivo);
      await userEvent.paste('a'.repeat(300));

      expect(motivo).toHaveValue('a'.repeat(255));
    });

    it('el contador N/255 aparece al acercarse al máximo, sin molestar antes', async () => {
      conMotivo();
      const motivo = screen.getByLabelText(/Motivo/);
      await userEvent.click(motivo);
      await userEvent.paste('a'.repeat(203));
      expect(screen.queryByText(/\/255$/)).not.toBeInTheDocument();
      expect(motivo).toHaveAccessibleDescription('Por ejemplo: error de carga (mínimo 3 letras)');

      await userEvent.type(motivo, 'b');

      expect(screen.getByText('204/255')).toBeVisible();
      // Va en la ayuda del campo: el lector de pantalla también lo oye.
      expect(motivo).toHaveAccessibleDescription(
        'Por ejemplo: error de carga (mínimo 3 letras) 204/255',
      );
      await userEvent.paste('c'.repeat(100));
      expect(screen.getByText('255/255')).toBeVisible();
    });

    it('el máximo se puede cambiar con maxMotivo', async () => {
      conMotivo({ maxMotivo: 100 });
      const motivo = screen.getByLabelText(/Motivo/);
      expect(motivo).toHaveAttribute('maxlength', '100');

      await userEvent.click(motivo);
      await userEvent.paste('a'.repeat(150));

      expect(motivo).toHaveValue('a'.repeat(100));
      expect(screen.getByText('100/100')).toBeVisible();
    });
  });

  it('el texto del botón que descarta se puede cambiar (por ejemplo, "Seguir editando")', async () => {
    const alCancelar = vi.fn();
    render(
      <ModalConfirmacion
        abierto
        titulo="¿Descartar lo cargado?"
        mensaje="Hay datos sin guardar."
        textoCancelar="Seguir editando"
        textoConfirmar="Descartar"
        peligroso
        alConfirmar={() => {}}
        alCancelar={alCancelar}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Cancelar' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Seguir editando' }));
    expect(alCancelar).toHaveBeenCalled();
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

  it('si es peligroso, el botón de confirmar es el rojo relleno (la acción que abrió el modal va con contorno)', () => {
    render(
      <ModalConfirmacion
        abierto
        titulo="Dar de baja"
        mensaje="¿Confirma?"
        textoConfirmar="Dar de baja"
        peligroso
        alConfirmar={() => {}}
        alCancelar={() => {}}
      />,
    );
    const confirmar = screen.getByRole('button', { name: 'Dar de baja' });
    expect(confirmar).toHaveClass('MuiButton-contained', 'MuiButton-colorError');
  });

  it('si no es peligroso, confirmar es el botón principal', () => {
    render(
      <ModalConfirmacion
        abierto
        titulo="Corregir"
        mensaje="¿Confirma?"
        textoConfirmar="Confirmar"
        alConfirmar={() => {}}
        alCancelar={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: 'Confirmar' })).toHaveClass(
      'MuiButton-contained',
      'MuiButton-colorPrimary',
    );
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

  describe('con enfocar (avisos que piden una decisión)', () => {
    const original = HTMLElement.prototype.scrollIntoView;
    afterEach(() => {
      HTMLElement.prototype.scrollIntoView = original;
    });

    it('al montarse tiene el foco y se lleva a la vista, centrada', () => {
      const scrollIntoView = vi.fn();
      HTMLElement.prototype.scrollIntoView = scrollIntoView;
      render(
        <Alerta tipo="advertencia" titulo="El paciente ya estuvo internado" enfocar>
          ¿Desea reingresarlo?
        </Alerta>,
      );
      const alerta = screen.getByRole('alert');
      expect(alerta).toHaveFocus();
      expect(alerta).toHaveAttribute('tabindex', '-1');
      expect(scrollIntoView).toHaveBeenCalledWith({ block: 'center' });
    });

    it('funciona aunque el navegador no tenga scrollIntoView (jsdom)', () => {
      // @ts-expect-error: simula un entorno sin scrollIntoView
      HTMLElement.prototype.scrollIntoView = undefined;
      render(
        <Alerta tipo="advertencia" enfocar>
          Prescripción duplicada
        </Alerta>,
      );
      expect(screen.getByRole('alert')).toHaveFocus();
    });
  });

  it('sin enfocar no le roba el foco a lo que se está haciendo', () => {
    render(
      <>
        <input aria-label="Campo" autoFocus />
        <Alerta tipo="error">No se pudo guardar</Alerta>
      </>,
    );
    expect(screen.getByLabelText('Campo')).toHaveFocus();
    expect(screen.getByRole('alert')).not.toHaveAttribute('tabindex');
  });
});
