// Globale Konstanten und Zustandsvariablen
const API_BASE_URL = 'php/'; // Basis-URL für PHP-Skripte
const CORS_PROXY_URL = 'https://api.allorigins.win/raw?url=';
const WFCD_RELICS_URL = 'https://cdn.jsdelivr.net/gh/WFCD/warframe-items/data/json/Relics.json';
const WFCD_IMAGE_CDN = 'https://cdn.warframestat.us/img/';

let currentUser = null; // Speichert Benutzerdaten nach Login
let wfcdRelicData = null; // Speichert die geladenen Relic.json Daten
let userRelicInventory = null; // Speichert das geparste Relikt-Inventar des Benutzers (oder die Roh-Bytes/Base64 davon)
let lastFetchedBase64RelicData = null; // Um die Rohdaten für erneutes Parsen zu halten
let amChartsInstances = { credits: null, platinum: null, endo: null }; // Für Chart-Instanzen

// DOM-Elemente
const systemBootLoader = document.getElementById('system-boot-loader');
const apiLoader = document.getElementById('api-loader');
const appContainer = document.getElementById('app-container');

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


// Hilfsfunktionen
function showApiLoader() {
    apiLoader.classList.remove('hidden');
}

function hideApiLoader() {
    // Nur ausblenden, wenn keine anderen wichtigen Ladevorgänge laufen (vereinfachte Prüfung)
    // Eine robustere Lösung würde einen Lade-Counter verwenden.
    apiLoader.classList.add('hidden');
}

function displayMessage(element, message, isError = false) {
    element.textContent = message;
    element.className = `mt-2 text-sm text-center ${isError ? 'text-red-400' : 'text-green-400'}`;
    if (message) {
        element.classList.remove('hidden');
    } else {
        element.classList.add('hidden');
    }
}

function showView(viewToShow) {
    [loginSection, registerSection, dashboardSection].forEach(section => {
        section.classList.add('hidden');
    });
    if (viewToShow) {
        viewToShow.classList.remove('hidden');
    }
}

function hexToRgb(hex) {
    const bigint = parseInt(hex.slice(1), 16);
    const r = (bigint >> 16) & 255;
    const g = (bigint >> 8) & 255;
    const b = bigint & 255;
    return `${r},${g},${b}`;
}

function lightenHexColor(hex, percent) {
    hex = hex.replace(/^\s*#|\s*$/g, '');
    if (hex.length === 3) hex = hex.replace(/(.)/g, '$1$1');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
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
    const panels = document.querySelectorAll('.panel');
    panels.forEach(panel => {
        panel.style.borderColor = `rgba(${hexToRgb(primaryColor)}, 0.3)`;
        panel.style.boxShadow = `0 0 15px 0px rgba(${hexToRgb(primaryColor)}, 0.2)`;
    });
    localStorage.setItem('accentColor', primaryColor);
}

function loadAccentColor() {
    const savedColor = localStorage.getItem('accentColor');
    applyAccentColor(savedColor || getComputedStyle(document.documentElement).getPropertyValue('--primary-accent').trim());
}

// Initialisierungsfunktion
async function init() {
    loadAccentColor();
    setTimeout(() => {
        systemBootLoader.style.opacity = '0';
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
    colorChoiceButtons.forEach(button => {
        button.addEventListener('click', (e) => applyAccentColor(e.target.dataset.color));
    });
    saveAlecaFrameTokenButton.addEventListener('click', handleSaveAndLoadAlecaFrameToken);

    await checkUserSession(); // Prüft Session und lädt ggf. Daten
    await loadWfcdRelicData(); // Lädt WFCD Daten im Hintergrund, falls noch nicht geschehen
}

// Authentifizierungsfunktionen
async function handleLogin(event) {
    event.preventDefault();
    displayMessage(loginMessage, '');
    const username = loginForm.username.value;
    const password = loginForm.password.value;
    showApiLoader();
    try {
        const response = await fetch(`${API_BASE_URL}login.php`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await response.json();
        if (response.ok && data.success) {
            displayMessage(loginMessage, data.success, false);
            currentUser = data.user;
            await afterLogin();
        } else {
            displayMessage(loginMessage, data.error || 'Login fehlgeschlagen.', true);
        }
    } catch (error) {
        displayMessage(loginMessage, 'Netzwerkfehler oder Server nicht erreichbar.', true);
    } finally { hideApiLoader(); }
}

async function handleRegister(event) {
    event.preventDefault();
    displayMessage(registerMessage, '');
    const username = registerForm.username.value;
    const password = registerForm.password.value;
    const access_code = registerForm.access_code.value;
    showApiLoader();
    try {
        const response = await fetch(`${API_BASE_URL}register.php`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password, access_code })
        });
        const data = await response.json();
        if (response.ok && data.success) {
            displayMessage(registerMessage, data.success + ' Du kannst dich jetzt anmelden.', false);
            registerForm.reset();
            setTimeout(() => showView(loginSection), 2000);
        } else {
            displayMessage(registerMessage, data.error || 'Registrierung fehlgeschlagen.', true);
        }
    } catch (error) {
        displayMessage(registerMessage, 'Netzwerkfehler oder Server nicht erreichbar.', true);
    } finally { hideApiLoader(); }
}

async function checkUserSession() {
    showApiLoader();
    try {
        const response = await fetch(`${API_BASE_URL}check_session.php`, { method: 'GET' });
        const data = await response.json();
        if (response.ok && data.loggedIn) {
            currentUser = data.user;
            await afterLogin();
        } else {
            showView(loginSection);
        }
    } catch (error) {
        showView(loginSection);
    } finally { hideApiLoader(); }
}

async function afterLogin() {
    if (!currentUser) return;
    usernameDisplay.textContent = currentUser.username;
    showView(dashboardSection);
    if (currentUser.api_token) {
        alecaFrameTokenInput.value = currentUser.api_token;
        await loadAlecaFrameData(currentUser.api_token);
    } else {
        statsSection.classList.add('hidden');
        relicInventorySection.classList.add('hidden');
        alecaFrameTokenSection.classList.remove('hidden');
        displayMessage(alecaFrameTokenMessage, 'Bitte gib deinen AlecaFrame Token ein.', false);
    }
}

async function handleLogout() {
    showApiLoader();
    try {
        await fetch(`${API_BASE_URL}logout.php`, { method: 'POST' });
    } catch (error) { console.error('Logout Fehler:', error); }
    finally {
        currentUser = null;
        lastFetchedBase64RelicData = null;
        userRelicInventory = null;
        showView(loginSection);
        loginForm.reset();
        statsSection.classList.add('hidden');
        relicInventorySection.classList.add('hidden');
        generalStatsDisplay.innerHTML = '';
        relicInventoryGrid.innerHTML = '';
        alecaFrameTokenInput.value = '';
        displayMessage(alecaFrameTokenMessage, '');
        Object.values(amChartsInstances).forEach(chart => chart?.dispose());
        amChartsInstances = { credits: null, platinum: null, endo: null };
        hideApiLoader();
    }
}

// AlecaFrame Token und Daten
async function handleSaveAndLoadAlecaFrameToken() {
    const token = alecaFrameTokenInput.value.trim();
    if (!token) {
        displayMessage(alecaFrameTokenMessage, 'Token darf nicht leer sein.', true);
        return;
    }
    showApiLoader();
    try {
        const response = await fetch(`${API_BASE_URL}save_token.php`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ api_token: token })
        });
        const data = await response.json();
        if (response.ok && data.success) {
            if (currentUser) currentUser.api_token = token;
            await loadAlecaFrameData(token); // Lädt Daten direkt nach dem Speichern
        } else {
            displayMessage(alecaFrameTokenMessage, data.error || 'Fehler beim Speichern des Tokens.', true);
        }
    } catch (error) {
        displayMessage(alecaFrameTokenMessage, 'Netzwerkfehler oder Server nicht erreichbar.', true);
    } finally { hideApiLoader(); }
}

async function loadAlecaFrameData(token) {
    if (!token) {
        statsSection.classList.add('hidden');
        relicInventorySection.classList.add('hidden');
        displayMessage(alecaFrameTokenMessage, 'Kein AlecaFrame Token vorhanden.', true);
        return;
    }
    displayMessage(alecaFrameTokenMessage, ''); // Alte Nachrichten löschen
    showApiLoader();
    statsSection.classList.remove('hidden');
    relicInventorySection.classList.remove('hidden');

    try {
        // AlecaFrame Statistiken
        const statsUrl = `${CORS_PROXY_URL}${encodeURIComponent(`https://stats.alecaframe.com/api/stats/public?token=${token}`)}`;
        const statsResponse = await fetch(statsUrl);
        if (!statsResponse.ok) throw new Error(`AlecaFrame Stats API: ${statsResponse.status} ${statsResponse.statusText}`);
        const statsData = await statsResponse.json();
        if (statsData.error) throw new Error(`AlecaFrame API Fehler: ${statsData.error}`);
        if (!statsData.stats || !statsData.history) throw new Error("Unerwartete Datenstruktur von AlecaFrame Statistiken.");

        displayGeneralStats(statsData.stats);
        createCurrencyCharts(statsData.history); // Implementierung in Phase 5

        // AlecaFrame Relikt-Inventar
        const relicInventoryUrl = `${CORS_PROXY_URL}${encodeURIComponent(`https://stats.alecaframe.com/api/stats/public/getRelicInventory?publicToken=${token}`)}`;
        const relicInventoryResponse = await fetch(relicInventoryUrl);
        if (!relicInventoryResponse.ok) throw new Error(`AlecaFrame Relic API: ${relicInventoryResponse.status} ${relicInventoryResponse.statusText}`);
        lastFetchedBase64RelicData = await relicInventoryResponse.text();

        try { // Prüfen, ob die Antwort ein JSON-Fehler ist
            const jsonData = JSON.parse(lastFetchedBase64RelicData);
            if (jsonData && jsonData.error) throw new Error(`AlecaFrame Relic API Fehler: ${jsonData.error}`);
        } catch(e) { /* Kein JSON, wahrscheinlich Base64, also weiter */ }

        parseAndDisplayRelicInventory(lastFetchedBase64RelicData);

    } catch (error) {
        console.error('Fehler beim Laden der AlecaFrame Daten:', error);
        displayMessage(alecaFrameTokenMessage, `Fehler: ${error.message}`, true);
        statsSection.classList.add('hidden');
        relicInventorySection.classList.add('hidden');
    } finally {
        hideApiLoader();
    }
}

function displayGeneralStats(stats) {
    let html = '<h4 class="text-lg font-heading mb-2">Account Übersicht</h4><div class="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">';
    const getStat = (obj, path, defaultValue = 'N/A') => path.split('.').reduce((o, k) => (o || {})[k], obj) || defaultValue;
    const formatNum = (num) => typeof num === 'number' ? num.toLocaleString() : num;

    html += `<div><span class="text-text-secondary">Credits:</span> <span class="text-primary-accent">${formatNum(getStat(stats, 'currencies.credits', getStat(stats, 'credits')))}</span></div>`;
    html += `<div><span class="text-text-secondary">Platin:</span> <span class="text-primary-accent">${formatNum(getStat(stats, 'currencies.platinum', getStat(stats, 'platinum')))}</span></div>`;
    html += `<div><span class="text-text-secondary">Endo:</span> <span class="text-primary-accent">${formatNum(getStat(stats, 'currencies.endo', getStat(stats, 'endo')))}</span></div>`;
    html += `<div><span class="text-text-secondary">Mastery Rank:</span> <span class="text-primary-accent">${getStat(stats, 'masteryRank.current')}</span></div>`;
    const playtimeSeconds = getStat(stats, 'player.playtime', getStat(stats, 'playTime', 0));
    html += `<div><span class="text-text-secondary">Spielzeit:</span> <span class="text-primary-accent">${playtimeSeconds !== 'N/A' ? Math.floor(playtimeSeconds / 3600) + ' Std.' : 'N/A'}</span></div>`;
    html += `<div><span class="text-text-secondary">Ingame Name:</span> <span class="text-primary-accent">${getStat(stats, 'player.name')}</span></div>`;
    html += '</div>';
    generalStatsDisplay.innerHTML = html;
}

function createCurrencyCharts(historyData) {
    console.log("Währungsverlauf für amCharts:", historyData);

    // Gemeinsame Funktion zum Erstellen eines Charts
    const createChart = (containerId, data, valueFieldName, colorHex, currencyName) => {
        const chartContainer = document.getElementById(containerId);
        if (!chartContainer) {
            console.error(`Chart Container ${containerId} nicht gefunden.`);
            return;
        }
        chartContainer.innerHTML = ''; // Alten Inhalt (Placeholder) löschen

        // amCharts Instanz entsorgen, falls vorhanden
        if (amChartsInstances[currencyName.toLowerCase()]) {
            amChartsInstances[currencyName.toLowerCase()].dispose();
            amChartsInstances[currencyName.toLowerCase()] = null;
        }

        if (!data || data.length === 0) {
            chartContainer.innerHTML = `<p class="text-text-secondary text-center pt-8 text-sm">Keine Verlaufsdaten für ${currencyName} verfügbar.</p>`;
            return;
        }

        // Daten für amCharts vorbereiten (timestamp und value)
        // AlecaFrame liefert Timestamps in Sekunden, amCharts braucht Millisekunden
        const chartData = data.map(item => ({
            date: parseInt(item.timestamp) * 1000, // Umwandlung in Millisekunden und sicherstellen, dass es eine Zahl ist
            value: parseInt(item[valueFieldName]) // Sicherstellen, dass der Wert eine Zahl ist
        })).sort((a,b) => a.date - b.date); // Nach Datum sortieren, falls nicht schon geschehen


        let root = am5.Root.new(chartContainer);
        amChartsInstances[currencyName.toLowerCase()] = root; // Instanz speichern

        // Dark Theme anwenden, falls gewünscht
        root.setThemes([am5themes_Animated.new(root), am5themes_Dark.new(root)]);

        // Eigene Farben für das Theme setzen (überschreibt Teile des Dark Themes)
        root.interfaceColors.set("background", am5.color(0x00000000)); // Transparenter Hintergrund
        root.interfaceColors.set("text", am5.color(0xe0e0e0)); // --text-primary
        root.interfaceColors.set("grid", am5.color(0x333333)); // Dunkles Grau für Gitterlinien
        root.interfaceColors.set("secondaryButtonText", am5.color(0xe0e0e0)); // Für Zoom-Buttons etc.


        let chart = root.container.children.push(am5xy.XYChart.new(root, {
            panX: true,
            panY: false,
            wheelX: "panX",
            wheelY: "zoomX",
            pinchZoomX: true,
            layout: root.verticalLayout,
            maxTooltipDistance: 0 // Tooltip immer anzeigen, auch wenn Maus nicht direkt auf Punkt
        }));

        // X-Achse (Datum)
        let xAxis = chart.xAxes.push(am5xy.DateAxis.new(root, {
            baseInterval: { timeUnit: "day", count: 1 },
            renderer: am5xy.AxisRendererX.new(root, {
                minorGridEnabled: true,
                minGridDistance: 70 // Mindestabstand zwischen Gitterlinien in Pixel
            }),
            tooltip: am5.Tooltip.new(root, {}) // Leerer Tooltip für die Achse selbst
        }));

        // Y-Achse (Wert)
        let yAxis = chart.yAxes.push(am5xy.ValueAxis.new(root, {
            renderer: am5xy.AxisRendererY.new(root, {
                minGridDistance: 30
            }),
            tooltip: am5.Tooltip.new(root, {})
        }));
        yAxis.get("renderer").labels.template.setAll({ fill: am5.color(0xa0a0a0) }); // --text-secondary für Y-Achsen-Labels
        xAxis.get("renderer").labels.template.setAll({ fill: am5.color(0xa0a0a0) }); // --text-secondary für X-Achsen-Labels


        // Serie erstellen
        let series = chart.series.push(am5xy.LineSeries.new(root, {
            name: currencyName,
            xAxis: xAxis,
            yAxis: yAxis,
            valueYField: "value",
            valueXField: "date",
            stroke: am5.color(colorHex), // Linienfarbe
            fill: am5.color(colorHex), // Füllfarbe für die Fläche unter der Linie (optional)
            tensionX: 0.8, // Linien glätten
            tooltip: am5.Tooltip.new(root, {
                labelText: "{valueY}",
                pointerOrientation: "horizontal",
                dy:-10 // Kleiner Offset nach oben
            })
        }));

        // Fläche unter der Linie
        series.fills.template.setAll({
            fillOpacity: 0.1,
            visible: true
        });

        // Bullets (Punkte auf der Linie)
        series.bullets.push(function() {
            return am5.Bullet.new(root, {
                sprite: am5.Circle.new(root, {
                    radius: 3,
                    fill: series.get("stroke"), // Farbe wie Linie
                    stroke: root.interfaceColors.get("background"), // Hintergrundfarbe für den Rand
                    strokeWidth: 1
                })
            });
        });

        series.data.setAll(chartData);
        series.appear(1000); // Animation beim Laden

        // Scrollbar für Zoom und Navigation (optional)
        let scrollbarX = chart.set("scrollbarX", am5.Scrollbar.new(root, {
            orientation: "horizontal",
            height: 30
        }));
        scrollbarX.thumb.setAll({
          fill: am5.color(0x39ff14), // Akzentfarbe
          fillOpacity: 0.2
        });
        scrollbarX.startGrip.setAll({ visible: true, fill: am5.color(0x39ff14) });
        scrollbarX.endGrip.setAll({ visible: true, fill: am5.color(0x39ff14) });


        // Cursor für Tooltips und Achsen-Infos
        let cursor = chart.set("cursor", am5xy.XYCursor.new(root, {
            behavior: "zoomXY", // Zoom-Verhalten bei Auswahl
            xAxis: xAxis,
            yAxis: yAxis
        }));
        cursor.lineY.set("visible", false); // Vertikale Cursor-Linie ausblenden

        chart.appear(1000, 100); // Chart-Animation
    };

    // Erstelle die drei Charts
    // Farben können ggf. aus CSS-Variablen gelesen oder hier definiert werden
    const primaryAccentColor = getComputedStyle(document.documentElement).getPropertyValue('--primary-accent').trim();

    createChart('credits-chart-container', historyData.credits, 'credits', primaryAccentColor, 'Credits');
    createChart('platinum-chart-container', historyData.platinum, 'platinum', '#87CEEB', 'Platin'); // SkyBlue für Platin
    createChart('endo-chart-container', historyData.endo, 'endo', '#FFD700', 'Endo'); // Gold für Endo
}

function parseAndDisplayRelicInventory(base64Data) {
    relicInventoryGrid.innerHTML = '';
    try {
        if (!base64Data) throw new Error("Keine Base64 Daten für Relikt-Inventar erhalten.");
        const binaryString = atob(base64Data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);

        if (bytes.length === 0) throw new Error("Relikt-Inventar ist leer oder konnte nicht dekodiert werden.");

        if (bytes.length < 500) { // Kurze Antworten könnten Fehler sein
            const textDecoder = new TextDecoder('utf-8');
            const potentialErrorText = textDecoder.decode(bytes);
            if (potentialErrorText.toLowerCase().match(/error|token|invalid/)) {
                 throw new Error("Relikt-Inventar API-Antwort: " + potentialErrorText.substring(0,150));
            }
        }

        if (!wfcdRelicData) {
            relicInventoryGrid.innerHTML = '<p class="text-text-secondary col-span-full text-center">Lade Relikt-Item-Datenbank... Bitte kurz warten.</p>';
            setTimeout(() => parseAndDisplayRelicInventory(base64Data), 2000);
            return;
        }

        // Da die Binärstruktur der AlecaFrame API unbekannt ist,
        // wird hier eine DUMMY-Implementierung verwendet, die annimmt, dass die API
        // eine JSON-Struktur zurückgibt, die als String binär kodiert wurde (sehr unwahrscheinlich).
        // ODER es wird eine komplett zufällige Auswahl von Relikten aus WFCD angezeigt.
        // Ein ECHTER Parser für die unbekannte Binärstruktur kann hier nicht implementiert werden.
        let parsedRelics = [];
        try { // Versuch, als JSON zu parsen (falls es doch Text-basiert ist)
            const textData = new TextDecoder('utf-8').decode(bytes);
            const jsonData = JSON.parse(textData);
            if (Array.isArray(jsonData) && jsonData.every(r => r.uniqueName && typeof r.count === 'number')) {
                parsedRelics = jsonData;
            }
        } catch (e) { /* Kein valides JSON, also weiter mit Dummy-Logik */ }

        if (parsedRelics.length > 0) {
            userRelicInventory = parsedRelics.map(apiRelic => {
                const wfcdDetail = wfcdRelicData.find(w => w.uniqueName === apiRelic.uniqueName);
                return wfcdDetail ? { ...wfcdDetail, count: apiRelic.count } : null;
            }).filter(r => r !== null);
        } else {
            // Fallback: Zeige eine Fehlermeldung und dann Dummy-Daten
            relicInventoryGrid.innerHTML = `<p class="text-orange-400 col-span-full text-center">WARNUNG: Die binäre Struktur des Relikt-Inventars ist unbekannt. Anzeige mit DUMMY-DATEN.</p>
            <p class="text-xs text-text-secondary col-span-full text-center mt-1">Bytes empfangen: ${bytes.length}. Erste Bytes (dezimal): ${bytes.slice(0,10).join(', ')}</p>`;
            userRelicInventory = wfcdRelicData.slice(0, Math.min(24, wfcdRelicData.length)) // Nimm bis zu 24 zufällige Relikte
                                 .map(r => ({...r, count: Math.floor(Math.random() * 15) + 1}));
        }
        displayRelics(userRelicInventory);

    } catch (error) {
        console.error("Fehler beim Parsen des Relikt-Inventars:", error);
        relicInventoryGrid.innerHTML = `<p class="text-red-400 col-span-full text-center">Fehler: ${error.message}</p>`;
        userRelicInventory = null;
    }
}

function displayRelics(relicsToDisplay) {
    if (!relicsToDisplay || relicsToDisplay.length === 0) {
        if (!relicInventoryGrid.innerHTML.includes("WARNUNG:")) { // Nicht überschreiben, wenn schon Dummy-Warnung da ist
            relicInventoryGrid.innerHTML = '<p class="text-text-secondary col-span-full text-center">Keine Relikte zum Anzeigen.</p>';
        }
        return;
    }
    // Wenn eine Warnung da ist, wird sie durch die Relikte ersetzt. Ansonsten Grid leeren.
    if (!relicInventoryGrid.innerHTML.includes("WARNUNG:")) {
        relicInventoryGrid.innerHTML = '';
    }


    relicsToDisplay.forEach(relic => {
        const imageName = relic.imageName || `${relic.uniqueName.toLowerCase().replace(/\s+/g, '-')}.png`;
        const isVaulted = relic.vaulted ? "[VAULTED] " : "";

        const relicElement = document.createElement('div');
        relicElement.className = 'panel !p-2 flex flex-col items-center text-center cursor-pointer interactive-element transition-all hover:scale-105 focus-within:ring-2 focus-within:ring-primary-accent';
        relicElement.setAttribute('tabindex', '0'); // Für Tastaturfokus
        relicElement.innerHTML = `
            <img src="${WFCD_IMAGE_CDN}${imageName}" alt="${relic.name}" class="w-16 h-16 mb-1 object-contain" loading="lazy" onerror="this.style.display='none'; this.parentElement.insertAdjacentHTML('afterbegin', '<div class=\\'w-16 h-16 mb-1 flex items-center justify-center bg-bg-surface text-text-secondary text-xs rounded-sm\\'>N/A</div>');">
            <p class="text-xs font-semibold">${isVaulted}${relic.name}</p>
            <p class="text-xs text-text-secondary">Tier: ${relic.tier}</p>
            <p class="text-xs text-primary-accent">Anzahl: ${relic.count !== undefined ? relic.count : 'N/A'}</p>
        `;
        relicElement.addEventListener('mouseenter', (event) => showRelicTooltip(event, relic));
        relicElement.addEventListener('mouseleave', hideRelicTooltip);
        relicElement.addEventListener('mousemove', moveRelicTooltip);
        relicElement.addEventListener('focus', (event) => showRelicTooltip(event, relic)); // Tooltip auch bei Fokus
        relicElement.addEventListener('blur', hideRelicTooltip);


        relicInventoryGrid.appendChild(relicElement);
    });
}

function showRelicTooltip(event, relic) {
    if (!relic || !wfcdRelicData) return;
    const detailedRelic = wfcdRelicData.find(r => r.uniqueName === relic.uniqueName) || relic;
    let tooltipContent = `<h5 class="font-bold text-primary-accent mb-1">${detailedRelic.name} ${detailedRelic.vaulted ? "<span class='text-yellow-400 text-xs font-normal'>[VAULTED]</span>" : ""}</h5>`;

    if (detailedRelic.rewards && Array.isArray(detailedRelic.rewards)) {
        tooltipContent += '<p class="text-xs text-text-secondary mb-1">Mögliche Belohnungen (Top 3 nach Seltenheit):</p><ul class="list-none text-xs space-y-0.5">';
        const sortedRewards = [...detailedRelic.rewards].sort((a, b) => {
            const rarityOrder = { "Common": 3, "Uncommon": 2, "Rare": 1 };
            return (rarityOrder[a.rarity] || 4) - (rarityOrder[b.rarity] || 4) || a.itemName.localeCompare(b.itemName);
        });
        sortedRewards.slice(0, 3).forEach(item => {
            const rarityColor = item.rarity === "Rare" ? "text-yellow-400" : item.rarity === "Uncommon" ? "text-gray-300" : "text-text-primary";
            tooltipContent += `<li><span class="${rarityColor}">${item.itemName}</span> (${item.rarity}, ${item.chance}%)</li>`;
        });
        if (sortedRewards.length > 3) tooltipContent += `<li>... und ${sortedRewards.length - 3} weitere</li>`;
        tooltipContent += '</ul>';
    } else {
         tooltipContent += '<p class="text-xs text-text-secondary">Keine Belohnungsdetails verfügbar.</p>';
    }
    relicTooltip.innerHTML = tooltipContent;
    relicTooltip.classList.remove('hidden');
    moveRelicTooltip(event);
}

function hideRelicTooltip() {
    relicTooltip.classList.add('hidden');
}

function moveRelicTooltip(event) {
    if (relicTooltip.classList.contains('hidden')) return;
    const { clientX:mouseX, clientY:mouseY } = event;
    const tooltipRect = relicTooltip.getBoundingClientRect();
    let x = mouseX + 20;
    let y = mouseY + 20;
    if (x + tooltipRect.width > window.innerWidth - 10) x = mouseX - tooltipRect.width - 20;
    if (y + tooltipRect.height > window.innerHeight - 10) y = mouseY - tooltipRect.height - 20;
    if (x < 10) x = 10;
    if (y < 10) y = 10;
    relicTooltip.style.left = `${x}px`;
    relicTooltip.style.top = `${y}px`;
}

async function loadWfcdRelicData() {
    if (wfcdRelicData) return; // Bereits geladen
    console.log("Lade WFCD Relic.json...");
    showApiLoader();
    try {
        const response = await fetch(WFCD_RELICS_URL);
        if (!response.ok) throw new Error(`WFCD Relic.json: ${response.statusText}`);
        wfcdRelicData = await response.json();
        console.log('WFCD Relic.json geladen:', wfcdRelicData.length, "Relikte");
        // Wenn Relikt-Inventar auf diese Daten gewartet hat, neu parsen/anzeigen
        if (lastFetchedBase64RelicData && relicInventoryGrid.innerHTML.includes("Lade Relikt-Item-Datenbank...")) {
            console.log("WFCD Daten jetzt verfügbar, versuche Relikt-Inventar neu zu parsen.");
            parseAndDisplayRelicInventory(lastFetchedBase64RelicData);
        }
    } catch (error) {
        console.error('WFCD Ladefehler:', error);
        if(relicInventoryGrid && (relicInventoryGrid.innerHTML === '' || relicInventoryGrid.innerHTML.includes("Lade Relikt-Item-Datenbank..."))) {
            relicInventoryGrid.innerHTML = `<p class="text-red-400 col-span-full text-center">Fehler beim Laden der Relikt-Item-Datenbank: ${error.message}</p>`;
        }
    } finally {
        hideApiLoader(); // Verstecke Loader, wenn WFCD fertig ist (oder fehlgeschlagen)
    }
}

// Einstellungs-Modal Funktionen
function openSettingsModal() {
    settingsModal.classList.remove('hidden');
    settingsAccessCodeSection.classList.remove('hidden');
    colorPickerSection.classList.add('hidden');
    settingsAccessCodeInput.value = '';
    displayMessage(settingsAccessMessage, '');
    settingsAccessCodeInput.focus();
}

function closeSettingsModal() {
    settingsModal.classList.add('hidden');
}

function checkSettingsAccessCode() {
    if (settingsAccessCodeInput.value === "69420") {
        settingsAccessCodeSection.classList.add('hidden');
        colorPickerSection.classList.remove('hidden');
        displayMessage(settingsAccessMessage, '');
    } else {
        displayMessage(settingsAccessMessage, 'Falscher Freischaltcode.', true);
    }
}

// Three.js Hintergrund (aus threejs-background.js importiert)
import { initThreeJS } from './threejs-background.js';
function initThreeJSBackground() {
    const container = document.getElementById('threejs-canvas-container');
    if (container) {
        try {
            initThreeJS(container);
        } catch (error) {
            console.error("Failed to initialize Three.js background:", error);
            container.innerHTML = '<p style="color:var(--text-secondary); text-align:center; padding-top:40vh;">Hintergrundanimation konnte nicht geladen werden.</p>';
        }
    }
}

// App Start
document.addEventListener('DOMContentLoaded', () => {
    init();
    initThreeJSBackground();
});
