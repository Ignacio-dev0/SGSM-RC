import { useEffect, useState } from 'react';
import { Box, Button, Paper, Typography } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import FaceRetouchingNaturalIcon from '@mui/icons-material/FaceRetouchingNatural';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { mensajeDeError } from '../../api/cliente';
import { usePaciente } from '../../api/pacientes';
import { useCatalogo } from '../../api/prescripciones';
import { suministrosApi } from '../../api/suministros';
import type { Insumo } from '../../api/tipos';
import { useValidacionFacial } from '../../biometria/useValidacionFacial';
import { Alerta } from '../../componentes/Alerta';
import { Boton } from '../../componentes/Boton';
import { CampoTexto } from '../../componentes/CampoTexto';
import { EncabezadoPagina } from '../../componentes/EncabezadoPagina';
import { ListaCantidades, SelectorPaciente, type ItemCantidad } from './comunes';

/**
 * Registro de insumos no prescriptos (T414 · CU21): carga rápida de varios insumos con sus
 * cantidades al lado de la cama, confirmada con la cara en un solo movimiento.
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

  // Al cambiar de paciente no queda nada del anterior (ni los insumos ni la nota).
  useEffect(() => {
    setItems([]);
    setObservaciones('');
    setAviso(null);
  }, [pacienteId]);

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

  const confirmar = async () => {
    if (!paciente.data) return;
    const token = await pedirValidacion(
      `Registro de insumos para ${paciente.data.apellido}, ${paciente.data.nombre}`,
    );
    if (token) registrar.mutate(token);
  };

  const visibles = (catalogo.data ?? []).filter((i) =>
    i.nombre.toLowerCase().includes(buscar.trim().toLowerCase()),
  );
  const p = paciente.data;

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

      {p && (
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
            />
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
                  sx={{ justifyContent: 'flex-start', textAlign: 'left', py: 1.5 }}
                >
                  <span>
                    {i.nombre}
                    {i.presentacion && (
                      <Typography
                        component="span"
                        variant="body2"
                        sx={{ display: 'block', opacity: 0.8 }}
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
              Para {p.apellido}, {p.nombre} {p.cama ? `· Cama ${p.cama.numero}` : ''}
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
            <Boton
              startIcon={<FaceRetouchingNaturalIcon />}
              disabled={items.length === 0}
              cargando={registrar.isPending}
              onClick={() => void confirmar()}
            >
              Confirmar con mi rostro
            </Boton>
          </Paper>
        </Box>
      )}
      {!p && !pacienteId && (
        <Boton disabled startIcon={<FaceRetouchingNaturalIcon />}>
          Confirmar con mi rostro
        </Boton>
      )}
      {modalValidacion}
    </>
  );
}
