import { useEffect, useState } from 'react';
import { Box, Button, InputAdornment, Paper, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import FaceRetouchingNaturalIcon from '@mui/icons-material/FaceRetouchingNatural';
import SearchIcon from '@mui/icons-material/Search';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { mensajeDeError } from '../../api/cliente';
import { usePaciente } from '../../api/pacientes';
import { useCatalogo } from '../../api/prescripciones';
import { suministrosApi } from '../../api/suministros';
import type { Insumo } from '../../api/tipos';
import { useValidacionFacial } from '../../biometria/useValidacionFacial';
import { AccionesFormulario } from '../../componentes/AccionesFormulario';
import { Alerta } from '../../componentes/Alerta';
import { Boton } from '../../componentes/Boton';
import { CampoTexto } from '../../componentes/CampoTexto';
import { EncabezadoPagina } from '../../componentes/EncabezadoPagina';
import { Cargando, ErrorDeCarga } from '../../componentes/EstadoDeCarga';
import { IdentidadPaciente } from '../pacientes/IdentidadPaciente';
import { useCambiosSinGuardar } from '../../utilidades/useCambiosSinGuardar';
import { formatearCama } from '../pacientes/etiquetas';
import { formatearDosis } from '../prescripciones/etiquetas';
import { ListaCantidades, SelectorPaciente, type ItemCantidad } from './comunes';

/**
 * Registro de insumos no prescriptos (T414 · CU21): carga rápida de varios insumos con sus
 * cantidades al lado de la cama, confirmada con el rostro en un solo movimiento.
 */
export function RegistroInsumos() {
  const clienteQuery = useQueryClient();
  const [parametros, setParametros] = useSearchParams();
  const pacienteId = Number(parametros.get('pacienteId')) || 0;
  const paciente = usePaciente(pacienteId);
  const catalogo = useCatalogo('INSUMO');
  const { pedirValidacion, modalValidacion } = useValidacionFacial();
  const [buscar, setBuscar] = useState('');
  const [items, setItems] = useState<ItemCantidad[]>([]);
  const [observaciones, setObservaciones] = useState('');
  const [aviso, setAviso] = useState<string | null>(null);
  // Registrar vacía los insumos y la nota, así que después de guardar ya no hay nada que perder.
  const { dialogo } = useCambiosSinGuardar(items.length > 0 || observaciones.trim() !== '');

  const agregar = (i: Insumo) => {
    setAviso(null);
    setItems((actual) =>
      actual.some((x) => x.insumoId === i.id)
        ? actual.map((x) => (x.insumoId === i.id ? { ...x, cantidad: x.cantidad + 1 } : x))
        : [...actual, { insumoId: i.id, nombre: i.nombre, unidad: i.unidadMedida, cantidad: 1 }],
    );
  };

  const registrar = useMutation({
    mutationFn: (validacionToken: string) =>
      suministrosApi.registrarInsumos({
        pacienteId,
        items: items.map(({ insumoId, cantidad }) => ({ insumoId, cantidad })),
        observaciones,
        validacionToken,
      }),
    onSuccess: (s) => {
      setAviso(
        `Se registraron ${s.detalles.length} ${s.detalles.length === 1 ? 'insumo' : 'insumos'} para ${s.paciente.apellido}, ${s.paciente.nombre}.`,
      );
      setItems([]);
      setObservaciones('');
      void clienteQuery.invalidateQueries({ queryKey: ['suministros'] });
    },
  });
  const { reset: reiniciarRegistro } = registrar;

  // Al cambiar de paciente no queda nada del anterior (ni los insumos, ni la nota, ni un error).
  useEffect(() => {
    setItems([]);
    setObservaciones('');
    setAviso(null);
    reiniciarRegistro();
  }, [pacienteId, reiniciarRegistro]);

  const p = paciente.data;

  const confirmar = async () => {
    if (!p) return;
    const token = await pedirValidacion(
      `Registro de insumos para ${p.apellido}, ${p.nombre}`,
      // Lo que se confirma queda a la vista junto a la cámara.
      <>
        <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
          {items.map((i) => (
            <li key={i.insumoId}>
              <strong>{i.nombre}</strong> · {formatearDosis(i.cantidad, i.unidad)}
            </li>
          ))}
        </Box>
        <Typography sx={{ mt: 1 }}>
          {p.apellido}, {p.nombre} · DNI {p.dni}
          {p.cama ? ` · Cama ${formatearCama(p.cama.numero)}` : ''}
        </Typography>
      </>,
      'No se registraron los insumos.',
    );
    if (token) registrar.mutate(token);
  };

  const texto = buscar.trim();
  const visibles = (catalogo.data ?? []).filter((i) =>
    i.nombre.toLowerCase().includes(texto.toLowerCase()),
  );
  // Una cantidad vacía o en cero (0) no se confirma: la lista la marca con su error.
  const puedeConfirmar = items.length > 0 && items.every((i) => i.cantidad >= 1);

  return (
    <>
      <EncabezadoPagina
        titulo="Registrar insumos"
        volverA={pacienteId ? `/pacientes/${pacienteId}` : '/suministros'}
      />
      <Box sx={{ maxWidth: 520, mb: 2 }}>
        <SelectorPaciente
          valor={pacienteId ? String(pacienteId) : ''}
          alCambiar={(v) => setParametros(v ? { pacienteId: v } : {}, { replace: true })}
        />
      </Box>
      {aviso && (
        <Alerta tipo="exito" alCerrar={() => setAviso(null)}>
          {aviso}
        </Alerta>
      )}
      {registrar.isError && <Alerta tipo="error">{mensajeDeError(registrar.error)}</Alerta>}

      {pacienteId > 0 && paciente.isLoading && <Cargando texto="Cargando el paciente…" />}
      {paciente.isError && (
        <ErrorDeCarga
          que="el paciente"
          error={paciente.error}
          alReintentar={() => void paciente.refetch()}
        />
      )}

      {p && (
        <>
          <IdentidadPaciente paciente={p} />
          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', lg: '3fr 2fr' } }}>
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Typography variant="h6" component="h2" sx={{ mb: 1 }}>
                Catálogo
              </Typography>
              <CampoTexto
                etiqueta="Buscar insumo"
                valor={buscar}
                alCambiar={setBuscar}
                type="search"
                sx={{ mb: 2 }}
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
              {catalogo.isError && (
                <ErrorDeCarga
                  que="el catálogo de insumos"
                  error={catalogo.error}
                  alReintentar={() => void catalogo.refetch()}
                />
              )}
              {catalogo.isLoading && <Cargando texto="Cargando el catálogo…" />}
              {catalogo.isSuccess && catalogo.data.length === 0 && (
                <Alerta tipo="info">
                  El catálogo no tiene insumos para registrar. Pida al administrador que los
                  agregue.
                </Alerta>
              )}
              {catalogo.isSuccess && catalogo.data.length > 0 && visibles.length === 0 && (
                <Alerta tipo="info">
                  Ningún insumo coincide con «{texto}». Revise el nombre o pida al administrador que
                  lo agregue al catálogo.
                </Alerta>
              )}
              <Box
                sx={{
                  display: 'grid',
                  gap: 1,
                  gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                }}
              >
                {visibles.map((i) => (
                  <Button
                    key={i.id}
                    variant="outlined"
                    startIcon={<AddIcon />}
                    aria-label={`Agregar ${i.nombre}`}
                    onClick={() => agregar(i)}
                    sx={{
                      justifyContent: 'flex-start',
                      textAlign: 'left',
                      py: 1.5,
                      // El nombre se lee en el color del texto: la marca queda para el "+" y el borde.
                      color: 'text.primary',
                      '& .MuiButton-startIcon': { color: 'primary.main' },
                    }}
                  >
                    <span>
                      <Typography
                        component="span"
                        sx={{
                          display: 'block',
                          fontWeight: 700,
                          lineHeight: 1.3,
                          color: 'text.primary',
                        }}
                      >
                        {i.nombre}
                      </Typography>
                      {i.presentacion && (
                        <Typography
                          component="span"
                          variant="body2"
                          color="text.secondary"
                          sx={{ display: 'block', lineHeight: 1.3 }}
                        >
                          {i.presentacion}
                        </Typography>
                      )}
                    </span>
                  </Button>
                ))}
              </Box>
            </Paper>

            <Paper variant="outlined" sx={{ p: 2, display: 'grid', gap: 2, alignContent: 'start' }}>
              <Typography variant="h6" component="h2">
                Insumos a registrar
              </Typography>
              {items.length === 0 ? (
                <Typography color="text.secondary">
                  Toque los insumos del catálogo para agregarlos.
                </Typography>
              ) : (
                <ListaCantidades titulo="Insumos a registrar" items={items} alCambiar={setItems} />
              )}
              <CampoTexto
                etiqueta="Observaciones"
                valor={observaciones}
                alCambiar={setObservaciones}
              />
              <AccionesFormulario>
                <Boton
                  startIcon={<FaceRetouchingNaturalIcon />}
                  disabled={!puedeConfirmar}
                  cargando={registrar.isPending}
                  onClick={() => void confirmar()}
                >
                  Confirmar con mi rostro
                </Boton>
              </AccionesFormulario>
            </Paper>
          </Box>
        </>
      )}
      {!p && !pacienteId && (
        <AccionesFormulario>
          <Boton disabled startIcon={<FaceRetouchingNaturalIcon />}>
            Confirmar con mi rostro
          </Boton>
        </AccionesFormulario>
      )}
      {modalValidacion}
      {dialogo}
    </>
  );
}
