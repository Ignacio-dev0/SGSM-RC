import { Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { ConPermiso, RutaProtegida } from './auth/RutaProtegida';
import { pantallaDiferida, type PantallaDiferida } from './componentes/cargaDiferida';
import { LimiteDeCarga } from './componentes/LimiteDeCarga';
import { Disposicion } from './navegacion/Disposicion';
import { usePrecargaAlApuntar, type SeccionPrecargable } from './navegacion/precarga';
import { Ingreso } from './paginas/Ingreso';
import { Inicio } from './paginas/Inicio';
import { NoEncontrada } from './paginas/NoEncontrada';
import { CargaPrescripcion } from './paginas/prescripciones/CargaPrescripcion';
import { DetallePrescripcion } from './paginas/prescripciones/DetallePrescripcion';
import { PanelRecordatorios } from './paginas/recordatorios/PanelRecordatorios';
import { AdministracionMedicamento } from './paginas/suministros/AdministracionMedicamento';
import { HistorialSuministros } from './paginas/suministros/HistorialSuministros';
import { RegistroInsumos } from './paginas/suministros/RegistroInsumos';
import { BusquedaPacientes } from './paginas/pacientes/BusquedaPacientes';
import { EdicionPaciente } from './paginas/pacientes/EdicionPaciente';
import { FichaPaciente } from './paginas/pacientes/FichaPaciente';
import { RegistroPaciente } from './paginas/pacientes/RegistroPaciente';

// Lo de todos los días al lado de la cama va en el código inicial. Reportes (con los gráficos),
// auditoría y gestión se descargan al abrirlos o al apuntar a su enlace (T702 · RNF03).
const Reportes = pantallaDiferida(() => import('./paginas/reportes/Reportes'), 'Reportes');
const Auditoria = pantallaDiferida(() => import('./paginas/auditoria/Auditoria'), 'Auditoria');
const CatalogoInsumos = pantallaDiferida(
  () => import('./paginas/catalogo/CatalogoInsumos'),
  'CatalogoInsumos',
);
const GestionBiometria = pantallaDiferida(
  () => import('./paginas/biometria/GestionBiometria'),
  'GestionBiometria',
);
const PruebaReconocimiento = pantallaDiferida(
  () => import('./paginas/biometria/PruebaReconocimiento'),
  'PruebaReconocimiento',
);
const RostroUsuario = pantallaDiferida(
  () => import('./paginas/biometria/RostroUsuario'),
  'RostroUsuario',
);
const ListaUsuarios = pantallaDiferida(
  () => import('./paginas/usuarios/ListaUsuarios'),
  'ListaUsuarios',
);
const FormularioUsuario = pantallaDiferida(
  () => import('./paginas/usuarios/FormularioUsuario'),
  'FormularioUsuario',
);
const PermisosUsuario = pantallaDiferida(
  () => import('./paginas/usuarios/PermisosUsuario'),
  'PermisosUsuario',
);

const seccion = (ruta: string, ...pantallas: PantallaDiferida[]): SeccionPrecargable => ({
  ruta,
  precargar: () => pantallas.forEach((p) => p.precargar()),
});

const SECCIONES_DIFERIDAS = [
  seccion('/reportes', Reportes),
  seccion('/auditoria', Auditoria),
  seccion('/catalogo', CatalogoInsumos),
  seccion('/biometria', GestionBiometria, PruebaReconocimiento, RostroUsuario),
  seccion('/usuarios', ListaUsuarios, FormularioUsuario, PermisosUsuario),
];

/**
 * Contenido de las pantallas con sesión. Mientras llega el código de una pantalla diferida, ella
 * misma muestra el Cargando de siempre en el lugar del contenido (el menú y la barra no se
 * mueven); si no llega, LimiteDeCarga lo explica y ofrece Reintentar.
 */
function ContenidoDiferido() {
  usePrecargaAlApuntar(SECCIONES_DIFERIDAS);
  const { pathname } = useLocation();
  return (
    <LimiteDeCarga clave={pathname}>
      <Outlet />
    </LimiteDeCarga>
  );
}

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
        <Route element={<ContenidoDiferido />}>
          <Route index element={<Inicio />} />
          <Route
            path="recordatorios"
            element={
              <ConPermiso permiso="recordatorios.ver">
                <PanelRecordatorios />
              </ConPermiso>
            }
          />
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
            path="suministros"
            element={
              <ConPermiso permiso="suministros.ver">
                <Outlet />
              </ConPermiso>
            }
          >
            <Route index element={<HistorialSuministros />} />
            <Route
              path="medicamento"
              element={
                <ConPermiso permiso="suministros.registrar">
                  <AdministracionMedicamento />
                </ConPermiso>
              }
            />
            <Route
              path="insumos"
              element={
                <ConPermiso permiso="suministros.registrar">
                  <RegistroInsumos />
                </ConPermiso>
              }
            />
          </Route>
          <Route
            path="reportes"
            element={
              <ConPermiso permiso="reportes.ver">
                <Reportes />
              </ConPermiso>
            }
          />
          <Route
            path="auditoria"
            element={
              <ConPermiso permiso="auditoria.ver">
                <Auditoria />
              </ConPermiso>
            }
          />
          <Route
            path="biometria"
            element={
              <ConPermiso permiso="biometria.gestionar">
                <Outlet />
              </ConPermiso>
            }
          >
            <Route index element={<GestionBiometria />} />
            <Route path="prueba" element={<PruebaReconocimiento />} />
            <Route path=":id" element={<RostroUsuario />} />
          </Route>
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
          {/* Dentro de la disposición: con sesión se ve el menú; sin sesión, RutaProtegida lleva al ingreso. */}
          <Route path="*" element={<NoEncontrada />} />
        </Route>
      </Route>
    </Routes>
  );
}
