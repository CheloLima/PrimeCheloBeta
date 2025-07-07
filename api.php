<?php
require_once 'php/includes/config.php'; // Stellt sicher, dass PDO, Session etc. initialisiert sind

// Aktion aus dem GET-Parameter oder POST-Parameter bestimmen
$action = $_REQUEST['action'] ?? ''; // $_REQUEST prüft GET und POST

// Routing zu den entsprechenden Funktionen
switch ($action) {
    case 'register':
        handle_register($pdo);
        break;
    case 'login':
        handle_login($pdo);
        break;
    case 'logout':
        handle_logout(); // Braucht kein $pdo, da es nur Sessions betrifft
        break;
    case 'check_session':
        handle_check_session($pdo);
        break;
    case 'save_token':
        handle_save_token($pdo);
        break;
    case 'get_warframe_data':
        handle_get_warframe_data($pdo);
        break;
    default:
        send_json_response(['error' => 'Ungültige oder fehlende Aktion.'], 400);
        break;
}

// --- Funktionsdefinitionen (migriert aus den alten Dateien) ---

function handle_register($pdo) {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        send_json_response(['error' => 'Ungültige Anfragemethode für Registrierung.'], 405);
    }
    $input = json_decode(file_get_contents('php://input'), true);
    $username = $input['username'] ?? null;
    $password = $input['password'] ?? null;
    $access_code = $input['access_code'] ?? null;

    if (empty($username) || empty($password) || empty($access_code)) {
        send_json_response(['error' => 'Alle Felder sind erforderlich.'], 400);
    }
    if (strlen($password) < 8) {
        send_json_response(['error' => 'Passwort mind. 8 Zeichen.'], 400);
    }
    if ($access_code !== REGISTRATION_ACCESS_CODE) {
        send_json_response(['error' => 'Ungültiger Zugangscode.'], 403);
    }

    try {
        $stmt = $pdo->prepare("SELECT id FROM users WHERE username = :username");
        $stmt->bindParam(':username', $username);
        $stmt->execute();
        if ($stmt->fetch()) {
            send_json_response(['error' => 'Benutzername bereits vergeben.'], 409);
        }

        $password_hash = password_hash($password, PASSWORD_DEFAULT);
        if ($password_hash === false) {
            send_json_response(['error' => 'Fehler bei Passwortverarbeitung.'], 500);
        }

        $stmt = $pdo->prepare("INSERT INTO users (username, password_hash) VALUES (:username, :password_hash)");
        $stmt->bindParam(':username', $username);
        $stmt->bindParam(':password_hash', $password_hash);

        if ($stmt->execute()) {
            send_json_response(['success' => 'Benutzer erfolgreich registriert.'], 201);
        } else {
            send_json_response(['error' => 'Registrierung fehlgeschlagen.'], 500);
        }
    } catch (PDOException $e) {
        if ($e->getCode() == 23000) {
            send_json_response(['error' => 'Benutzername existiert bereits (DB).'], 409);
        }
        send_json_response(['error' => 'DB-Fehler bei Registrierung.', 'details' => $e->getMessage()], 500);
    }
}

function handle_login($pdo) {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        send_json_response(['error' => 'Ungültige Anfragemethode für Login.'], 405);
    }
    $input = json_decode(file_get_contents('php://input'), true);
    $username = $input['username'] ?? null;
    $password = $input['password'] ?? null;

    if (empty($username) || empty($password)) {
        send_json_response(['error' => 'Benutzername und Passwort erforderlich.'], 400);
    }

    try {
        $stmt = $pdo->prepare("SELECT id, username, password_hash FROM users WHERE username = :username");
        $stmt->bindParam(':username', $username);
        $stmt->execute();
        $user = $stmt->fetch(PDO::FETCH_ASSOC);

        if ($user && password_verify($password, $user['password_hash'])) {
            $_SESSION['user_id'] = $user['id']; // Wichtig für den serverseitigen Proxy später
            $_SESSION['username'] = $user['username'];
            // 'loggedin' = true ist implizit, wenn user_id gesetzt ist

            send_json_response([
                'success' => 'Anmeldung erfolgreich.',
                'user' => ['id' => $user['id'], 'username' => $user['username']]
            ], 200);
        } else {
            send_json_response(['error' => 'Ungültiger Benutzername oder Passwort.'], 401);
        }
    } catch (PDOException $e) {
        send_json_response(['error' => 'DB-Fehler bei Anmeldung.', 'details' => $e->getMessage()], 500);
    }
}

function handle_logout() {
    $_SESSION = array();
    if (ini_get("session.use_cookies")) {
        $params = session_get_cookie_params();
        setcookie(session_name(), '', time() - 42000,
            $params["path"], $params["domain"],
            $params["secure"], $params["httponly"]
        );
    }
    session_destroy();
    send_json_response(['success' => 'Abmeldung erfolgreich.'], 200);
}

function handle_check_session($pdo) {
    // OPTIONS-Request abfangen (für CORS Preflight, falls der Client direkt auf api.php zugreift)
    if ($_SERVER['REQUEST_METHOD'] == 'OPTIONS') {
        send_json_response(null, 204); // No Content
    }

    if (isset($_SESSION['user_id']) && isset($_SESSION['username'])) {
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
            send_json_response(['error' => 'DB-Fehler bei Session-Prüfung.', 'details' => $e->getMessage()], 500);
        }
    } else {
        send_json_response(['loggedIn' => false, 'error' => 'Keine aktive Session.'], 401);
    }
}

function handle_save_token($pdo) {
    if (!isset($_SESSION['user_id'])) {
        send_json_response(['error' => 'Nicht authentifiziert.'], 401);
    }
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        send_json_response(['error' => 'Ungültige Anfragemethode für Token-Speicherung.'], 405);
    }

    $input = json_decode(file_get_contents('php://input'), true);
    $api_token = $input['api_token'] ?? null;
    // Erlaube auch leeren Token zum Löschen

    try {
        $stmt = $pdo->prepare("UPDATE users SET api_token = :api_token WHERE id = :user_id");
        $stmt->bindParam(':api_token', $api_token);
        $stmt->bindParam(':user_id', $_SESSION['user_id'], PDO::PARAM_INT);

        if ($stmt->execute()) {
            send_json_response(['success' => 'API-Token erfolgreich gespeichert.'], 200);
        } else {
            send_json_response(['error' => 'Fehler beim Speichern des API-Tokens.'], 500);
        }
    } catch (PDOException $e) {
        send_json_response(['error' => 'DB-Fehler bei Token-Speicherung.', 'details' => $e->getMessage()], 500);
    }
}

function handle_get_warframe_data($pdo) {
    if (!isset($_SESSION['user_id'])) {
        send_json_response(['error' => 'Nicht authentifiziert für Datenabruf.'], 401);
    }

    try {
        // API-Token des Benutzers aus der Datenbank abrufen
        $stmt = $pdo->prepare("SELECT api_token FROM users WHERE id = :user_id");
        $stmt->bindParam(':user_id', $_SESSION['user_id'], PDO::PARAM_INT);
        $stmt->execute();
        $user_token_data = $stmt->fetch(PDO::FETCH_ASSOC);

        if (!$user_token_data || empty($user_token_data['api_token'])) {
            send_json_response(['error' => 'Kein AlecaFrame API-Token für diesen Benutzer hinterlegt.'], 400);
        }
        $alecaframe_token = $user_token_data['api_token'];

        // URLs für AlecaFrame API
        $stats_url = "https://stats.alecaframe.com/api/stats/public?token=" . urlencode($alecaframe_token);
        $relic_inventory_url = "https://stats.alecaframe.com/api/stats/public/getRelicInventory?publicToken=" . urlencode($alecaframe_token);

        // Funktion für cURL-Anfragen
        function fetch_alecaframe_data($url) {
            $ch = curl_init();
            curl_setopt($ch, CURLOPT_URL, $url);
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, 1);
            curl_setopt($ch, CURLOPT_TIMEOUT, 15); // Timeout nach 15 Sekunden
            curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
            curl_setopt($ch, CURLOPT_MAXREDIRS, 5);
             // Wichtig für HTTPS, wenn lokale Zertifikate nicht aktuell sind (auf Plesk oft nicht nötig)
            // curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
            // curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);

            $response_body = curl_exec($ch);
            $http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            $curl_error_num = curl_errno($ch);
            $curl_error_msg = curl_error($ch);
            curl_close($ch);

            if ($curl_error_num > 0) {
                return ['error' => "cURL Fehler ($url): " . $curl_error_msg, 'http_code' => $http_code, 'body' => null];
            }
            if ($http_code >= 400) {
                 return ['error' => "AlecaFrame API Fehler ($url): HTTP Status " . $http_code, 'http_code' => $http_code, 'body' => $response_body];
            }
            return ['error' => null, 'http_code' => $http_code, 'body' => $response_body];
        }

        // Daten abrufen
        $stats_result = fetch_alecaframe_data($stats_url);
        $relic_result = fetch_alecaframe_data($relic_inventory_url);

        // Ergebnisse vorbereiten
        $final_response = [];
        $has_errors = false;

        if ($stats_result['error']) {
            $final_response['statsDataError'] = $stats_result['error'] . (isset($stats_result['body']) ? " - Response: " . substr($stats_result['body'], 0, 200) : "");
            $has_errors = true;
        } else {
            // Versuche, JSON zu parsen, um sicherzustellen, dass es valides JSON ist
            $parsed_stats = json_decode($stats_result['body'], true);
            if (json_last_error() !== JSON_ERROR_NONE) {
                 $final_response['statsDataError'] = "Ungültiges JSON von Stats API: " . json_last_error_msg();
                 $has_errors = true;
            } else {
                $final_response['statsData'] = $parsed_stats;
            }
        }

        if ($relic_result['error']) {
            $final_response['relicInventoryDataError'] = $relic_result['error'] . (isset($relic_result['body']) ? " - Response: " . substr($relic_result['body'], 0, 200) : "");
            $has_errors = true;
        } else {
            // Relikt-Daten werden als String (ggf. JSON-escaped Base64) weitergegeben
            // Das Frontend parst dies weiter.
            $final_response['relicInventoryData'] = $relic_result['body'];
        }

        // HTTP Statuscode für die Gesamtantwort setzen
        // Wenn ein Teil fehlschlägt, aber der andere erfolgreich ist, senden wir trotzdem 200
        // aber mit Fehlerdetails im Body. Nur wenn beide cURL-Aufrufe komplett fehlschlagen,
        // könnte man einen 502 oder 503 senden. Fürs erste ist 200 mit Fehlerdetails im JSON besser.
        send_json_response($final_response, 200);

    } catch (PDOException $e) {
        send_json_response(['error' => 'DB-Fehler beim Abrufen des API-Tokens.', 'details' => $e->getMessage()], 500);
    } catch (Exception $e) { // Allgemeine Fehler abfangen
        send_json_response(['error' => 'Allgemeiner Fehler im Proxy: ' . $e->getMessage()], 500);
    }
}
?>
