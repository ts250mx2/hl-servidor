-- =====================================================================
--  Migracion: la bitacora guarda la aplicacion (Key de acceso) de cada
--  llamada, para filtrar y agrupar estadisticas por aplicacion.
--  Ejecutar una sola vez sobre bases creadas antes de este cambio.
-- =====================================================================
USE `BDHLServer`;

ALTER TABLE `tblBitacora`
  ADD COLUMN `IdKey`      INT         NULL COMMENT 'key de acceso usada' AFTER `KeyPrefijo`,
  ADD COLUMN `Aplicacion` VARCHAR(80) NULL COMMENT 'nombre de la aplicacion al momento de la llamada' AFTER `IdKey`;

-- Rellena el historico a partir del prefijo de la key.
UPDATE `tblBitacora` b
  INNER JOIN `tblKeys` k ON k.KeyPrefijo = b.KeyPrefijo
  SET b.IdKey = k.IdKey, b.Aplicacion = k.Nombre
  WHERE b.IdKey IS NULL;
