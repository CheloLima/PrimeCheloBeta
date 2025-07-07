-- SQL-Skript zum Erstellen der 'users'-Tabelle

CREATE TABLE IF NOT EXISTS `users` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `username` VARCHAR(255) NOT NULL UNIQUE,
  `password_hash` VARCHAR(255) NOT NULL,
  `api_token` TEXT DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Hinweis: Dieses Skript sollte manuell oder über ein Admin-Tool
-- auf dem Plesk-Server in der Datenbank 'chelo_prime' ausgeführt werden.
-- Die Zugangsdaten sind:
-- Host: localhost
-- Benutzer: chelo_prime
-- Passwort: ce0S658^y
-- Datenbank: chelo_prime
