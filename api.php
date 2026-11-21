<?php
/* ==========================================================================
   221 DIGITAL — api.php : source de données centralisée (site public + gestionnaire)

   Actions (protocole déjà utilisé par les deux fichiers HTML) :
     GET  ?action=ping    -> état (mot de passe défini ? session valide ? révision)
     GET  ?action=rev     -> révision courante (léger, sert à l'actualisation automatique du site)
     GET  ?action=load    -> données publiées (public : c'est ce que le site affiche)
     POST ?action=setup   -> crée le mot de passe (uniquement si data/ALLOW_SETUP existe)
     POST ?action=login   -> connexion, renvoie un jeton
     POST ?action=logout  -> révoque le jeton
     POST ?action=save    -> enregistre (jeton obligatoire), contrôle la relecture

   Sécurité : mot de passe haché (password_hash), jeton aléatoire stocké haché,
   limitation des tentatives, écriture atomique + verrou, sauvegardes automatiques,
   détection des conflits (une version obsolète ne peut pas écraser une plus récente).
   Aucune dépendance : PHP 7.4 ou plus.
   ========================================================================== */
declare(strict_types=1);

const APP_ID        = '221-digital';
const MAX_BODY      = 30 * 1024 * 1024;   // 30 Mo
const TOKEN_TTL     = 30 * 86400;         // session : 30 jours
const MAX_SESSIONS  = 20;
const MAX_BACKUPS   = 40;
const MAX_FAILS     = 5;                  // tentatives de connexion échouées ...
const FAIL_WINDOW   = 900;                // ... par fenêtre de 15 minutes et par adresse IP

$DIR = __DIR__ . '/data';
$F_DATA = $DIR . '/site-data.json';
$F_CONF = $DIR . '/config.php';           // secrets : protégés par un en-tête PHP
$F_SESS = $DIR . '/sessions.php';
$F_FAIL = $DIR . '/attempts.php';
$F_LOCK = $DIR . '/.lock';
$F_ALLOW = $DIR . '/ALLOW_SETUP';

/* ---------- Réponses ---------- */
function out(array $payload, int $status = 200): void {
    http_response_code($status);
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}
function fail(string $msg, int $status, string $code = ''): void {
    $p = ['ok' => false, 'error' => $msg];
    if ($code !== '') $p['code'] = $code;
    out($p, $status);
}

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
/* L'authentification repose sur un jeton (en-tête), pas sur des cookies : l'origine * est donc sans risque
   et permet au gestionnaire, ouvert depuis l'ordinateur, de dialoguer avec ce serveur. */
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-221-Token');
header('Access-Control-Max-Age: 86400');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') { http_response_code(204); exit; }

/* ---------- Dossier de données ---------- */
if (!is_dir($DIR) && !@mkdir($DIR, 0755, true) && !is_dir($DIR)) {
    fail("Impossible de créer le dossier data/ : vérifiez les droits d'écriture du serveur.", 500, 'storage');
}
if (!is_dir($DIR . '/backups')) @mkdir($DIR . '/backups', 0755, true);
if (!is_file($DIR . '/.htaccess')) @file_put_contents($DIR . '/.htaccess', "Require all denied\n<IfModule !mod_authz_core.c>\nOrder allow,deny\nDeny from all\n</IfModule>\n");
if (!is_file($DIR . '/index.html')) @file_put_contents($DIR . '/index.html', '');
if (!is_writable($DIR)) fail("Le dossier data/ n'est pas modifiable par le serveur (droits d'écriture manquants).", 500, 'storage');

/* ---------- Fichiers gardés : JSON précédé d'un en-tête PHP (jamais lisible depuis le web) ---------- */
const GUARD = "<?php http_response_code(403); exit; ?>\n";
function guard_read(string $file): array {
    if (!is_file($file)) return [];
    $raw = @file_get_contents($file);
    if ($raw === false) return [];
    if (strpos($raw, GUARD) === 0) $raw = substr($raw, strlen(GUARD));
    $j = json_decode($raw, true);
    return is_array($j) ? $j : [];
}
function atomic_write(string $file, string $content): bool {
    $tmp = $file . '.' . bin2hex(random_bytes(4)) . '.tmp';
    if (@file_put_contents($tmp, $content, LOCK_EX) !== strlen($content)) { @unlink($tmp); return false; }
    if (!@rename($tmp, $file)) { @unlink($tmp); return false; }
    return true;
}
function guard_write(string $file, array $data): bool {
    return atomic_write($file, GUARD . json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
}

/* Verrou global : une seule écriture à la fois */
$lockH = null;
function lock(): void {
    global $lockH, $F_LOCK;
    $lockH = fopen($F_LOCK, 'c');
    if (!$lockH || !flock($lockH, LOCK_EX)) fail("Verrou d'écriture indisponible.", 500, 'storage');
}
function unlock(): void { global $lockH; if ($lockH) { flock($lockH, LOCK_UN); fclose($lockH); $lockH = null; } }

function current_rev(): string {
    global $F_DATA;
    return is_file($F_DATA) ? sha1_file($F_DATA) : 'none';
}
function is_https(): bool {
    if (!empty($_SERVER['HTTPS']) && strtolower((string)$_SERVER['HTTPS']) !== 'off') return true;
    if (($_SERVER['SERVER_PORT'] ?? '') === '443') return true;
    if (strtolower((string)($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '')) === 'https') return true;
    if (!empty($_SERVER['HTTP_CF_VISITOR']) && strpos((string)$_SERVER['HTTP_CF_VISITOR'], 'https') !== false) return true;
    return false;
}
function is_local_host(): bool {
    $ip = $_SERVER['REMOTE_ADDR'] ?? '';
    return $ip === '127.0.0.1' || $ip === '::1';
}
function require_https(): void {
    if (!is_https() && !is_local_host()) fail('Connexion non sécurisée : utilisez https://www.221.digital/.', 400, 'https_required');
}

/* ---------- Authentification par jeton ---------- */
function request_token(): string {
    $t = (string)($_SERVER['HTTP_X_221_TOKEN'] ?? '');
    if ($t === '') {
        $a = (string)($_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '');
        if (stripos($a, 'Bearer ') === 0) $t = trim(substr($a, 7));
    }
    return $t;
}
function is_logged(): bool {
    global $F_SESS;
    $t = request_token();
    if ($t === '' || !preg_match('/^[a-f0-9]{64}$/', $t)) return false;
    $h = hash('sha256', $t);
    $s = guard_read($F_SESS);
    return isset($s[$h]) && (int)$s[$h] > time();
}
function new_token(): string {
    global $F_SESS;
    $t = bin2hex(random_bytes(32));
    $s = guard_read($F_SESS);
    $now = time();
    foreach ($s as $h => $exp) if ((int)$exp <= $now) unset($s[$h]);
    asort($s);
    while (count($s) >= MAX_SESSIONS) { reset($s); unset($s[key($s)]); }
    $s[hash('sha256', $t)] = $now + TOKEN_TTL;
    guard_write($F_SESS, $s);
    return $t;
}
function require_auth(): void {
    if (!is_logged()) fail('Session expirée ou absente : reconnectez-vous.', 401, 'auth');
}
function has_password(): bool {
    global $F_CONF;
    $c = guard_read($F_CONF);
    return !empty($c['hash']);
}

/* ---------- Limitation des tentatives ---------- */
function fail_key(): string { return sha1((string)($_SERVER['REMOTE_ADDR'] ?? '?')); }
function check_not_locked(): void {
    global $F_FAIL;
    $a = guard_read($F_FAIL); $k = fail_key(); $now = time();
    $list = array_values(array_filter($a[$k] ?? [], fn($t) => (int)$t > $now - FAIL_WINDOW));
    if (count($list) >= MAX_FAILS) fail('Trop de tentatives. Réessayez dans quelques minutes.', 429, 'locked');
}
function register_fail(): void {
    global $F_FAIL;
    $a = guard_read($F_FAIL); $k = fail_key(); $now = time();
    foreach ($a as $kk => $l) { $a[$kk] = array_values(array_filter((array)$l, fn($t) => (int)$t > $now - FAIL_WINDOW)); if (!$a[$kk]) unset($a[$kk]); }
    $a[$k][] = $now;
    guard_write($F_FAIL, $a);
}
function clear_fails(): void {
    global $F_FAIL;
    $a = guard_read($F_FAIL); unset($a[fail_key()]); guard_write($F_FAIL, $a);
}

/* ---------- Corps de requête ---------- */
function read_body(): array {
    $len = (int)($_SERVER['CONTENT_LENGTH'] ?? 0);
    if ($len > MAX_BODY) fail('Données trop volumineuses (30 Mo maximum).', 413, 'too_large');
    $raw = file_get_contents('php://input', false, null, 0, MAX_BODY + 1);
    if ($raw === false || $raw === '') fail("Aucune donnée reçue (limite post_max_size du serveur dépassée ?).", 400, 'empty');
    if (strlen($raw) > MAX_BODY) fail('Données trop volumineuses (30 Mo maximum).', 413, 'too_large');
    $j = json_decode($raw);
    if (!is_object($j)) fail('Corps de requête JSON invalide.', 400, 'bad_json');
    return ['obj' => $j, 'raw' => $raw];
}

/* Contrôle de structure : refuse tout ce qui ne ressemble pas aux données du site */
function validate_data($d): string {
    if (!is_object($d)) return 'Les données doivent être un objet.';
    foreach (['logos', 'projects', 'clients', 'reviews'] as $k) {
        if (isset($d->$k) && !is_array($d->$k)) return "Le champ « $k » doit être une liste.";
    }
    foreach (($d->projects ?? []) as $p) {
        if (!is_object($p) || !isset($p->url) || !is_string($p->url) || !preg_match('#^https?://#i', $p->url)) return 'Un projet a une adresse invalide (http/https obligatoire).';
    }
    foreach (['hero'] as $k) if (isset($d->$k) && !is_string($d->$k)) return "Le champ « $k » est invalide.";
    return '';
}

/* ---------- Routage ---------- */
$action = (string)($_GET['action'] ?? '');
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

switch ($action) {
    case 'ping':
        out(['ok' => true, 'app' => APP_ID, 'hasPassword' => has_password(), 'logged' => is_logged(), 'rev' => current_rev()]);

    case 'rev':
        out(['ok' => true, 'rev' => current_rev()]);

    case 'load':
        if (!is_file($F_DATA)) out(['ok' => true, 'rev' => 'none', 'data' => null]);
        $raw = file_get_contents($F_DATA);
        if ($raw === false || json_decode($raw) === null) fail('Fichier de données illisible côté serveur.', 500, 'storage');
        echo '{"ok":true,"rev":"' . sha1($raw) . '","data":' . $raw . '}';
        exit;

    case 'setup':
        if ($method !== 'POST') fail('Méthode non autorisée.', 405);
        require_https();
        if (has_password()) fail('Un mot de passe existe déjà.', 403, 'already');
        if (!is_file($F_ALLOW)) fail("Création du mot de passe verrouillée. Sur le serveur, créez un fichier vide nommé data/ALLOW_SETUP puis recommencez.", 403, 'setup_locked');
        $pw = (string)(read_body()['obj']->password ?? '');
        if (strlen($pw) < 8) fail('Le mot de passe doit contenir au moins 8 caractères.', 400, 'weak');
        lock();
        guard_write($F_CONF, ['hash' => password_hash($pw, PASSWORD_DEFAULT), 'created' => date('c')]);
        @unlink($F_ALLOW);
        $t = new_token();
        unlock();
        out(['ok' => true, 'token' => $t]);

    case 'login':
        if ($method !== 'POST') fail('Méthode non autorisée.', 405);
        require_https();
        if (!has_password()) fail("Aucun mot de passe défini : utilisez la création du mot de passe.", 403, 'nopassword');
        check_not_locked();
        $pw = (string)(read_body()['obj']->password ?? '');
        $c = guard_read($F_CONF);
        if ($pw === '' || !password_verify($pw, (string)$c['hash'])) {
            lock(); register_fail(); unlock();
            usleep(400000);
            fail('Mot de passe incorrect.', 401, 'auth');
        }
        lock(); clear_fails(); $t = new_token(); unlock();
        out(['ok' => true, 'token' => $t]);

    case 'logout':
        if ($method !== 'POST') fail('Méthode non autorisée.', 405);
        $t = request_token();
        if ($t !== '') {
            lock();
            $s = guard_read($F_SESS); unset($s[hash('sha256', $t)]); guard_write($F_SESS, $s);
            unlock();
        }
        out(['ok' => true]);

    case 'save':
        if ($method !== 'POST') fail('Méthode non autorisée.', 405);
        require_https();
        require_auth();
        $b = read_body()['obj'];
        if (!isset($b->data)) fail('Données manquantes.', 400, 'no_data');
        $err = validate_data($b->data);
        if ($err !== '') fail($err, 422, 'invalid');
        $json = json_encode($b->data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRESERVE_ZERO_FRACTION);
        if ($json === false) fail("Les données n'ont pas pu être encodées.", 422, 'invalid');
        lock();
        $rev = current_rev();
        if (isset($b->baseRev) && is_string($b->baseRev) && $b->baseRev !== $rev) {
            unlock();
            fail("Le site a été modifié depuis votre dernière lecture (autre onglet ou autre appareil). Rien n'a été écrasé : rechargez le gestionnaire puis refaites la modification.", 409, 'conflict');
        }
        if (is_file($F_DATA)) {
            $bk = $DIR . '/backups/site-data-' . date('Ymd-His') . '-' . substr($rev, 0, 8) . '.json';
            if (!@copy($F_DATA, $bk)) { unlock(); fail("Sauvegarde de sécurité impossible : enregistrement annulé, données intactes.", 500, 'storage'); }
            $old = glob($DIR . '/backups/site-data-*.json') ?: [];
            sort($old);
            while (count($old) > MAX_BACKUPS) @unlink(array_shift($old));
        }
        if (!atomic_write($F_DATA, $json)) { unlock(); fail("Écriture impossible sur le serveur : données précédentes conservées.", 500, 'storage'); }
        clearstatcache();
        if (!is_file($F_DATA) || file_get_contents($F_DATA) !== $json) { unlock(); fail("Relecture après écriture non conforme.", 500, 'verify'); }
        $newRev = sha1($json);
        unlock();
        out(['ok' => true, 'rev' => $newRev, 'bytes' => strlen($json), 'savedAt' => date('c')]);

    default:
        fail('Action inconnue.', 400, 'unknown');
}
