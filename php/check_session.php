<?php
require_once 'includes/config.php'; // Stellt sicher, dass die Session gestartet wird

// OPTIONS-Request abfangen (für CORS Preflight)
if ($_SERVER['REQUEST_METHOD'] == 'OPTIONS') {
    send_json_response(null, 204); // No Content
}

if (isset($_SESSION['user_id']) && isset($_SESSION['username'])) {
    // Benutzer ist eingeloggt, hole auch den API-Token, falls vorhanden
    try {
        $stmt = $pdo->prepare("SELECT api_token FROM users WHERE id = :user_id");
        $stmt->bindParam(':user_id', $_SESSION['user_id'], PDO::PARAM_INT);
        $stmt->execute();
        $user_data = $stmt->fetch(PDO::FETCH_ASSOC);
        $api_token = $user_data ? $user_data['api_token'] : null;

        send_json_response([
            'loggedIn' => true,
            'user' => [
                'id' => $_SESSION['user_id'],
                'username' => $_SESSION['username'],
                'api_token' => $api_token
            ]
        ], 200);
    } catch (PDOException $e) {
        // error_log("Fehler beim Abrufen des API-Tokens in check_session: " . $e->getMessage());
        send_json_response(['error' => 'Fehler beim Überprüfen der Session-Daten.', 'details' => $e->getMessage()], 500);
    }
} else {
    send_json_response(['loggedIn' => false, 'error' => 'Keine aktive Session gefunden.'], 401);
}
?>
