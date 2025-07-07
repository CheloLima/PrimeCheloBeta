<?php
require_once 'includes/config.php'; // Stellt sicher, dass die Session-Konfiguration geladen wird

// Session-Variablen löschen
$_SESSION = array();

// Session-Cookie löschen, falls verwendet
if (ini_get("session.use_cookies")) {
    $params = session_get_cookie_params();
    setcookie(session_name(), '', time() - 42000,
        $params["path"], $params["domain"],
        $params["secure"], $params["httponly"]
    );
}

// Session zerstören
session_destroy();

send_json_response(['success' => 'Abmeldung erfolgreich.'], 200);
?>
