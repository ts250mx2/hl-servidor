-- =====================================================================
--  Migración: separa Llaves de API y Agentes.
--  Solo ejecutar si la base YA existía con la version anterior
--  (tblAgentes con Proveedor/Modelo y tblKeys con IdAgente).
--  Si vas a crear la base desde cero, usa BDHLServer.sql.
--  Conserva los UUID existentes: cada agente anterior se convierte en
--  una llave + un agente con el mismo nombre y UUID.
-- =====================================================================
USE `BDHLServer`;

-- 1. Las keys de acceso dejan de apuntar a un agente
ALTER TABLE `tblKeys` DROP FOREIGN KEY `fk_keys_agente`;
ALTER TABLE `tblKeys` DROP INDEX `ix_agente`;
ALTER TABLE `tblKeys` DROP COLUMN `IdAgente`;

-- 2. La tabla anterior de agentes pasa a ser la de llaves
RENAME TABLE `tblAgentes` TO `tblLlaves`;
ALTER TABLE `tblLlaves` RENAME COLUMN `IdAgente` TO `IdLlave`;
ALTER TABLE `tblLlaves` RENAME COLUMN `Agente` TO `Llave`;

-- 3. Nueva tabla de agentes
CREATE TABLE `tblAgentes` (
  `IdAgente`          INT NOT NULL AUTO_INCREMENT,
  `Uuid`              CHAR(36)    NOT NULL COMMENT 'identificador publico para el webservice',
  `Agente`            VARCHAR(45) NOT NULL,
  `IdLlave`           INT NOT NULL COMMENT 'llave (proveedor + modelo) que ejecuta este agente',
  `Status`            INT NOT NULL DEFAULT 1,
  `FechaAlta`         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `FechaModificacion` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`IdAgente`),
  UNIQUE KEY `uq_uuid` (`Uuid`),
  KEY `ix_llave` (`IdLlave`),
  CONSTRAINT `fk_agentes_llave` FOREIGN KEY (`IdLlave`) REFERENCES `tblLlaves` (`IdLlave`)
) ENGINE = InnoDB;

-- 4. Un agente por cada llave existente, conservando UUID, nombre y status
INSERT INTO `tblAgentes` (`IdAgente`, `Uuid`, `Agente`, `IdLlave`, `Status`)
SELECT `IdLlave`, `Uuid`, `Llave`, `IdLlave`, `Status` FROM `tblLlaves`;

-- 5. El UUID ya no vive en la llave
ALTER TABLE `tblLlaves` DROP INDEX `uq_uuid`;
ALTER TABLE `tblLlaves` DROP COLUMN `Uuid`;

-- 6. Bitacora: IdAgente sigue apuntando a tblAgentes (mismos ids), no requiere cambios
