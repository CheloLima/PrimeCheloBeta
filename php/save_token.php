<?php
require_once 'includes/config.php';

// Sicherstellen, dass der Benutzer eingeloggt ist
if (!isset($_SESSION['user_id'])) {
    send_json_response(['error' => 'Nicht authentifiziert. Bitte zuerst anmelden.'], 401);
}

// Sicherstellen, dass die Anfrage per POST erfolgt
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    send_json_response(['error' => 'Ungültige Anfragemethode.'], 405);
}

$input = json_decode(file_get_contents('php://input'), true);
$api_token = $input['api_token'] ?? null;

if (empty($api_token)) {
    // Erlaube auch das Löschen des Tokens, indem ein leerer String gesendet wird
    // send_json_response(['error' => 'API-Token ist erforderlich.'], 400);
}

try {
    $stmt = $pdo->prepare("UPDATE users SET api_token = :api_token WHERE id = :user_id");
    $stmt->bindParam(':api_token', $api_token); // Kann auch NULL sein, wenn der Token entfernt werden soll
    $stmt->bindParam(':user_id', $_SESSION['user_id'], PDO::PARAM_INT);

    if ($stmt->execute()) {
        if ($stmt->rowCount() > 0) {
            send_json_response(['success' => 'API-Token erfolgreich gespeichert.'], 200);
        } else {
            // Kein Fehler, aber auch keine Zeile betroffen (z.B. Token war schon gleich oder User ID nicht gefunden - letzteres sollte nicht passieren)
            send_json_response(['success' => 'API-Token-Status unverändert oder Benutzer nicht gefunden.'], 200);
        }
    } else {
        send_json_response(['error' => 'Fehler beim Speichern des API-Tokens.'], 500);
    }
} catch (PDOException $e) {
    // error_log("Datenbankfehler beim Speichern des API-Tokens: " . $e->getMessage());
    send_json_response(['error' => 'Datenbankfehler beim Speichern des API-Tokens.', 'details' => $e->getMessage()], 500);
}
?>
