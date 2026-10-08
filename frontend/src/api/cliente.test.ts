import { http, HttpResponse } from 'msw';
import { servidor } from '../pruebas/servidor';
import { ErrorApi, api, alExpirarSesion, descargar, mensajeDeError } from './cliente';

describe('cliente de la API', () => {
  it('devuelve el contenido de data', async () => {
    servidor.use(http.get('*/api/pacientes/1', () => HttpResponse.json({ data: { id: 1 } })));
    await expect(api.get('/api/pacientes/1')).resolves.toEqual({ id: 1 });
  });

  it('envía el cuerpo como JSON', async () => {
    servidor.use(
      http.post('*/api/eco', async ({ request }) =>
        HttpResponse.json({ data: await request.json() }, { status: 201 }),
      ),
    );
    await expect(api.post('/api/eco', { dni: '30111222' })).resolves.toEqual({
      dni: '30111222',
    });
  });

  it('devuelve también meta en las listas paginadas', async () => {
    servidor.use(
      http.get('*/api/usuarios', () =>
        HttpResponse.json({
          data: [],
          meta: { pagina: 1, porPagina: 20, total: 0, totalPaginas: 0 },
        }),
      ),
    );
    await expect(api.lista('/api/usuarios', { texto: 'a' })).resolves.toEqual({
      data: [],
      meta: { pagina: 1, porPagina: 20, total: 0, totalPaginas: 0 },
    });
  });

  it('convierte las respuestas de error en ErrorApi con el mensaje del backend', async () => {
    servidor.use(
      http.post('*/api/eco', () =>
        HttpResponse.json(
          { error: { codigo: 'DNI_DUPLICADO', mensaje: 'Ya existe un paciente con ese DNI' } },
          { status: 409 },
        ),
      ),
    );
    const error = await api.post('/api/eco', {}).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ErrorApi);
    expect(error).toMatchObject({
      estado: 409,
      codigo: 'DNI_DUPLICADO',
      message: 'Ya existe un paciente con ese DNI',
    });
  });

  it('avisa cuando la sesión venció', async () => {
    const manejador = vi.fn();
    alExpirarSesion(manejador);
    servidor.use(
      http.get('*/api/usuarios', () =>
        HttpResponse.json(
          { error: { codigo: 'NO_AUTENTICADO', mensaje: 'La sesión se cerró por inactividad' } },
          { status: 401 },
        ),
      ),
    );
    await expect(api.get('/api/usuarios')).rejects.toBeInstanceOf(ErrorApi);
    expect(manejador).toHaveBeenCalledWith('La sesión se cerró por inactividad');
    alExpirarSesion(null);
  });

  it('informa un error de conexión entendible', async () => {
    servidor.use(http.get('*/api/salud', () => HttpResponse.error()));
    await expect(api.get('/api/salud')).rejects.toMatchObject({
      codigo: 'SIN_CONEXION',
      message: expect.stringMatching(/conexión/),
    });
  });
});

// F60: un error del servidor dice qué pasó y qué hacer, no "Error interno/inesperado".
describe('mensajes de error genéricos (F60)', () => {
  const FALLA_DEL_SERVIDOR =
    'El servidor tuvo un problema. Intente de nuevo en unos minutos; si sigue, avise al área de sistemas.';

  it('un error interno del servidor se explica y dice qué hacer', async () => {
    servidor.use(
      http.get('*/api/eco', () =>
        HttpResponse.json(
          { error: { codigo: 'ERROR_INTERNO', mensaje: 'Error interno del servidor' } },
          { status: 500 },
        ),
      ),
    );
    await expect(api.get('/api/eco')).rejects.toMatchObject({
      estado: 500,
      codigo: 'ERROR_INTERNO',
      message: FALLA_DEL_SERVIDOR,
    });
  });

  it('si el servidor responde sin el cuerpo esperado (proxy caído, página de error) pasa lo mismo', async () => {
    servidor.use(
      http.get('*/api/eco', () => new HttpResponse('<html>Bad Gateway</html>', { status: 502 })),
    );
    await expect(api.get('/api/eco')).rejects.toMatchObject({
      estado: 502,
      codigo: 'ERROR_INTERNO',
      message: FALLA_DEL_SERVIDOR,
    });
  });

  it('los demás errores conservan el mensaje del servidor, que sí dice qué corregir', async () => {
    servidor.use(
      http.get('*/api/eco', () =>
        HttpResponse.json(
          { error: { codigo: 'CAMA_OCUPADA', mensaje: 'La cama A-01 ya está ocupada' } },
          { status: 409 },
        ),
      ),
    );
    await expect(api.get('/api/eco')).rejects.toMatchObject({
      message: 'La cama A-01 ya está ocupada',
    });
  });

  it('mensajeDeError muestra el mensaje solo de un ErrorApi; cualquier otra cosa, el texto con la acción a seguir', () => {
    const inesperada =
      'Ocurrió un problema inesperado. Intente de nuevo; si sigue, avise al área de sistemas.';
    expect(mensajeDeError(new ErrorApi(0, 'SIN_CONEXION', 'No hay conexión'))).toBe(
      'No hay conexión',
    );
    expect(mensajeDeError('algo')).toBe(inesperada);
    // Un Error común trae texto técnico (en inglés, de la biblioteca): no se le muestra a nadie.
    expect(mensajeDeError(new TypeError('Failed to fetch'))).toBe(inesperada);
    expect(mensajeDeError(new Error('body stream already read'))).toBe(inesperada);
  });
});

// E6 · T603: los archivos (PDF, Excel) se bajan con fetch y el nombre lo da el servidor.
describe('descarga de archivos', () => {
  it('devuelve el archivo y el nombre de Content-Disposition, con los parámetros en la query', async () => {
    let pedido: URL | undefined;
    servidor.use(
      http.get('*/api/reportes/suministros/exportar', ({ request }) => {
        pedido = new URL(request.url);
        return new HttpResponse('%PDF-1.7', {
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': 'attachment; filename="reporte-suministros-20261007.pdf"',
          },
        });
      }),
    );

    const archivo = await descargar('/api/reportes/suministros/exportar', {
      formato: 'pdf',
      desde: '2026-10-01',
      salaId: '',
      tipo: undefined,
    });

    expect(archivo.nombre).toBe('reporte-suministros-20261007.pdf');
    expect(await archivo.blob.text()).toBe('%PDF-1.7');
    expect(pedido?.searchParams.get('formato')).toBe('pdf');
    expect(pedido?.searchParams.get('desde')).toBe('2026-10-01');
    // Lo vacío no viaja, como en los demás pedidos.
    expect(pedido?.searchParams.has('salaId')).toBe(false);
    expect(pedido?.searchParams.has('tipo')).toBe(false);
  });

  it('entiende el nombre codificado (filename*) y, sin encabezado, usa el nombre de respaldo', async () => {
    servidor.use(
      http.get(
        '*/api/archivo/codificado',
        () =>
          new HttpResponse('x', {
            headers: {
              'Content-Disposition':
                'attachment; filename="estadisticas.xlsx"; filename*=UTF-8\'\'estad%C3%ADsticas-20261007.xlsx',
            },
          }),
      ),
      http.get('*/api/archivo/sin-nombre', () => new HttpResponse('x')),
    );

    await expect(descargar('/api/archivo/codificado')).resolves.toMatchObject({
      nombre: 'estadísticas-20261007.xlsx',
    });
    await expect(
      descargar('/api/archivo/sin-nombre', undefined, 'reporte.pdf'),
    ).resolves.toMatchObject({ nombre: 'reporte.pdf' });
  });

  it('si el servidor rechaza la descarga, lanza ErrorApi con su mensaje, como los demás pedidos', async () => {
    servidor.use(
      http.get('*/api/reportes/suministros/exportar', () =>
        HttpResponse.json(
          { error: { codigo: 'SIN_PERMISO', mensaje: 'No tiene permiso para esta acción' } },
          { status: 403 },
        ),
      ),
    );

    await expect(descargar('/api/reportes/suministros/exportar')).rejects.toMatchObject({
      estado: 403,
      codigo: 'SIN_PERMISO',
      message: 'No tiene permiso para esta acción',
    });
  });

  it('un error interno o la falta de conexión se explican igual que en los demás pedidos', async () => {
    servidor.use(
      http.get('*/api/archivo/falla', () =>
        HttpResponse.json(
          { error: { codigo: 'ERROR_INTERNO', mensaje: 'Error interno del servidor' } },
          { status: 500 },
        ),
      ),
      http.get('*/api/archivo/sin-red', () => HttpResponse.error()),
    );

    await expect(descargar('/api/archivo/falla')).rejects.toMatchObject({
      estado: 500,
      message:
        'El servidor tuvo un problema. Intente de nuevo en unos minutos; si sigue, avise al área de sistemas.',
    });
    await expect(descargar('/api/archivo/sin-red')).rejects.toMatchObject({
      codigo: 'SIN_CONEXION',
    });
  });

  // E6-06 · E5-15 (F76): la red puede cortarse mientras llega el cuerpo, no solo al pedir.
  afterEach(() => vi.restoreAllMocks());

  it('si se corta la conexión mientras llega el archivo, es el mismo error de "sin conexión"', async () => {
    const cortado = new Response('%PDF', { status: 200 });
    vi.spyOn(cortado, 'blob').mockRejectedValue(new TypeError('terminated'));
    const espia = vi.spyOn(globalThis, 'fetch').mockResolvedValue(cortado);

    const error = await descargar('/api/archivo/cortado').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ErrorApi);
    expect(error).toMatchObject({
      estado: 0,
      codigo: 'SIN_CONEXION',
      message: 'No hay conexión con el servidor. Revise el Wi-Fi e intente de nuevo.',
    });
    expect(espia).toHaveBeenCalled();
  });

  it('una descarga cancelada no es un error de conexión: dice que se canceló', async () => {
    const control = new AbortController();
    const espia = vi.spyOn(globalThis, 'fetch').mockImplementation(
      (_url, init) =>
        new Promise((_resolver, rechazar) => {
          init?.signal?.addEventListener('abort', () =>
            rechazar(new DOMException('Aborted', 'AbortError')),
          );
        }),
    );

    const pedido = descargar('/api/archivo/lento', undefined, 'x.pdf', control.signal).catch(
      (e: unknown) => e,
    );
    control.abort();

    expect(await pedido).toMatchObject({ estado: 0, codigo: 'CANCELADO' });
    expect(espia.mock.calls[0]?.[1]?.signal).toBe(control.signal);
  });

  it('avisa si la sesión venció mientras se pedía el archivo', async () => {
    const manejador = vi.fn();
    alExpirarSesion(manejador);
    servidor.use(
      http.get('*/api/archivo/vencida', () =>
        HttpResponse.json(
          { error: { codigo: 'NO_AUTENTICADO', mensaje: 'La sesión se cerró por inactividad' } },
          { status: 401 },
        ),
      ),
    );

    await expect(descargar('/api/archivo/vencida')).rejects.toBeInstanceOf(ErrorApi);
    expect(manejador).toHaveBeenCalledWith('La sesión se cerró por inactividad');
    alExpirarSesion(null);
  });
});
