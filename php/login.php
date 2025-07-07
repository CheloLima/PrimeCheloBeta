<?php
require_once 'includes/config.php';

// Sicherstellen, dass die Anfrage per POST erfolgt
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    send_json_response(['error' => 'Ungültige Anfragemethode.'], 405);
}

$input = json_decode(file_get_contents('php://input'), true);

$username = $input['username'] ?? null;
$password = $input['password'] ?? null;

if (empty($username) || empty($password)) {
    send_json_response(['error' => 'Benutzername und Passwort sind erforderlich.'], 400);
}

try {
    $stmt = $pdo->prepare("SELECT id, username, password_hash FROM users WHERE username = :username");
    $stmt->bindParam(':username', $username);
    $stmt->execute();
    $user = $stmt->fetch(PDO::FETCH_ASSOC);

    if ($user && password_verify($password, $user['password_hash'])) {
        // Passwort ist korrekt, Session starten
        $_SESSION['user_id'] = $user['id'];
        $_SESSION['username'] = $user['username'];

        send_json_response([
            'success' => 'Anmeldung erfolgreich.',
            'user' => [
                'id' => $user['id'],
                'username' => $user['username']
            ]
        ], 200);
    } else {
        send_json_response(['error' => 'Ungültiger Benutzername oder Passwort.'], 401);
    }
} catch (PDOException $e) {
    // error_log("Datenbankfehler beim Login: " . $e->getMessage());
    send_json_response(['error' => 'Datenbankfehler beim Anmeldeversuch.', 'details' => $e->getMessage()], 500);
}
?>
