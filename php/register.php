<?php
require_once 'includes/config.php';

// Sicherstellen, dass die Anfrage per POST erfolgt
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    send_json_response(['error' => 'Ungültige Anfragemethode.'], 405);
}

// Rohdaten aus dem Request-Body lesen (für JSON-Payloads)
$input = json_decode(file_get_contents('php://input'), true);

$username = $input['username'] ?? null;
$password = $input['password'] ?? null;
$access_code = $input['access_code'] ?? null;

// Validierung der Eingaben
if (empty($username) || empty($password) || empty($access_code)) {
    send_json_response(['error' => 'Alle Felder sind erforderlich: Benutzername, Passwort und Zugangscode.'], 400);
}

if (strlen($password) < 8) {
    send_json_response(['error' => 'Das Passwort muss mindestens 8 Zeichen lang sein.'], 400);
}

// Zugangscode prüfen
if ($access_code !== REGISTRATION_ACCESS_CODE) {
    send_json_response(['error' => 'Ungültiger Zugangscode.'], 403);
}

// Prüfen, ob Benutzername bereits existiert
try {
    $stmt = $pdo->prepare("SELECT id FROM users WHERE username = :username");
    $stmt->bindParam(':username', $username);
    $stmt->execute();
    if ($stmt->fetch()) {
        send_json_response(['error' => 'Benutzername bereits vergeben.'], 409);
    }
} catch (PDOException $e) {
    // error_log("Fehler bei Prüfung des Benutzernamens: " . $e->getMessage());
    send_json_response(['error' => 'Datenbankfehler bei Prüfung des Benutzernamens.', 'details' => $e->getMessage()], 500);
}

// Passwort hashen
$password_hash = password_hash($password, PASSWORD_DEFAULT);
if ($password_hash === false) {
    // error_log("Fehler beim Hashen des Passworts.");
    send_json_response(['error' => 'Fehler bei der Passwortverarbeitung.'], 500);
}

// Neuen Benutzer in die Datenbank einfügen
try {
    $stmt = $pdo->prepare("INSERT INTO users (username, password_hash) VALUES (:username, :password_hash)");
    $stmt->bindParam(':username', $username);
    $stmt->bindParam(':password_hash', $password_hash);

    if ($stmt->execute()) {
        send_json_response(['success' => 'Benutzer erfolgreich registriert.'], 201);
    } else {
        send_json_response(['error' => 'Registrierung fehlgeschlagen.'], 500);
    }
} catch (PDOException $e) {
    // error_log("Fehler beim Einfügen des Benutzers: " . $e->getMessage());
    // Spezifische Fehler für doppelte Einträge (sollte durch vorherige Prüfung abgefangen werden, aber als Fallback)
    if ($e->getCode() == 23000) { // SQLSTATE[23000]: Integrity constraint violation
        send_json_response(['error' => 'Benutzername bereits vergeben (Datenbank-Constraint).'], 409);
    }
    send_json_response(['error' => 'Datenbankfehler bei der Registrierung.', 'details' => $e->getMessage()], 500);
}
?>
