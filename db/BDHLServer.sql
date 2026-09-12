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
  `Status`            INT NOT NULL DEFAULT 1,
  `FechaAlta`         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `FechaModificacion` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`IdAgente`),
  UNIQUE KEY `uq_uuid` (`Uuid`),
  KEY `ix_llave` (`IdLlave`),
  CONSTRAINT `fk_agentes_llave` FOREIGN KEY (`IdLlave`) REFERENCES `tblLlaves` (`IdLlave`)
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
  PRIMARY KEY (`IdBitacora`),
  KEY `ix_fecha` (`Fecha`)
) ENGINE = InnoDB;

-- ── 8. Datos iniciales ────────────────────────────────────────────────
INSERT IGNORE INTO `tblIPsPermitidas` (`IP`, `Descripcion`) VALUES
  ('127.0.0.1',       'Localhost'),
  ('::1',             'Localhost IPv6'),
  ('201.172.236.128', 'IP pública del servidor');

-- Usuario inicial del portal:  admin / admin123   (cámbialo después de entrar)
INSERT IGNORE INTO `tblUsuarios` (`Usuario`, `Login`, `Password`) VALUES
  ('Administrador', 'admin', '$2b$10$kxgs0ranbii4yPv0pVR7R.EGpvbFd5MB8.L7PVGSioE2cXFra/q.W');
