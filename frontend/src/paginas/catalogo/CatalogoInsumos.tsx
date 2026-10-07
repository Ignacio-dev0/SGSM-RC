import { useEffect, useState } from 'react';
import {
  Box,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  InputAdornment,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ErrorApi, erroresPorCampo, mensajeDeError } from '../../api/cliente';
import { insumosApi, type DatosInsumo } from '../../api/prescripciones';
import type { Insumo, TipoInsumo } from '../../api/tipos';
import { Alerta } from '../../componentes/Alerta';
import { Boton } from '../../componentes/Boton';
import { CampoTexto } from '../../componentes/CampoTexto';
import { EncabezadoPagina } from '../../componentes/EncabezadoPagina';
import { Selector } from '../../componentes/Selector';
import { Tabla, type Columna } from '../../componentes/Tabla';
import { useRetardo } from '../../utilidades/useRetardo';

const TIPOS = [
  { valor: 'MEDICAMENTO', etiqueta: 'Medicamento' },
  { valor: 'INSUMO', etiqueta: 'Insumo no medicinal' },
];

const COLUMNAS: Columna<Insumo>[] = [
  { titulo: 'Nombre', valor: (i) => <strong>{i.nombre}</strong> },
  { titulo: 'Tipo', valor: (i) => (i.tipo === 'MEDICAMENTO' ? 'Medicamento' : 'Insumo') },
  { titulo: 'Presentación', valor: (i) => i.presentacion || '—' },
  { titulo: 'Unidad', valor: (i) => i.unidadMedida },
  {
    titulo: 'Estado',
    valor: (i) =>
      i.activo ? (
        <Chip size="small" label="Activo" color="success" variant="outlined" />
      ) : (
        <Chip size="small" label="Dado de baja" />
      ),
  },
];

const VACIO: DatosInsumo = { nombre: '', tipo: 'MEDICAMENTO', unidadMedida: '', presentacion: '' };

interface PropsDialogo {
  /** null = alta; un insumo = edición. */
  insumo: Insumo | null;
  abierto: boolean;
  alCerrar: () => void;
  alTerminar: (mensaje: string) => void;
}

function DialogoInsumo({ insumo, abierto, alCerrar, alTerminar }: PropsDialogo) {
  const [datos, setDatos] = useState<DatosInsumo>(VACIO);
  const [errores, setErrores] = useState<Partial<Record<keyof DatosInsumo, string>>>({});

  useEffect(() => {
    if (abierto) {
      setDatos(
        insumo
          ? {
              nombre: insumo.nombre,
              tipo: insumo.tipo,
              unidadMedida: insumo.unidadMedida,
              presentacion: insumo.presentacion,
            }
          : VACIO,
      );
      setErrores({});
    }
  }, [abierto, insumo]);

  const alFallar = (err: unknown) => {
    const porCampo = erroresPorCampo(err) as Partial<Record<keyof DatosInsumo, string>>;
    if (err instanceof ErrorApi && err.codigo === 'INSUMO_DUPLICADO') porCampo.nombre = err.message;
    setErrores(porCampo);
  };

  const guardar = useMutation({
    mutationFn: () => (insumo ? insumosApi.modificar(insumo.id, datos) : insumosApi.crear(datos)),
    onSuccess: (i) =>
      alTerminar(
        insumo ? `Se guardaron los cambios de ${i.nombre}` : `${i.nombre} agregado al catálogo`,
      ),
    onError: alFallar,
  });
  const cambiarEstado = useMutation({
    mutationFn: () =>
      insumo!.activo
        ? insumosApi.darDeBaja(insumo!.id)
        : insumosApi.modificar(insumo!.id, { activo: true }),
    onSuccess: (i) =>
      alTerminar(
        i.activo
          ? `${i.nombre} volvió a estar activo`
          : `${i.nombre} fue dado de baja del catálogo`,
      ),
  });

  const enviar = () => {
    const faltan = {
      ...(datos.nombre.trim() ? {} : { nombre: 'Ingrese el nombre' }),
      ...(datos.unidadMedida.trim() ? {} : { unidadMedida: 'Ingrese la unidad de medida' }),
    };
    setErrores(faltan);
    if (Object.keys(faltan).length === 0) guardar.mutate();
  };
  const campo = (c: keyof DatosInsumo) => ({
    valor: datos[c],
    alCambiar: (v: string) => {
      setDatos((d) => ({ ...d, [c]: v }));
      setErrores((e) => ({ ...e, [c]: undefined }));
    },
    error: errores[c],
  });
  const error =
    guardar.isError && Object.keys(errores).length === 0 ? guardar.error : cambiarEstado.error;

  return (
    <Dialog
      open={abierto}
      onClose={alCerrar}
      fullWidth
      maxWidth="sm"
      aria-labelledby="titulo-insumo"
    >
      <DialogTitle id="titulo-insumo">
        {/* Glosario: "insumo" es solo lo no medicinal; el título dice qué se agrega. */}
        {insumo ? 'Editar' : 'Nuevo'} {datos.tipo === 'MEDICAMENTO' ? 'medicamento' : 'insumo'}
      </DialogTitle>
      <DialogContent sx={{ display: 'grid', gap: 2, pt: '8px !important' }}>
        {error ? <Alerta tipo="error">{mensajeDeError(error)}</Alerta> : null}
        <CampoTexto etiqueta="Nombre" {...campo('nombre')} required />
        <Selector
          etiqueta="Tipo"
          {...campo('tipo')}
          alCambiar={(v) => setDatos((d) => ({ ...d, tipo: v as TipoInsumo }))}
          opciones={TIPOS}
          required
        />
        <CampoTexto
          etiqueta="Unidad de medida"
          {...campo('unidadMedida')}
          required
          ayuda="Cómo se registra el consumo: mg, ml, comprimido, unidad…"
        />
        <CampoTexto
          etiqueta="Presentación"
          {...campo('presentacion')}
          ayuda="Por ejemplo: Comprimidos 500 mg, Paquete x 10"
        />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 3, gap: 1 }}>
        {insumo && (
          <Boton
            variante={insumo.activo ? 'peligro' : 'secundario'}
            cargando={cambiarEstado.isPending}
            onClick={() => cambiarEstado.mutate()}
            sx={{ mr: 'auto' }}
          >
            {insumo.activo ? 'Dar de baja' : 'Reactivar'}
          </Boton>
        )}
        <Boton variante="texto" onClick={alCerrar}>
          Cancelar
        </Boton>
        <Boton cargando={guardar.isPending} onClick={enviar}>
          Guardar
        </Boton>
      </DialogActions>
    </Dialog>
  );
}

/** Administración del catálogo de insumos y medicamentos (T303). */
export function CatalogoInsumos() {
  const clienteQuery = useQueryClient();
  const [texto, setTexto] = useState('');
  const [tipo, setTipo] = useState<TipoInsumo | ''>('');
  const [activo, setActivo] = useState('true');
  const [dialogo, setDialogo] = useState<{ insumo: Insumo | null } | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const textoBuscado = useRetardo(texto);

  const filtros = { texto: textoBuscado, tipo, activo };
  const consulta = useQuery({
    queryKey: ['insumos', filtros],
    queryFn: () => insumosApi.listar(filtros),
  });

  return (
    <>
      <EncabezadoPagina
        titulo="Catálogo de insumos y medicamentos"
        acciones={
          <Boton startIcon={<AddIcon />} onClick={() => setDialogo({ insumo: null })}>
            Agregar al catálogo
          </Boton>
        }
      />
      {aviso && (
        <Alerta tipo="exito" alCerrar={() => setAviso(null)}>
          {aviso}
        </Alerta>
      )}
      {consulta.isError && <Alerta tipo="error">{mensajeDeError(consulta.error)}</Alerta>}
      <Box
        sx={{
          display: 'grid',
          gap: 2,
          gridTemplateColumns: { xs: '1fr', md: '2fr 1fr 1fr' },
          mb: 2,
        }}
      >
        <CampoTexto
          etiqueta="Buscar por nombre"
          valor={texto}
          alCambiar={setTexto}
          type="search"
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              ),
            },
          }}
        />
        <Selector
          etiqueta="Tipo"
          valor={tipo}
          alCambiar={(v) => setTipo(v as TipoInsumo | '')}
          opciones={[
            { valor: '', etiqueta: 'Todos' },
            { valor: 'MEDICAMENTO', etiqueta: 'Medicamentos' },
            { valor: 'INSUMO', etiqueta: 'Insumos' },
          ]}
        />
        <Selector
          etiqueta="Estado"
          valor={activo}
          alCambiar={setActivo}
          opciones={[
            { valor: 'true', etiqueta: 'Activos' },
            { valor: 'false', etiqueta: 'Dados de baja' },
          ]}
        />
      </Box>
      <Tabla
        titulo="Catálogo"
        columnas={COLUMNAS}
        filas={consulta.data ?? []}
        claveFila={(i) => i.id}
        cargando={consulta.isFetching}
        mensajeVacio="No hay insumos que coincidan"
        alTocarFila={(i) => setDialogo({ insumo: i })}
      />
      <DialogoInsumo
        insumo={dialogo?.insumo ?? null}
        abierto={dialogo !== null}
        alCerrar={() => setDialogo(null)}
        alTerminar={(mensaje) => {
          setDialogo(null);
          setAviso(mensaje);
          void clienteQuery.invalidateQueries({ queryKey: ['insumos'] });
        }}
      />
    </>
  );
}
