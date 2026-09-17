-- =====================================================================
--  HL Console - Administrador de llaves de IA
--  Script de creación de base de datos, usuario y tablas
--  Ejecutar como root en MySQL 8.0 (Workbench o consola)
-- =====================================================================

-- ── 1. Base de datos ──────────────────────────────────────────────────
CREATE DATABASE IF NOT EXISTS `BDHLServer`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

-- ── 2. Usuario único: solo desde localhost y desde 201.172.236.128 ────
--    MySQL evalúa host por host, por eso se crea la misma cuenta tres veces
--    (localhost por socket/nombre, 127.0.0.1 por TCP local, y la IP pública).
CREATE USER IF NOT EXISTS 'hladministrador'@'localhost'       IDENTIFIED BY 'HL2026Llaves';
CREATE USER IF NOT EXISTS 'hladministrador'@'127.0.0.1'       IDENTIFIED BY 'HL2026Llaves';
CREATE USER IF NOT EXISTS 'hladministrador'@'201.172.236.128' IDENTIFIED BY 'HL2026Llaves';

GRANT ALL PRIVILEGES ON `BDHLServer`.* TO 'hladministrador'@'localhost';
GRANT ALL PRIVILEGES ON `BDHLServer`.* TO 'hladministrador'@'127.0.0.1';
GRANT ALL PRIVILEGES ON `BDHLServer`.* TO 'hladministrador'@'201.172.236.128';
FLUSH PRIVILEGES;

USE `BDHLServer`;

-- ── 3. Usuarios del portal (password con bcrypt) ──────────────────────
CREATE TABLE IF NOT EXISTS `tblUsuarios` (
  `IdUsuario`  INT NOT NULL AUTO_INCREMENT,
  `Usuario`    VARCHAR(80)  NOT NULL,
  `Login`      VARCHAR(45)  NOT NULL,
  `Password`   VARCHAR(100) NOT NULL COMMENT 'hash bcrypt',
  `Status`     INT NOT NULL DEFAULT 1,
  `FechaAlta`  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`IdUsuario`),
  UNIQUE KEY `uq_login` (`Login`)
) ENGINE = InnoDB;

-- ── 4. Llaves de API (proveedor + modelo + llave cifrada) ────────────
CREATE TABLE IF NOT EXISTS `tblLlaves` (
  `IdLlave`           INT NOT NULL AUTO_INCREMENT,
  `Llave`             VARCHAR(45)  NOT NULL COMMENT 'nombre descriptivo',
  `Proveedor`         VARCHAR(30)  NOT NULL COMMENT 'id de lib/providers.ts: claude, openai, gemini, deepseek, groq, mistral, xai, openrouter, kimi, qwen, glm, otro',
  `Modelo`            VARCHAR(100) NOT NULL COMMENT 'ej. claude-opus-4-8, gpt-5',
  `LlaveEncriptada`   TEXT         NOT NULL COMMENT 'AES-256-GCM base64: iv.tag.cifrado',
  `FechaCaducidad`    DATETIME     NULL,
  `Status`            INT NOT NULL DEFAULT 1,
  `FechaAlta`         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `FechaModificacion` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`IdLlave`)
) ENGINE = InnoDB;

-- ── 5. Agentes: lo que piden las aplicaciones por UUID. Cada agente apunta a una llave ──
CREATE TABLE IF NOT EXISTS `tblAgentes` (
  `IdAgente`          INT NOT NULL AUTO_INCREMENT,
  `Uuid`              CHAR(36)    NOT NULL COMMENT 'identificador publico para el webservice',
  `Agente`            VARCHAR(45) NOT NULL,
  `IdLlave`           INT NOT NULL COMMENT 'llave (proveedor + modelo) que ejecuta este agente',
  `IdLlaveRespaldo`   INT NULL COMMENT 'llave con la que el proxy reintenta si la principal falla (mismo API)',
  `Status`            INT NOT NULL DEFAULT 1,
  `FechaAlta`         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `FechaModificacion` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`IdAgente`),
  UNIQUE KEY `uq_uuid` (`Uuid`),
  KEY `ix_llave` (`IdLlave`),
  KEY `ix_llave_respaldo` (`IdLlaveRespaldo`),
  CONSTRAINT `fk_agentes_llave` FOREIGN KEY (`IdLlave`) REFERENCES `tblLlaves` (`IdLlave`),
  CONSTRAINT `fk_agentes_llave_respaldo` FOREIGN KEY (`IdLlaveRespaldo`) REFERENCES `tblLlaves` (`IdLlave`)
) ENGINE = InnoDB;

-- ── 5b. Keys de acceso: credencial de cada aplicación para el webservice ──
--    Solo se guarda el hash SHA-256. La Key completa se muestra una sola vez.
CREATE TABLE IF NOT EXISTS `tblKeys` (
  `IdKey`      INT NOT NULL AUTO_INCREMENT,
  `Nombre`     VARCHAR(80) NOT NULL COMMENT 'nombre de la aplicación que la usa',
  `KeyHash`    CHAR(64)    NOT NULL,
  `KeyPrefijo` VARCHAR(12) NOT NULL COMMENT 'primeros caracteres para identificarla',
  `SecretoCifrado` TEXT NULL COMMENT 'secreto compartido cifrado con MASTER_KEY; con el se cifra la llave en la respuesta del webservice',
  `Status`     INT NOT NULL DEFAULT 1,
  `UltimoUso`  DATETIME NULL,
  `FechaAlta`  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`IdKey`),
  UNIQUE KEY `uq_keyhash` (`KeyHash`)
) ENGINE = InnoDB;

-- ── 6. Lista blanca de IPs para el webservice ─────────────────────────
CREATE TABLE IF NOT EXISTS `tblIPsPermitidas` (
  `IdIP`        INT NOT NULL AUTO_INCREMENT,
  `IP`          VARCHAR(45)  NOT NULL,
  `Descripcion` VARCHAR(100) NULL,
  `Status`      INT NOT NULL DEFAULT 1,
  `FechaAlta`   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`IdIP`),
  UNIQUE KEY `uq_ip` (`IP`)
) ENGINE = InnoDB;

-- ── 7. Bitácora de consultas al webservice ────────────────────────────
CREATE TABLE IF NOT EXISTS `tblBitacora` (
  `IdBitacora` INT NOT NULL AUTO_INCREMENT,
  `Fecha`      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `IP`         VARCHAR(45) NOT NULL,
  `KeyPrefijo` VARCHAR(12) NULL,
  `IdKey`      INT NULL COMMENT 'key de acceso usada',
  `Aplicacion` VARCHAR(80) NULL COMMENT 'nombre de la aplicacion al momento de la llamada',
  `IdAgente`   INT NULL,
  `Proveedor`  VARCHAR(30)  NULL COMMENT 'proveedor de la llave del agente al momento de la llamada',
  `Modelo`     VARCHAR(100) NULL COMMENT 'modelo de la llave del agente al momento de la llamada',
  `Resultado`  VARCHAR(20) NOT NULL COMMENT 'OK | IP_BLOQUEADA | KEY_INVALIDA | AGENTE_INVALIDO | AGENTE_INACTIVO | LLAVE_INACTIVA | CADUCADO | PROVEEDOR_CAMBIADO | ERROR',
  `Detalle`    VARCHAR(200) NULL,
  `DuracionMs`           INT           NULL COMMENT 'ms desde que llego la peticion hasta que termino la respuesta del proveedor',
  `TokensEntrada`        INT           NULL COMMENT 'tokens de entrada a precio completo (sin cache)',
  `TokensSalida`         INT           NULL,
  `TokensCacheLectura`   INT           NULL,
  `TokensCacheEscritura` INT           NULL,
  `CostoUsd`             DECIMAL(12,6) NULL COMMENT 'gasto estimado en USD segun tblPrecios; NULL si el modelo no tiene precio',
  PRIMARY KEY (`IdBitacora`),
  KEY `ix_fecha` (`Fecha`)
) ENGINE = InnoDB;

-- ── 7b. Auditoria del portal: quien cambio que (sin secretos) ────────
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

-- ── 7c. Precios por modelo para estimar el gasto ─────────────────────
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

-- ── 8. Datos iniciales ────────────────────────────────────────────────
INSERT IGNORE INTO `tblIPsPermitidas` (`IP`, `Descripcion`) VALUES
  ('127.0.0.1',       'Localhost'),
  ('::1',             'Localhost IPv6'),
  ('201.172.236.128', 'IP pública del servidor');

-- Usuario inicial del portal:  admin / admin123   (cámbialo después de entrar)
INSERT IGNORE INTO `tblUsuarios` (`Usuario`, `Login`, `Password`) VALUES
  ('Administrador', 'admin', '$2b$10$kxgs0ranbii4yPv0pVR7R.EGpvbFd5MB8.L7PVGSioE2cXFra/q.W');
