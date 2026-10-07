import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { ConPermiso, RutaProtegida } from './auth/RutaProtegida';
import { Disposicion } from './navegacion/Disposicion';
import { Ingreso } from './paginas/Ingreso';
import { CatalogoInsumos } from './paginas/catalogo/CatalogoInsumos';
import { Inicio } from './paginas/Inicio';
import { CargaPrescripcion } from './paginas/prescripciones/CargaPrescripcion';
import { DetallePrescripcion } from './paginas/prescripciones/DetallePrescripcion';
import { BusquedaPacientes } from './paginas/pacientes/BusquedaPacientes';
import { EdicionPaciente } from './paginas/pacientes/EdicionPaciente';
import { FichaPaciente } from './paginas/pacientes/FichaPaciente';
import { RegistroPaciente } from './paginas/pacientes/RegistroPaciente';
import { FormularioUsuario } from './paginas/usuarios/FormularioUsuario';
import { ListaUsuarios } from './paginas/usuarios/ListaUsuarios';
import { PermisosUsuario } from './paginas/usuarios/PermisosUsuario';

/** Mapa de pantallas. Cada ruta con datos sensibles exige además su permiso. */
export function RutasApp() {
  return (
    <Routes>
      <Route path="/ingresar" element={<Ingreso />} />
      <Route
        element={
          <RutaProtegida>
            <Disposicion />
          </RutaProtegida>
        }
      >
        <Route index element={<Inicio />} />
        <Route
          path="pacientes"
          element={
            <ConPermiso permiso="pacientes.ver">
              <Outlet />
            </ConPermiso>
          }
        >
          <Route index element={<BusquedaPacientes />} />
          <Route
            path="nuevo"
            element={
              <ConPermiso permiso="pacientes.gestionar">
                <RegistroPaciente />
              </ConPermiso>
            }
          />
          <Route path=":id" element={<FichaPaciente />} />
          <Route
            path=":id/prescripciones/nueva"
            element={
              <ConPermiso permiso="prescripciones.gestionar">
                <CargaPrescripcion />
              </ConPermiso>
            }
          />
          <Route
            path=":id/editar"
            element={
              <ConPermiso permiso="pacientes.gestionar">
                <EdicionPaciente />
              </ConPermiso>
            }
          />
        </Route>
        <Route
          path="prescripciones/:id"
          element={
            <ConPermiso permiso="prescripciones.ver">
              <DetallePrescripcion />
            </ConPermiso>
          }
        />
        <Route
          path="catalogo"
          element={
            <ConPermiso permiso="catalogo.gestionar">
              <CatalogoInsumos />
            </ConPermiso>
          }
        />
        <Route
          path="usuarios"
          element={
            <ConPermiso permiso="usuarios.gestionar">
              <Outlet />
            </ConPermiso>
          }
        >
          <Route index element={<ListaUsuarios />} />
          <Route path="nuevo" element={<FormularioUsuario />} />
          <Route path=":id" element={<FormularioUsuario key="edicion" />} />
          <Route path=":id/permisos" element={<PermisosUsuario />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
