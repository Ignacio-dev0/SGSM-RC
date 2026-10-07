import { useEffect, useRef, useState } from 'react';
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
import { ErrorDeCarga } from '../../componentes/EstadoDeCarga';
import { ModalConfirmacion } from '../../componentes/ModalConfirmacion';
import { Selector } from '../../componentes/Selector';
import { Tabla, type Columna } from '../../componentes/Tabla';
import { oracionDe, pasosParaProbar } from '../../utilidades/sinResultados';
import { useFiltrosEnUrl } from '../../utilidades/useFiltrosEnUrl';
import { useRetardo } from '../../utilidades/useRetardo';
import { useFocoEnPrimerError } from '../../utilidades/useFocoEnPrimerError';
import { cerrarSinTocarAfuera } from '../../componentes/dialogos';

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
  const [confirmandoBaja, setConfirmandoBaja] = useState(false);
  const { ref: refFormulario, enfocarPrimerError } = useFocoEnPrimerError<HTMLDivElement>();

  const alFallar = (err: unknown) => {
    const porCampo = erroresPorCampo(err) as Partial<Record<keyof DatosInsumo, string>>;
    if (err instanceof ErrorApi && err.codigo === 'INSUMO_DUPLICADO') porCampo.nombre = err.message;
    setErrores(porCampo);
    enfocarPrimerError();
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
    onSuccess: (i) => {
      setConfirmandoBaja(false);
      alTerminar(
        i.activo
          ? `${i.nombre} volvió a estar activo`
          : `${i.nombre} fue dado de baja del catálogo`,
      );
    },
  });
  const { reset: olvidarErrorAlGuardar } = guardar;
  const { reset: olvidarErrorDeEstado } = cambiarEstado;

  // Cada vez que el diálogo se abre, se cierra o pasa a otro insumo arranca limpio: sin la
  // confirmación de baja del insumo anterior y sin errores de intentos anteriores.
  useEffect(() => {
    setConfirmandoBaja(false);
    olvidarErrorAlGuardar();
    olvidarErrorDeEstado();
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
  }, [abierto, insumo, olvidarErrorAlGuardar, olvidarErrorDeEstado]);

  const enviar = () => {
    const faltan = {
      ...(datos.nombre.trim() ? {} : { nombre: 'Ingrese el nombre' }),
      ...(datos.unidadMedida.trim() ? {} : { unidadMedida: 'Ingrese la unidad de medida' }),
    };
    setErrores(faltan);
    enfocarPrimerError();
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
  const errorAlGuardar =
    guardar.isError && Object.keys(errores).length === 0 ? guardar.error : null;
  // La baja se confirma en su propio modal: si falla, el error se ve ahí (y no en el diálogo de
  // atrás, que queda tapado). Reactivar no pide confirmación: su error va en este diálogo.
  const error = errorAlGuardar ?? (confirmandoBaja ? null : cambiarEstado.error);

  return (
    <Dialog
      open={abierto}
      onClose={cerrarSinTocarAfuera(alCerrar)}
      fullWidth
      maxWidth="sm"
      aria-labelledby="titulo-insumo"
    >
      <DialogTitle id="titulo-insumo">
        {/* Glosario: "insumo" es solo lo no medicinal; el título dice qué se agrega. */}
        {insumo ? 'Editar' : 'Nuevo'} {datos.tipo === 'MEDICAMENTO' ? 'medicamento' : 'insumo'}
      </DialogTitle>
      <DialogContent ref={refFormulario} sx={{ display: 'grid', gap: 2, pt: '8px !important' }}>
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
            onClick={() => (insumo.activo ? setConfirmandoBaja(true) : cambiarEstado.mutate())}
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
      {insumo && (
        <ModalConfirmacion
          abierto={confirmandoBaja}
          titulo={`Dar de baja ${insumo.nombre}`}
          mensaje="Deja de aparecer para prescribir y para registrar suministros. Las prescripciones y los registros que ya lo usan no cambian, y se puede reactivar desde el catálogo."
          textoConfirmar="Dar de baja"
          peligroso
          cargando={cambiarEstado.isPending}
          alConfirmar={() => cambiarEstado.mutate()}
          alCancelar={() => {
            setConfirmandoBaja(false);
            olvidarErrorDeEstado();
          }}
        >
          {cambiarEstado.isError && (
            <Box sx={{ mt: 2 }}>
              <Alerta tipo="error">{mensajeDeError(cambiarEstado.error)}</Alerta>
            </Box>
          )}
        </ModalConfirmacion>
      )}
    </Dialog>
  );
}

/** Vista inicial: lo activo de todo tipo, sin búsqueda. Lo que se aparta de esto va en la URL. */
const FILTROS_INICIALES = { texto: '', tipo: '', activo: 'true' };

/** Qué no se encontró y qué probar: la causa y el paso siguiente, con lo que se buscó. */
function mensajeSinInsumos({ texto, tipo, activo }: typeof FILTROS_INICIALES, conFiltros: boolean) {
  const buscado = texto.trim();
  const que =
    tipo === 'MEDICAMENTO'
      ? 'medicamentos'
      : tipo === 'INSUMO'
        ? 'insumos'
        : 'insumos ni medicamentos';
  const causa = oracionDe([
    'No hay',
    que,
    activo === 'true' ? 'activos' : activo === 'false' ? 'dados de baja' : '',
    buscado && `que coincidan con «${buscado}»`,
  ]);
  if (!conFiltros) return `${causa} Use «Agregar al catálogo» para cargar uno.`;
  const pasos = pasosParaProbar([
    buscado && 'pruebe con otro nombre',
    tipo && 'cambie Tipo a Todos',
    activo !== 'true' && 'cambie Estado a Activos',
  ]);
  return `${causa} ${pasos}`;
}

/**
 * Administración del catálogo de insumos y medicamentos (T303). Los filtros viven en la URL:
 * la búsqueda sigue ahí al volver a la pantalla.
 */
export function CatalogoInsumos() {
  const clienteQuery = useQueryClient();
  const filtros = useFiltrosEnUrl(FILTROS_INICIALES);
  const { texto, tipo, activo } = filtros.valores;
  const [dialogo, setDialogo] = useState<{ insumo: Insumo | null } | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const textoBuscado = useRetardo(texto);
  const campoBusqueda = useRef<HTMLInputElement>(null);

  // Al escribir se espera a que termine de tipear; al vaciar el campo se aplica enseguida.
  const aplicados = { texto: texto ? textoBuscado : '', tipo, activo };
  const consulta = useQuery({
    queryKey: ['insumos', aplicados],
    queryFn: () => insumosApi.listar({ ...aplicados, tipo: tipo as TipoInsumo | '' }),
  });

  // Solo con la respuesta ya asentada y sin error: un fallo de carga no es "no hay insumos".
  const sinResultados = consulta.isSuccess && !consulta.isFetching && consulta.data.length === 0;
  const conFiltros = filtros.hayFiltros(aplicados);
  const quitarFiltros = () => {
    filtros.quitarFiltros();
    // El botón desaparece al recargar la lista: el foco pasa al campo para buscar de nuevo.
    campoBusqueda.current?.focus();
  };

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
          alCambiar={(v) => filtros.fijar({ texto: v })}
          type="search"
          inputRef={campoBusqueda}
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
          alCambiar={(v) => filtros.fijar({ tipo: v })}
          opciones={[
            { valor: '', etiqueta: 'Todos' },
            { valor: 'MEDICAMENTO', etiqueta: 'Medicamentos' },
            { valor: 'INSUMO', etiqueta: 'Insumos' },
          ]}
        />
        <Selector
          etiqueta="Estado"
          valor={activo}
          alCambiar={(v) => filtros.fijar({ activo: v })}
          opciones={[
            { valor: 'true', etiqueta: 'Activos' },
            { valor: 'false', etiqueta: 'Dados de baja' },
          ]}
        />
      </Box>
      {consulta.isError ? (
        // Un fallo de carga no se lee como "no hay insumos": sin tabla ni mensaje de vacío.
        <ErrorDeCarga
          que="el catálogo"
          error={consulta.error}
          alReintentar={() => void consulta.refetch()}
        />
      ) : (
        <Tabla
          titulo="Catálogo"
          columnas={COLUMNAS}
          filas={consulta.data ?? []}
          claveFila={(i) => i.id}
          cargando={consulta.isFetching}
          mensajeVacio={mensajeSinInsumos(aplicados, conFiltros)}
          alTocarFila={(i) => setDialogo({ insumo: i })}
        />
      )}
      {sinResultados && conFiltros && (
        <Box
          role="group"
          aria-label="Qué puede hacer ahora"
          sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 2 }}
        >
          <Boton variante="secundario" onClick={quitarFiltros}>
            Quitar filtros
          </Boton>
          <Boton startIcon={<AddIcon />} onClick={() => setDialogo({ insumo: null })}>
            Agregar al catálogo
          </Boton>
        </Box>
      )}
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
