// Globale Konstanten und Zustandsvariablen
const API_BASE_URL = 'api.php'; // NEU: Zentraler API-Endpunkt
// const CORS_PROXY_URL = 'https://api.allorigins.win/raw?url='; // Nicht mehr benötigt für AlecaFrame
const WFCD_RELICS_URL = 'https://cdn.jsdelivr.net/gh/WFCD/warframe-items/data/json/Relics.json';
const WFCD_IMAGE_CDN = 'https://cdn.warframestat.us/img/';

let currentUser = null;
let wfcdRelicMap = new Map();
let userRelicInventory = null;
let lastFetchedBase64RelicData = null; // Wird jetzt vom PHP-Proxy als String geliefert
let amChartsInstances = { credits: null, platinum: null, endo: null };

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
function normalizeRelicName(name) {
    if (typeof name !== 'string') return '';
    return name.toLowerCase()
               .replace(/\s*\([\w\s]+\)\s*$/, '')
               .replace(/relic/g, '')
               .replace(/prime vault/g, '')
               .replace(/vaulted/g, '')
               .replace(/\[|\]/g, '')
               .replace(/\s+/g, ' ')
               .trim();
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

    await loadWfcdRelicData();
    await checkUserSession();
}

async function handleLogin(event) {
    event.preventDefault(); displayMessage(loginMessage, '');
    const body = { username: loginForm.username.value, password: loginForm.password.value };
    showApiLoader();
    try {
        const response = await fetch(`${API_BASE_URL}?action=login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const data = await response.json();
        if (response.ok && data.success) {
            currentUser = data.user; await afterLogin();
        } else { displayMessage(loginMessage, data.error || 'Login fehlgeschlagen.', true); }
    } catch (e) { displayMessage(loginMessage, 'Netzwerkfehler.', true); } finally { hideApiLoader(); }
}
async function handleRegister(event) {
    event.preventDefault(); displayMessage(registerMessage, '');
    const body = { username: registerForm.username.value, password: registerForm.password.value, access_code: registerForm.access_code.value };
    showApiLoader();
    try {
        const response = await fetch(`${API_BASE_URL}?action=register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        const data = await response.json();
        if (response.ok && data.success) {
            displayMessage(registerMessage, data.success + ' Anmelden.', false); registerForm.reset(); setTimeout(() => showView(loginSection), 2000);
        } else { displayMessage(registerMessage, data.error || 'Registrierung fehlgeschlagen.', true); }
    } catch (e) { displayMessage(registerMessage, 'Netzwerkfehler.', true); } finally { hideApiLoader(); }
}
async function checkUserSession() {
    showApiLoader();
    try {
        const response = await fetch(`${API_BASE_URL}?action=check_session`, { method: 'GET' });
        const data = await response.json();
        if (response.ok && data.loggedIn) { currentUser = data.user; await afterLogin(); } else { showView(loginSection); }
    } catch (e) { showView(loginSection); } finally { hideApiLoader(); }
}
async function afterLogin() {
    if (!currentUser) return;
    usernameDisplay.textContent = currentUser.username;
    showView(dashboardSection);
    if (currentUser.api_token) {
        alecaFrameTokenInput.value = currentUser.api_token;
        await loadAlecaFrameData(); // Ruft jetzt ohne Token-Parameter auf
    } else {
        statsSection.classList.add('hidden'); relicInventorySection.classList.add('hidden');
        alecaFrameTokenSection.classList.remove('hidden');
        displayMessage(alecaFrameTokenMessage, 'AlecaFrame Token eingeben.', false);
    }
}
async function handleLogout() {
    showApiLoader();
    try { await fetch(`${API_BASE_URL}?action=logout`, { method: 'POST' }); } catch (e) { console.error('Logout Fehler:', e); }
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
async function handleSaveAndLoadAlecaFrameToken() {
    const token = alecaFrameTokenInput.value.trim();
    if (!token) { displayMessage(alecaFrameTokenMessage, 'Token darf nicht leer sein.', true); return; }
    showApiLoader();
    try {
        // Token zuerst im Backend speichern
        const saveResponse = await fetch(`${API_BASE_URL}?action=save_token`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ api_token: token }) });
        const saveData = await saveResponse.json();
        if (!saveResponse.ok || !saveData.success) {
            throw new Error(saveData.error || "Fehler beim Speichern des Tokens.");
        }

        // Wenn Speichern erfolgreich, currentUser aktualisieren und Daten laden
        if (currentUser) currentUser.api_token = token; // Wichtig, damit der Proxy den neuen Token verwendet
        await loadAlecaFrameData(); // Ruft jetzt ohne Token-Parameter auf

    } catch (e) {
        displayMessage(alecaFrameTokenMessage, e.message || 'Netzwerkfehler oder Server-Problem.', true);
    } finally {
        hideApiLoader();
    }
}

// --- AlecaFrame Datenverarbeitung via PHP Proxy ---
async function loadAlecaFrameData() { // Token wird nicht mehr als Parameter benötigt
    displayMessage(alecaFrameTokenMessage, '');
    showApiLoader();
    statsSection.classList.remove('hidden');
    relicInventorySection.classList.remove('hidden');

    try {
        const response = await fetch(`${API_BASE_URL}?action=get_warframe_data`, { method: 'GET' });
        if (!response.ok) {
            let errorMsg = `Fehler vom Server-Proxy: ${response.status} ${response.statusText}`;
            try { const errorData = await response.json(); errorMsg = errorData.error || errorMsg; } catch(e) {}
            throw new Error(errorMsg);
        }

        const combinedData = await response.json();
        console.log("Kombinierte Daten vom PHP-Proxy:", combinedData);

        // Verarbeitung der Statistikdaten
        if (combinedData.statsDataError) {
            console.error("Fehler bei Stats-Daten vom PHP-Proxy:", combinedData.statsDataError);
            displayMessage(alecaFrameTokenMessage, `Stats API Fehler: ${combinedData.statsDataError}`, true);
            generalStatsDisplay.innerHTML = `<p class="text-red-400">${combinedData.statsDataError}</p>`;
            // Verstecke Chart-Container, wenn Stats fehlschlagen
            Object.keys(amChartsInstances).forEach(key => document.getElementById(`${key}-chart-container`).innerHTML = '');

        } else if (combinedData.statsData && combinedData.statsData.generalDataPoints) {
            const statsData = combinedData.statsData;
            const latestStats = statsData.generalDataPoints.length > 0 ? statsData.generalDataPoints[statsData.generalDataPoints.length - 1] : {};
            if(statsData.usernameWhenPublic) latestStats.usernameWhenPublic = statsData.usernameWhenPublic;
            displayGeneralStats(latestStats);
            createCurrencyCharts(statsData.generalDataPoints);
        } else {
            const errorDetail = combinedData.statsData ? `Empfangene Keys: ${Object.keys(combinedData.statsData).join(', ')}` : "Keine StatsData empfangen.";
            console.error("Unerwartete oder fehlende Stats-Daten vom PHP-Proxy:", errorDetail, combinedData.statsData);
            displayMessage(alecaFrameTokenMessage, "Fehler: Keine gültigen Statistikdaten empfangen.", true);
            generalStatsDisplay.innerHTML = `<p class="text-red-400">Keine gültigen Statistikdaten empfangen. ${errorDetail}</p>`;
            Object.keys(amChartsInstances).forEach(key => document.getElementById(`${key}-chart-container`).innerHTML = '');
        }

        // Verarbeitung der Relikt-Inventardaten
        if (combinedData.relicInventoryDataError) {
            console.error("Fehler bei Relikt-Inventar-Daten vom PHP-Proxy:", combinedData.relicInventoryDataError);
            relicInventoryGrid.innerHTML = `<p class="text-red-400 col-span-full text-center">${combinedData.relicInventoryDataError}</p>`;
        } else if (combinedData.relicInventoryData) {
            lastFetchedBase64RelicData = combinedData.relicInventoryData; // Ist der String, der ggf. JSON-escaped Base64 ist
            parseAndDisplayRelicInventory(lastFetchedBase64RelicData);
        } else {
            console.error("Unerwartete oder fehlende Relikt-Inventar-Daten vom PHP-Proxy.");
            relicInventoryGrid.innerHTML = `<p class="text-red-400 col-span-full text-center">Keine gültigen Relikt-Inventardaten empfangen.</p>`;
        }

    } catch (error) {
        console.error('Fehler beim Abrufen der Daten via PHP-Proxy:', error);
        displayMessage(alecaFrameTokenMessage, `Proxy Fehler: ${error.message}`, true);
        statsSection.classList.add('hidden');
        relicInventorySection.classList.add('hidden');
    } finally {
        hideApiLoader();
    }
}

function displayGeneralStats(latestDataPoint) {
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
function createCurrencyCharts(generalDataPoints) {
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

async function loadWfcdRelicData() {
    if (wfcdRelicMap.size > 0) {
        console.log("WFCD Relic Map bereits initialisiert.");
        return;
    }
    console.log("Lade WFCD Relic.json für Map-Erstellung...");
    showApiLoader();
    try {
        const response = await fetch(WFCD_RELICS_URL); // Direkt fetch, da keine Credentials/Proxy für WFCD nötig
        if (!response.ok) throw new Error(`WFCD Relic.json: ${response.statusText}`);
        const itemsArray = await response.json();

        wfcdRelicMap.clear();
        itemsArray.forEach(item => {
            const normalizedKey = normalizeRelicName(item.name);
            if (normalizedKey) {
                wfcdRelicMap.set(normalizedKey, item);
            }
        });
        console.log('WFCD Relic Map initialisiert:', wfcdRelicMap.size, "Einträge");

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

function parseAndDisplayRelicInventory(base64ApiResponse) {
    relicInventoryGrid.innerHTML = '';
    try {
        if (!base64ApiResponse) throw new Error("Keine Base64 Relikt-Daten von API.");

        let actualBase64String;
        try {
            actualBase64String = JSON.parse(base64ApiResponse);
            if (typeof actualBase64String !== 'string') {
                console.warn('Relikt-Antwort (nach JSON.parse) ist kein String. Typ:', typeof actualBase64String);
                actualBase64String = base64ApiResponse;
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

        if (wfcdRelicMap.size === 0) {
            relicInventoryGrid.innerHTML = '<p class="text-text-secondary col-span-full text-center">Warte auf WFCD Relikt-Datenbank...</p>';
            setTimeout(() => parseAndDisplayRelicInventory(base64ApiResponse), 2000);
            return;
        }

        const dataView = new DataView(bytes.buffer);
        let offset = 0;
        const numRelicTypes = dataView.getUint32(offset, true); offset += 4;
        userRelicInventory = [];

        const relicTierApiMap = ["Lith", "Meso", "Neo", "Axi", "Requiem"];

        for (let i = 0; i < numRelicTypes; i++) {
            if (offset + 9 > bytes.length) { console.error("Nicht genug Daten für Relikt #", i); break; }
            const typeByte = dataView.getUint8(offset); offset += 1;
            const refinementByte = dataView.getUint8(offset); offset += 1;

            let nameChars = [];
            for(let j=0; j < 3; j++) nameChars.push(String.fromCharCode(dataView.getUint8(offset + j)));
            offset += 3;
            const alecaRelicShortName = nameChars.join('').trim();
            const count = dataView.getUint32(offset, true); offset += 4;

            const alecaTierName = relicTierApiMap[typeByte] || "UnknownTier";
            const normalizedAlecaName = normalizeRelicName(`${alecaTierName} ${alecaRelicShortName}`);

            const wfcdDetail = wfcdRelicMap.get(normalizedAlecaName);

            if (wfcdDetail) {
                userRelicInventory.push({ ...wfcdDetail, count: count });
            } else {
                console.warn(`Kein WFCD Detail für normalisierten Namen "${normalizedAlecaName}" (Original Aleca: ${alecaTierName} ${alecaRelicShortName}) gefunden.`);
                userRelicInventory.push({
                    name: `${alecaTierName} ${alecaRelicShortName}`,
                    uniqueName: `unknown_${normalizedAlecaName.replace(/\s+/g, '_')}`,
                    tier: alecaTierName, imageName: '', rewards: [], vaulted: false, count: count,
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
        const imageName = relic.imageName || `${(relic.tier || '').toLowerCase()}${(relic.name || '').split(' ').pop().toLowerCase()}relicint.png`;
        const isVaulted = relic.vaulted ? "<span class='text-yellow-400 text-xs font-normal'>[VAULTED]</span> " : "";
        const displayName = relic.name;

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

function showRelicTooltip(event, relicData) {
    if (!relicData) return;
    const isVaultedText = relicData.vaulted ? "<span class='text-yellow-400 text-xs font-normal'>[VAULTED]</span>" : "";
    let tooltipContent = `<h5 class="font-bold text-primary-accent mb-1">${relicData.name} ${isVaultedText}</h5>`;

    if (relicData.rewards && Array.isArray(relicData.rewards)) {
        tooltipContent += '<p class="text-xs text-text-secondary mb-1">Top 3 Belohnungen:</p><ul class="list-none text-xs space-y-0.5">';
        const rarityOrder = { "Rare": 1, "Uncommon": 2, "Common": 3 };
        const sortedRewards = [...relicData.rewards].sort((a,b) =>
            (rarityOrder[a.rarity] || 4) - (rarityOrder[b.rarity] || 4) ||
            b.chance - a.chance ||
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
function moveRelicTooltip(event) {
    if (relicTooltip.classList.contains('hidden')) return;
    const { clientX:mX, clientY:mY } = event; const rect = relicTooltip.getBoundingClientRect();
    let x = mX + 20, y = mY + 20;
    if (x + rect.width > window.innerWidth - 10) x = mX - rect.width - 20;
    if (y + rect.height > window.innerHeight - 10) y = mY - rect.height - 20;
    if (x < 10) x = 10; if (y < 10) y = 10;
    relicTooltip.style.left = `${x}px`; relicTooltip.style.top = `${y}px`;
}

function openSettingsModal() {
    settingsModal.classList.remove('hidden'); settingsAccessCodeSection.classList.remove('hidden');
    colorPickerSection.classList.add('hidden'); settingsAccessCodeInput.value = '';
    displayMessage(settingsAccessMessage, ''); settingsAccessCodeInput.focus();
}
function closeSettingsModal() { settingsModal.classList.add('hidden'); }
function checkSettingsAccessCode() {
    if (settingsAccessCodeInput.value === "69420") {
        settingsAccessCodeSection.classList.add('hidden'); colorPickerSection.classList.remove('hidden'); displayMessage(settingsAccessMessage, '');
    } else { displayMessage(settingsAccessMessage, 'Falscher Code.', true); }
}

import { initThreeJS } from './threejs-background.js';
function initThreeJSBackground() {
    const c = document.getElementById('threejs-canvas-container');
    if (c) { try { initThreeJS(c); } catch (e) { console.error("Three.js Fehler:", e); c.innerHTML = '<p style="color:var(--text-secondary);text-align:center;padding-top:40vh;">BG Animation Fehler.</p>'; } }
}

document.addEventListener('DOMContentLoaded', () => { init(); initThreeJSBackground(); });
