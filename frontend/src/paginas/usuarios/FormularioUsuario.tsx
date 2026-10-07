import { useEffect, useState, type FormEvent } from 'react';
import { Box, Chip, Paper, Typography } from '@mui/material';
import KeyOutlinedIcon from '@mui/icons-material/KeyOutlined';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { ErrorApi, erroresPorCampo, mensajeDeError } from '../../api/cliente';
import type { Usuario } from '../../api/tipos';
import { useRoles, usuariosApi, type DatosUsuario } from '../../api/usuarios';
import { useUsuario } from '../../auth/useSesion';
import { Alerta } from '../../componentes/Alerta';
import { Boton } from '../../componentes/Boton';
import { CampoTexto } from '../../componentes/CampoTexto';
import { EncabezadoPagina } from '../../componentes/EncabezadoPagina';
import { Cargando, ErrorDeCarga } from '../../componentes/EstadoDeCarga';
import { ModalConfirmacion } from '../../componentes/ModalConfirmacion';
import { Selector } from '../../componentes/Selector';
import { formatearFechaHora } from '../../utilidades/formato';

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
  if (!d.nombreUsuario.trim()) e.nombreUsuario = 'Ingrese el nombre de usuario';
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
  const [aviso, setAviso] = useState<string | null>(null);
  const [confirmandoBaja, setConfirmandoBaja] = useState(false);

  useEffect(() => {
    if (existente.data) setDatos(desdeUsuario(existente.data));
  }, [existente.data]);

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
  };

  const guardar = useMutation({
    mutationFn: () => {
      const { contrasena, ...resto } = datos;
      const cuerpo = contrasena ? { ...resto, contrasena } : resto;
      return esAlta ? usuariosApi.crear(cuerpo) : usuariosApi.modificar(usuarioId, cuerpo);
    },
    onSuccess: async (u) => {
      await clienteQuery.invalidateQueries({ queryKey: ['usuarios'] });
      if (esAlta) {
        navegar('/usuarios', { state: { aviso: `Usuario ${u.nombreUsuario} creado` } });
      } else {
        clienteQuery.setQueryData(['usuario', usuarioId], u);
        setAviso('Los cambios se guardaron');
      }
    },
    onError: mostrarErrorDelServidor,
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
              {!u.activo && <Chip label="Dado de baja" size="small" />}
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
              {u.activo && u.id !== yo.id && (
                <Boton variante="peligro" onClick={() => setConfirmandoBaja(true)}>
                  Dar de baja
                </Boton>
              )}
            </>
          )
        }
      />

      {aviso && (
        <Alerta tipo="exito" alCerrar={() => setAviso(null)}>
          {aviso}
        </Alerta>
      )}
      {errorGeneral && <Alerta tipo="error">{errorGeneral}</Alerta>}

      {!esAlta && existente.isError ? (
        <ErrorDeCarga
          que="los datos del usuario"
          error={existente.error}
          alReintentar={() => void existente.refetch()}
        />
      ) : !esAlta && !u ? (
        <Cargando texto="Cargando los datos del usuario…" />
      ) : (
        <Paper variant="outlined" component="form" noValidate onSubmit={enviar} sx={{ p: 3 }}>
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
            />
            <Selector
              etiqueta="Rol"
              valor={datos.rol}
              alCambiar={actualizar('rol')}
              error={errores.rol}
              required
              textoVacio="Elegir…"
              opciones={(roles.data ?? []).map((r) => ({ valor: r.codigo, etiqueta: r.nombre }))}
            />
            <CampoTexto
              etiqueta={esAlta ? 'Contraseña' : 'Contraseña nueva'}
              valor={datos.contrasena ?? ''}
              alCambiar={actualizar('contrasena')}
              error={errores.contrasena}
              required={esAlta}
              type="password"
              autoComplete="new-password"
              ayuda={
                esAlta
                  ? 'Al menos 8 caracteres, con letras y números'
                  : 'Dejar vacío para no cambiarla'
              }
            />
          </Box>

          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 4 }}>
            <Boton variante="texto" onClick={() => navegar('/usuarios')}>
              Cancelar
            </Boton>
            <Boton type="submit" cargando={guardar.isPending}>
              Guardar
            </Boton>
          </Box>
        </Paper>
      )}

      <ModalConfirmacion
        abierto={confirmandoBaja}
        titulo="Dar de baja al usuario"
        mensaje={`${u?.nombre ?? ''} ${u?.apellido ?? ''} ya no podrá ingresar al sistema. Sus registros anteriores se conservan.`}
        textoConfirmar="Dar de baja"
        peligroso
        cargando={darDeBaja.isPending}
        alConfirmar={() => darDeBaja.mutate()}
        alCancelar={() => setConfirmandoBaja(false)}
      >
        {darDeBaja.isError && <Alerta tipo="error">{mensajeDeError(darDeBaja.error)}</Alerta>}
      </ModalConfirmacion>
    </>
  );
}
