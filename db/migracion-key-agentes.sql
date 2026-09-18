-- =====================================================================
--  Migracion: agentes permitidos por key de acceso. Una key sin filas aqui
--  puede usar cualquier agente (como hasta ahora); con filas, solo esos.
--  El webservice y el proxy rechazan lo demas con AGENTE_NO_PERMITIDO.
--  Ejecutar una sola vez sobre bases creadas antes de este cambio.
-- =====================================================================
USE `BDHLServer`;

CREATE TABLE IF NOT EXISTS `tblKeyAgentes` (
  `IdKey`    INT NOT NULL,
  `IdAgente` INT NOT NULL,
  PRIMARY KEY (`IdKey`, `IdAgente`),
  KEY `ix_keyagentes_agente` (`IdAgente`),
  CONSTRAINT `fk_keyagentes_key` FOREIGN KEY (`IdKey`) REFERENCES `tblKeys` (`IdKey`) ON DELETE CASCADE,
  CONSTRAINT `fk_keyagentes_agente` FOREIGN KEY (`IdAgente`) REFERENCES `tblAgentes` (`IdAgente`) ON DELETE CASCADE
) ENGINE = InnoDB;
