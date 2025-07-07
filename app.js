// Globale Konstanten und Zustandsvariablen
const API_BASE_URL = 'php/';
const CORS_PROXY_URL = 'https://api.allorigins.win/raw?url=';
const WFCD_RELICS_URL = 'https://cdn.jsdelivr.net/gh/WFCD/warframe-items/data/json/Relics.json';
const WFCD_IMAGE_CDN = 'https://cdn.warframestat.us/img/';

let currentUser = null;
let wfcdRelicMap = new Map(); // NEU: Map für schnellen Zugriff auf WFCD-Daten via normalisiertem Namen
let userRelicInventory = null;
let lastFetchedBase64RelicData = null;
let amChartsInstances = { credits: null, platinum: null, endo: null };

// DOM-Elemente (Kurzreferenzen, da schon bekannt)
const systemBootLoader = document.getElementById('system-boot-loader');
const apiLoader = document.getElementById('api-loader');
const appContainer = document.getElementById('app-container');
// ... (weitere DOM-Elemente wie gehabt) ...
const loginSection = document.getElementById('login-section');
const registerSection = document.getElementById('register-section');
const dashboardSection = document.getElementById('dashboard-section');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const loginMessage = document.getElementById('login-message');
const registerMessage = document.getElementById('register-message');
const showRegisterButton = document.getElementById('show-register-button');
const showLoginButton = document.getElementById('show-login-button');
const usernameDisplay = document.getElementById('username-display');
const logoutButton = document.getElementById('logout-button');
const settingsButton = document.getElementById('settings-button');
const alecaFrameTokenSection = document.getElementById('alecaframe-token-section');
const alecaFrameTokenInput = document.getElementById('alecaframe-token-input');
const saveAlecaFrameTokenButton = document.getElementById('save-alecaframe-token-button');
const alecaFrameTokenMessage = document.getElementById('alecaframe-token-message');
const statsSection = document.getElementById('stats-section');
const generalStatsDisplay = document.getElementById('general-stats-display');
const relicInventorySection = document.getElementById('relic-inventory-section');
const relicInventoryGrid = document.getElementById('relic-inventory-grid');
const relicTooltip = document.getElementById('relic-tooltip');
const settingsModal = document.getElementById('settings-modal');
const settingsAccessCodeSection = document.getElementById('settings-access-code-section');
const settingsAccessCodeInput = document.getElementById('settings-access-code-input');
const submitSettingsAccessCodeButton = document.getElementById('submit-settings-access-code');
const settingsAccessMessage = document.getElementById('settings-access-message');
const colorPickerSection = document.getElementById('color-picker-section');
const colorChoiceButtons = document.querySelectorAll('.color-choice-button');
const closeSettingsModalButton = document.getElementById('close-settings-modal');


// --- Hilfsfunktionen ---
function showApiLoader() { apiLoader.classList.remove('hidden'); }
function hideApiLoader() { apiLoader.classList.add('hidden'); }
function displayMessage(element, message, isError = false) {
    element.textContent = message;
    element.className = `mt-2 text-sm text-center ${isError ? 'text-red-400' : 'text-green-400'}`;
    if (message) element.classList.remove('hidden'); else element.classList.add('hidden');
}
function showView(viewToShow) {
    [loginSection, registerSection, dashboardSection].forEach(section => section.classList.add('hidden'));
    if (viewToShow) viewToShow.classList.remove('hidden');
}
function hexToRgb(hex) {
    const bigint = parseInt(hex.slice(1), 16);
    return `${(bigint >> 16) & 255},${(bigint >> 8) & 255},${bigint & 255}`;
}
function lightenHexColor(hex, percent) {
    hex = hex.replace(/^\s*#|\s*$/g, '');
    if (hex.length === 3) hex = hex.replace(/(.)/g, '$1$1');
    const r = parseInt(hex.substr(0, 2), 16), g = parseInt(hex.substr(2, 2), 16), b = parseInt(hex.substr(4, 2), 16);
    const newR = Math.min(255, Math.floor(r * (1 + percent / 100)));
    const newG = Math.min(255, Math.floor(g * (1 + percent / 100)));
    const newB = Math.min(255, Math.floor(b * (1 + percent / 100)));
    return `#${newR.toString(16).padStart(2, '0')}${newG.toString(16).padStart(2, '0')}${newB.toString(16).padStart(2, '0')}`;
}
function applyAccentColor(primaryColor) {
    const secondaryColor = lightenHexColor(primaryColor, 40);
    document.documentElement.style.setProperty('--primary-accent', primaryColor);
    document.documentElement.style.setProperty('--secondary-accent', secondaryColor);
    document.documentElement.style.setProperty('--primary-accent-rgb', hexToRgb(primaryColor));
    document.querySelectorAll('.panel').forEach(panel => {
        panel.style.borderColor = `rgba(${hexToRgb(primaryColor)}, 0.3)`;
        panel.style.boxShadow = `0 0 15px 0px rgba(${hexToRgb(primaryColor)}, 0.2)`;
    });
    localStorage.setItem('accentColor', primaryColor);
}
function loadAccentColor() {
    const savedColor = localStorage.getItem('accentColor');
    applyAccentColor(savedColor || getComputedStyle(document.documentElement).getPropertyValue('--primary-accent').trim());
}

// --- NEU: Relikt-Namen Normalisierungsfunktion ---
/**
 * Normalisiert einen Relikt-Namen für den Abgleich zwischen APIs.
 * Beispiel: "Lith L5 Relic (Radiant)" -> "lith l5"
 * @param {string} name - Der ursprüngliche Relikt-Name.
 * @returns {string} - Der normalisierte Name.
 */
function normalizeRelicName(name) {
    if (typeof name !== 'string') return '';
    return name.toLowerCase()
               .replace(/\s*\([\w\s]+\)\s*$/, '') // Entfernt Anhängsel wie (Radiant), (Intact) etc.
               .replace(/relic/g, '')          // Entfernt das Wort "relic"
               .replace(/prime vault/g, '')     // Entfernt "prime vault"
               .replace(/vaulted/g, '')         // Entfernt "vaulted"
               .replace(/\[|\]/g, '')           // Entfernt eckige Klammern
               .replace(/\s+/g, ' ')             // Mehrfache Leerzeichen zu einem
               .trim();                          // Leerzeichen am Anfang/Ende entfernen
}


async function init() {
    loadAccentColor();
    setTimeout(() => {
        systemBootLoader.style.opacity = '0';
        systemBootLoader.style.pointerEvents = 'none';
        setTimeout(() => {
            systemBootLoader.classList.add('hidden');
            appContainer.style.opacity = '1';
        }, 500);
    }, 1500);

    showRegisterButton.addEventListener('click', () => showView(registerSection));
    showLoginButton.addEventListener('click', () => showView(loginSection));
    loginForm.addEventListener('submit', handleLogin);
    registerForm.addEventListener('submit', handleRegister);
    logoutButton.addEventListener('click', handleLogout);
    settingsButton.addEventListener('click', openSettingsModal);
    closeSettingsModalButton.addEventListener('click', closeSettingsModal);
    submitSettingsAccessCodeButton.addEventListener('click', checkSettingsAccessCode);
    colorChoiceButtons.forEach(button => button.addEventListener('click', (e) => applyAccentColor(e.target.dataset.color)));
    saveAlecaFrameTokenButton.addEventListener('click', handleSaveAndLoadAlecaFrameToken);

    await loadWfcdRelicData(); // WFCD Daten zuerst laden, damit die Map bereit ist
    await checkUserSession();  // Dann Session prüfen und ggf. AlecaFrame Daten laden
}

// Authentifizierungsfunktionen (bleiben im Wesentlichen gleich)
async function handleLogin(event) { /* ... wie gehabt ... */
    event.preventDefault(); displayMessage(loginMessage, '');
    const body = { username: loginForm.username.value, password: loginForm.password.value };
    showApiLoader();
    try {
        const response = await fetch(`${API_BASE_URL}login.php`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const data = await response.json();
        if (response.ok && data.success) {
            currentUser = data.user; await afterLogin();
        } else { displayMessage(loginMessage, data.error || 'Login fehlgeschlagen.', true); }
    } catch (e) { displayMessage(loginMessage, 'Netzwerkfehler.', true); } finally { hideApiLoader(); }
}
async function handleRegister(event) { /* ... wie gehabt ... */
    event.preventDefault(); displayMessage(registerMessage, '');
    const body = { username: registerForm.username.value, password: registerForm.password.value, access_code: registerForm.access_code.value };
    showApiLoader();
    try {
        const response = await fetch(`${API_BASE_URL}register.php`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const data = await response.json();
        if (response.ok && data.success) {
            displayMessage(registerMessage, data.success + ' Anmelden.', false); registerForm.reset(); setTimeout(() => showView(loginSection), 2000);
        } else { displayMessage(registerMessage, data.error || 'Registrierung fehlgeschlagen.', true); }
    } catch (e) { displayMessage(registerMessage, 'Netzwerkfehler.', true); } finally { hideApiLoader(); }
}
async function checkUserSession() { /* ... wie gehabt ... */
    showApiLoader();
    try {
        const response = await fetch(`${API_BASE_URL}check_session.php`, { method: 'GET' });
        const data = await response.json();
        if (response.ok && data.loggedIn) { currentUser = data.user; await afterLogin(); } else { showView(loginSection); }
    } catch (e) { showView(loginSection); } finally { hideApiLoader(); }
}
async function afterLogin() { /* ... wie gehabt ... */
    if (!currentUser) return;
    usernameDisplay.textContent = currentUser.username;
    showView(dashboardSection);
    if (currentUser.api_token) {
        alecaFrameTokenInput.value = currentUser.api_token;
        await loadAlecaFrameData(currentUser.api_token);
    } else {
        statsSection.classList.add('hidden'); relicInventorySection.classList.add('hidden');
        alecaFrameTokenSection.classList.remove('hidden');
        displayMessage(alecaFrameTokenMessage, 'AlecaFrame Token eingeben.', false);
    }
}
async function handleLogout() { /* ... wie gehabt ... */
    showApiLoader();
    try { await fetch(`${API_BASE_URL}logout.php`, { method: 'POST' }); } catch (e) { console.error('Logout Fehler:', e); }
    finally {
        currentUser = null; lastFetchedBase64RelicData = null; userRelicInventory = null;
        showView(loginSection); loginForm.reset();
        statsSection.classList.add('hidden'); relicInventorySection.classList.add('hidden');
        generalStatsDisplay.innerHTML = ''; relicInventoryGrid.innerHTML = '';
        alecaFrameTokenInput.value = ''; displayMessage(alecaFrameTokenMessage, '');
        Object.values(amChartsInstances).forEach(chart => chart?.dispose());
        amChartsInstances = { credits: null, platinum: null, endo: null };
        hideApiLoader();
    }
}
async function handleSaveAndLoadAlecaFrameToken() { /* ... wie gehabt ... */
    const token = alecaFrameTokenInput.value.trim();
    if (!token) { displayMessage(alecaFrameTokenMessage, 'Token darf nicht leer sein.', true); return; }
    showApiLoader();
    try {
        const response = await fetch(`${API_BASE_URL}save_token.php`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ api_token: token }) });
        const data = await response.json();
        if (response.ok && data.success) {
            if (currentUser) currentUser.api_token = token;
            await loadAlecaFrameData(token);
        } else { displayMessage(alecaFrameTokenMessage, data.error || 'Fehler Speichern Token.', true); }
    } catch (e) { displayMessage(alecaFrameTokenMessage, 'Netzwerkfehler.', true); } finally { hideApiLoader(); }
}

// --- AlecaFrame Datenverarbeitung ---
async function loadAlecaFrameData(token) {
    if (!token) { statsSection.classList.add('hidden'); relicInventorySection.classList.add('hidden'); displayMessage(alecaFrameTokenMessage, 'Kein Token.', true); return; }
    displayMessage(alecaFrameTokenMessage, ''); showApiLoader();
    statsSection.classList.remove('hidden'); relicInventorySection.classList.remove('hidden');

    try {
        const statsUrl = `${CORS_PROXY_URL}${encodeURIComponent(`https://stats.alecaframe.com/api/stats/public?token=${token}`)}`;
        const statsResponse = await fetch(statsUrl);
        if (!statsResponse.ok) throw new Error(`AlecaFrame Stats API: ${statsResponse.status} ${statsResponse.statusText}`);
        const responseText = await statsResponse.text();
        console.log("Rohe Antwort von AlecaFrame Stats API (via Proxy):", responseText);
        const statsData = JSON.parse(responseText);

        if (statsData.type && statsData.title && statsData.status && statsData.status >= 400) {
            throw new Error(`API Fehler: "${statsData.title}" (Status ${statsData.status}). Token prüfen oder später versuchen.`);
        }
        if (statsData.error) throw new Error(`AlecaFrame API Fehler: ${statsData.error}`);
        if (!statsData.generalDataPoints) {
            console.error("Fehlende 'generalDataPoints'. Empfangene Keys:", Object.keys(statsData));
            throw new Error("Stats: 'generalDataPoints' fehlt. Unerwartete API-Antwortstruktur.");
        }

        const latestStats = statsData.generalDataPoints.length > 0 ? statsData.generalDataPoints[statsData.generalDataPoints.length - 1] : {};
        if(statsData.usernameWhenPublic) latestStats.usernameWhenPublic = statsData.usernameWhenPublic;
        displayGeneralStats(latestStats);
        createCurrencyCharts(statsData.generalDataPoints);

        const relicUrl = `${CORS_PROXY_URL}${encodeURIComponent(`https://stats.alecaframe.com/api/stats/public/getRelicInventory?publicToken=${token}`)}`;
        const relicResponse = await fetch(relicUrl);
        if (!relicResponse.ok) throw new Error(`AlecaFrame Relic API: ${relicResponse.status} ${relicResponse.statusText}`);
        lastFetchedBase64RelicData = await relicResponse.text();
        try { const j = JSON.parse(lastFetchedBase64RelicData); if (j && j.error) throw new Error(`AlecaFrame Relic API Fehler: ${j.error}`); } catch(e) {}
        parseAndDisplayRelicInventory(lastFetchedBase64RelicData);
    } catch (error) {
        console.error('Fehler AlecaFrame Daten:', error);
        displayMessage(alecaFrameTokenMessage, `Fehler: ${error.message}`, true);
        statsSection.classList.add('hidden'); relicInventorySection.classList.add('hidden');
    } finally { hideApiLoader(); }
}

function displayGeneralStats(latestDataPoint) { /* ... wie gehabt, ggf. anpassen ... */
    let html = '<h4 class="text-lg font-heading mb-2">Account Übersicht</h4><div class="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">';
    const format = (num) => typeof num === 'number' ? num.toLocaleString() : (num !== undefined ? num : 'N/A');
    html += `<div><span class="text-text-secondary">Credits:</span> <span class="text-primary-accent">${format(latestDataPoint.credits)}</span></div>`;
    html += `<div><span class="text-text-secondary">Platin:</span> <span class="text-primary-accent">${format(latestDataPoint.plat)}</span></div>`;
    html += `<div><span class="text-text-secondary">Endo:</span> <span class="text-primary-accent">${format(latestDataPoint.endo)}</span></div>`;
    html += `<div><span class="text-text-secondary">Mastery Rank:</span> <span class="text-primary-accent">${format(latestDataPoint.mr)}</span></div>`;
    html += `<div><span class="text-text-secondary">Ingame Name:</span> <span class="text-primary-accent">${latestDataPoint.usernameWhenPublic || (currentUser?.username || 'N/A')}</span></div>`;
    if (latestDataPoint.ducats !== undefined) html += `<div><span class="text-text-secondary">Dukaten:</span> <span class="text-primary-accent">${format(latestDataPoint.ducats)}</span></div>`;
    if (latestDataPoint.aya !== undefined) html += `<div><span class="text-text-secondary">Aya:</span> <span class="text-primary-accent">${format(latestDataPoint.aya)}</span></div>`;
    if (latestDataPoint.relicOpened !== undefined) html += `<div><span class="text-text-secondary">Relikte geöffnet:</span> <span class="text-primary-accent">${format(latestDataPoint.relicOpened)}</span></div>`;
    html += '</div>';
    generalStatsDisplay.innerHTML = html;
}
function createCurrencyCharts(generalDataPoints) { /* ... wie gehabt ... */
    const createChart = (containerId, dataArray, valueFieldName, colorHex, currencyName) => {
        const chartContainer = document.getElementById(containerId);
        if (!chartContainer) { console.error(`Chart Container ${containerId} fehlt.`); return; }
        chartContainer.innerHTML = '';
        if (amChartsInstances[currencyName.toLowerCase()]) { amChartsInstances[currencyName.toLowerCase()].dispose(); amChartsInstances[currencyName.toLowerCase()] = null; }
        if (!dataArray || dataArray.length === 0) { chartContainer.innerHTML = `<p class="text-text-secondary text-center pt-8 text-sm">Keine Verlaufsdaten: ${currencyName}.</p>`; return; }

        const chartData = dataArray.map(item => ({ date: new Date(item.ts).getTime(), value: parseInt(item[valueFieldName]) || 0 })).sort((a,b) => a.date - b.date);
        let root = am5.Root.new(chartContainer);
        amChartsInstances[currencyName.toLowerCase()] = root;
        root.setThemes([am5themes_Animated.new(root), am5themes_Dark.new(root)]);
        root.interfaceColors.setAll({ "background": am5.color(0x00000000), "text": am5.color(0xe0e0e0), "grid": am5.color(0x333333), "secondaryButtonText": am5.color(0xe0e0e0) });
        let chart = root.container.children.push(am5xy.XYChart.new(root, { panX: true, panY: false, wheelX: "panX", wheelY: "zoomX", pinchZoomX: true, layout: root.verticalLayout, maxTooltipDistance: 0 }));
        let xAxis = chart.xAxes.push(am5xy.DateAxis.new(root, { baseInterval: { timeUnit: "day", count: 1 }, renderer: am5xy.AxisRendererX.new(root, { minorGridEnabled: true, minGridDistance: 70 }), tooltip: am5.Tooltip.new(root, {}) }));
        let yAxis = chart.yAxes.push(am5xy.ValueAxis.new(root, { renderer: am5xy.AxisRendererY.new(root, { minGridDistance: 30 }), tooltip: am5.Tooltip.new(root, {}) }));
        yAxis.get("renderer").labels.template.setAll({ fill: am5.color(0xa0a0a0) }); xAxis.get("renderer").labels.template.setAll({ fill: am5.color(0xa0a0a0) });
        let series = chart.series.push(am5xy.LineSeries.new(root, { name: currencyName, xAxis: xAxis, yAxis: yAxis, valueYField: "value", valueXField: "date", stroke: am5.color(colorHex), fill: am5.color(colorHex), tensionX: 0.8, tooltip: am5.Tooltip.new(root, { labelText: "{valueY.formatNumber('#,###')}", pointerOrientation: "horizontal", dy:-10 }) }));
        series.fills.template.setAll({ fillOpacity: 0.1, visible: true });
        series.bullets.push(() => am5.Bullet.new(root, { sprite: am5.Circle.new(root, { radius: 3, fill: series.get("stroke"), stroke: root.interfaceColors.get("background"), strokeWidth: 1 }) }));
        series.data.setAll(chartData); series.appear(1000);
        const accent = getComputedStyle(document.documentElement).getPropertyValue('--primary-accent').trim();
        let scrollbarX = chart.set("scrollbarX", am5.Scrollbar.new(root, { orientation: "horizontal", height: 30 }));
        scrollbarX.thumb.setAll({ fill: am5.color(accent), fillOpacity: 0.2 });
        scrollbarX.startGrip.setAll({ visible: true, fill: am5.color(accent) }); scrollbarX.endGrip.setAll({ visible: true, fill: am5.color(accent) });
        let cursor = chart.set("cursor", am5xy.XYCursor.new(root, { behavior: "zoomXY", xAxis: xAxis, yAxis: yAxis }));
        cursor.lineY.set("visible", false); chart.appear(1000, 100);
    };
    const pColor = getComputedStyle(document.documentElement).getPropertyValue('--primary-accent').trim();
    createChart('credits-chart-container', generalDataPoints, 'credits', pColor, 'Credits');
    createChart('platinum-chart-container', generalDataPoints, 'plat', '#87CEEB', 'Platin');
    createChart('endo-chart-container', generalDataPoints, 'endo', '#FFD700', 'Endo');
}

// --- WFCD Item Database ---
async function loadWfcdRelicData() {
    if (wfcdRelicMap.size > 0) { // Prüfe, ob die Map bereits gefüllt ist
        console.log("WFCD Relic Map bereits initialisiert.");
        return;
    }
    console.log("Lade WFCD Relic.json für Map-Erstellung...");
    showApiLoader();
    try {
        const response = await fetch(WFCD_RELICS_URL);
        if (!response.ok) throw new Error(`WFCD Relic.json: ${response.statusText}`);
        const itemsArray = await response.json();

        wfcdRelicMap.clear(); // Sicherstellen, dass die Map leer ist, bevor sie gefüllt wird
        itemsArray.forEach(item => {
            const normalizedKey = normalizeRelicName(item.name);
            if (normalizedKey) { // Nur hinzufügen, wenn ein gültiger Schlüssel erzeugt wurde
                wfcdRelicMap.set(normalizedKey, item);
            }
        });
        console.log('WFCD Relic Map initialisiert:', wfcdRelicMap.size, "Einträge");

        // Wenn Relikt-Inventar auf diese Daten gewartet hat, neu parsen/anzeigen
        if (lastFetchedBase64RelicData && relicInventoryGrid.innerHTML.includes("Lade Relikt-DB...")) {
            parseAndDisplayRelicInventory(lastFetchedBase64RelicData);
        }
    } catch (error) {
        console.error('WFCD Ladefehler für Map:', error);
        if(relicInventoryGrid && (relicInventoryGrid.innerHTML === '' || relicInventoryGrid.innerHTML.includes("Lade Relikt-DB..."))) {
            relicInventoryGrid.innerHTML = `<p class="text-red-400 col-span-full text-center">Fehler Laden Relikt-DB: ${error.message}</p>`;
        }
    } finally { hideApiLoader(); }
}


// --- Relikt Inventar Verarbeitung ---
function parseAndDisplayRelicInventory(base64ApiResponse) {
    relicInventoryGrid.innerHTML = '';
    try {
        if (!base64ApiResponse) throw new Error("Keine Base64 Relikt-Daten von API.");

        let actualBase64String;
        try {
            actualBase64String = JSON.parse(base64ApiResponse);
            if (typeof actualBase64String !== 'string') {
                console.warn('Relikt-Antwort (nach JSON.parse) ist kein String. Typ:', typeof actualBase64String);
                actualBase64String = base64ApiResponse; // Fallback zum direkten String
            }
        } catch (e) {
            console.warn('JSON.parse der Relikt-Antwort fehlgeschlagen, verwende direkten String. Fehler:', e);
            actualBase64String = base64ApiResponse;
        }

        if (!actualBase64String) throw new Error("Konnte keinen Base64-String aus Relikt-Antwort extrahieren.");

        const binaryString = atob(actualBase64String);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);

        if (bytes.length === 0 && actualBase64String.length > 0) throw new Error("Relikt-Inventar dekodiert zu Länge 0.");
        if (bytes.length === 0) throw new Error("Relikt-Inventar leer/Dekodierfehler.");

        if (wfcdRelicMap.size === 0) { // WFCD Map muss geladen sein
            relicInventoryGrid.innerHTML = '<p class="text-text-secondary col-span-full text-center">Warte auf WFCD Relikt-Datenbank...</p>';
            setTimeout(() => parseAndDisplayRelicInventory(base64ApiResponse), 2000);
            return;
        }

        const dataView = new DataView(bytes.buffer);
        let offset = 0;
        const numRelicTypes = dataView.getUint32(offset, true); offset += 4;
        userRelicInventory = [];

        const relicTierApiMap = ["Lith", "Meso", "Neo", "Axi", "Requiem"]; // Für AlecaFrame Byte-Wert

        for (let i = 0; i < numRelicTypes; i++) {
            if (offset + 9 > bytes.length) { console.error("Nicht genug Daten für Relikt #", i); break; }
            const typeByte = dataView.getUint8(offset); offset += 1;
            const refinementByte = dataView.getUint8(offset); offset += 1; // Aktuell nicht für Abgleich verwendet

            let nameChars = [];
            for(let j=0; j < 3; j++) nameChars.push(String.fromCharCode(dataView.getUint8(offset + j)));
            offset += 3;
            const alecaRelicShortName = nameChars.join('').trim();
            const count = dataView.getUint32(offset, true); offset += 4;

            const alecaTierName = relicTierApiMap[typeByte] || "UnknownTier";
            // Erzeuge den normalisierten Schlüssel aus AlecaFrame-Daten
            const normalizedAlecaName = normalizeRelicName(`${alecaTierName} ${alecaRelicShortName}`);

            const wfcdDetail = wfcdRelicMap.get(normalizedAlecaName);

            if (wfcdDetail) {
                userRelicInventory.push({
                    ...wfcdDetail, // Alle Daten von WFCD
                    count: count,  // Anzahl von AlecaFrame
                    // Ggf. apiTierName und apiShortName für Debugging beibehalten, falls nötig
                    // apiTierName: alecaTierName,
                    // apiShortName: alecaRelicShortName
                });
            } else {
                console.warn(`Kein WFCD Detail für normalisierten Namen "${normalizedAlecaName}" (Original Aleca: ${alecaTierName} ${alecaRelicShortName}) gefunden.`);
                userRelicInventory.push({
                    name: `${alecaTierName} ${alecaRelicShortName}`,
                    uniqueName: `unknown_${normalizedAlecaName.replace(/\s+/g, '_')}`,
                    tier: alecaTierName,
                    imageName: '',
                    rewards: [],
                    vaulted: false,
                    count: count,
                });
            }
        }
        displayRelics(userRelicInventory);

    } catch (error) {
        console.error("Fehler Parsen Relikt-Inventar:", error);
        relicInventoryGrid.innerHTML = `<p class="text-red-400 col-span-full text-center">Fehler Relikt-Verarbeitung: ${error.message}</p>`;
        userRelicInventory = null;
    }
}

function displayRelics(relicsToDisplay) {
    if (!relicsToDisplay || relicsToDisplay.length === 0) {
        relicInventoryGrid.innerHTML = '<p class="text-text-secondary col-span-full text-center">Keine Relikte zum Anzeigen.</p>'; return;
    }
    relicInventoryGrid.innerHTML = '';

    relicsToDisplay.forEach(relic => {
        // Verwende direkt die Daten aus dem (hoffentlich) angereicherten Relikt-Objekt
        const imageName = relic.imageName || `${(relic.tier || '').toLowerCase()}${(relic.name || '').split(' ').pop().toLowerCase()}relicint.png`; // Fallback für imageName
        const isVaulted = relic.vaulted ? "<span class='text-yellow-400 text-xs font-normal'>[VAULTED]</span> " : "";
        const displayName = relic.name; // Sollte jetzt der volle Name aus WFCD sein

        const relicElement = document.createElement('div');
        relicElement.className = 'panel !p-2 flex flex-col items-center text-center cursor-pointer interactive-element transition-all hover:scale-105 focus-within:ring-2 focus-within:ring-primary-accent';
        relicElement.setAttribute('tabindex', '0');
        relicElement.innerHTML = `
            <img src="${WFCD_IMAGE_CDN}${imageName}" alt="${displayName}" class="w-16 h-16 mb-1 object-contain" loading="lazy" onerror="this.style.display='none'; this.parentElement.insertAdjacentHTML('afterbegin', '<div class=\\'w-16 h-16 mb-1 flex items-center justify-center bg-bg-surface text-text-secondary text-xs rounded-sm\\'>N/A</div>');">
            <p class="text-xs font-semibold">${isVaulted}${displayName}</p>
            <p class="text-xs text-text-secondary">Tier: ${relic.tier}</p>
            <p class="text-xs text-primary-accent">Anzahl: ${relic.count !== undefined ? relic.count : 'N/A'}</p>
        `;
        relicElement.addEventListener('mouseenter', (event) => showRelicTooltip(event, relic));
        relicElement.addEventListener('mouseleave', hideRelicTooltip);
        relicElement.addEventListener('mousemove', moveRelicTooltip);
        relicElement.addEventListener('focus', (event) => showRelicTooltip(event, relic));
        relicElement.addEventListener('blur', hideRelicTooltip);
        relicInventoryGrid.appendChild(relicElement);
    });
}

function showRelicTooltip(event, relicData) { // relicData sollte jetzt das angereicherte Objekt sein
    if (!relicData) return;
    const isVaultedText = relicData.vaulted ? "<span class='text-yellow-400 text-xs font-normal'>[VAULTED]</span>" : "";
    let tooltipContent = `<h5 class="font-bold text-primary-accent mb-1">${relicData.name} ${isVaultedText}</h5>`;

    if (relicData.rewards && Array.isArray(relicData.rewards)) {
        tooltipContent += '<p class="text-xs text-text-secondary mb-1">Top 3 Belohnungen:</p><ul class="list-none text-xs space-y-0.5">';
        const rarityOrder = { "Rare": 1, "Uncommon": 2, "Common": 3 };
        const sortedRewards = [...relicData.rewards].sort((a,b) =>
            (rarityOrder[a.rarity] || 4) - (rarityOrder[b.rarity] || 4) ||
            b.chance - a.chance || // Sekundär nach Chance, falls Seltenheit gleich
            a.itemName.localeCompare(b.itemName)
        );
        sortedRewards.slice(0, 3).forEach(item => {
            const rarityColor = item.rarity === "Rare" ? "text-yellow-400" : item.rarity === "Uncommon" ? "text-gray-300" : "text-text-primary";
            tooltipContent += `<li><span class="${rarityColor}">${item.itemName}</span> (${item.rarity}) - ${item.chance}%</li>`;
        });
        if (sortedRewards.length > 3) tooltipContent += `<li>... und ${sortedRewards.length - 3} weitere</li>`;
        tooltipContent += '</ul>';
    } else { tooltipContent += '<p class="text-xs text-text-secondary">Keine Belohnungsdetails.</p>'; }
    relicTooltip.innerHTML = tooltipContent;
    relicTooltip.classList.remove('hidden');
    moveRelicTooltip(event);
}
function hideRelicTooltip() { relicTooltip.classList.add('hidden'); }
function moveRelicTooltip(event) { /* ... wie gehabt ... */
    if (relicTooltip.classList.contains('hidden')) return;
    const { clientX:mX, clientY:mY } = event; const rect = relicTooltip.getBoundingClientRect();
    let x = mX + 20, y = mY + 20;
    if (x + rect.width > window.innerWidth - 10) x = mX - rect.width - 20;
    if (y + rect.height > window.innerHeight - 10) y = mY - rect.height - 20;
    if (x < 10) x = 10; if (y < 10) y = 10;
    relicTooltip.style.left = `${x}px`; relicTooltip.style.top = `${y}px`;
}

// --- Einstellungs-Modal (bleibt gleich) ---
function openSettingsModal() { /* ... wie gehabt ... */
    settingsModal.classList.remove('hidden'); settingsAccessCodeSection.classList.remove('hidden');
    colorPickerSection.classList.add('hidden'); settingsAccessCodeInput.value = '';
    displayMessage(settingsAccessMessage, ''); settingsAccessCodeInput.focus();
}
function closeSettingsModal() { settingsModal.classList.add('hidden'); }
function checkSettingsAccessCode() { /* ... wie gehabt ... */
    if (settingsAccessCodeInput.value === "69420") {
        settingsAccessCodeSection.classList.add('hidden'); colorPickerSection.classList.remove('hidden'); displayMessage(settingsAccessMessage, '');
    } else { displayMessage(settingsAccessMessage, 'Falscher Code.', true); }
}

// --- Three.js Hintergrund (bleibt gleich) ---
import { initThreeJS } from './threejs-background.js';
function initThreeJSBackground() { /* ... wie gehabt ... */
    const c = document.getElementById('threejs-canvas-container');
    if (c) { try { initThreeJS(c); } catch (e) { console.error("Three.js Fehler:", e); c.innerHTML = '<p style="color:var(--text-secondary);text-align:center;padding-top:40vh;">BG Animation Fehler.</p>'; } }
}

// --- App Start ---
document.addEventListener('DOMContentLoaded', () => { init(); initThreeJSBackground(); });
