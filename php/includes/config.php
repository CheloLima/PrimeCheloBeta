<?php
// Datenbankkonfiguration
define('DB_HOST', 'localhost');
define('DB_USER', 'chelo_prime');
define('DB_PASS', 'ce0S658^y'); // Bitte nach der Entwicklung durch sicherere Methode ersetzen (z.B. Umgebungsvariablen)
define('DB_NAME', 'chelo_prime');

// Zugangscode für Registrierung
define('REGISTRATION_ACCESS_CODE', 'Chelocord');

// CORS erlauben (für lokale Entwicklung, auf Produktivsystem ggf. anpassen)
header("Access-Control-Allow-Origin: *"); // Erlaubt Anfragen von jeder Domain
header("Access-Control-Allow-Methods: POST, GET, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization");

// Standard-Antworttyp als JSON setzen
header('Content-Type: application/json');

// Fehlerbehandlung
ini_set('display_errors', 0); // Fehler nicht direkt im Output anzeigen
error_reporting(E_ALL);

// Globale Hilfsfunktion für JSON-Antworten
function send_json_response($data, $statusCode = 200) {
    http_response_code($statusCode);
    echo json_encode($data);
    exit;
}

// Datenbankverbindung herstellen (PDO)
try {
    $pdo = new PDO("mysql:host=" . DB_HOST . ";dbname=" . DB_NAME . ";charset=utf8mb4", DB_USER, DB_PASS);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
} catch (PDOException $e) {
    // Im Fehlerfall eine generische Fehlermeldung senden, um Details zu verbergen
    // Loggen Sie den echten Fehler serverseitig für Debugging-Zwecke
    // error_log("Datenbankverbindungsfehler: " . $e->getMessage()); // Beispiel für Logging
    send_json_response(['error' => 'Datenbankverbindungsfehler', 'details' => $e->getMessage()], 500); // Detail nur für Entwicklung
}

// Session starten, falls nicht bereits geschehen
if (session_status() == PHP_SESSION_NONE) {
    session_start();
}
?>
