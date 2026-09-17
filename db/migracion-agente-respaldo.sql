-- =====================================================================
--  Migracion: llave de respaldo por agente. Si el proveedor de la llave
--  principal falla (saturado, sin saldo, caido, llave revocada), el proxy
--  reintenta la llamada con esta llave. Debe hablar el mismo API que la
--  principal (Claude con Claude, OpenAI con OpenAI o compatibles).
--  Ejecutar una sola vez sobre bases creadas antes de este cambio.
-- =====================================================================
USE `BDHLServer`;

ALTER TABLE `tblAgentes`
  ADD COLUMN `IdLlaveRespaldo` INT NULL COMMENT 'llave con la que se reintenta si la principal falla' AFTER `IdLlave`,
  ADD KEY `ix_llave_respaldo` (`IdLlaveRespaldo`),
  ADD CONSTRAINT `fk_agentes_llave_respaldo` FOREIGN KEY (`IdLlaveRespaldo`) REFERENCES `tblLlaves` (`IdLlave`);
