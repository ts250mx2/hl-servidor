-- =====================================================================
--  Migracion: secreto compartido por Key de acceso.
--  Con el, el webservice regresa la llave de API cifrada (AES-256-GCM)
--  y la app la descifra con su HL_SECRET. Ejecutar una sola vez.
--  Las keys existentes quedan sin secreto: regenera cada una desde el
--  portal (Keys de acceso -> Regenerar) para obtener Key + Secreto.
-- =====================================================================
USE `BDHLServer`;

ALTER TABLE `tblKeys`
  ADD COLUMN `SecretoCifrado` TEXT NULL
    COMMENT 'secreto compartido cifrado con MASTER_KEY; con el se cifra la llave en la respuesta del webservice'
    AFTER `KeyPrefijo`;
