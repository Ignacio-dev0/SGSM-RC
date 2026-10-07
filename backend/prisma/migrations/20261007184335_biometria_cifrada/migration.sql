-- T705 · RNF06: el patrón facial y la foto de referencia se guardan cifrados con AES-256-GCM
-- (docs/seguridad.md, D50–D53). Generada con `prisma migrate diff` (migrate dev --create-only no
-- corre sin terminal interactiva) y editada para no perder los datos existentes.
--
-- SQL no tiene la clave: los registros existentes pasan al formato 0 ("en claro, pendiente de
-- cifrar": un byte 0 y después los bytes) y `npm run biometria:cifrar -w backend` los cifra
-- (formato 1). El servidor corre lo mismo al arrancar, así que no quedan en claro aunque nadie
-- corra el script. La aplicación nunca lee el formato 0 como válido.
-- El patrón va como 128 double big-endian (float8send), igual que patronABytes() del backend.

-- AlterTable
ALTER TABLE "datos_biometricos" ADD COLUMN "patron_cifrado" BYTEA,
ADD COLUMN "foto_cifrada" BYTEA;

UPDATE "datos_biometricos" d SET
  "patron_cifrado" = '\x00'::bytea || (
    SELECT string_agg(float8send(t.v), ''::bytea ORDER BY t.i)
    FROM unnest(d."patron") WITH ORDINALITY AS t(v, i)),
  "foto_cifrada" = '\x00'::bytea || d."foto_referencia";

-- Si algún registro no tuviera patrón, esto falla y no se pierde nada.
ALTER TABLE "datos_biometricos" ALTER COLUMN "patron_cifrado" SET NOT NULL,
ALTER COLUMN "foto_cifrada" SET NOT NULL;

ALTER TABLE "datos_biometricos" DROP CONSTRAINT "datos_biometricos_patron_128";
ALTER TABLE "datos_biometricos" DROP COLUMN "foto_referencia",
DROP COLUMN "patron";

-- Los 128 valores (1024 bytes) se controlan por el largo: 1 + 1024 en formato 0 y
-- 1 + 4 + 12 + 16 + 1024 en formato 1. Un formato nuevo necesita actualizar esta restricción.
ALTER TABLE "datos_biometricos" ADD CONSTRAINT "datos_biometricos_patron_128"
  CHECK (octet_length("patron_cifrado") = CASE get_byte("patron_cifrado", 0)
    WHEN 0 THEN 1025 WHEN 1 THEN 1057 ELSE -1 END);
