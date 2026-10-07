import { useEffect, useState } from 'react';
import { Box, Checkbox, FormControlLabel, Paper, Typography } from '@mui/material';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { mensajeDeError } from '../../api/cliente';
import type { Permiso } from '../../api/tipos';
import { usePermisos, usuariosApi } from '../../api/usuarios';
import { Alerta } from '../../componentes/Alerta';
import { Boton } from '../../componentes/Boton';
import { EncabezadoPagina } from '../../componentes/EncabezadoPagina';

const NOMBRE_MODULO: Record<string, string> = {
  usuarios: 'Usuarios',
  biometria: 'Biometría',
  pacientes: 'Pacientes',
  catalogo: 'Catálogo',
  prescripciones: 'Prescripciones',
  suministros: 'Suministros',
};

/**
 * Permisos adicionales de un usuario (T111 · CU05). Los permisos del rol se muestran marcados
 * y bloqueados; el administrador marca los adicionales que necesita esa persona.
 */
export function PermisosUsuario() {
  const usuarioId = Number(useParams().id);
  const clienteQuery = useQueryClient();
  const permisos = usePermisos();
  const usuario = useQuery({
    queryKey: ['usuario', usuarioId],
    queryFn: () => usuariosApi.obtener(usuarioId),
  });
  const [adicionales, setAdicionales] = useState<Set<string>>(new Set());
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    if (usuario.data) setAdicionales(new Set(usuario.data.permisosAdicionales));
  }, [usuario.data]);

  const guardar = useMutation({
    mutationFn: () => usuariosApi.asignarPermisos(usuarioId, [...adicionales].sort()),
    onSuccess: (u) => {
      clienteQuery.setQueryData(['usuario', usuarioId], u);
      void clienteQuery.invalidateQueries({ queryKey: ['usuarios'] });
      setAviso('Los permisos se guardaron. Rigen desde el próximo pedido del usuario.');
    },
  });

  const delRol = new Set(usuario.data?.permisosDelRol ?? []);
  const porModulo = new Map<string, Permiso[]>();
  for (const p of permisos.data ?? []) {
    porModulo.set(p.modulo, [...(porModulo.get(p.modulo) ?? []), p]);
  }

  const alternar = (codigo: string) => {
    setAviso(null);
    setAdicionales((actual) => {
      const nuevo = new Set(actual);
      if (nuevo.has(codigo)) nuevo.delete(codigo);
      else nuevo.add(codigo);
      return nuevo;
    });
  };

  const u = usuario.data;
  return (
    <>
      <EncabezadoPagina
        titulo="Permisos adicionales"
        subtitulo={u && `${u.apellido}, ${u.nombre} · Rol ${u.rol.nombre}`}
        volverA={`/usuarios/${usuarioId}`}
      />
      {aviso && <Alerta tipo="exito">{aviso}</Alerta>}
      {guardar.isError && <Alerta tipo="error">{mensajeDeError(guardar.error)}</Alerta>}
      {usuario.isError && <Alerta tipo="error">{mensajeDeError(usuario.error)}</Alerta>}

      <Typography color="text.secondary" sx={{ mb: 2 }}>
        Los permisos que trae el rol aparecen marcados y no se pueden quitar desde acá. Marque los
        permisos extra que necesita este usuario.
      </Typography>

      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' } }}>
        {[...porModulo.entries()].map(([modulo, lista]) => (
          <Paper key={modulo} variant="outlined" sx={{ p: 2 }}>
            <Typography variant="h6" component="h2">
              {NOMBRE_MODULO[modulo] ?? modulo}
            </Typography>
            {lista.map((p) => (
              <FormControlLabel
                key={p.codigo}
                sx={{ display: 'flex', alignItems: 'flex-start', my: 0.5 }}
                control={
                  <Checkbox
                    checked={delRol.has(p.codigo) || adicionales.has(p.codigo)}
                    disabled={delRol.has(p.codigo)}
                    onChange={() => alternar(p.codigo)}
                  />
                }
                label={
                  <Box sx={{ pt: 1.5 }}>
                    {p.descripcion}
                    {delRol.has(p.codigo) && (
                      <Typography variant="body2" color="text.secondary">
                        Incluido en el rol
                      </Typography>
                    )}
                  </Box>
                }
              />
            ))}
          </Paper>
        ))}
      </Box>

      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 3 }}>
        <Boton onClick={() => guardar.mutate()} cargando={guardar.isPending} disabled={!u}>
          Guardar permisos
        </Boton>
      </Box>
    </>
  );
}
