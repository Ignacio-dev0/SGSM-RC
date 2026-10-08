import { useEffect, useState, type FormEvent } from 'react';
import { Box, Button, Paper, Typography } from '@mui/material';
import FaceOutlinedIcon from '@mui/icons-material/FaceOutlined';
import KeyOutlinedIcon from '@mui/icons-material/KeyOutlined';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link as EnlaceRouter, useNavigate, useParams } from 'react-router-dom';
import { ErrorApi, erroresPorCampo, mensajeDeError } from '../../api/cliente';
import type { Usuario } from '../../api/tipos';
import { useRoles, usuariosApi, type DatosUsuario } from '../../api/usuarios';
import { useSesion, useUsuario } from '../../auth/useSesion';
import { AccionesFormulario } from '../../componentes/AccionesFormulario';
import { Alerta } from '../../componentes/Alerta';
import { Boton } from '../../componentes/Boton';
import { CampoContrasena } from '../../componentes/CampoContrasena';
import { CampoTexto } from '../../componentes/CampoTexto';
import { ChipEstado } from '../../componentes/ChipEstado';
import { EncabezadoPagina } from '../../componentes/EncabezadoPagina';
import { Cargando, ErrorDeCarga } from '../../componentes/EstadoDeCarga';
import { ModalConfirmacion } from '../../componentes/ModalConfirmacion';
import { Selector } from '../../componentes/Selector';
import { formatearFechaHora } from '../../utilidades/formato';
import { hayDiferencias, useCambiosSinGuardar } from '../../utilidades/useCambiosSinGuardar';
import { useFocoEnPrimerError } from '../../utilidades/useFocoEnPrimerError';
import { AYUDA_NOMBRE_USUARIO, errorNombreUsuario } from './validacion';

const VACIO: DatosUsuario = {
  nombre: '',
  apellido: '',
  dni: '',
  nombreUsuario: '',
  email: '',
  matricula: '',
  rol: '',
  contrasena: '',
};

const desdeUsuario = (u: Usuario): DatosUsuario => ({
  nombre: u.nombre,
  apellido: u.apellido,
  dni: u.dni,
  nombreUsuario: u.nombreUsuario,
  email: u.email ?? '',
  matricula: u.matricula ?? '',
  rol: u.rol.codigo,
  contrasena: '',
});

/** D110 del servidor: el rol propio no se cambia (responde 403 CAMBIO_PROPIO). */
const AYUDA_ROL_PROPIO = 'Nadie puede cambiar su propio rol: se lo cambia otro administrador.';

/** Campo al que corresponde cada error de conflicto del backend. */
const CAMPO_DEL_CONFLICTO: Record<string, keyof DatosUsuario> = {
  DNI_DUPLICADO: 'dni',
  USUARIO_DUPLICADO: 'nombreUsuario',
};

function validar(d: DatosUsuario, esAlta: boolean) {
  const e: Partial<Record<keyof DatosUsuario, string>> = {};
  if (!d.nombre.trim()) e.nombre = 'Ingrese el nombre';
  if (!d.apellido.trim()) e.apellido = 'Ingrese el apellido';
  if (!d.dni.trim()) e.dni = 'Ingrese el DNI';
  else if (!/^\d{7,8}$/.test(d.dni.trim())) e.dni = 'El DNI debe tener 7 u 8 dígitos, sin puntos';
  const usuario = errorNombreUsuario(d.nombreUsuario);
  if (usuario) e.nombreUsuario = usuario;
  if (!d.rol) e.rol = 'Elija el rol';
  if (esAlta && !d.contrasena) e.contrasena = 'Ingrese una contraseña';
  return e;
}

/** Alta y modificación de usuarios, con la baja lógica (T110 · CU01, CU03, CU04). */
export function FormularioUsuario() {
  const { id } = useParams();
  const esAlta = id === undefined;
  const usuarioId = Number(id);
  const yo = useUsuario();
  const esUnoMismo = !esAlta && usuarioId === yo.id;
  const { tienePermiso } = useSesion();
  const navegar = useNavigate();
  const clienteQuery = useQueryClient();
  const roles = useRoles();

  const existente = useQuery({
    queryKey: ['usuario', usuarioId],
    queryFn: () => usuariosApi.obtener(usuarioId),
    enabled: !esAlta,
  });

  const [datos, setDatos] = useState<DatosUsuario>(VACIO);
  const [errores, setErrores] = useState<Partial<Record<keyof DatosUsuario, string>>>({});
  const { ref: refFormulario, enfocarPrimerError } = useFocoEnPrimerError<HTMLFormElement>();
  const [aviso, setAviso] = useState<string | null>(null);
  const [confirmandoBaja, setConfirmandoBaja] = useState(false);

  useEffect(() => {
    if (existente.data) setDatos(desdeUsuario(existente.data));
  }, [existente.data]);

  // Lo escrito frente a lo que había: un formulario vacío en el alta, el usuario cargado al editar.
  const original = esAlta ? VACIO : existente.data ? desdeUsuario(existente.data) : null;
  const { dialogo, permitirSalida } = useCambiosSinGuardar(
    original !== null && hayDiferencias(datos, original),
  );

  const actualizar = (campo: keyof DatosUsuario) => (valor: string) => {
    setDatos((d) => ({ ...d, [campo]: valor }));
    setErrores((e) => ({ ...e, [campo]: undefined }));
  };

  const mostrarErrorDelServidor = (err: unknown) => {
    const porCampo = erroresPorCampo(err) as Partial<Record<keyof DatosUsuario, string>>;
    if (err instanceof ErrorApi && CAMPO_DEL_CONFLICTO[err.codigo]) {
      porCampo[CAMPO_DEL_CONFLICTO[err.codigo]!] = err.message;
    }
    setErrores(porCampo);
    enfocarPrimerError();
  };

  const guardar = useMutation({
    mutationFn: () => {
      const { contrasena, ...resto } = datos;
      const cuerpo = contrasena ? { ...resto, contrasena } : resto;
      if (esAlta) return usuariosApi.crear(cuerpo);
      // El rol propio no viaja: no se puede cambiar (D110 del servidor · D167).
      const { rol: _rol, ...sinRol } = cuerpo;
      return usuariosApi.modificar(usuarioId, esUnoMismo ? sinRol : cuerpo);
    },
    onSuccess: async (u) => {
      await clienteQuery.invalidateQueries({ queryKey: ['usuarios'] });
      if (esAlta) {
        permitirSalida();
        navegar('/usuarios', { state: { aviso: `Usuario ${u.nombreUsuario} creado` } });
      } else {
        clienteQuery.setQueryData(['usuario', usuarioId], u);
        setAviso('Los cambios se guardaron');
      }
    },
    onError: mostrarErrorDelServidor,
  });

  const reactivar = useMutation({
    mutationFn: () => usuariosApi.reactivar(usuarioId),
    onSuccess: (r) => {
      clienteQuery.setQueryData(['usuario', usuarioId], r);
      void clienteQuery.invalidateQueries({ queryKey: ['usuarios'] });
      setAviso('El usuario se reactivó y puede volver a ingresar al sistema');
    },
  });

  const darDeBaja = useMutation({
    mutationFn: () => usuariosApi.darDeBaja(usuarioId),
    onSuccess: async (u) => {
      setConfirmandoBaja(false);
      clienteQuery.setQueryData(['usuario', usuarioId], u);
      await clienteQuery.invalidateQueries({ queryKey: ['usuarios'] });
      setAviso('El usuario quedó dado de baja y ya no puede ingresar al sistema');
    },
  });

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    setAviso(null);
    const faltan = validar(datos, esAlta);
    setErrores(faltan);
    enfocarPrimerError();
    if (Object.keys(faltan).length === 0) guardar.mutate();
  };

  const u = existente.data;
  const errorGeneral =
    guardar.error && Object.keys(errores).length === 0 ? mensajeDeError(guardar.error) : null;

  return (
    <>
      <EncabezadoPagina
        titulo={esAlta ? 'Nuevo usuario' : u ? `${u.apellido}, ${u.nombre}` : 'Usuario'}
        volverA="/usuarios"
        subtitulo={
          u && (
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
              {u.rol.nombre}
              {!u.activo && <ChipEstado estado="DADO_DE_BAJA" />}
              <span>· Último acceso: {formatearFechaHora(u.ultimoAcceso)}</span>
            </Box>
          )
        }
        acciones={
          u && (
            <>
              <Boton
                variante="secundario"
                startIcon={<KeyOutlinedIcon />}
                onClick={() => navegar(`/usuarios/${usuarioId}/permisos`)}
              >
                Permisos adicionales
              </Boton>
              {tienePermiso('biometria.gestionar') && (
                // Es navegación: un enlace con aspecto de botón secundario.
                <Button
                  variant="outlined"
                  startIcon={<FaceOutlinedIcon />}
                  component={EnlaceRouter}
                  to={`/biometria/${usuarioId}`}
                >
                  Rostro
                </Button>
              )}
              {u.activo && u.id !== yo.id && (
                <Boton variante="peligro" onClick={() => setConfirmandoBaja(true)}>
                  Dar de baja
                </Boton>
              )}
              {!u.activo && (
                <Boton
                  variante="secundario"
                  cargando={reactivar.isPending}
                  onClick={() => reactivar.mutate()}
                >
                  Reactivar
                </Boton>
              )}
            </>
          )
        }
      />

      {reactivar.isError && <Alerta tipo="error">{mensajeDeError(reactivar.error)}</Alerta>}
      {aviso && (
        <Alerta tipo="exito" alCerrar={() => setAviso(null)}>
          {aviso}
        </Alerta>
      )}
      {/* Un rechazo sin campo (PRIVILEGIO_AJENO, ULTIMO_ADMINISTRADOR): arriba, lejos de Guardar,
          así que se lleva a la vista con el foco. */}
      {errorGeneral && (
        <Alerta tipo="error" enfocar>
          {errorGeneral}
        </Alerta>
      )}

      {!esAlta && existente.isError ? (
        <ErrorDeCarga
          que="los datos del usuario"
          error={existente.error}
          alReintentar={() => void existente.refetch()}
        />
      ) : !esAlta && !u ? (
        <Cargando texto="Cargando los datos del usuario…" />
      ) : (
        <Paper
          ref={refFormulario}
          variant="outlined"
          component="form"
          noValidate
          onSubmit={enviar}
          sx={{ p: 3 }}
        >
          <Typography variant="h6" component="h2" sx={{ mb: 2 }}>
            Datos personales
          </Typography>
          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
            <CampoTexto
              etiqueta="Nombre"
              valor={datos.nombre}
              alCambiar={actualizar('nombre')}
              error={errores.nombre}
              required
            />
            <CampoTexto
              etiqueta="Apellido"
              valor={datos.apellido}
              alCambiar={actualizar('apellido')}
              error={errores.apellido}
              required
            />
            <CampoTexto
              etiqueta="DNI"
              valor={datos.dni}
              alCambiar={actualizar('dni')}
              error={errores.dni}
              required
              // El formato se dice de entrada (UX-20a); si falla, el error toma el lugar de la ayuda.
              ayuda="7 u 8 dígitos, sin puntos"
              slotProps={{ htmlInput: { inputMode: 'numeric', maxLength: 8 } }}
            />
            <CampoTexto
              etiqueta="Matrícula"
              valor={datos.matricula}
              alCambiar={actualizar('matricula')}
              error={errores.matricula}
            />
            <CampoTexto
              etiqueta="Email"
              valor={datos.email}
              alCambiar={actualizar('email')}
              error={errores.email}
              type="email"
            />
          </Box>

          <Typography variant="h6" component="h2" sx={{ mt: 4, mb: 2 }}>
            Acceso al sistema
          </Typography>
          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
            <CampoTexto
              etiqueta="Nombre de usuario"
              valor={datos.nombreUsuario}
              alCambiar={actualizar('nombreUsuario')}
              error={errores.nombreUsuario}
              required
              autoCapitalize="none"
              ayuda={AYUDA_NOMBRE_USUARIO}
            />
            {esUnoMismo && u ? (
              // Solo lectura (no deshabilitado): se llega con el teclado y se lee por qué.
              <CampoTexto
                etiqueta="Rol"
                valor={u.rol.nombre}
                alCambiar={() => {}}
                ayuda={AYUDA_ROL_PROPIO}
                slotProps={{ htmlInput: { readOnly: true } }}
              />
            ) : (
              <Selector
                etiqueta="Rol"
                valor={datos.rol}
                alCambiar={actualizar('rol')}
                error={errores.rol}
                required
                textoVacio="Elegir…"
                opciones={(roles.data ?? []).map((r) => ({ valor: r.codigo, etiqueta: r.nombre }))}
              />
            )}
            <CampoContrasena
              etiqueta={esAlta ? 'Contraseña' : 'Contraseña nueva'}
              valor={datos.contrasena ?? ''}
              alCambiar={actualizar('contrasena')}
              error={errores.contrasena}
              required={esAlta}
              autoComplete="new-password"
              ayuda={
                esAlta
                  ? 'Al menos 8 caracteres, con letras y números'
                  : 'Dejar vacío para no cambiarla'
              }
            />
          </Box>

          <AccionesFormulario>
            <Boton variante="texto" onClick={() => navegar('/usuarios')}>
              Cancelar
            </Boton>
            <Boton type="submit" cargando={guardar.isPending}>
              Guardar
            </Boton>
          </AccionesFormulario>
        </Paper>
      )}

      <ModalConfirmacion
        abierto={confirmandoBaja}
        titulo="Dar de baja al usuario"
        mensaje={`${u?.nombre ?? ''} ${u?.apellido ?? ''} (${u?.nombreUsuario ?? ''}) ya no podrá ingresar al sistema. Sus registros anteriores se conservan y se puede reactivar desde esta misma pantalla.`}
        textoConfirmar="Dar de baja"
        peligroso
        cargando={darDeBaja.isPending}
        alConfirmar={() => darDeBaja.mutate()}
        alCancelar={() => setConfirmandoBaja(false)}
      >
        {darDeBaja.isError && <Alerta tipo="error">{mensajeDeError(darDeBaja.error)}</Alerta>}
      </ModalConfirmacion>
      {dialogo}
    </>
  );
}
