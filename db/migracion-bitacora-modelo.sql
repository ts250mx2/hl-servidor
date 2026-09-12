-- =====================================================================
--  Migracion: la bitacora guarda tambien proveedor y modelo de cada
--  llamada, para agrupar estadisticas por proveedor y por modelo.
--  Ejecutar una sola vez sobre bases creadas antes de este cambio.
-- =====================================================================
USE `BDHLServer`;

ALTER TABLE `tblBitacora`
  ADD COLUMN `Proveedor` VARCHAR(30)  NULL COMMENT 'proveedor de la llave del agente al momento de la llamada' AFTER `IdAgente`,
  ADD COLUMN `Modelo`    VARCHAR(100) NULL COMMENT 'modelo de la llave del agente al momento de la llamada'   AFTER `Proveedor`;
