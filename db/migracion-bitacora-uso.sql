-- =====================================================================
--  Migracion: uso por llamada (duracion, tokens y gasto estimado) y
--  tabla de precios por modelo para calcularlo.
--  Ejecutar una sola vez sobre bases creadas antes de este cambio.
-- =====================================================================
USE `BDHLServer`;

ALTER TABLE `tblBitacora`
  ADD COLUMN `DuracionMs`           INT           NULL COMMENT 'ms desde que llego la peticion hasta que termino la respuesta del proveedor' AFTER `Detalle`,
  ADD COLUMN `TokensEntrada`        INT           NULL COMMENT 'tokens de entrada a precio completo (sin cache)' AFTER `DuracionMs`,
  ADD COLUMN `TokensSalida`         INT           NULL AFTER `TokensEntrada`,
  ADD COLUMN `TokensCacheLectura`   INT           NULL AFTER `TokensSalida`,
  ADD COLUMN `TokensCacheEscritura` INT           NULL AFTER `TokensCacheLectura`,
  ADD COLUMN `CostoUsd`             DECIMAL(12,6) NULL COMMENT 'gasto estimado en USD segun tblPrecios; NULL si el modelo no tiene precio' AFTER `TokensCacheEscritura`;

-- Precios en USD por millon de tokens. Modelo es un prefijo: gana el mas largo que coincida.
CREATE TABLE IF NOT EXISTS `tblPrecios` (
  `IdPrecio`          INT NOT NULL AUTO_INCREMENT,
  `Proveedor`         VARCHAR(30)   NOT NULL,
  `Modelo`            VARCHAR(100)  NOT NULL COMMENT 'prefijo del identificador del modelo',
  `Entrada`           DECIMAL(10,4) NOT NULL DEFAULT 0 COMMENT 'USD por millon de tokens de entrada',
  `Salida`            DECIMAL(10,4) NOT NULL DEFAULT 0,
  `CacheLectura`      DECIMAL(10,4) NOT NULL DEFAULT 0,
  `CacheEscritura`    DECIMAL(10,4) NOT NULL DEFAULT 0,
  `Nota`              VARCHAR(120)  NULL,
  `FechaModificacion` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`IdPrecio`),
  UNIQUE KEY `uq_precio_modelo` (`Proveedor`, `Modelo`)
) ENGINE = InnoDB;

-- Valores orientativos de lista publica (verifica contra la pagina de precios de cada proveedor).
INSERT IGNORE INTO `tblPrecios` (`Proveedor`, `Modelo`, `Entrada`, `Salida`, `CacheLectura`, `CacheEscritura`, `Nota`) VALUES
  ('claude', 'claude-fable-5-1',  10.00, 50.00, 0.25, 12.50, 'lista Anthropic'),
  ('claude', 'claude-fable-5',    10.00, 50.00, 1.00, 12.50, 'lista Anthropic'),
  ('claude', 'claude-opus-5',      5.00, 25.00, 0.50,  6.25, 'lista Anthropic'),
  ('claude', 'claude-opus-4-8',    5.00, 25.00, 0.50,  6.25, 'lista Anthropic'),
  ('claude', 'claude-opus-4-7',    5.00, 25.00, 0.50,  6.25, 'lista Anthropic'),
  ('claude', 'claude-opus-4-6',    5.00, 25.00, 0.50,  6.25, 'lista Anthropic'),
  ('claude', 'claude-sonnet-5',    2.00, 10.00, 0.20,  2.50, 'lista Anthropic'),
  ('claude', 'claude-sonnet-4-6',  3.00, 15.00, 0.30,  3.75, 'lista Anthropic'),
  ('claude', 'claude-haiku-4-5',   1.00,  5.00, 0.10,  1.25, 'lista Anthropic'),
  ('openai', 'gpt-5-mini',         0.25,  2.00, 0.025, 0, 'orientativo, verifica'),
  ('openai', 'gpt-5-nano',         0.05,  0.40, 0.005, 0, 'orientativo, verifica'),
  ('openai', 'gpt-5',              1.25, 10.00, 0.125, 0, 'orientativo, verifica'),
  ('openai', 'gpt-4.1-mini',       0.40,  1.60, 0.10,  0, 'orientativo, verifica'),
  ('openai', 'gpt-4.1',            2.00,  8.00, 0.50,  0, 'orientativo, verifica'),
  ('openai', 'gpt-4o-mini',        0.15,  0.60, 0.075, 0, 'orientativo, verifica'),
  ('openai', 'gpt-4o',             2.50, 10.00, 1.25,  0, 'orientativo, verifica'),
  ('openai', 'o4-mini',            1.10,  4.40, 0.275, 0, 'orientativo, verifica'),
  ('openai', 'o3',                 2.00,  8.00, 0.50,  0, 'orientativo, verifica'),
  ('gemini', 'gemini-2.5-pro',     1.25, 10.00, 0.31,  0, 'orientativo, verifica'),
  ('gemini', 'gemini-2.5-flash-lite', 0.10, 0.40, 0.025, 0, 'orientativo, verifica'),
  ('gemini', 'gemini-2.5-flash',   0.30,  2.50, 0.075, 0, 'orientativo, verifica'),
  ('gemini', 'gemini-2.0-flash',   0.10,  0.40, 0.025, 0, 'orientativo, verifica'),
  ('deepseek', 'deepseek-chat',    0.27,  1.10, 0.07,  0, 'orientativo, verifica'),
  ('deepseek', 'deepseek-reasoner', 0.55, 2.19, 0.14,  0, 'orientativo, verifica');
