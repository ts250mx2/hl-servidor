-- =====================================================================
--  Migracion: alertas y presupuestos.
--  - tblAlertas: avisos que genera HL (llave por caducar, proveedor que
--    rechaza, respaldo usado, presupuesto agotado, gasto diario...). Se ven
--    en el portal y, si hay webhook o SMTP configurados, se envian.
--  - Presupuesto diario (USD) y tope de llamadas por dia en keys y agentes;
--    al rebasarlos el webservice y el proxy responden 429 PRESUPUESTO.
--  Ejecutar una sola vez sobre bases creadas antes de este cambio.
-- =====================================================================
USE `BDHLServer`;

CREATE TABLE IF NOT EXISTS `tblAlertas` (
  `IdAlerta` INT NOT NULL AUTO_INCREMENT,
  `Fecha`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `Tipo`     VARCHAR(30)  NOT NULL COMMENT 'LLAVE_CADUCADA | LLAVE_POR_CADUCAR | PROVEEDOR_RECHAZA | RESPALDO_USADO | PRESUPUESTO | GASTO_DIARIO | ACCESO_NO_PERMITIDO',
  `Nivel`    VARCHAR(10)  NOT NULL COMMENT 'info | warn | bad',
  `Titulo`   VARCHAR(160) NOT NULL,
  `Detalle`  VARCHAR(500) NULL,
  `Clave`    VARCHAR(120) NOT NULL COMMENT 'identidad del aviso: no se repite el mismo en 24 h',
  `Leida`    TINYINT(1)   NOT NULL DEFAULT 0,
  `Enviada`  TINYINT(1)   NOT NULL DEFAULT 0 COMMENT '1 si salio por webhook o correo',
  `Canal`    VARCHAR(60)  NULL COMMENT 'por donde se envio, o el error',
  PRIMARY KEY (`IdAlerta`),
  KEY `ix_alertas_fecha` (`Fecha`),
  KEY `ix_alertas_clave` (`Clave`, `Fecha`),
  KEY `ix_alertas_leida` (`Leida`)
) ENGINE = InnoDB;

ALTER TABLE `tblKeys`
  ADD COLUMN `PresupuestoDiarioUsd` DECIMAL(10,2) NULL COMMENT 'gasto maximo por dia; NULL = sin tope' AFTER `Status`,
  ADD COLUMN `MaxLlamadasDia`       INT           NULL COMMENT 'llamadas aceptadas por dia; NULL = sin tope' AFTER `PresupuestoDiarioUsd`;

ALTER TABLE `tblAgentes`
  ADD COLUMN `PresupuestoDiarioUsd` DECIMAL(10,2) NULL COMMENT 'gasto maximo por dia; NULL = sin tope' AFTER `Status`,
  ADD COLUMN `MaxLlamadasDia`       INT           NULL COMMENT 'llamadas aceptadas por dia; NULL = sin tope' AFTER `PresupuestoDiarioUsd`;

-- Para sumar el uso del dia por key y por agente sin recorrer toda la bitacora.
ALTER TABLE `tblBitacora`
  ADD KEY `ix_bitacora_key_fecha` (`IdKey`, `Fecha`),
  ADD KEY `ix_bitacora_agente_fecha` (`IdAgente`, `Fecha`);
