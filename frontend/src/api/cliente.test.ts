import { http, HttpResponse } from 'msw';
import { servidor } from '../pruebas/servidor';
import { ErrorApi, api, alExpirarSesion, mensajeDeError } from './cliente';

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

  it('mensajeDeError usa el mensaje del error y, si no es un error, un texto con la acción a seguir', () => {
    expect(mensajeDeError(new Error('No hay conexión'))).toBe('No hay conexión');
    expect(mensajeDeError('algo')).toBe(
      'Ocurrió un problema inesperado. Intente de nuevo; si sigue, avise al área de sistemas.',
    );
  });
});
