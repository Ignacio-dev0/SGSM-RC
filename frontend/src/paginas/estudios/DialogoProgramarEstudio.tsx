import { useId, useState, type FormEvent } from 'react';
import { Box, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ErrorApi, erroresPorCampo, mensajeDeError } from '../../api/cliente';
import { estudiosApi, useTiposEstudio, type TipoEstudio } from '../../api/estudios';
import type { Paciente } from '../../api/tipos';
import { Alerta } from '../../componentes/Alerta';
import { Boton } from '../../componentes/Boton';
import { CampoTexto } from '../../componentes/CampoTexto';
import { cerrarSinTocarAfuera } from '../../componentes/dialogos';
import { Selector } from '../../componentes/Selector';
import { isoDeCampoFechaHora } from '../../utilidades/campoFechaHora';
import { useFocoEnPrimerError } from '../../utilidades/useFocoEnPrimerError';
import {
  ayudaDeFecha,
  errorDeFecha,
  errorDelServidor,
  fechaYHora,
  identidad,
  pacienteDelEstudio,
} from './etiquetas';
import { useRefrescarEstudios, type ResultadoEstudio } from './useRefrescarEstudios';

interface Formulario {
  tipoId: string;
  fecha: string;
  nombre: string;
  preparacion: string;
  observaciones: string;
}

type Errores = Partial<Record<keyof Formulario, string>>;

const VACIO: Formulario = { tipoId: '', fecha: '', nombre: '', preparacion: '', observaciones: '' };

/** Campo de la API → campo del formulario, para ubicar los errores de validación del servidor. */
const CAMPO: Record<string, keyof Formulario> = { tipoEstudioId: 'tipoId', fechaHora: 'fecha' };

/** Un texto precargado del tipo anterior (o vacío) se reemplaza al cambiar de tipo; uno escrito a mano, no. */
const esPrecargado = (texto: string, delTipoAnterior: string | null | undefined) =>
  texto.trim() === '' || texto === (delTipoAnterior ?? '');

function validar(f: Formulario): Errores {
  const fecha = errorDeFecha(f.fecha);
  return {
    ...(f.tipoId ? {} : { tipoId: 'Elija el tipo de estudio' }),
    ...(fecha ? { fecha } : {}),
  };
}

/**
 * Programar un estudio (T511 · S15): tipo del catálogo, fecha y hora, y nombre y preparación que
 * se precargan del tipo y se pueden precisar (D27). Solo a pacientes internados.
 */
export function DialogoProgramarEstudio({
  paciente,
  alCerrar,
  alTerminar,
}: {
  paciente: Paciente;
  alCerrar: () => void;
  alTerminar: (r: ResultadoEstudio) => void;
}) {
  const idTitulo = useId();
  const clienteQuery = useQueryClient();
  const refrescar = useRefrescarEstudios();
  const tipos = useTiposEstudio();
  const [f, setF] = useState<Formulario>(VACIO);
  const [errores, setErrores] = useState<Errores>({});
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const { ref, enfocarPrimerError } = useFocoEnPrimerError<HTMLFormElement>();

  const tipoPorId = (id: string): TipoEstudio | undefined =>
    tipos.data?.find((t) => String(t.id) === id);

  const cambiar = (campo: keyof Formulario) => (valor: string) => {
    setF((actual) => ({ ...actual, [campo]: valor }));
    setErrores((e) => ({
      ...e,
      // La fecha se revisa mientras se elige (es lo que más se equivoca); el resto, al enviar.
      [campo]: campo === 'fecha' && valor ? errorDeFecha(valor) : undefined,
    }));
  };

  const cambiarTipo = (valor: string) => {
    const anterior = tipoPorId(f.tipoId);
    const nuevo = tipoPorId(valor);
    setF((actual) => ({
      ...actual,
      tipoId: valor,
      nombre: esPrecargado(actual.nombre, anterior?.nombre) ? (nuevo?.nombre ?? '') : actual.nombre,
      preparacion: esPrecargado(actual.preparacion, anterior?.preparacionPorDefecto)
        ? (nuevo?.preparacionPorDefecto ?? '')
        : actual.preparacion,
    }));
    setErrores((e) => ({ ...e, tipoId: undefined }));
  };

  const programar = useMutation({
    mutationFn: () =>
      estudiosApi.programar(paciente.id, {
        tipoEstudioId: Number(f.tipoId),
        fechaHora: isoDeCampoFechaHora(f.fecha),
        // Vacío: el del tipo. Preparación vacía: sin preparación (D27).
        nombre: f.nombre.trim() || undefined,
        preparacion: f.preparacion.trim() || null,
        observaciones: f.observaciones.trim() || null,
      }),
    onSuccess: (e) => {
      refrescar(e);
      alTerminar({
        tipo: 'exito',
        texto: `Se programó ${e.nombre} para el ${fechaYHora(e.fechaHora)}.`,
        estudio: e,
      });
    },
    onError: (err) => {
      const porCampo: Errores = {};
      for (const [campo, mensaje] of Object.entries(erroresPorCampo(err))) {
        porCampo[CAMPO[campo] ?? (campo as keyof Formulario)] = mensaje;
      }
      const { campo, texto } = errorDelServidor(err);
      if (campo) porCampo[campo === 'tipo' ? 'tipoId' : 'fecha'] = texto;
      if (err instanceof ErrorApi && err.codigo === 'TIPO_ESTUDIO_NO_DISPONIBLE') {
        // El que se dio de baja deja de aparecer en la lista.
        void tipos.refetch();
      }
      if (err instanceof ErrorApi && err.codigo === 'PACIENTE_NO_INTERNADO') {
        void clienteQuery.invalidateQueries({ queryKey: ['paciente', paciente.id] });
      }
      setErrores(porCampo);
      setErrorGeneral(Object.keys(porCampo).length === 0 ? texto : null);
      enfocarPrimerError();
    },
  });

  const enviar = (evento: FormEvent) => {
    evento.preventDefault();
    const faltan = validar(f);
    setErrores(faltan);
    setErrorGeneral(null);
    enfocarPrimerError();
    if (Object.keys(faltan).length === 0) programar.mutate();
  };

  return (
    <Dialog
      open
      onClose={programar.isPending ? undefined : cerrarSinTocarAfuera(alCerrar)}
      fullWidth
      maxWidth="sm"
      aria-labelledby={idTitulo}
    >
      <Box
        ref={ref}
        component="form"
        noValidate
        onSubmit={enviar}
        // El contenido se desplaza y el título y los botones quedan a la vista.
        sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}
      >
        <DialogTitle id={idTitulo}>Programar estudio</DialogTitle>
        <DialogContent>
          {/* A quién se le programa: el nombre, el DNI y la cama, siempre juntos. */}
          <Typography sx={{ fontWeight: 700, mb: 2 }}>
            {identidad(pacienteDelEstudio(paciente))}
          </Typography>
          {errorGeneral && (
            // Arriba, lejos del botón tocado: se lleva a la vista y toma el foco (E5-10).
            <Alerta tipo="error" enfocar>
              {errorGeneral}
            </Alerta>
          )}
          <Box
            sx={{
              display: 'grid',
              gap: 2,
              // Una sola columna en teléfono; tipo y fecha lado a lado desde tablet.
              gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
            }}
          >
            <Selector
              etiqueta="Tipo de estudio"
              valor={f.tipoId}
              alCambiar={cambiarTipo}
              error={
                errores.tipoId ??
                (tipos.isError
                  ? `No se pudo cargar la lista de tipos de estudio. ${mensajeDeError(tipos.error)}`
                  : undefined)
              }
              alReintentar={() => void tipos.refetch()}
              errorDeCarga={tipos.isError}
              reintentando={tipos.isFetching}
              required
              textoVacio={tipos.isLoading ? 'Cargando tipos de estudio…' : 'Elegir…'}
              opciones={(tipos.data ?? []).map((t) => ({
                valor: String(t.id),
                etiqueta: t.nombre,
              }))}
            />
            <CampoTexto
              etiqueta="Fecha y hora"
              valor={f.fecha}
              alCambiar={cambiar('fecha')}
              error={errores.fecha}
              ayuda={ayudaDeFecha(f.fecha)}
              required
              type="datetime-local"
              slotProps={{ inputLabel: { shrink: true } }}
            />
            <CampoTexto
              etiqueta="Nombre del estudio (opcional)"
              valor={f.nombre}
              alCambiar={cambiar('nombre')}
              error={errores.nombre}
              ayuda="Se completa con el tipo; puede precisarlo (por ejemplo, «Rx de tórax frente y perfil»)"
              slotProps={{ htmlInput: { maxLength: 120 } }}
              sx={{ gridColumn: '1 / -1' }}
            />
            <CampoTexto
              etiqueta="Preparación (opcional)"
              valor={f.preparacion}
              alCambiar={cambiar('preparacion')}
              error={errores.preparacion}
              ayuda="La del tipo de estudio; puede cambiarla o borrarla"
              multiline
              minRows={2}
              slotProps={{ htmlInput: { maxLength: 500 } }}
              sx={{ gridColumn: '1 / -1' }}
            />
            <CampoTexto
              etiqueta="Observaciones (opcional)"
              valor={f.observaciones}
              alCambiar={cambiar('observaciones')}
              error={errores.observaciones}
              ayuda="Por ejemplo: trasladar en silla de ruedas"
              multiline
              minRows={2}
              slotProps={{ htmlInput: { maxLength: 500 } }}
              sx={{ gridColumn: '1 / -1' }}
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 3, gap: 1, flexWrap: 'wrap' }}>
          <Boton variante="texto" onClick={alCerrar} disabled={programar.isPending}>
            Cancelar
          </Boton>
          <Boton type="submit" cargando={programar.isPending}>
            Programar estudio
          </Boton>
        </DialogActions>
      </Box>
    </Dialog>
  );
}
