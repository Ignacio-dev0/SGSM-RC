import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import type { Insumo } from '../../api/tipos';
import { ADMIN, ENFERMERO } from '../../pruebas/datos';
import { renderizarApp } from '../../pruebas/renderizar';
import { servidor } from '../../pruebas/servidor';

const insumo = (extra: Partial<Insumo> = {}): Insumo => ({
  id: 1,
  nombre: 'Paracetamol',
  tipo: 'MEDICAMENTO',
  unidadMedida: 'mg',
  presentacion: 'Comprimidos 500 mg',
  activo: true,
  ...extra,
});

describe('catálogo de insumos y medicamentos (T303)', () => {
  it('lista el catálogo y filtra por tipo', async () => {
    const pedidos: URLSearchParams[] = [];
    servidor.use(
      http.get('*/api/insumos', ({ request }) => {
        pedidos.push(new URL(request.url).searchParams);
        return HttpResponse.json({ data: [insumo()] });
      }),
    );
    renderizarApp('/catalogo', ADMIN);

    const tabla = await screen.findByRole('table', { name: 'Catálogo' });
    expect(await within(tabla).findByText('Paracetamol')).toBeInTheDocument();
    expect(within(tabla).getByText('Medicamento')).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText('Tipo'), 'Insumos');
    await waitFor(() => expect(pedidos.at(-1)?.get('tipo')).toBe('INSUMO'));
  });

  it('agrega un insumo al catálogo', async () => {
    let enviado: unknown;
    servidor.use(
      http.get('*/api/insumos', () => HttpResponse.json({ data: [] })),
      http.post('*/api/insumos', async ({ request }) => {
        enviado = await request.json();
        return HttpResponse.json(
          { data: insumo({ id: 9, nombre: 'Pañal adulto', tipo: 'INSUMO' }) },
          { status: 201 },
        );
      }),
    );
    renderizarApp('/catalogo', ADMIN);

    await userEvent.click(await screen.findByRole('button', { name: 'Agregar al catálogo' }));
    // El título dice qué se agrega según el tipo elegido (medicamento o insumo).
    const dialogo = screen.getByRole('dialog', { name: 'Nuevo medicamento' });
    await userEvent.type(within(dialogo).getByLabelText(/^Nombre/), 'Pañal adulto');
    await userEvent.selectOptions(within(dialogo).getByLabelText(/^Tipo/), 'Insumo no medicinal');
    expect(dialogo).toHaveAccessibleName('Nuevo insumo');
    await userEvent.type(within(dialogo).getByLabelText(/^Unidad de medida/), 'unidad');
    await userEvent.type(within(dialogo).getByLabelText(/^Presentación/), 'Paquete x 10');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByRole('status')).toHaveTextContent(/Pañal adulto/);
    expect(enviado).toEqual({
      nombre: 'Pañal adulto',
      tipo: 'INSUMO',
      unidadMedida: 'unidad',
      presentacion: 'Paquete x 10',
    });
  });

  it('el diálogo no se cierra tocando afuera (se perdería lo escrito) y enfoca el error', async () => {
    servidor.use(http.get('*/api/insumos', () => HttpResponse.json({ data: [] })));
    renderizarApp('/catalogo', ADMIN);

    await userEvent.click(await screen.findByRole('button', { name: 'Agregar al catálogo' }));
    const dialogo = screen.getByRole('dialog', { name: 'Nuevo medicamento' });
    await userEvent.type(within(dialogo).getByLabelText(/^Unidad de medida/), 'mg');
    await userEvent.click(document.querySelector('.MuiBackdrop-root')!);
    expect(screen.getByRole('dialog', { name: 'Nuevo medicamento' })).toBeInTheDocument();

    await userEvent.click(within(dialogo).getByRole('button', { name: 'Guardar' }));
    // El foco va al primer campo con error, para corregirlo sin buscarlo.
    await waitFor(() => expect(document.activeElement).toHaveAttribute('aria-invalid', 'true'));
    expect(document.activeElement).toBe(within(dialogo).getByLabelText(/^Nombre/));
  });

  it('da de baja un insumo desde su edición', async () => {
    const baja = vi.fn(() => HttpResponse.json({ data: insumo({ activo: false }) }));
    servidor.use(
      http.get('*/api/insumos', () => HttpResponse.json({ data: [insumo()] })),
      http.delete('*/api/insumos/1', baja),
    );
    renderizarApp('/catalogo', ADMIN);

    await userEvent.click(await screen.findByText('Paracetamol'));
    const dialogo = screen.getByRole('dialog', { name: 'Editar medicamento' });
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Dar de baja' }));
    // Pide confirmación nombrando qué se da de baja y si se puede deshacer.
    const confirmacion = screen.getByRole('dialog', { name: /Dar de baja Paracetamol/ });
    expect(confirmacion).toHaveTextContent(/se puede reactivar/);
    expect(baja).not.toHaveBeenCalled();
    await userEvent.click(within(confirmacion).getByRole('button', { name: 'Dar de baja' }));

    expect(await screen.findByRole('status')).toHaveTextContent(/dado de baja/);
    expect(baja).toHaveBeenCalled();
  });

  it('el enfermero no tiene acceso a la administración del catálogo', async () => {
    renderizarApp('/catalogo', ENFERMERO);
    expect(await screen.findByText(/No tiene permiso/)).toBeInTheDocument();
  });
});

describe('el catálogo recuerda lo que se filtró (queda en la URL)', () => {
  const sinResultadosSiHayTexto = http.get('*/api/insumos', ({ request }) =>
    HttpResponse.json({ data: new URL(request.url).searchParams.get('texto') ? [] : [insumo()] }),
  );
  const OPCIONES = { name: 'Qué puede hacer ahora' };

  it('restaura de la URL el texto, el tipo y el estado, y los pide a la API', async () => {
    const pedidos: URLSearchParams[] = [];
    servidor.use(
      http.get('*/api/insumos', ({ request }) => {
        pedidos.push(new URL(request.url).searchParams);
        return HttpResponse.json({ data: [insumo()] });
      }),
    );
    renderizarApp('/catalogo?texto=gasa&tipo=INSUMO&activo=false', ADMIN);

    await screen.findByRole('table', { name: 'Catálogo' });
    expect(screen.getByLabelText(/Buscar/)).toHaveValue('gasa');
    expect(screen.getByLabelText('Tipo')).toHaveValue('INSUMO');
    expect(screen.getByLabelText('Estado')).toHaveValue('false');
    expect(pedidos[0]?.get('texto')).toBe('gasa');
    expect(pedidos[0]?.get('tipo')).toBe('INSUMO');
    expect(pedidos[0]?.get('activo')).toBe('false');
  });

  it('con filtros dice por qué no hay nada y qué probar, y permite quitarlos', async () => {
    servidor.use(sinResultadosSiHayTexto);
    renderizarApp('/catalogo', ADMIN);

    await userEvent.type(await screen.findByLabelText(/Buscar/), 'zzz');
    expect(
      await screen.findByText(
        'No hay insumos ni medicamentos activos que coincidan con «zzz». Pruebe con otro nombre.',
      ),
    ).toBeInTheDocument();
    await userEvent.click(
      within(screen.getByRole('group', OPCIONES)).getByRole('button', { name: 'Quitar filtros' }),
    );

    expect(screen.getByLabelText(/Buscar/)).toHaveValue('');
    // El botón desaparece: el foco queda en el campo para buscar de nuevo.
    expect(screen.getByLabelText(/Buscar/)).toHaveFocus();
    const tabla = screen.getByRole('table', { name: 'Catálogo' });
    expect(await within(tabla).findByText('Paracetamol')).toBeInTheDocument();
    expect(screen.queryByRole('group', OPCIONES)).not.toBeInTheDocument();
  });

  it('si lo buscado no está, se puede agregar al catálogo desde el mismo lugar', async () => {
    servidor.use(sinResultadosSiHayTexto);
    renderizarApp('/catalogo?texto=zzz', ADMIN);

    const opciones = await screen.findByRole('group', OPCIONES);
    await userEvent.click(within(opciones).getByRole('button', { name: 'Agregar al catálogo' }));

    expect(await screen.findByRole('dialog', { name: 'Nuevo medicamento' })).toBeInTheDocument();
  });

  it('nombra el tipo y el estado elegidos en el mensaje', async () => {
    servidor.use(http.get('*/api/insumos', () => HttpResponse.json({ data: [] })));
    renderizarApp('/catalogo?tipo=INSUMO&activo=false', ADMIN);

    expect(
      await screen.findByText(
        'No hay insumos dados de baja. Cambie Tipo a Todos, o cambie Estado a Activos.',
      ),
    ).toBeInTheDocument();
  });

  it('sin nada cargado lo dice distinto y apunta a Agregar al catálogo', async () => {
    servidor.use(http.get('*/api/insumos', () => HttpResponse.json({ data: [] })));
    renderizarApp('/catalogo', ADMIN);

    expect(
      await screen.findByText(
        'No hay insumos ni medicamentos activos. Use «Agregar al catálogo» para cargar uno.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Quitar filtros' })).not.toBeInTheDocument();
  });

  it('un fallo de carga no se lee como "no hay insumos": avisa, deja reintentar y no muestra el vacío', async () => {
    let pedidos = 0;
    servidor.use(
      http.get('*/api/insumos', () => {
        pedidos++;
        return pedidos === 1
          ? HttpResponse.json(
              { error: { codigo: 'ERROR_INTERNO', mensaje: 'Error inesperado del servidor' } },
              { status: 500 },
            )
          : HttpResponse.json({ data: [insumo()] });
      }),
    );
    renderizarApp('/catalogo?texto=zzz', ADMIN);

    const aviso = await screen.findByRole('alert');
    expect(aviso).toHaveTextContent(/No se pudo cargar el catálogo/);
    expect(aviso).toHaveTextContent(/Error inesperado/);
    expect(screen.queryByText(/No hay insumos/)).not.toBeInTheDocument();
    expect(screen.queryByRole('group', OPCIONES)).not.toBeInTheDocument();

    await userEvent.click(within(aviso).getByRole('button', { name: 'Reintentar' }));

    const tabla = await screen.findByRole('table', { name: 'Catálogo' });
    expect(await within(tabla).findByText('Paracetamol')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('dar de baja desde el catálogo: la confirmación (UX-10)', () => {
  const dosInsumos = http.get('*/api/insumos', () =>
    HttpResponse.json({ data: [insumo(), insumo({ id: 2, nombre: 'Ibuprofeno' })] }),
  );
  const falla = () =>
    HttpResponse.json(
      { error: { codigo: 'ERROR_INTERNO', mensaje: 'Error inesperado del servidor' } },
      { status: 500 },
    );

  /** Abre Paracetamol y llega a la confirmación de la baja. */
  async function pedirBajaDeParacetamol() {
    await userEvent.click(await screen.findByText('Paracetamol'));
    const dialogo = screen.getByRole('dialog', { name: 'Editar medicamento' });
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Dar de baja' }));
    return {
      dialogo,
      confirmacion: screen.getByRole('dialog', { name: /Dar de baja Paracetamol/ }),
    };
  }

  it('después de dar de baja un insumo, abrir otro no muestra sola la confirmación', async () => {
    servidor.use(
      dosInsumos,
      http.delete('*/api/insumos/1', () => HttpResponse.json({ data: insumo({ activo: false }) })),
    );
    renderizarApp('/catalogo', ADMIN);

    const { confirmacion } = await pedirBajaDeParacetamol();
    await userEvent.click(within(confirmacion).getByRole('button', { name: 'Dar de baja' }));
    expect(await screen.findByRole('status')).toHaveTextContent(/dado de baja/);

    await userEvent.click(await screen.findByText('Ibuprofeno'));
    expect(await screen.findByRole('dialog', { name: 'Editar medicamento' })).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: /Dar de baja/ })).not.toBeInTheDocument(),
    );
  });

  it('si la baja falla, el error se ve dentro de la confirmación y no en el diálogo de atrás', async () => {
    servidor.use(dosInsumos, http.delete('*/api/insumos/1', falla));
    renderizarApp('/catalogo', ADMIN);

    const { dialogo, confirmacion } = await pedirBajaDeParacetamol();
    await userEvent.click(within(confirmacion).getByRole('button', { name: 'Dar de baja' }));

    expect(await within(confirmacion).findByRole('alert')).toHaveTextContent(/Error inesperado/);
    expect(within(dialogo).queryByRole('alert', { hidden: true })).not.toBeInTheDocument();
    // La confirmación sigue abierta: se puede reintentar o cancelar.
    expect(confirmacion).toBeInTheDocument();
  });

  it('un error de un intento anterior no reaparece al abrir otro insumo', async () => {
    servidor.use(dosInsumos, http.delete('*/api/insumos/1', falla));
    renderizarApp('/catalogo', ADMIN);

    const { dialogo, confirmacion } = await pedirBajaDeParacetamol();
    await userEvent.click(within(confirmacion).getByRole('button', { name: 'Dar de baja' }));
    await within(confirmacion).findByRole('alert');
    await userEvent.click(within(confirmacion).getByRole('button', { name: 'Cancelar' }));
    // El diálogo de atrás vuelve a ser accesible cuando termina de cerrarse la confirmación.
    await userEvent.click(await within(dialogo).findByRole('button', { name: 'Cancelar' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: /Editar/ })).not.toBeInTheDocument(),
    );

    await userEvent.click(await screen.findByText('Ibuprofeno'));
    expect(await screen.findByRole('dialog', { name: 'Editar medicamento' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('el catálogo en tablet vertical (F28 · F32 · F48)', () => {
  const NBSP = String.fromCharCode(160);

  it('los filtros van en una región de búsqueda con nombre (grilla de dos columnas desde sm)', async () => {
    servidor.use(http.get('*/api/insumos', () => HttpResponse.json({ data: [insumo()] })));
    renderizarApp('/catalogo', ADMIN);

    const filtros = await screen.findByRole('search', { name: 'Filtros' });
    expect(within(filtros).getByLabelText(/Buscar/)).toBeInTheDocument();
    expect(within(filtros).getByLabelText('Tipo')).toBeInTheDocument();
    expect(within(filtros).getByLabelText('Estado')).toBeInTheDocument();
  });

  it('los encabezados son cortos, para que no se partan en dos renglones', async () => {
    servidor.use(http.get('*/api/insumos', () => HttpResponse.json({ data: [insumo()] })));
    renderizarApp('/catalogo', ADMIN);

    const tabla = await screen.findByRole('table', { name: 'Catálogo' });
    const encabezados = within(tabla)
      .getAllByRole('columnheader')
      .map((e) => e.textContent?.trim());
    expect(encabezados.slice(0, 5)).toEqual(['Nombre', 'Tipo', 'Presentación', 'Unidad', 'Estado']);
  });

  it('el nombre va en negrita y la fila dice qué abre', async () => {
    servidor.use(http.get('*/api/insumos', () => HttpResponse.json({ data: [insumo()] })));
    renderizarApp('/catalogo', ADMIN);

    const tabla = await screen.findByRole('table', { name: 'Catálogo' });
    const fila = await within(tabla).findByRole('row', { name: 'Abrir Paracetamol' });
    expect(within(fila).getByText('Paracetamol').tagName).toBe('STRONG');
  });

  it('la presentación y la medida no se parten: el número queda junto a su unidad', async () => {
    servidor.use(
      http.get('*/api/insumos', () =>
        HttpResponse.json({
          data: [
            insumo(),
            insumo({ id: 2, nombre: 'Gasa estéril 10 x 10 cm', tipo: 'INSUMO', presentacion: '' }),
          ],
        }),
      ),
    );
    renderizarApp('/catalogo', ADMIN);

    const tabla = await screen.findByRole('table', { name: 'Catálogo' });
    expect((await within(tabla).findByText(/^Comprimidos 500/)).textContent).toBe(
      `Comprimidos 500${NBSP}mg`,
    );
    expect(within(tabla).getByText(/^Gasa estéril 10/).textContent).toBe(
      `Gasa estéril 10${NBSP}x${NBSP}10${NBSP}cm`,
    );
  });

  it('se ordena por nombre como se ordena en español: "Cánula" va antes que "Ceftriaxona"', async () => {
    servidor.use(
      http.get('*/api/insumos', () =>
        HttpResponse.json({
          data: [
            insumo({ id: 1, nombre: 'Ceftriaxona' }),
            insumo({ id: 2, nombre: 'Clonazepam' }),
            insumo({ id: 3, nombre: 'Cánula nasal' }),
          ],
        }),
      ),
    );
    renderizarApp('/catalogo', ADMIN);

    const tabla = await screen.findByRole('table', { name: 'Catálogo' });
    await within(tabla).findByText('Ceftriaxona');
    const nombres = within(tabla)
      .getAllByRole('row')
      .slice(1)
      .map((fila) => within(fila).getAllByRole('cell')[0]?.textContent);
    expect(nombres).toEqual(['Cánula nasal', 'Ceftriaxona', 'Clonazepam']);
  });

  it('mientras se filtra, las filas anteriores se ven atenuadas y el listado figura ocupado', async () => {
    let liberar!: () => void;
    const respuestaLenta = new Promise<void>((resolver) => (liberar = resolver));
    servidor.use(
      http.get('*/api/insumos', async ({ request }) => {
        if (new URL(request.url).searchParams.get('tipo') === 'INSUMO') await respuestaLenta;
        return HttpResponse.json({ data: [insumo()] });
      }),
    );
    renderizarApp('/catalogo', ADMIN);

    const tabla = await screen.findByRole('table', { name: 'Catálogo' });
    await within(tabla).findByText('Paracetamol');
    const contenedor = tabla.closest('[aria-busy]')!;
    expect(contenedor).toHaveAttribute('aria-busy', 'false');

    await userEvent.selectOptions(screen.getByLabelText('Tipo'), 'Insumos');

    await waitFor(() => expect(contenedor).toHaveAttribute('aria-busy', 'true'));
    expect(contenedor).toHaveStyle({ opacity: '0.5' });
    // Las filas viejas siguen ahí: no se vacía el catálogo mientras llegan las nuevas.
    expect(within(tabla).getByText('Paracetamol')).toBeInTheDocument();

    liberar();
    await waitFor(() => expect(contenedor).toHaveAttribute('aria-busy', 'false'));
  });
});
