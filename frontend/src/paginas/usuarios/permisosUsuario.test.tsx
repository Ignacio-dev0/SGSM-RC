import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import type { Permiso, Usuario } from '../../api/tipos';
import { ADMIN } from '../../pruebas/datos';
import { renderizarApp } from '../../pruebas/renderizar';
import { servidor } from '../../pruebas/servidor';

/** Un permiso de cada módulo nuevo de E5 en adelante (y uno de antes, como referencia). */
const PERMISOS: Permiso[] = [
  { codigo: 'pacientes.ver', modulo: 'pacientes', descripcion: 'Buscar pacientes' },
  { codigo: 'recordatorios.ver', modulo: 'recordatorios', descripcion: 'Ver los recordatorios' },
  { codigo: 'estudios.ver', modulo: 'estudios', descripcion: 'Consultar los estudios' },
  { codigo: 'reportes.ver', modulo: 'reportes', descripcion: 'Ver los reportes' },
  { codigo: 'auditoria.ver', modulo: 'auditoria', descripcion: 'Consultar la auditoría' },
];

const usuario: Usuario = {
  id: 10,
  nombreUsuario: 'lgomez',
  dni: '30111222',
  nombre: 'Lucía',
  apellido: 'Gómez',
  email: null,
  matricula: 'ME 2001',
  rol: { codigo: 'ENFERMERO', nombre: 'Enfermero' },
  activo: true,
  fechaBaja: null,
  bloqueadoHasta: null,
  ultimoAcceso: null,
  tieneBiometria: false,
  permisosDelRol: ['pacientes.ver'],
  permisosAdicionales: [],
};

describe('permisos adicionales: cada módulo con su nombre legible', () => {
  it('recordatorios, estudios, reportes y auditoría se nombran como los demás módulos', async () => {
    servidor.use(
      http.get('*/api/permisos', () => HttpResponse.json({ data: PERMISOS })),
      http.get('*/api/usuarios/10', () => HttpResponse.json({ data: usuario })),
    );
    renderizarApp('/usuarios/10/permisos', ADMIN);

    expect(await screen.findByRole('heading', { name: 'Pacientes' })).toBeInTheDocument();
    for (const nombre of ['Recordatorios', 'Estudios', 'Reportes', 'Auditoría']) {
      expect(screen.getByRole('heading', { name: nombre })).toBeInTheDocument();
    }
    for (const codigo of ['recordatorios', 'estudios', 'reportes', 'auditoria']) {
      expect(screen.queryByRole('heading', { name: codigo })).not.toBeInTheDocument();
    }
  });
});

describe('permisos adicionales propios (D110 del servidor)', () => {
  it('se ven pero no se cambian: dice por qué y no ofrece guardar', async () => {
    servidor.use(
      http.get('*/api/permisos', () => HttpResponse.json({ data: PERMISOS })),
      http.get('*/api/usuarios/1', () =>
        HttpResponse.json({
          data: { ...usuario, id: 1, nombre: 'Laura', apellido: 'Méndez' },
        }),
      ),
    );
    renderizarApp('/usuarios/1/permisos', ADMIN);

    expect(
      await screen.findByText(
        'Nadie puede cambiar sus propios permisos adicionales: se los cambia otro administrador.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Guardar permisos' })).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Ver los recordatorios/ })).toBeDisabled();
  });
});
