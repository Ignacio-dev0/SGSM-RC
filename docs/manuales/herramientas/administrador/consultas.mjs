// Manual del administrador, segunda parte: reportes, estadísticas y auditoría en la tablet
// (capturas 23 a 35) y, en el teléfono, la barra, el menú en cajón y el detalle de la
// auditoría (36 a 38).

import { UI } from './datos.mjs';
import { DENTRO, alInicio, buscadores, esperar, filaHasta, subirHasta } from './marcadores.mjs';

/** Sigue en la misma pantalla de la tablet: Reportes, Estadísticas y Auditoría. */
export async function recorridoConsultas(page, capturar) {
  const { menu, boton, selector, alerta, titulo } = buscadores(page);
  const irA = async (opcion) => {
    await menu.getByRole('link', { name: opcion, exact: true }).click();
    await esperar(page);
  };

  // 23–28 · Reportes y estadísticas
  await irA('Reportes');
  const filtrosReporte = page.getByRole('search', { name: 'Filtros' });
  await capturar(
    page,
    '23-reportes-filtros.png',
    'Reportes: pestañas y filtros (período, sala, tipo, agrupación)',
    {
      marcas: [
        {
          n: 1,
          loc: page.getByRole('tablist', { name: 'Secciones de los reportes' }),
          tipo: 'area',
          que: 'Pestañas Suministros y Estadísticas',
        },
        {
          n: 2,
          loc: filtrosReporte.getByRole('group'),
          tipo: 'area',
          que: 'Período: Hoy, 7 días o 30 días (el elegido lleva tilde)',
        },
        {
          n: 3,
          loc: [
            page.getByLabel('Desde', { exact: true }),
            page.getByLabel('Hasta', { exact: true }),
          ],
          tipo: 'area',
          que: 'Desde y Hasta: otro período (hasta un año)',
        },
        { n: 4, loc: selector('Sala'), que: 'Sala (o Todas)', ...DENTRO },
        { n: 5, loc: selector('Tipo'), que: 'Tipo: Medicamentos, Insumos o Todos', ...DENTRO },
        {
          n: 6,
          loc: selector('Agrupar por'),
          que: 'Agrupar por: Paciente, Medicamento o insumo, Personal o Día',
          ...DENTRO,
        },
      ],
      incluir: [titulo('Reportes')],
    },
  );
  const descargas = page.getByRole('group', { name: 'Descargar' });
  const tablaReporte = page.getByRole('table', { name: /^Reporte de suministros por/ });
  // El resumen (período, sala y tipo) arriba de todo, debajo de la barra.
  const resumen = page.locator('main p', { hasText: /Todas las salas/ }).first();
  await subirHasta(page, resumen, 112);
  await capturar(
    page,
    '24-reportes-resultado.png',
    'Resultado del reporte: resumen, descargas y tabla con el total',
    {
      marcas: [
        {
          n: 1,
          loc: resumen,
          tipo: 'area',
          que: 'Resumen: período, sala y tipo que se están mostrando',
        },
        { n: 2, loc: descargas, tipo: 'area', que: 'Botones "Descargar PDF" y "Descargar Excel"' },
        {
          n: 3,
          loc: page.getByRole('link', { name: 'Ver cada unidad por separado' }),
          que: '"Ver cada unidad por separado" (agrupa por medicamento o insumo)',
          lado: 'der',
        },
        { n: 4, loc: tablaReporte, tipo: 'area', que: 'Tabla del reporte, con la fila Total' },
      ],
    },
  );
  const bajada = page.waitForEvent('download');
  await boton('Descargar PDF').click();
  await (await bajada).delete();
  await alerta('Se descargó').waitFor();
  await esperar(page);
  await capturar(
    page,
    '25-reportes-descarga.png',
    'Aviso después de descargar el PDF (nombre del archivo y período)',
    {
      marcas: [
        { n: 1, loc: alerta('Se descargó'), tipo: 'area', que: 'Aviso "Se descargó … (período)"' },
      ],
      incluir: [descargas],
    },
  );
  await alInicio(page);
  await page.getByRole('tab', { name: 'Estadísticas' }).click();
  await esperar(page, 800);
  const indicadores = page.getByLabel('Indicadores del período');
  const primerGrafico = page.locator('main section').first();
  await subirHasta(page, resumen, 112);
  await capturar(
    page,
    '26-estadisticas.png',
    'Estadísticas: descargas, indicadores del período y el primer gráfico',
    {
      marcas: [
        { n: 1, loc: descargas, tipo: 'area', que: 'Descargar PDF o Excel de las estadísticas' },
        {
          n: 2,
          loc: indicadores,
          tipo: 'area',
          que: 'Indicadores: suministros, pacientes atendidos, recordatorios atendidos y a tiempo',
        },
        {
          n: 3,
          loc: [primerGrafico.getByRole('heading'), primerGrafico.locator('[id$="-descripcion"]')],
          tipo: 'area',
          que: 'Título y explicación de cada gráfico',
        },
      ],
      incluir: [resumen],
    },
  );
  const verTabla = primerGrafico.getByRole('button', { name: 'Ver como tabla' });
  await subirHasta(page, primerGrafico, 112);
  await capturar(
    page,
    '27-estadisticas-grafico.png',
    'Un gráfico (los más usados) con el botón "Ver como tabla"',
    {
      marcas: [
        {
          n: 1,
          loc: primerGrafico.locator('svg').first(),
          tipo: 'area',
          que: 'Gráfico de barras: cantidad de suministros de cada medicamento o insumo',
        },
        {
          n: 2,
          loc: verTabla,
          que: 'Botón "Ver como tabla" (los mismos números, en una tabla)',
          lado: 'der',
        },
      ],
      incluir: [primerGrafico.getByRole('heading')],
    },
  );
  await verTabla.click();
  await esperar(page);
  const ocultar = primerGrafico.getByRole('button', { name: 'Ocultar la tabla' });
  await subirHasta(page, ocultar, 300);
  await capturar(page, '28-estadisticas-tabla.png', 'El mismo gráfico con su tabla abierta', {
    marcas: [
      { n: 1, loc: ocultar, que: 'Botón "Ocultar la tabla"', lado: 'der' },
      {
        n: 2,
        loc: primerGrafico.getByRole('table'),
        tipo: 'area',
        que: 'Tabla con los números del gráfico',
      },
    ],
  });
  await alInicio(page);

  // 29–35 · Auditoría
  await irA('Auditoría');
  const filtrosAud = page.getByRole('search', { name: 'Filtros' });
  const usuarioAud = page.getByRole('combobox', { name: 'Usuario', exact: true });
  const pacienteAud = page.getByRole('combobox', { name: 'Paciente', exact: true });
  const movimientos = page.getByRole('table', { name: 'Movimientos' });
  await capturar(
    page,
    '29-auditoria-filtros.png',
    'Auditoría: filtros (fechas, origen, usuario, paciente, acción, sobre qué)',
    {
      marcas: [
        {
          n: 1,
          loc: [
            filtrosAud.getByLabel('Desde', { exact: true }),
            filtrosAud.getByLabel('Hasta', { exact: true }),
          ],
          tipo: 'area',
          que: 'Desde y Hasta',
        },
        {
          n: 2,
          loc: selector('Origen'),
          que: 'Origen: Personas (lo que hizo el personal), Sistema o Todos',
          ...DENTRO,
        },
        {
          n: 3,
          loc: usuarioAud,
          que: 'Usuario: quién hizo el movimiento (se escribe y se elige)',
          lado: 'dentro-der',
          dx: -64,
        },
        {
          n: 4,
          loc: pacienteAud,
          que: 'Paciente: sobre qué paciente (también los que ya se fueron)',
          lado: 'dentro-der',
          dx: -64,
        },
        {
          n: 5,
          loc: selector('Acción'),
          que: 'Acción: qué se hizo (Creó, Modificó, Dio de baja…)',
          ...DENTRO,
        },
        {
          n: 6,
          loc: selector('Sobre qué'),
          que: 'Sobre qué: Usuario, Paciente, Prescripción, Insumo…',
          ...DENTRO,
        },
      ],
      incluir: [titulo('Auditoría')],
    },
  );
  await selector('Origen').selectOption({ label: 'Sistema' });
  await esperar(page);
  await subirHasta(page, selector('Origen'), 125);
  await capturar(
    page,
    '30-auditoria-origen-sistema.png',
    'Origen "Sistema": lo que el sistema hace solo (genera recordatorios, los vence…)',
    {
      // Desde la etiqueta del campo: sin el renglón de ayuda del campo de arriba, cortado.
      margen: 6,
      marcas: [
        { n: 1, loc: selector('Origen'), que: 'Origen en "Sistema"', ...DENTRO },
        {
          n: 2,
          loc: movimientos.locator('tbody tr').first(),
          tipo: 'area',
          que: 'Un movimiento del sistema: Usuario "Sistema", por ejemplo "Generó · Recordatorio"',
        },
      ],
    },
  );
  await alInicio(page);
  await selector('Origen').selectOption({ label: 'Personas' });
  await esperar(page);
  await pacienteAud.click();
  await pacienteAud.pressSequentially('Olmedo', { delay: 60 });
  const sugerencia = page.getByRole('option', { name: /^Olmedo, Ramiro Teodoro/ });
  await sugerencia.waitFor();
  await esperar(page);
  await capturar(
    page,
    '31-auditoria-buscar-paciente.png',
    'Filtro Paciente: se escribe el apellido y se elige de las sugerencias',
    {
      marcas: [
        {
          n: 1,
          loc: pacienteAud,
          que: 'Campo Paciente con lo escrito',
          lado: 'dentro-der',
          dx: -64,
        },
        { n: 2, loc: sugerencia, tipo: 'area', que: 'Sugerencia con apellido, nombre y DNI' },
      ],
      incluir: [page.getByRole('listbox')],
      desenfocar: false,
    },
  );
  await sugerencia.click();
  await esperar(page);
  await subirHasta(page, pacienteAud, 125);
  await capturar(
    page,
    '32-auditoria-por-paciente.png',
    'Movimientos sobre un paciente (Olmedo, Ramiro Teodoro)',
    {
      // Desde la etiqueta del campo: sin el renglón de ayuda del campo de arriba, cortado.
      margen: 6,
      marcas: [
        { n: 1, loc: pacienteAud, que: 'Paciente elegido', lado: 'dentro-der', dx: -12 },
        {
          n: 2,
          loc: movimientos.locator('thead'),
          tipo: 'area',
          que: 'Columnas: Fecha y hora, Usuario, Acción, Sobre qué y Paciente',
        },
        {
          n: 3,
          loc: movimientos.locator('tbody tr').first(),
          tipo: 'area',
          que: 'Un movimiento: se toca para ver el detalle',
          lado: 'br',
        },
      ],
      incluir: [await filaHasta(movimientos, 1)],
    },
  );
  // Se quita el paciente con la cruz del campo (aparece con el campo enfocado).
  await pacienteAud.click();
  await page.getByRole('button', { name: 'Borrar Paciente' }).click();
  await page.keyboard.press('Escape');
  await esperar(page);
  await selector('Sobre qué').selectOption({ label: 'Usuario' });
  await selector('Acción').selectOption({ label: 'Dio de baja' });
  await esperar(page);
  const filaBaja = movimientos.locator('tbody tr').first();
  await subirHasta(page, selector('Acción'), 125);
  await capturar(
    page,
    '33-auditoria-por-accion.png',
    'Filtros Acción "Dio de baja" y Sobre qué "Usuario": quién dio de baja a quién',
    {
      // Desde la etiqueta del campo: sin el renglón de ayuda del campo de arriba, cortado.
      margen: 6,
      marcas: [
        { n: 1, loc: selector('Acción'), que: 'Acción "Dio de baja"', ...DENTRO },
        { n: 2, loc: selector('Sobre qué'), que: 'Sobre qué "Usuario"', ...DENTRO },
        {
          n: 3,
          loc: filaBaja,
          tipo: 'area',
          que: 'El movimiento: cuándo, quién (Usuario) y sobre qué usuario',
          lado: 'br',
        },
      ],
    },
  );
  await filaBaja.click();
  const detalle = page.getByRole('dialog', { name: /^Dio de baja · Usuario/ });
  await detalle.waitFor();
  await esperar(page);
  await capturar(
    page,
    '34-auditoria-antes-despues.png',
    'Detalle de un movimiento: datos y tabla Antes y después',
    {
      marcas: [
        {
          n: 1,
          loc: detalle.locator('dl').first(),
          tipo: 'area',
          que: 'Fecha y hora y quién lo hizo',
        },
        {
          n: 2,
          loc: detalle.getByRole('table', { name: 'Antes y después' }),
          tipo: 'area',
          que: 'Tabla Antes y después, campo por campo',
        },
        {
          n: 3,
          loc: detalle.getByText('Cambió', { exact: true }).first(),
          que: 'Marca "Cambió" en los campos que cambiaron',
          lado: 'der',
        },
        { n: 4, loc: boton('Cerrar', detalle), que: 'Botón Cerrar', lado: 'izq' },
      ],
      incluir: [detalle],
    },
  );
  await boton('Cerrar', detalle).click();
  await detalle.waitFor({ state: 'detached' });
  await selector('Sobre qué').selectOption({ label: 'Todo' });
  await selector('Acción').selectOption({ label: 'Registró el rostro' });
  await esperar(page);
  await movimientos.locator('tbody tr').first().click();
  const protegido = page.getByRole('dialog', { name: /^Registró el rostro/ });
  await protegido.waitFor();
  await esperar(page);
  await capturar(
    page,
    '35-auditoria-datos-protegidos.png',
    'Detalle del registro de un rostro: queda quién, cuándo y de quién, pero no el rostro',
    {
      marcas: [
        {
          n: 1,
          loc: protegido.locator('dl').first(),
          tipo: 'area',
          que: 'Quién registró el rostro, cuándo y de qué usuario (Detalle)',
        },
        {
          n: 2,
          loc: [
            protegido.getByText('Antes y después', { exact: true }),
            protegido.getByText('Esta acción no guardó valores.'),
          ],
          tipo: 'area',
          que: '"Esta acción no guardó valores": el patrón facial y la foto (como las contraseñas) no quedan en la auditoría',
        },
      ],
      incluir: [protegido],
    },
  );
  await boton('Cerrar', protegido).click();
}

/** En el teléfono: lo que cambia (barra, menú en cajón, detalle a pantalla completa). */
export async function recorridoTelefono(page, capturar) {
  const { boton, selector, titulo } = buscadores(page);
  await page.goto(`${UI}/`);
  await esperar(page);
  const abrir = page.getByRole('button', { name: 'Abrir el menú' });
  await capturar(
    page,
    '36-telefono-barra.png',
    'En el teléfono: barra superior con el botón de menú, la campana y Salir',
    {
      marcas: [
        { n: 1, loc: abrir, que: 'Botón "Abrir el menú"', lado: 'br', dx: -8, dy: -6 },
        {
          n: 2,
          loc: page.getByRole('button', { name: /^Notificaciones/ }),
          que: 'Campana de Notificaciones',
          lado: 'br',
          dx: -8,
          dy: -6,
        },
        {
          n: 3,
          loc: page.getByRole('button', { name: 'Salir' }),
          que: 'Salir (solo el ícono)',
          lado: 'br',
          dx: -8,
          dy: -6,
        },
      ],
      incluir: [titulo()],
    },
  );
  await abrir.click();
  const cajon = page.locator('.MuiDrawer-paper');
  await cajon.waitFor();
  await esperar(page);
  await capturar(
    page,
    '37-telefono-menu.png',
    'En el teléfono: el menú se abre en un cajón, con el tema de la pantalla al pie',
    {
      marcas: [
        {
          n: 1,
          loc: cajon.getByRole('navigation', { name: 'Menú principal' }),
          tipo: 'area',
          que: 'Opciones del menú (las mismas del menú lateral de la tablet)',
          lado: 'der',
        },
        {
          n: 2,
          loc: cajon.getByText('Tema de la pantalla').locator('..'),
          tipo: 'area',
          que: 'Tema de la pantalla: el del dispositivo, claro u oscuro',
        },
      ],
      recorte: 'ventana',
    },
  );
  await cajon.getByRole('link', { name: 'Auditoría', exact: true }).click();
  await cajon.waitFor({ state: 'detached' }).catch(() => undefined);
  await esperar(page);
  await selector('Sobre qué').selectOption({ label: 'Usuario' });
  await selector('Acción').selectOption({ label: 'Dio de baja' });
  await esperar(page);
  // En el teléfono cada movimiento es una tarjeta: se toca la tarjeta.
  await page
    .getByRole('listitem')
    .filter({ has: page.getByRole('button', { name: /^Ver el detalle: Dio de baja/ }) })
    .first()
    .click();
  const detalle = page.getByRole('dialog', { name: /^Dio de baja · Usuario/ });
  await detalle.waitFor();
  await esperar(page);
  await capturar(
    page,
    '38-telefono-auditoria-detalle.png',
    'En el teléfono: el detalle de la auditoría ocupa la pantalla y cada campo es una tarjeta',
    {
      marcas: [
        {
          n: 1,
          loc: detalle.getByRole('list', { name: 'Antes y después' }).getByRole('listitem').first(),
          tipo: 'area',
          que: 'Tarjeta de un campo: Antes, Después y la marca "Cambió"',
        },
        { n: 2, loc: boton('Cerrar', detalle), que: 'Botón Cerrar', lado: 'izq' },
      ],
      recorte: 'ventana',
    },
  );
}
