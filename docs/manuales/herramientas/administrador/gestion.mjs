// Manual del administrador, primera parte (tablet): Inicio, usuarios (alta, modificación, baja
// y reactivación, permisos adicionales), rostro del personal, catálogo y notificaciones.
// Capturas 01 a 22.

import { ALTA, DEMO, MEDICAMENTO_A_EDITAR, NUEVO_MEDICAMENTO, UI, claveAlAzar } from './datos.mjs';
import { DENTRO, alInicio, buscadores, esperar, subirHasta } from './marcadores.mjs';

/** Recorre la gestión como el administrador, desde el Inicio. */
export async function recorridoGestion(page, capturar) {
  const { menu, boton, dialogo, campo, selector, fila, alerta, titulo } = buscadores(page);
  const irA = async (opcion) => {
    await menu.getByRole('link', { name: opcion, exact: true }).click();
    await esperar(page);
  };
  const DEMO_FILA = `Abrir ${DEMO.apellido}, ${DEMO.nombre}`;

  // 01 · Inicio
  await page.goto(`${UI}/`);
  await esperar(page);
  await capturar(
    page,
    '01-inicio.png',
    'Inicio del administrador: tareas de gestión primero, menú lateral y barra superior',
    {
      marcas: [
        {
          n: 1,
          loc: page.locator('[data-destacada="true"]'),
          tipo: 'area',
          que: 'Tarjeta "Nuevo usuario", la tarea destacada (debajo, las demás tareas del administrador)',
        },
        {
          n: 2,
          loc: menu,
          tipo: 'area',
          que: 'Menú lateral: Usuarios, Biometría, Catálogo, Reportes, Auditoría y las secciones clínicas',
        },
        {
          n: 3,
          loc: page.getByRole('button', { name: /^Tema de la pantalla/ }),
          que: 'Tema de la pantalla (claro, oscuro o igual que el dispositivo)',
          lado: 'br',
          dx: -8,
          dy: -6,
        },
        {
          n: 4,
          loc: page.getByRole('link', { name: /^Recordatorios: / }),
          que: 'Reloj de recordatorios: tomas y estudios del hospital para atender (es para enfermería)',
          lado: 'br',
          dx: -8,
          dy: -6,
        },
        {
          n: 5,
          loc: page.getByRole('button', { name: /^Notificaciones/ }),
          que: 'Campana de Notificaciones, con el número de avisos sin leer (los avisos del administrador)',
          lado: 'br',
          dx: -8,
          dy: -6,
        },
        { n: 6, loc: boton('Salir'), que: 'Botón Salir', lado: 'tr', dx: 6, dy: 4 },
        {
          n: 7,
          loc: page.getByText('Modo demostración: la validación facial se simula', {
            exact: false,
          }),
          tipo: 'area',
          que: 'Franja "Modo demostración": la validación facial se simula (no usar con pacientes reales)',
          lado: 'dentro-der',
        },
      ],
      recorte: { y1: 0, y2: 760 },
    },
  );

  // 02 · Usuarios
  await irA('Usuarios');
  await capturar(
    page,
    '02-usuarios-lista.png',
    'Lista de usuarios: búsqueda, filtros Rol y Estado, y la persona de demostración',
    {
      marcas: [
        { n: 1, loc: boton('Nuevo usuario'), que: 'Botón "Nuevo usuario"', lado: 'izq' },
        {
          n: 2,
          loc: page.getByRole('searchbox', { name: 'Buscar por apellido, usuario o DNI' }),
          que: 'Buscar por apellido, usuario o DNI',
          ...DENTRO,
        },
        {
          n: 3,
          loc: [selector('Rol'), selector('Estado')],
          tipo: 'area',
          que: 'Filtros Rol y Estado (Activos, Dados de baja, Todos)',
        },
        {
          n: 4,
          loc: fila(DEMO_FILA),
          tipo: 'area',
          que: 'Fila de una persona: se toca para abrir su ficha; columna Estado (Activo, Bloqueado, Dado de baja)',
        },
      ],
      incluir: [titulo('Usuarios'), page.locator('main').getByText(/^Página \d+ de \d+/)],
    },
  );

  // 03–04 · Nuevo usuario (se completa y NO se guarda)
  await boton('Nuevo usuario').click();
  await esperar(page);
  await campo('Nombre').fill(ALTA.nombre);
  await campo('Apellido').fill(ALTA.apellido);
  await campo('DNI').fill(ALTA.dni);
  await campo('Matrícula').fill(ALTA.matricula);
  await campo('Email').fill(ALTA.email);
  await campo('Nombre de usuario').fill(ALTA.nombreUsuario);
  await selector('Rol').selectOption({ label: ALTA.rol });
  const contrasena = page.locator('input[type="password"]');
  await contrasena.fill(claveAlAzar());
  await alInicio(page);
  await capturar(
    page,
    '03-usuario-nuevo-datos.png',
    'Nuevo usuario: datos personales completos (ejemplo ficticio, sin guardar)',
    {
      marcas: [
        {
          n: 1,
          loc: [campo('Nombre'), campo('Email')],
          tipo: 'area',
          que: 'Datos personales: Nombre, Apellido y DNI son obligatorios (*); Matrícula y Email, opcionales',
        },
        {
          n: 2,
          loc: campo('DNI'),
          que: 'DNI: 7 u 8 dígitos, sin puntos (lo dice la ayuda debajo)',
          ...DENTRO,
        },
      ],
      incluir: [titulo('Nuevo usuario')],
    },
  );
  await subirHasta(page, page.getByRole('heading', { name: 'Acceso al sistema' }), 130);
  await capturar(
    page,
    '04-usuario-nuevo-acceso.png',
    'Nuevo usuario: acceso al sistema (usuario, rol, contraseña) y Guardar, sin guardar',
    {
      marcas: [
        {
          n: 1,
          loc: campo('Nombre de usuario'),
          que: 'Nombre de usuario (con el que la persona va a ingresar)',
          ...DENTRO,
        },
        { n: 2, loc: selector('Rol'), que: 'Rol: Administrador, Médico o Enfermero', ...DENTRO },
        {
          n: 3,
          loc: contrasena,
          que: 'Contraseña inicial: al menos 8 caracteres, con letras y números',
          ...DENTRO,
        },
        {
          n: 4,
          loc: boton('Guardar'),
          que: 'Botón Guardar (Cancelar, a su izquierda, sale sin guardar)',
          lado: 'arriba',
        },
      ],
      incluir: [page.getByRole('heading', { name: 'Acceso al sistema' })],
    },
  );
  // Salir sin guardar: la pantalla pregunta si se descarta lo cargado.
  await boton('Cancelar').click();
  const descartar = dialogo('¿Descartar lo cargado?');
  await descartar.waitFor();
  await boton('Descartar', descartar).click();
  await esperar(page);

  // 05 · Ficha de la persona (modificar)
  await fila(DEMO_FILA).click();
  await esperar(page);
  await capturar(
    page,
    '05-usuario-ficha.png',
    `Ficha de ${DEMO.apellido}, ${DEMO.nombre}: acciones y datos para modificar`,
    {
      marcas: [
        {
          n: 1,
          loc: page
            .locator('main')
            .getByText(/Último acceso:/)
            .locator('..'),
          tipo: 'area',
          margen: 3,
          que: 'Rol y Último acceso (la última vez que la persona ingresó)',
          lado: 'der',
        },
        {
          n: 2,
          loc: boton('Permisos adicionales'),
          que: 'Botón "Permisos adicionales"',
          lado: 'abajo',
        },
        {
          n: 3,
          loc: page.getByRole('link', { name: 'Rostro' }),
          que: 'Botón "Rostro" (registro facial de la persona)',
          lado: 'abajo',
        },
        { n: 4, loc: boton('Dar de baja'), que: 'Botón "Dar de baja"', lado: 'abajo' },
        {
          n: 5,
          loc: [campo('Nombre'), campo('Email')],
          tipo: 'area',
          que: 'Datos personales: se corrigen en el lugar y se toca Guardar, al pie (Acceso al sistema: rol y Contraseña nueva)',
        },
      ],
      incluir: [titulo()],
    },
  );

  // 39 · La parte de abajo de la ficha: Acceso al sistema (sin guardar nada)
  await subirHasta(page, page.getByRole('heading', { name: 'Acceso al sistema' }), 130);
  await capturar(
    page,
    '39-usuario-ficha-acceso.png',
    `Ficha de ${DEMO.apellido}, ${DEMO.nombre}: Acceso al sistema (usuario, rol, contraseña nueva) y Guardar`,
    {
      marcas: [
        {
          n: 1,
          loc: campo('Nombre de usuario'),
          que: 'Nombre de usuario (con el que ingresa; se puede corregir)',
          ...DENTRO,
        },
        { n: 2, loc: selector('Rol'), que: 'Rol', ...DENTRO },
        {
          n: 3,
          loc: page.locator('input[type="password"]'),
          tipo: 'area',
          que: 'Contraseña nueva: vacía no cambia nada ("Dejar vacío para no cambiarla")',
          lado: 'dentro-der',
        },
        {
          n: 4,
          loc: boton('Guardar'),
          que: 'Botón Guardar (guarda todo lo de la ficha; Cancelar vuelve a la lista sin guardar)',
          lado: 'abajo',
        },
      ],
      incluir: [page.getByRole('heading', { name: 'Acceso al sistema' })],
    },
  );
  await alInicio(page);

  // 06 · Dar de baja: el diálogo y, sobre la persona de demostración, se confirma
  await boton('Dar de baja').click();
  const baja = dialogo('Dar de baja al usuario');
  await baja.waitFor();
  await esperar(page);
  await capturar(
    page,
    '06-usuario-dar-de-baja.png',
    'Diálogo "Dar de baja al usuario": qué pasa y que se puede reactivar',
    {
      marcas: [
        {
          n: 1,
          loc: baja.locator('.MuiDialogContent-root'),
          tipo: 'area',
          que: 'Qué pasa: ya no podrá ingresar; sus registros se conservan y se puede reactivar',
        },
        {
          n: 2,
          loc: boton('Dar de baja', baja),
          que: 'Botón "Dar de baja" (confirma); Cancelar, a su izquierda, no cambia nada',
          lado: 'abajo',
        },
      ],
      incluir: [baja],
    },
  );
  await boton('Dar de baja', baja).click();
  await baja.waitFor({ state: 'detached' });
  await esperar(page);

  // 07–08 · Dada de baja → Reactivar
  await alInicio(page);
  await capturar(
    page,
    '07-usuario-dado-de-baja.png',
    'La persona quedó dada de baja: aviso, etiqueta "Dado de baja" y botón Reactivar',
    {
      marcas: [
        {
          n: 1,
          loc: alerta('El usuario quedó dado de baja'),
          tipo: 'area',
          que: 'Aviso: quedó dado de baja y ya no puede ingresar',
        },
        {
          n: 2,
          loc: page.locator('main .MuiChip-root', { hasText: 'Dado de baja' }).locator('..'),
          tipo: 'area',
          margen: 3,
          que: 'Etiqueta "Dado de baja" junto al rol',
          dx: 12,
        },
        { n: 3, loc: boton('Reactivar'), que: 'Botón "Reactivar"', lado: 'der' },
      ],
      incluir: [titulo()],
    },
  );
  await boton('Reactivar').click();
  await alerta('El usuario se reactivó').waitFor();
  await esperar(page);
  await capturar(
    page,
    '08-usuario-reactivado.png',
    'Después de Reactivar: la persona vuelve a poder ingresar',
    {
      marcas: [
        {
          n: 1,
          loc: alerta('El usuario se reactivó'),
          tipo: 'area',
          que: 'Aviso: se reactivó y puede volver a ingresar',
        },
        { n: 2, loc: boton('Dar de baja'), que: 'Vuelve a aparecer "Dar de baja"', lado: 'der' },
      ],
      incluir: [titulo()],
    },
  );

  // 09–10 · Permisos adicionales (se marca uno y NO se guarda)
  await boton('Permisos adicionales').click();
  await esperar(page);
  const permisoExtra = page.getByRole('checkbox', { name: /Consultar la auditoría/ });
  await permisoExtra.check();
  const incluidoEnRol = page
    .locator('label', { has: page.getByText('Incluido en el rol') })
    .filter({ hasText: 'Consultar el catálogo' });
  await alInicio(page);
  await capturar(
    page,
    '09-permisos-adicionales.png',
    'Permisos adicionales: los del rol vienen marcados y bloqueados; se marca uno extra (sin guardar)',
    {
      marcas: [
        {
          n: 1,
          loc: page.getByText('Los permisos que trae el rol aparecen marcados'),
          tipo: 'area',
          que: 'Explicación: los permisos del rol no se pueden quitar desde acá',
        },
        {
          n: 2,
          loc: page.locator('label', { has: permisoExtra }),
          tipo: 'area',
          que: 'Permiso extra marcado (Consultar la auditoría)',
        },
        {
          n: 3,
          loc: incluidoEnRol,
          tipo: 'area',
          que: 'Permiso "Incluido en el rol": marcado y bloqueado',
        },
      ],
      incluir: [titulo('Permisos adicionales')],
    },
  );
  await subirHasta(page, boton('Guardar permisos'), 700);
  await capturar(
    page,
    '10-permisos-guardar.png',
    'Final de la lista de permisos, con el botón Guardar permisos',
    {
      marcas: [
        {
          n: 1,
          loc: boton('Guardar permisos'),
          que: 'Botón "Guardar permisos" (rigen desde el próximo pedido de la persona)',
          lado: 'izq',
        },
      ],
      incluir: [page.getByRole('heading', { name: 'Usuarios', level: 2 })],
    },
  );

  // 11 · Biometría
  await irA('Biometría');
  const filaRostro = fila(`Abrir el registro facial de ${DEMO.apellido}, ${DEMO.nombre}`);
  await capturar(
    page,
    '11-biometria-lista.png',
    'Biometría del personal: quién tiene el rostro registrado',
    {
      marcas: [
        {
          n: 1,
          loc: filaRostro,
          tipo: 'area',
          que: 'Fila de la persona: se toca para registrar, actualizar o eliminar su rostro',
        },
        {
          n: 2,
          loc: filaRostro.getByText('Sin registrar'),
          que: 'Columna Rostro: "Sin registrar" o "Registrado"',
          lado: 'arriba',
        },
        {
          n: 3,
          loc: boton('Prueba de reconocimiento'),
          que: 'Botón "Prueba de reconocimiento"',
          lado: 'izq',
        },
      ],
      incluir: [titulo()],
    },
  );

  // 12–16 · Rostro de la persona de demostración
  await filaRostro.click();
  await esperar(page);
  await capturar(
    page,
    '12-rostro-sin-registrar.png',
    'Registro facial de la persona, todavía sin rostro',
    {
      marcas: [
        {
          n: 1,
          loc: [page.getByText('Sin rostro registrado'), page.getByText('Hasta que se registre')],
          tipo: 'area',
          que: 'Estado: "Sin rostro registrado" (no puede confirmar suministros)',
        },
        { n: 2, loc: boton('Registrar rostro'), que: 'Botón "Registrar rostro"', lado: 'der' },
      ],
      incluir: [titulo()],
    },
  );
  await boton('Registrar rostro').click();
  const registro = dialogo(`Registrar rostro de ${DEMO.nombre} ${DEMO.apellido}`);
  await registro.waitFor();
  await esperar(page);
  await capturar(
    page,
    '13-rostro-registrar-demostracion.png',
    'Diálogo "Registrar rostro" en modo demostración: se elige qué rostro simular (sin cámara)',
    {
      marcas: [
        {
          n: 1,
          loc: alerta('Esta instalación no usa la cámara', registro),
          tipo: 'area',
          que: 'Aviso "Modo de demostración": esta instalación no usa la cámara',
        },
        {
          n: 2,
          loc: registro.getByRole('button', { name: /^Simular el rostro de/ }),
          que: 'Botón "Simular el rostro de …" (en el hospital, en su lugar se ve la cámara)',
          lado: 'izq',
        },
        {
          n: 3,
          loc: boton('Simular otro rostro', registro),
          que: 'Botón "Simular otro rostro"',
          lado: 'izq',
        },
        { n: 4, loc: boton('Cancelar', registro), que: 'Botón Cancelar', lado: 'izq' },
      ],
      incluir: [registro],
    },
  );
  await registro.getByRole('button', { name: /^Simular el rostro de/ }).click();
  await registro.getByText('¿Se ve bien el rostro?').waitFor();
  await esperar(page);
  await capturar(
    page,
    '14-rostro-revisar-foto.png',
    'Revisión de la captura antes de guardarla (en demostración no hay foto real)',
    {
      marcas: [
        {
          n: 1,
          loc: registro.getByText('¿Se ve bien el rostro?'),
          tipo: 'area',
          que: '"¿Se ve bien el rostro?": con la cámara, encima se ve la foto tomada, que queda como referencia',
        },
        {
          n: 2,
          loc: boton('Volver a capturar', registro),
          que: 'Botón "Volver a capturar"',
          lado: 'abajo',
        },
        { n: 3, loc: boton('Guardar', registro), que: 'Botón Guardar', lado: 'abajo' },
      ],
      incluir: [registro],
    },
  );
  await boton('Guardar', registro).click();
  await registro.waitFor({ state: 'detached' });
  await esperar(page, 600);
  await capturar(
    page,
    '15-rostro-registrado.png',
    'Rostro registrado: foto de referencia, Actualizar rostro y Eliminar datos biométricos',
    {
      marcas: [
        {
          n: 1,
          loc: alerta('Rostro registrado.'),
          tipo: 'area',
          que: 'Aviso: rostro registrado; ya puede confirmar operaciones con su rostro',
        },
        {
          n: 2,
          loc: page.getByRole('img', { name: /^Foto de referencia de/ }),
          tipo: 'area',
          que: 'Foto de referencia (en demostración, un cuadro de color) y fecha de la última actualización',
        },
        { n: 3, loc: boton('Actualizar rostro'), que: 'Botón "Actualizar rostro"', lado: 'abajo' },
        {
          n: 4,
          loc: boton('Eliminar datos biométricos'),
          que: 'Botón "Eliminar datos biométricos"',
          lado: 'abajo',
        },
      ],
      incluir: [titulo()],
    },
  );
  await boton('Eliminar datos biométricos').click();
  const eliminar = dialogo('Eliminar datos biométricos');
  await eliminar.waitFor();
  await esperar(page);
  await capturar(
    page,
    '16-rostro-eliminar.png',
    'Diálogo "Eliminar datos biométricos" (sin confirmar)',
    {
      marcas: [
        {
          n: 1,
          loc: eliminar.locator('.MuiDialogContent-root'),
          tipo: 'area',
          que: 'Qué se borra: el patrón facial y la foto; no podrá confirmar suministros hasta registrarse de nuevo',
        },
        {
          n: 2,
          loc: boton('Eliminar', eliminar),
          que: 'Botón Eliminar (confirma); Cancelar no borra nada',
          lado: 'abajo',
        },
      ],
      incluir: [eliminar],
    },
  );
  await boton('Cancelar', eliminar).click();
  await eliminar.waitFor({ state: 'detached' });

  // 17 · Prueba de reconocimiento
  await page.getByRole('link', { name: 'Volver' }).click();
  await esperar(page);
  await boton('Prueba de reconocimiento').click();
  await esperar(page);
  await capturar(
    page,
    '17-prueba-reconocimiento.png',
    'Prueba de reconocimiento: en modo demostración solo explica que necesita la cámara',
    {
      marcas: [
        {
          n: 1,
          loc: alerta('Esta prueba necesita la cámara'),
          tipo: 'area',
          que: 'Aviso: la prueba necesita la cámara (instalado con la cámara, mide detección, luz y estabilidad)',
        },
      ],
      incluir: [titulo()],
    },
  );

  // 18–21 · Catálogo
  await irA('Catálogo');
  const buscarInsumo = page.getByRole('searchbox', { name: 'Buscar por nombre' });
  await buscarInsumo.fill(MEDICAMENTO_A_EDITAR.slice(0, 5));
  await fila(`Abrir ${MEDICAMENTO_A_EDITAR}`).waitFor();
  await esperar(page, 600);
  await capturar(
    page,
    '18-catalogo-lista.png',
    `Catálogo de insumos y medicamentos, buscando "${MEDICAMENTO_A_EDITAR.slice(0, 5)}"`,
    {
      marcas: [
        {
          n: 1,
          loc: boton('Agregar al catálogo'),
          que: 'Botón "Agregar al catálogo"',
          lado: 'izq',
        },
        { n: 2, loc: buscarInsumo, que: 'Buscar por nombre (con lo escrito)', ...DENTRO },
        {
          n: 3,
          loc: [selector('Tipo'), selector('Estado')],
          tipo: 'area',
          que: 'Filtros Tipo (Medicamentos, Insumos) y Estado (Activos, Dados de baja)',
        },
        {
          n: 4,
          loc: fila(`Abrir ${MEDICAMENTO_A_EDITAR}`),
          tipo: 'area',
          que: 'Fila de un medicamento: se toca para modificarlo o darlo de baja',
        },
      ],
      incluir: [titulo()],
    },
  );
  await boton('Agregar al catálogo').click();
  const nuevo = dialogo('Nuevo medicamento');
  await nuevo.waitFor();
  await campo('Nombre', nuevo).fill(NUEVO_MEDICAMENTO.nombre);
  await campo('Unidad de medida', nuevo).fill(NUEVO_MEDICAMENTO.unidad);
  await campo('Presentación', nuevo).fill(NUEVO_MEDICAMENTO.presentacion);
  await esperar(page);
  await capturar(
    page,
    '19-catalogo-agregar.png',
    'Diálogo "Nuevo medicamento" completo (ejemplo, sin guardar)',
    {
      marcas: [
        { n: 1, loc: campo('Nombre', nuevo), que: 'Nombre', lado: 'izq' },
        {
          n: 2,
          loc: selector('Tipo', nuevo),
          que: 'Tipo: Medicamento o Insumo no medicinal (el título del diálogo cambia con el tipo)',
          lado: 'izq',
        },
        {
          n: 3,
          loc: campo('Unidad de medida', nuevo),
          que: 'Unidad de medida: cómo se registra el consumo (mg, ml, comprimido, unidad…)',
          lado: 'izq',
        },
        { n: 4, loc: campo('Presentación', nuevo), que: 'Presentación (opcional)', lado: 'izq' },
        {
          n: 5,
          loc: boton('Guardar', nuevo),
          que: 'Botón Guardar (Cancelar no guarda)',
          lado: 'abajo',
        },
      ],
      incluir: [nuevo],
    },
  );
  await boton('Cancelar', nuevo).click();
  await nuevo.waitFor({ state: 'detached' });
  await fila(`Abrir ${MEDICAMENTO_A_EDITAR}`).click();
  const editar = dialogo('Editar medicamento');
  await editar.waitFor();
  await esperar(page);
  await capturar(
    page,
    '20-catalogo-modificar.png',
    `Diálogo "Editar medicamento" (${MEDICAMENTO_A_EDITAR}), sin guardar`,
    {
      marcas: [
        {
          n: 1,
          loc: [campo('Nombre', editar), campo('Presentación', editar)],
          tipo: 'area',
          que: 'Datos del medicamento: se corrigen en el lugar',
        },
        { n: 2, loc: boton('Dar de baja', editar), que: 'Botón "Dar de baja"', lado: 'abajo' },
        {
          n: 3,
          loc: boton('Guardar', editar),
          que: 'Botón Guardar (Cancelar no guarda)',
          lado: 'abajo',
        },
      ],
      incluir: [editar],
    },
  );
  await boton('Dar de baja', editar).click();
  const bajaInsumo = dialogo(`Dar de baja ${MEDICAMENTO_A_EDITAR}`);
  await bajaInsumo.waitFor();
  await esperar(page);
  await capturar(
    page,
    '21-catalogo-dar-de-baja.png',
    `Confirmación "Dar de baja ${MEDICAMENTO_A_EDITAR}" (sin confirmar)`,
    {
      marcas: [
        {
          n: 1,
          loc: bajaInsumo.locator('.MuiDialogContent-root'),
          tipo: 'area',
          que: 'Qué pasa: deja de aparecer para prescribir y registrar; lo ya registrado no cambia; se puede reactivar',
        },
        {
          n: 2,
          loc: boton('Dar de baja', bajaInsumo),
          que: 'Botón "Dar de baja" (confirma); Cancelar vuelve sin cambios',
          lado: 'abajo',
        },
      ],
      incluir: [bajaInsumo],
    },
  );
  await boton('Cancelar', bajaInsumo).click();
  await bajaInsumo.waitFor({ state: 'detached' });
  await boton('Cancelar', editar).click();
  await editar.waitFor({ state: 'detached' });

  // 22 · Notificaciones
  await page.getByRole('button', { name: /^Notificaciones/ }).click();
  const notif = dialogo('Notificaciones');
  await notif.waitFor();
  await esperar(page);
  const aviso = (texto) => notif.getByRole('listitem').filter({ hasText: texto }).first();
  // Lo más nuevo va arriba: con muchas tomas vencidas, la cuenta bloqueada y la validación
  // fallida quedan al final de la lista, que se desplaza dentro del diálogo.
  await notif.locator('.MuiDialogContent-root').evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  const vencidas = notif
    .getByRole('listitem')
    .filter({ hasText: 'Recordatorio vencido sin atender' });
  const hayVencidas = (await vencidas.count()) > 0;
  // En el orden en que se leen, de arriba hacia abajo (lo más nuevo arriba).
  const avisosMarcados = [
    ...(hayVencidas
      ? [
          {
            loc: vencidas.last(),
            que: 'Toma vencida: un recordatorio que nadie atendió a tiempo (medicamento, hora, paciente y cama)',
          },
        ]
      : []),
    {
      loc: aviso('se bloqueó'),
      que: 'Cuenta bloqueada por 3 intentos fallidos de inicio de sesión',
    },
    {
      loc: aviso('validaciones faciales fallidas'),
      que: 'Operación cancelada por 3 validaciones faciales fallidas',
    },
  ];
  const conPosicion = [];
  for (const a of avisosMarcados) conPosicion.push({ ...a, y: (await a.loc.boundingBox()).y });
  conPosicion.sort((a, b) => a.y - b.y);
  const marcasNotif = conPosicion.map((a, i) => ({
    n: i + 1,
    loc: a.loc,
    tipo: 'area',
    que: a.que,
    lado: 'tl',
  }));
  // "Marcar leída" se señala en un aviso sin recuadro (el de arriba del primero marcado), con su
  // propio recuadro: así no parece parte de otro aviso.
  const vencidasCuantas = await vencidas.count();
  const conBotonLibre =
    vencidasCuantas > 1 ? vencidas.nth(vencidasCuantas - 2) : aviso('se bloqueó');
  marcasNotif.push(
    {
      n: marcasNotif.length + 1,
      loc: conBotonLibre.getByRole('button', { name: 'Marcar leída' }),
      tipo: 'area',
      margen: 4,
      que: 'Botón "Marcar leída" (lo leído pasa a letra normal)',
      lado: 'der',
    },
    { n: marcasNotif.length + 2, loc: boton('Cerrar', notif), que: 'Botón Cerrar', lado: 'izq' },
  );
  await capturar(
    page,
    '22-notificaciones.png',
    `Notificaciones del administrador: cuenta bloqueada, validación facial fallida${hayVencidas ? ' y toma vencida' : ''}`,
    { marcas: marcasNotif, incluir: [notif] },
  );
  await boton('Cerrar', notif).click();
  await notif.waitFor({ state: 'detached' });
}
