import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { descriptorSimulado } from '../../biometria/simulado';
import { ADMIN, ENFERMERO } from '../../pruebas/datos';
import { renderizarApp } from '../../pruebas/renderizar';
import { servidor } from '../../pruebas/servidor';

const estado = (registrado: boolean) => ({
  usuarioId: 3,
  nombreUsuario: 'enfermero',
  nombre: 'Sofía',
  apellido: 'Acosta',
  rol: 'Enfermero',
  registrado,
  actualizadoEn: registrado ? '2026-10-07T12:00:00.000Z' : null,
});

describe('gestión biométrica (T406 · CU07–CU09)', () => {
  beforeEach(() => vi.stubEnv('VITE_BIOMETRIA_MODO', 'simulado'));
  afterEach(() => vi.unstubAllEnvs());

  it('lista el personal con el estado de su registro facial', async () => {
    servidor.use(
      http.get('*/api/biometria/usuarios', () =>
        HttpResponse.json({
          data: [
            {
              id: 3,
              nombreUsuario: 'enfermero',
              nombre: 'Sofía',
              apellido: 'Acosta',
              rol: 'Enfermero',
              registrado: true,
              actualizadoEn: '2026-10-07T12:00:00.000Z',
            },
            {
              id: 4,
              nombreUsuario: 'lgomez',
              nombre: 'Lucía',
              apellido: 'Gómez',
              rol: 'Enfermero',
              registrado: false,
              actualizadoEn: null,
            },
          ],
        }),
      ),
    );
    renderizarApp('/biometria', ADMIN);

    const tabla = await screen.findByRole('table', { name: 'Personal' });
    await within(tabla).findByText('Acosta, Sofía');
    const filas = within(tabla).getAllByRole('row');
    expect(filas[1]).toHaveTextContent(/Acosta, Sofía.*Registrado/);
    expect(filas[2]).toHaveTextContent(/Gómez, Lucía.*Sin registrar/);
  });

  it('registra el rostro de un enfermero con la cámara y su foto de referencia', async () => {
    let enviado: { patron: number[]; foto: string } | undefined;
    let registrado = false;
    servidor.use(
      http.get('*/api/biometria/usuarios/3', () => HttpResponse.json({ data: estado(registrado) })),
      http.put('*/api/biometria/usuarios/3', async ({ request }) => {
        enviado = (await request.json()) as typeof enviado;
        registrado = true;
        return HttpResponse.json({
          data: { usuarioId: 3, registrado: true, actualizadoEn: new Date().toISOString() },
        });
      }),
    );
    renderizarApp('/biometria/3', ADMIN);

    expect(await screen.findByText(/Sin rostro registrado/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Registrar rostro' }));
    const dialogo = screen.getByRole('dialog', { name: /Registrar rostro de Sofía Acosta/ });
    await userEvent.click(
      within(dialogo).getByRole('button', { name: /Simular el rostro de enfermero/ }),
    );
    expect(within(dialogo).getByRole('img', { name: 'Foto capturada' })).toBeInTheDocument();
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByRole('status')).toHaveTextContent(/Rostro registrado/);
    expect(enviado?.patron).toEqual(descriptorSimulado('enfermero'));
    expect(enviado?.foto).toMatch(/^data:image\//);
    expect(await screen.findByRole('img', { name: /Foto de referencia/ })).toBeInTheDocument();
  });

  it('elimina los datos biométricos con confirmación', async () => {
    let registrado = true;
    const eliminar = vi.fn(() => {
      registrado = false;
      return HttpResponse.json({ data: { usuarioId: 3, registrado: false, actualizadoEn: null } });
    });
    servidor.use(
      http.get('*/api/biometria/usuarios/3', () => HttpResponse.json({ data: estado(registrado) })),
      http.get('*/api/biometria/usuarios/3/foto', () => new HttpResponse(null, { status: 200 })),
      http.delete('*/api/biometria/usuarios/3', eliminar),
    );
    renderizarApp('/biometria/3', ADMIN);

    await userEvent.click(
      await screen.findByRole('button', { name: 'Eliminar datos biométricos' }),
    );
    const dialogo = screen.getByRole('dialog', { name: /Eliminar datos biométricos/ });
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Eliminar' }));

    expect(await screen.findByRole('status')).toHaveTextContent(/se eliminaron/);
    expect(eliminar).toHaveBeenCalled();
    expect(await screen.findByText(/Sin rostro registrado/)).toBeInTheDocument();
  });

  it('el enfermero no tiene acceso', async () => {
    renderizarApp('/biometria', ENFERMERO);
    expect(await screen.findByText(/No tiene permiso/)).toBeInTheDocument();
  });
});

describe('prueba de concepto del reconocimiento facial (T401)', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('en modo demostración explica que la prueba necesita la cámara', async () => {
    vi.stubEnv('VITE_BIOMETRIA_MODO', 'simulado');
    renderizarApp('/biometria/prueba', ADMIN);
    expect(await screen.findByText(/Esta prueba necesita la cámara/)).toBeInTheDocument();
    expect(screen.queryByText(/VITE_/)).not.toBeInTheDocument();
  });

  it('no nombra archivos de la documentación: dice a quién pedir la guía (F12)', async () => {
    vi.stubEnv('VITE_BIOMETRIA_MODO', 'simulado');
    renderizarApp('/biometria/prueba', ADMIN);
    const aviso = await screen.findByText(/Esta prueba necesita la cámara/);
    expect(aviso).toHaveTextContent(/el área de sistemas tiene la guía/);
    expect(document.body).not.toHaveTextContent(/docs\/|\.md\b/);
  });

  it('con la cámara mide el tiempo de detección y la cantidad de rostros', async () => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop: vi.fn() }] })) },
    });
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: vi.fn(),
      getImageData: () => ({ data: new Uint8ClampedArray([200, 200, 200, 255]) }),
    } as never);
    const { motorFaceApi } = await import('../../biometria/motorFaceApi');
    vi.spyOn(motorFaceApi, 'cargar').mockResolvedValue();
    vi.spyOn(motorFaceApi, 'detectar').mockResolvedValue({
      rostros: 1,
      descriptor: Array.from({ length: 128 }, () => 0.1),
    });
    renderizarApp('/biometria/prueba', ADMIN);

    await userEvent.click(await screen.findByRole('button', { name: 'Iniciar prueba' }));

    await waitFor(() => expect(screen.getByLabelText('Detecciones')).not.toHaveTextContent(/^0$/), {
      timeout: 3000,
    });
    expect(screen.getByLabelText('Tiempo promedio de detección')).toHaveTextContent(/ms/);
    expect(screen.getByLabelText('Con un solo rostro')).toHaveTextContent('100 %');
    expect(screen.getByLabelText('Luz')).toHaveTextContent(/Buena/);
  });
});

describe('estados de carga del rostro de un usuario', () => {
  it('si no se puede cargar lo dice y deja reintentar', async () => {
    servidor.use(
      http.get('*/api/biometria/usuarios/3', () =>
        HttpResponse.json(
          { error: { codigo: 'ERROR_INTERNO', mensaje: 'Error inesperado del servidor' } },
          { status: 500 },
        ),
      ),
    );
    renderizarApp('/biometria/3', ADMIN);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /No se pudo cargar el registro facial/,
    );
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });
});

describe('gestión biométrica: cuando no hay nada que mostrar (UX-03)', () => {
  const falla = () =>
    HttpResponse.json(
      { error: { codigo: 'ERROR_INTERNO', mensaje: 'Error inesperado del servidor' } },
      { status: 500 },
    );
  const persona = {
    id: 3,
    nombreUsuario: 'enfermero',
    nombre: 'Sofía',
    apellido: 'Acosta',
    rol: 'Enfermero',
    registrado: true,
    actualizadoEn: '2026-10-07T12:00:00.000Z',
  };

  it('un fallo de carga no se lee como "no hay personal": avisa, deja reintentar y no muestra el vacío', async () => {
    let pedidos = 0;
    servidor.use(
      http.get('*/api/biometria/usuarios', () => {
        pedidos++;
        return pedidos === 1 ? falla() : HttpResponse.json({ data: [persona] });
      }),
    );
    renderizarApp('/biometria', ADMIN);

    const aviso = await screen.findByRole('alert');
    expect(aviso).toHaveTextContent(/No se pudo cargar la lista del personal/);
    expect(aviso).toHaveTextContent(/El servidor tuvo un problema/);
    // Ni la tabla ni el mensaje de vacío: no es que no haya personal.
    expect(screen.queryByText(/No hay personal/)).not.toBeInTheDocument();
    expect(screen.queryByRole('table', { name: 'Personal' })).not.toBeInTheDocument();

    await userEvent.click(within(aviso).getByRole('button', { name: 'Reintentar' }));

    const tabla = await screen.findByRole('table', { name: 'Personal' });
    expect(await within(tabla).findByText('Acosta, Sofía')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('sin personal dice por qué y qué hacer', async () => {
    servidor.use(http.get('*/api/biometria/usuarios', () => HttpResponse.json({ data: [] })));
    renderizarApp('/biometria', ADMIN);

    expect(
      await screen.findByText(
        'No hay personal activo. Cuando se registre un usuario nuevo, va a aparecer en esta lista para cargar su rostro.',
      ),
    ).toBeInTheDocument();
  });
});

describe('gestión biométrica: el listado en tablet (F32 · F48)', () => {
  const persona = {
    id: 3,
    nombreUsuario: 'enfermero',
    nombre: 'Sofía',
    apellido: 'Acosta',
    rol: 'Enfermero',
    registrado: true,
    actualizadoEn: '2026-10-07T12:00:00.000Z',
  };

  it('cada fila dice qué abre y la persona va en negrita, con un encabezado corto', async () => {
    servidor.use(
      http.get('*/api/biometria/usuarios', () => HttpResponse.json({ data: [persona] })),
    );
    renderizarApp('/biometria', ADMIN);

    const tabla = await screen.findByRole('table', { name: 'Personal' });
    const fila = await within(tabla).findByRole('row', {
      name: 'Abrir el registro facial de Acosta, Sofía',
    });
    expect(within(fila).getByText('Acosta, Sofía').tagName).toBe('STRONG');
    expect(within(tabla).getByRole('columnheader', { name: 'Nombre' })).toBeInTheDocument();
    expect(within(tabla).queryByRole('columnheader', { name: 'Apellido y nombre' })).toBeNull();
  });
});
