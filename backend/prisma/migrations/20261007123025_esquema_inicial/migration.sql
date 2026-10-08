-- CreateEnum
CREATE TYPE "Sexo" AS ENUM ('FEMENINO', 'MASCULINO', 'OTRO');

-- CreateEnum
CREATE TYPE "EstadoPaciente" AS ENUM ('INTERNADO', 'EGRESADO');

-- CreateEnum
CREATE TYPE "TipoInsumo" AS ENUM ('MEDICAMENTO', 'INSUMO');

-- CreateEnum
CREATE TYPE "ViaAdministracion" AS ENUM ('ORAL', 'SUBLINGUAL', 'INTRAVENOSA', 'INTRAMUSCULAR', 'SUBCUTANEA', 'TOPICA', 'INHALATORIA', 'SONDA', 'RECTAL', 'OTRA');

-- CreateEnum
CREATE TYPE "EstadoPrescripcion" AS ENUM ('VIGENTE', 'SUSPENDIDA', 'FINALIZADA');

-- CreateEnum
CREATE TYPE "TipoSuministro" AS ENUM ('MEDICAMENTO', 'INSUMOS');

-- CreateEnum
CREATE TYPE "EstadoEstudio" AS ENUM ('PROGRAMADO', 'REALIZADO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "TipoRecordatorio" AS ENUM ('MEDICAMENTO', 'ESTUDIO');

-- CreateEnum
CREATE TYPE "EstadoRecordatorio" AS ENUM ('PENDIENTE', 'ATENDIDO', 'VENCIDO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "PrioridadRecordatorio" AS ENUM ('ALTA', 'MEDIA', 'BAJA');

-- CreateEnum
CREATE TYPE "MotivoAsignacion" AS ENUM ('INGRESO', 'TRASLADO', 'REINGRESO');

-- CreateTable
CREATE TABLE "roles" (
    "id" SERIAL NOT NULL,
    "codigo" VARCHAR(30) NOT NULL,
    "nombre" VARCHAR(60) NOT NULL,
    "descripcion" VARCHAR(255),

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permisos" (
    "id" SERIAL NOT NULL,
    "codigo" VARCHAR(60) NOT NULL,
    "descripcion" VARCHAR(255) NOT NULL,
    "modulo" VARCHAR(40) NOT NULL,

    CONSTRAINT "permisos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rol_permiso" (
    "rol_id" INTEGER NOT NULL,
    "permiso_id" INTEGER NOT NULL,

    CONSTRAINT "rol_permiso_pkey" PRIMARY KEY ("rol_id","permiso_id")
);

-- CreateTable
CREATE TABLE "usuarios" (
    "id" SERIAL NOT NULL,
    "nombre_usuario" VARCHAR(30) NOT NULL,
    "contrasena_hash" VARCHAR(100) NOT NULL,
    "dni" VARCHAR(10) NOT NULL,
    "nombre" VARCHAR(80) NOT NULL,
    "apellido" VARCHAR(80) NOT NULL,
    "email" VARCHAR(120),
    "matricula" VARCHAR(30),
    "rol_id" INTEGER NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "fecha_baja" TIMESTAMPTZ(3),
    "intentos_fallidos" INTEGER NOT NULL DEFAULT 0,
    "bloqueado_hasta" TIMESTAMPTZ(3),
    "intentos_biometricos_fallidos" INTEGER NOT NULL DEFAULT 0,
    "ultimo_acceso" TIMESTAMPTZ(3),
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuario_permiso" (
    "usuario_id" INTEGER NOT NULL,
    "permiso_id" INTEGER NOT NULL,
    "otorgado_por_id" INTEGER,
    "otorgado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usuario_permiso_pkey" PRIMARY KEY ("usuario_id","permiso_id")
);

-- CreateTable
CREATE TABLE "salas" (
    "id" SERIAL NOT NULL,
    "nombre" VARCHAR(60) NOT NULL,
    "piso" VARCHAR(20),
    "activa" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "salas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "camas" (
    "id" SERIAL NOT NULL,
    "numero" VARCHAR(10) NOT NULL,
    "sala_id" INTEGER NOT NULL,
    "habilitada" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "camas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pacientes" (
    "id" SERIAL NOT NULL,
    "dni" VARCHAR(10) NOT NULL,
    "nombre" VARCHAR(80) NOT NULL,
    "apellido" VARCHAR(80) NOT NULL,
    "fecha_nacimiento" DATE NOT NULL,
    "sexo" "Sexo" NOT NULL,
    "obra_social" VARCHAR(80),
    "numero_afiliado" VARCHAR(40),
    "diagnostico" VARCHAR(255),
    "contacto_emergencia_nombre" VARCHAR(120),
    "contacto_emergencia_telefono" VARCHAR(30),
    "observaciones" VARCHAR(500),
    "estado" "EstadoPaciente" NOT NULL DEFAULT 'INTERNADO',
    "fecha_ingreso" TIMESTAMPTZ(3) NOT NULL,
    "fecha_egreso" TIMESTAMPTZ(3),
    "motivo_egreso" VARCHAR(255),
    "creado_por_id" INTEGER NOT NULL,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "pacientes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asignaciones_cama" (
    "id" SERIAL NOT NULL,
    "paciente_id" INTEGER NOT NULL,
    "cama_id" INTEGER NOT NULL,
    "motivo" "MotivoAsignacion" NOT NULL,
    "fecha_desde" TIMESTAMPTZ(3) NOT NULL,
    "fecha_hasta" TIMESTAMPTZ(3),
    "asignado_por_id" INTEGER NOT NULL,
    "liberado_por_id" INTEGER,

    CONSTRAINT "asignaciones_cama_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "insumos" (
    "id" SERIAL NOT NULL,
    "nombre" VARCHAR(120) NOT NULL,
    "tipo" "TipoInsumo" NOT NULL,
    "unidad_medida" VARCHAR(30) NOT NULL,
    "presentacion" VARCHAR(120) NOT NULL DEFAULT '',
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "insumos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prescripciones" (
    "id" SERIAL NOT NULL,
    "paciente_id" INTEGER NOT NULL,
    "insumo_id" INTEGER NOT NULL,
    "dosis" DOUBLE PRECISION NOT NULL,
    "unidad_dosis" VARCHAR(30) NOT NULL,
    "frecuencia_horas" INTEGER NOT NULL,
    "via" "ViaAdministracion" NOT NULL,
    "fecha_inicio" TIMESTAMPTZ(3) NOT NULL,
    "fecha_fin" TIMESTAMPTZ(3),
    "observaciones" VARCHAR(500),
    "estado" "EstadoPrescripcion" NOT NULL DEFAULT 'VIGENTE',
    "motivo_cambio_estado" VARCHAR(255),
    "prescriptor_id" INTEGER NOT NULL,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "prescripciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suministros" (
    "id" SERIAL NOT NULL,
    "paciente_id" INTEGER NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "tipo" "TipoSuministro" NOT NULL,
    "prescripcion_id" INTEGER,
    "fecha_hora" TIMESTAMPTZ(3) NOT NULL,
    "observaciones" VARCHAR(500),
    "validado_biometricamente" BOOLEAN NOT NULL DEFAULT false,
    "motivo_correccion" VARCHAR(255),
    "corregido_en" TIMESTAMPTZ(3),
    "corregido_por_id" INTEGER,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "suministros_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "detalles_suministro" (
    "id" SERIAL NOT NULL,
    "suministro_id" INTEGER NOT NULL,
    "insumo_id" INTEGER NOT NULL,
    "cantidad" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "detalles_suministro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "datos_biometricos" (
    "id" SERIAL NOT NULL,
    "usuario_id" INTEGER NOT NULL,
    "patron" DOUBLE PRECISION[],
    "foto_referencia" BYTEA NOT NULL,
    "foto_tipo" VARCHAR(30) NOT NULL,
    "registrado_por_id" INTEGER NOT NULL,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "datos_biometricos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tipos_estudio" (
    "id" SERIAL NOT NULL,
    "nombre" VARCHAR(80) NOT NULL,
    "preparacion_por_defecto" VARCHAR(255),
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "tipos_estudio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "estudios" (
    "id" SERIAL NOT NULL,
    "paciente_id" INTEGER NOT NULL,
    "tipo_estudio_id" INTEGER NOT NULL,
    "nombre" VARCHAR(120) NOT NULL,
    "fecha_hora" TIMESTAMPTZ(3) NOT NULL,
    "preparacion" VARCHAR(500),
    "estado" "EstadoEstudio" NOT NULL DEFAULT 'PROGRAMADO',
    "motivo_cancelacion" VARCHAR(255),
    "realizado_en" TIMESTAMPTZ(3),
    "confirmado_por_id" INTEGER,
    "creado_por_id" INTEGER NOT NULL,
    "creado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "estudios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recordatorios" (
    "id" SERIAL NOT NULL,
    "tipo" "TipoRecordatorio" NOT NULL,
    "paciente_id" INTEGER NOT NULL,
    "prescripcion_id" INTEGER,
    "estudio_id" INTEGER,
    "fecha_hora_objetivo" TIMESTAMPTZ(3) NOT NULL,
    "generado_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "prioridad" "PrioridadRecordatorio" NOT NULL,
    "estado" "EstadoRecordatorio" NOT NULL DEFAULT 'PENDIENTE',
    "atendido_por_id" INTEGER,
    "atendido_en" TIMESTAMPTZ(3),
    "suministro_id" INTEGER,

    CONSTRAINT "recordatorios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auditoria" (
    "id" SERIAL NOT NULL,
    "usuario_id" INTEGER,
    "fecha_hora" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accion" VARCHAR(40) NOT NULL,
    "entidad" VARCHAR(40) NOT NULL,
    "entidad_id" VARCHAR(40),
    "paciente_id" INTEGER,
    "valor_anterior" JSONB,
    "valor_nuevo" JSONB,
    "detalle" VARCHAR(255),

    CONSTRAINT "auditoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notificaciones" (
    "id" SERIAL NOT NULL,
    "destinatario_id" INTEGER NOT NULL,
    "tipo" VARCHAR(40) NOT NULL,
    "mensaje" VARCHAR(255) NOT NULL,
    "datos" JSONB,
    "leida" BOOLEAN NOT NULL DEFAULT false,
    "creada_en" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notificaciones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "roles_codigo_key" ON "roles"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "permisos_codigo_key" ON "permisos"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_nombre_usuario_key" ON "usuarios"("nombre_usuario");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_dni_key" ON "usuarios"("dni");

-- CreateIndex
CREATE UNIQUE INDEX "salas_nombre_key" ON "salas"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "camas_sala_id_numero_key" ON "camas"("sala_id", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "pacientes_dni_key" ON "pacientes"("dni");

-- CreateIndex
CREATE INDEX "pacientes_apellido_idx" ON "pacientes"("apellido");

-- CreateIndex
CREATE INDEX "asignaciones_cama_paciente_id_idx" ON "asignaciones_cama"("paciente_id");

-- CreateIndex
CREATE UNIQUE INDEX "insumos_nombre_presentacion_key" ON "insumos"("nombre", "presentacion");

-- CreateIndex
CREATE INDEX "prescripciones_paciente_id_estado_idx" ON "prescripciones"("paciente_id", "estado");

-- CreateIndex
CREATE INDEX "suministros_paciente_id_fecha_hora_idx" ON "suministros"("paciente_id", "fecha_hora");

-- CreateIndex
CREATE INDEX "suministros_usuario_id_idx" ON "suministros"("usuario_id");

-- CreateIndex
CREATE UNIQUE INDEX "datos_biometricos_usuario_id_key" ON "datos_biometricos"("usuario_id");

-- CreateIndex
CREATE UNIQUE INDEX "tipos_estudio_nombre_key" ON "tipos_estudio"("nombre");

-- CreateIndex
CREATE INDEX "estudios_paciente_id_estado_idx" ON "estudios"("paciente_id", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "recordatorios_suministro_id_key" ON "recordatorios"("suministro_id");

-- CreateIndex
CREATE INDEX "recordatorios_estado_fecha_hora_objetivo_idx" ON "recordatorios"("estado", "fecha_hora_objetivo");

-- CreateIndex
CREATE UNIQUE INDEX "recordatorios_prescripcion_id_fecha_hora_objetivo_key" ON "recordatorios"("prescripcion_id", "fecha_hora_objetivo");

-- CreateIndex
CREATE UNIQUE INDEX "recordatorios_estudio_id_fecha_hora_objetivo_key" ON "recordatorios"("estudio_id", "fecha_hora_objetivo");

-- CreateIndex
CREATE INDEX "auditoria_entidad_entidad_id_idx" ON "auditoria"("entidad", "entidad_id");

-- CreateIndex
CREATE INDEX "auditoria_fecha_hora_idx" ON "auditoria"("fecha_hora");

-- CreateIndex
CREATE INDEX "auditoria_usuario_id_idx" ON "auditoria"("usuario_id");

-- CreateIndex
CREATE INDEX "auditoria_paciente_id_idx" ON "auditoria"("paciente_id");

-- CreateIndex
CREATE INDEX "notificaciones_destinatario_id_leida_idx" ON "notificaciones"("destinatario_id", "leida");

-- AddForeignKey
ALTER TABLE "rol_permiso" ADD CONSTRAINT "rol_permiso_rol_id_fkey" FOREIGN KEY ("rol_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rol_permiso" ADD CONSTRAINT "rol_permiso_permiso_id_fkey" FOREIGN KEY ("permiso_id") REFERENCES "permisos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_rol_id_fkey" FOREIGN KEY ("rol_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuario_permiso" ADD CONSTRAINT "usuario_permiso_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuario_permiso" ADD CONSTRAINT "usuario_permiso_permiso_id_fkey" FOREIGN KEY ("permiso_id") REFERENCES "permisos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuario_permiso" ADD CONSTRAINT "usuario_permiso_otorgado_por_id_fkey" FOREIGN KEY ("otorgado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "camas" ADD CONSTRAINT "camas_sala_id_fkey" FOREIGN KEY ("sala_id") REFERENCES "salas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pacientes" ADD CONSTRAINT "pacientes_creado_por_id_fkey" FOREIGN KEY ("creado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asignaciones_cama" ADD CONSTRAINT "asignaciones_cama_paciente_id_fkey" FOREIGN KEY ("paciente_id") REFERENCES "pacientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asignaciones_cama" ADD CONSTRAINT "asignaciones_cama_cama_id_fkey" FOREIGN KEY ("cama_id") REFERENCES "camas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asignaciones_cama" ADD CONSTRAINT "asignaciones_cama_asignado_por_id_fkey" FOREIGN KEY ("asignado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asignaciones_cama" ADD CONSTRAINT "asignaciones_cama_liberado_por_id_fkey" FOREIGN KEY ("liberado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescripciones" ADD CONSTRAINT "prescripciones_paciente_id_fkey" FOREIGN KEY ("paciente_id") REFERENCES "pacientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescripciones" ADD CONSTRAINT "prescripciones_insumo_id_fkey" FOREIGN KEY ("insumo_id") REFERENCES "insumos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescripciones" ADD CONSTRAINT "prescripciones_prescriptor_id_fkey" FOREIGN KEY ("prescriptor_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suministros" ADD CONSTRAINT "suministros_paciente_id_fkey" FOREIGN KEY ("paciente_id") REFERENCES "pacientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suministros" ADD CONSTRAINT "suministros_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suministros" ADD CONSTRAINT "suministros_prescripcion_id_fkey" FOREIGN KEY ("prescripcion_id") REFERENCES "prescripciones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suministros" ADD CONSTRAINT "suministros_corregido_por_id_fkey" FOREIGN KEY ("corregido_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detalles_suministro" ADD CONSTRAINT "detalles_suministro_suministro_id_fkey" FOREIGN KEY ("suministro_id") REFERENCES "suministros"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detalles_suministro" ADD CONSTRAINT "detalles_suministro_insumo_id_fkey" FOREIGN KEY ("insumo_id") REFERENCES "insumos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "datos_biometricos" ADD CONSTRAINT "datos_biometricos_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "datos_biometricos" ADD CONSTRAINT "datos_biometricos_registrado_por_id_fkey" FOREIGN KEY ("registrado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estudios" ADD CONSTRAINT "estudios_paciente_id_fkey" FOREIGN KEY ("paciente_id") REFERENCES "pacientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estudios" ADD CONSTRAINT "estudios_tipo_estudio_id_fkey" FOREIGN KEY ("tipo_estudio_id") REFERENCES "tipos_estudio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estudios" ADD CONSTRAINT "estudios_confirmado_por_id_fkey" FOREIGN KEY ("confirmado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "estudios" ADD CONSTRAINT "estudios_creado_por_id_fkey" FOREIGN KEY ("creado_por_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recordatorios" ADD CONSTRAINT "recordatorios_paciente_id_fkey" FOREIGN KEY ("paciente_id") REFERENCES "pacientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recordatorios" ADD CONSTRAINT "recordatorios_prescripcion_id_fkey" FOREIGN KEY ("prescripcion_id") REFERENCES "prescripciones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recordatorios" ADD CONSTRAINT "recordatorios_estudio_id_fkey" FOREIGN KEY ("estudio_id") REFERENCES "estudios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recordatorios" ADD CONSTRAINT "recordatorios_atendido_por_id_fkey" FOREIGN KEY ("atendido_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recordatorios" ADD CONSTRAINT "recordatorios_suministro_id_fkey" FOREIGN KEY ("suministro_id") REFERENCES "suministros"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auditoria" ADD CONSTRAINT "auditoria_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificaciones" ADD CONSTRAINT "notificaciones_destinatario_id_fkey" FOREIGN KEY ("destinatario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
