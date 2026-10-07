import { http, HttpResponse } from 'msw';
import { servidor } from '../pruebas/servidor';
import { ErrorApi, api, alExpirarSesion } from './cliente';

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
