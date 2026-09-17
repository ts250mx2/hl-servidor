-- =====================================================================
--  Migracion: auditoria del portal. Registra quien creo, edito o elimino
--  llaves, agentes, keys, IPs y usuarios, y que cambio (sin secretos).
--  Ejecutar una sola vez sobre bases creadas antes de este cambio.
-- =====================================================================
USE `BDHLServer`;

CREATE TABLE IF NOT EXISTS `tblAuditoria` (
  `IdAuditoria` INT NOT NULL AUTO_INCREMENT,
  `Fecha`       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `IdUsuario`   INT          NULL COMMENT 'usuario del portal; NULL si ya no existe o fue un login fallido',
  `Usuario`     VARCHAR(80)  NOT NULL COMMENT 'nombre del usuario al momento del cambio',
  `IP`          VARCHAR(45)  NOT NULL,
  `Accion`      VARCHAR(20)  NOT NULL COMMENT 'CREAR | EDITAR | ELIMINAR | REGENERAR | LOGIN | LOGIN_FALLIDO',
  `Entidad`     VARCHAR(20)  NOT NULL COMMENT 'llave | agente | key | ip | usuario | sesion | precio',
  `IdEntidad`   INT          NULL,
  `Nombre`      VARCHAR(100) NOT NULL COMMENT 'nombre del registro afectado',
  `Cambios`     JSON         NULL COMMENT '{ campo: { antes, despues } } solo de lo que cambio; nunca secretos',
  `Detalle`     VARCHAR(200) NULL,
  PRIMARY KEY (`IdAuditoria`),
  KEY `ix_auditoria_fecha` (`Fecha`),
  KEY `ix_auditoria_entidad` (`Entidad`, `IdEntidad`)
) ENGINE = InnoDB;
