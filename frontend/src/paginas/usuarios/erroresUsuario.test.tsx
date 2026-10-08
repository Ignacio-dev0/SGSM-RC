// Usuarios: los rechazos de D119 (PRIVILEGIO_AJENO) y D120 (ULTIMO_ADMINISTRADOR) del servidor se
// muestran con su mensaje, en el formulario, en los permisos adicionales y al dar de baja.
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import type { Permiso, Rol, Usuario, UsuarioSesion } from '../../api/tipos';
import { ADMIN } from '../../pruebas/datos';
import { renderizarApp } from '../../pruebas/renderizar';
import { servidor } from '../../pruebas/servidor';

const ROLES: Rol[] = [
  { codigo: 'ADMINISTRADOR', nombre: 'Administrador', descripcion: null, permisos: [] },
  { codigo: 'ENFERMERO', nombre: 'Enfermero', descripcion: null, permisos: ['pacientes.ver'] },
];

const PERMISOS: Permiso[] = [
  { codigo: 'pacientes.ver', modulo: 'pacientes', descripcion: 'Buscar pacientes' },
  { codigo: 'auditoria.ver', modulo: 'auditoria', descripcion: 'Consultar la auditoría' },
];

/** Gestiona usuarios pero no tiene todos los permisos: el caso de PRIVILEGIO_AJENO (D119). */
const GESTORA: UsuarioSesion = {
  ...ADMIN,
  id: 5,
  nombreUsuario: 'mrios',
  nombre: 'Marta',
  apellido: 'Ríos',
  rol: { codigo: 'SUPERVISOR', nombre: 'Supervisora' },
  permisos: ['usuarios.gestionar', 'usuarios.permisos', 'pacientes.ver'],
};

const usuario = (extra: Partial<Usuario> = {}): Usuario => ({
  id: 10,
  nombreUsuario: 'lgomez',
  dni: '30111222',
  nombre: 'Lucía',
  apellido: 'Gómez',
  email: null,
  matricula: null,
  rol: { codigo: 'ENFERMERO', nombre: 'Enfermero' },
  activo: true,
  fechaBaja: null,
  bloqueadoHasta: null,
  ultimoAcceso: null,
  tieneBiometria: false,
  permisosDelRol: ['pacientes.ver'],
  permisosAdicionales: [],
  ...extra,
});

/** La única administradora activa además de quien está en sesión (D120). */
const ADMINISTRADORA = usuario({
  rol: { codigo: 'ADMINISTRADOR', nombre: 'Administrador' },
  permisosDelRol: ['pacientes.ver', 'auditoria.ver'],
});

const AJENO_GESTION =
  'Gómez, Lucía tiene permisos que usted no tiene: lo gestiona un administrador';
const AJENO_ROL =
  'No puede dar el rol Administrador: tiene permisos que usted no tiene. Lo hace un administrador.';
const AJENO_PERMISOS = 'No puede asignar permisos que usted no tiene: Consultar la auditoría';
const ULTIMO = 'Gómez, Lucía es el único administrador activo: antes cree o reactive otro';

const rechazo = (estado: 403 | 409, codigo: string, mensaje: string) => () =>
  HttpResponse.json({ error: { codigo, mensaje } }, { status: estado });

beforeEach(() => {
  servidor.use(
    http.get('*/api/roles', () => HttpResponse.json({ data: ROLES })),
    http.get('*/api/permisos', () => HttpResponse.json({ data: PERMISOS })),
  );
});

/** El aviso de error con el mensaje del servidor, a la vista y con el foco (lejos del botón). */
async function avisoEnfocado(texto: string) {
  const aviso = await screen.findByRole('alert');
  expect(aviso).toHaveTextContent(texto);
  await waitFor(() => expect(aviso.closest('[tabindex="-1"]')).toHaveFocus());
}

describe('formulario de usuario: rechazos del servidor (D119 · D120)', () => {
  it('al dar un rol con permisos que no tiene (alta), el 403 PRIVILEGIO_AJENO dice por qué', async () => {
    servidor.use(
      http.get('*/api/usuarios', () =>
        HttpResponse.json({
          data: [],
          meta: { pagina: 1, porPagina: 20, total: 0, totalPaginas: 0 },
        }),
      ),
      http.post('*/api/usuarios', rechazo(403, 'PRIVILEGIO_AJENO', AJENO_ROL)),
    );
    renderizarApp('/usuarios/nuevo', GESTORA);

    await userEvent.type(await screen.findByLabelText(/^Nombre\s*\*?$/), 'Lucía');
    await userEvent.type(screen.getByLabelText(/^Apellido/), 'Gómez');
    await userEvent.type(screen.getByLabelText(/^DNI/), '30111222');
    await userEvent.type(screen.getByLabelText(/^Nombre de usuario/), 'lgomez');
    await userEvent.selectOptions(screen.getByLabelText(/^Rol/), 'Administrador');
    await userEvent.type(screen.getByLabelText(/^Contraseña/), 'Clave2026');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    await avisoEnfocado(AJENO_ROL);
  });

  it('al editar a quien tiene más permisos, el 403 PRIVILEGIO_AJENO dice por qué', async () => {
    servidor.use(
      http.get('*/api/usuarios/10', () => HttpResponse.json({ data: usuario() })),
      http.patch('*/api/usuarios/10', rechazo(403, 'PRIVILEGIO_AJENO', AJENO_GESTION)),
    );
    renderizarApp('/usuarios/10', GESTORA);

    const apellido = await screen.findByLabelText(/^Apellido/);
    await waitFor(() => expect(apellido).toHaveValue('Gómez'));
    await userEvent.type(apellido, ' Paz');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    await avisoEnfocado(AJENO_GESTION);
  });

  it('al sacarle el rol a la última administradora, el 409 ULTIMO_ADMINISTRADOR dice qué hacer', async () => {
    servidor.use(
      http.get('*/api/usuarios/10', () => HttpResponse.json({ data: ADMINISTRADORA })),
      http.patch('*/api/usuarios/10', rechazo(409, 'ULTIMO_ADMINISTRADOR', ULTIMO)),
    );
    renderizarApp('/usuarios/10', ADMIN);

    const rol = await screen.findByLabelText(/^Rol/);
    await waitFor(() => expect(rol).toHaveValue('ADMINISTRADOR'));
    await userEvent.selectOptions(rol, 'Enfermero');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    await avisoEnfocado(ULTIMO);
  });
});

describe('permisos adicionales: rechazo del servidor (D119)', () => {
  it('al dar un permiso que no tiene, el 403 PRIVILEGIO_AJENO dice cuál', async () => {
    servidor.use(
      http.get('*/api/usuarios/10', () => HttpResponse.json({ data: usuario() })),
      http.put(
        '*/api/usuarios/10/permisos-adicionales',
        rechazo(403, 'PRIVILEGIO_AJENO', AJENO_PERMISOS),
      ),
    );
    renderizarApp('/usuarios/10/permisos', GESTORA);

    await userEvent.click(await screen.findByRole('checkbox', { name: /Consultar la auditoría/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Guardar permisos' }));

    await avisoEnfocado(AJENO_PERMISOS);
    expect(screen.queryByText(/se guardaron/)).not.toBeInTheDocument();
  });
});

describe('dar de baja: rechazos del servidor (D119 · D120)', () => {
  async function confirmarBaja(datos: Usuario, sesion: UsuarioSesion) {
    servidor.use(http.get('*/api/usuarios/10', () => HttpResponse.json({ data: datos })));
    renderizarApp('/usuarios/10', sesion);
    await userEvent.click(await screen.findByRole('button', { name: 'Dar de baja' }));
    const dialogo = screen.getByRole('dialog', { name: /Dar de baja/ });
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Dar de baja' }));
    return dialogo;
  }

  it('la última administradora: el 409 ULTIMO_ADMINISTRADOR se lee en el diálogo', async () => {
    servidor.use(http.delete('*/api/usuarios/10', rechazo(409, 'ULTIMO_ADMINISTRADOR', ULTIMO)));
    const dialogo = await confirmarBaja(ADMINISTRADORA, ADMIN);

    expect(await within(dialogo).findByRole('alert')).toHaveTextContent(ULTIMO);
    expect(screen.queryByText(/quedó dado de baja/)).not.toBeInTheDocument();
  });

  it('quien tiene más permisos: el 403 PRIVILEGIO_AJENO se lee en el diálogo', async () => {
    servidor.use(http.delete('*/api/usuarios/10', rechazo(403, 'PRIVILEGIO_AJENO', AJENO_GESTION)));
    const dialogo = await confirmarBaja(usuario(), GESTORA);

    expect(await within(dialogo).findByRole('alert')).toHaveTextContent(AJENO_GESTION);
    expect(screen.queryByText(/quedó dado de baja/)).not.toBeInTheDocument();
  });
});
