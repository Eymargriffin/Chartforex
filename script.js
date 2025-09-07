// --- CONFIGURATION ---
const ZMW_MID_RATES = {
    'USD': 23.05, 'GBP': 31.03, 'EUR': 27.24, 'CAD': 16.62, 'SEK': 2.43, 'DKK': 3.65, 'JPY': 0.156,
    'CHF': 28.61, 'AUD': 14.92, 'ZAR': 1.32, 'BWP': 1.60, 'KES': 0.178
};
const CURRENCIES = [
    { name: 'US Dollar', code: 'USD', flag: 'us' },
    { name: 'British Pound', code: 'GBP', flag: 'gb' },
    { name: 'Euro', code: 'EUR', flag: 'eu' },
    { name: 'Canadian Dollar', code: 'CAD', flag: 'ca' },
    { name: 'Swedish Krona', code: 'SEK', flag: 'se' },
    { name: 'Danish Krone', code: 'DKK', flag: 'dk' },
    { name: 'Japanese Yen', code: 'JPY', flag: 'jp', isYen: true },
    { name: 'Swiss Franc', code: 'CHF', flag: 'ch' },
    { name: 'Australian Dollar', code: 'AUD', flag: 'au' },
    { name: 'South African Rand', code: 'ZAR', flag: 'za' },
    { name: 'Botswana Pula', code: 'BWP', flag: 'bw' },
    { name: 'Kenyan Shilling', code: 'KES', flag: 'ke' },
];
const INTEREST_RATES = [
    { term: "30 Days Fixed", rate: 4.55 }, { term: "45 Days Fixed", rate: 5.32 },
    { term: "60 Days Fixed", rate: 5.97 }, { term: "90 Days Fixed", rate: 6.45 },
    { term: "6 Months Fixed", rate: 7.06 }, { term: "12 Months Fixed", rate: 7.83 },
    { term: "18 Months Fixed", rate: 8.15 }, { term: "24 Months Fixed", rate: 8.27 },
    { term: "BOZ Policy Rate", rate: 14.50, isPolicy: true }
];
const FOREX_BUY_STORAGE_KEY = 'zmw_manual_forex_buy_rates';
const FOREX_SELL_STORAGE_KEY = 'zmw_manual_forex_sell_rates';
const INTEREST_STORAGE_KEY = 'zmw_manual_interest_rates';
const SPREAD_FACTOR_BUY = 0.995;
const SPREAD_FACTOR_SELL = 1.005;
const MANUAL_PASSWORD = 'duckduckgoose';
const LOCK_STORAGE_KEY = 'zmw_page_lock';

// --- STATE MANAGEMENT ---
let manualOverrides = { forex_buy: {}, forex_sell: {}, interest: {} };
let currentBuyingRates = {};
let currentSellingRates = {};
let previousBuyingRates = {};
let previousSellingRates = {};
let apiStatus = 'offline';
let usingFallback = true;
let confirmCallback = null;
let isUpdating = false;
let isLocked = false;

// --- DOM ELEMENT REFERENCES ---
const currencyNamesEl = document.getElementById('currency-names');
const buyingRatesEl = document.getElementById('buying-rates');
const sellingRatesEl = document.getElementById('selling-rates');
const interestRatesEl = document.getElementById('interest-rates');
const timestampEl = document.getElementById('time');
const dateEl = document.getElementById('date');
const apiStatusEl = document.getElementById('api-status');
const manualOverlay = document.getElementById('manual-overlay');
const confirmModal = document.getElementById('confirm-modal');
const confirmModalContent = document.getElementById('confirm-modal-content');
const lockOverlay = document.getElementById('lock-overlay');

// --- UI FUNCTIONS ---
function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    const container = document.getElementById('toast-container');
    container.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 100);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => container.removeChild(toast), 300);
    }, 3000);
}

// --- LOCK FUNCTIONALITY ---
function toggleLock() {
    const password = prompt("Enter password to toggle lock:");
    if (password !== MANUAL_PASSWORD) {
        showToast("Incorrect password", "error");
        return;
    }
    isLocked = !isLocked;
    localStorage.setItem(LOCK_STORAGE_KEY, JSON.stringify(isLocked));
    lockOverlay.classList.toggle('active', isLocked);
    showToast(isLocked ? 'Page locked' : 'Page unlocked', 'success');
}

// --- DATA HANDLING ---
function getFallbackRates() {
    const fallbackBuying = {};
    const fallbackSelling = {};
    CURRENCIES.forEach(c => {
        const mid = ZMW_MID_RATES[c.code];
        fallbackBuying[c.code] = manualOverrides.forex_buy[c.code] || (mid * SPREAD_FACTOR_BUY);
        fallbackSelling[c.code] = manualOverrides.forex_sell[c.code] || (mid * SPREAD_FACTOR_SELL);
    });
    return {buying: fallbackBuying, selling: fallbackSelling};
}

// --- BOARD UPDATE LOGIC ---
async function updateBoard() {
    if (isUpdating) return;
    isUpdating = true;
    try {
        const rates = getFallbackRates();
        previousBuyingRates = { ...currentBuyingRates };
        previousSellingRates = { ...currentSellingRates };
        currentBuyingRates = rates.buying;
        currentSellingRates = rates.selling;
        updateRateDisplays();
        updateTimestamp();
        updateAPIStatus();
        showToast('Rates loaded from local data', 'warning');
    } catch (error) {
        console.error("An error occurred during the board update:", error);
        apiStatus = 'error';
        updateAPIStatus();
        showToast('Error loading rates', 'error');
    } finally {
        isUpdating = false;
    }
}

function createBoardElements() {
    currencyNamesEl.innerHTML = CURRENCIES.map(c => 
        `<div class="currency-row stanchart-blue"><img src="https://flagcdn.com/w80/${c.flag}.png" alt="${c.name} flag" class="currency-flag"/><span>${c.name} (${c.code})</span></div>`
    ).join('');
    
    buyingRatesEl.innerHTML = CURRENCIES.map(c => 
        `<div class="rate-box" data-currency="${c.code}">...</div>`
    ).join('');

    sellingRatesEl.innerHTML = CURRENCIES.map(c => 
        `<div class="rate-box" data-currency="${c.code}">...</div>`
    ).join('');

    interestRatesEl.innerHTML = INTEREST_RATES.map(ir => 
        `<div class="interest-rate-row ${ir.isPolicy ? 'border-t-4 border-blue-200 mt-2 pt-4' : ''}">
            <span class="stanchart-blue ${ir.isPolicy ? 'font-black' : 'font-bold'}">${ir.term}</span>
            <div class="rate-box" data-term="${ir.term}">...</div>
        </div>`
    ).join('');
}

function updateRateDisplays() {
    CURRENCIES.forEach(c => {
        const buyingBox = buyingRatesEl.querySelector(`.rate-box[data-currency="${c.code}"]`);
        const sellingBox = sellingRatesEl.querySelector(`.rate-box[data-currency="${c.code}"]`);
        if (!buyingBox || !sellingBox) return;

        const buyingRate = currentBuyingRates[c.code];
        const sellingRate = currentSellingRates[c.code];
        const decimals = c.isYen ? 3 : 2;

        buyingBox.classList.remove('updated', 'manual-override');
        if (manualOverrides.forex_buy[c.code]) buyingBox.classList.add('manual-override');
        if (previousBuyingRates[c.code] && Math.abs(buyingRate - previousBuyingRates[c.code]) > 0.0001) {
            buyingBox.classList.add('updated');
            setTimeout(() => buyingBox.classList.remove('updated'), 5000);
        }
        buyingBox.innerHTML = `${buyingRate.toFixed(decimals)}`;

        sellingBox.classList.remove('updated', 'manual-override');
        if (manualOverrides.forex_sell[c.code]) sellingBox.classList.add('manual-override');
        if (previousSellingRates[c.code] && Math.abs(sellingRate - previousSellingRates[c.code]) > 0.0001) {
            sellingBox.classList.add('updated');
            setTimeout(() => sellingBox.classList.remove('updated'), 5000);
        }
        sellingBox.innerHTML = `${sellingRate.toFixed(decimals)}`;
    });
    
    INTEREST_RATES.forEach(ir => {
        const box = interestRatesEl.querySelector(`.rate-box[data-term="${ir.term}"]`);
        if (!box) return;
        const rate = manualOverrides.interest[ir.term] ?? ir.rate;
        box.textContent = `${rate.toFixed(2)}%`;
        box.classList.toggle('manual-override', !!manualOverrides.interest[ir.term]);
    });
}

function updateTimestamp() {
    const now = new Date();
    dateEl.textContent = now.toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    timestampEl.textContent = now.toLocaleTimeString('en-GB', { timeZone: 'Africa/Lusaka' });
}

function updateAPIStatus() {
    const config = {
        'offline': { text: 'OFFLINE MODE', class: 'status-offline', textClass: 'text-amber-600' },
        'error': { text: 'ERROR', class: 'status-error', textClass: 'text-red-600' }
    };
    const cfg = config[apiStatus] || config['error'];
    apiStatusEl.innerHTML = `<span class="api-status-dot ${cfg.class}"></span>${cfg.text}`;
    apiStatusEl.className = `text-sm mt-2 font-bold ${cfg.textClass}`;
}

// --- LOCAL STORAGE & OVERRIDES ---
function loadOverrides() {
    try {
        manualOverrides.forex_buy = JSON.parse(localStorage.getItem(FOREX_BUY_STORAGE_KEY) || '{}');
        manualOverrides.forex_sell = JSON.parse(localStorage.getItem(FOREX_SELL_STORAGE_KEY) || '{}');
        manualOverrides.interest = JSON.parse(localStorage.getItem(INTEREST_STORAGE_KEY) || '{}');
        isLocked = JSON.parse(localStorage.getItem(LOCK_STORAGE_KEY) || 'false');
        if (isLocked) lockOverlay.classList.add('active');
    } catch {
        manualOverrides = { forex_buy: {}, forex_sell: {}, interest: {} };
        isLocked = false;
    }
}

function saveOverrides() {
    localStorage.setItem(FOREX_BUY_STORAGE_KEY, JSON.stringify(manualOverrides.forex_buy));
    localStorage.setItem(FOREX_SELL_STORAGE_KEY, JSON.stringify(manualOverrides.forex_sell));
    localStorage.setItem(INTEREST_STORAGE_KEY, JSON.stringify(manualOverrides.interest));
}

// --- MANUAL PANEL LOGIC ---
function openManualPanel(initialTab = 'forex') {
    if (isLocked) {
        showToast("Cannot open manual panel while page is locked", "error");
        return;
    }
    const password = prompt("Enter password to access manual settings:");
    if (password !== MANUAL_PASSWORD) {
        showToast("Incorrect password", "error");
        return;
    }
    generateManualForexInputs();
    generateManualInterestInputs();
    switchManualTab(initialTab);
    manualOverlay.classList.remove('hidden');
}

function closeManualPanel() {
    manualOverlay.classList.add('hidden');
}

function switchManualTab(tabName) {
    document.getElementById('manual-inputs-forex').classList.toggle('hidden', tabName !== 'forex');
    document.getElementById('manual-inputs-interest').classList.toggle('hidden', tabName !== 'interest');
    document.querySelectorAll('#manual-panel-tabs .tab-button').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
        btn.classList.toggle('text-gray-500', btn.dataset.tab !== tabName);
        btn.classList.toggle('border-transparent', btn.dataset.tab !== tabName);
    });
}

function generateManualForexInputs() {
    const container = document.getElementById('manual-inputs-forex');
    container.innerHTML = CURRENCIES.map(c => {
        const buyOverrideVal = manualOverrides.forex_buy[c.code] || '';
        const sellOverrideVal = manualOverrides.forex_sell[c.code] || '';
        const currentBuyRate = currentBuyingRates[c.code] ? currentBuyingRates[c.code].toFixed(c.isYen ? 3 : 2) : '...';
        const currentSellRate = currentSellingRates[c.code] ? currentSellingRates[c.code].toFixed(c.isYen ? 3 : 2) : '...';
        return `<div class="bg-gray-50 p-3 rounded-lg border flex flex-col sm:flex-row items-center justify-between gap-4"><div class="flex items-center space-x-3"><img src="https://flagcdn.com/w40/${c.flag}.png" class="w-10"/><div><span class="font-bold text-lg stanchart-blue">${c.code}</span><div class="text-sm text-gray-600">${c.name}</div></div></div><div class="flex gap-4 text-right"><div><label class="text-xs text-gray-500">Buying</label><input type="number" step="0.001" min="0" value="${buyOverrideVal}" placeholder="Live: ${currentBuyRate}" class="w-32 p-2 border rounded bg-white text-right font-mono" onchange="saveManualRate('forex_buy', '${c.code}', this.value)"></div><div><label class="text-xs text-gray-500">Selling</label><input type="number" step="0.001" min="0" value="${sellOverrideVal}" placeholder="Live: ${currentSellRate}" class="w-32 p-2 border rounded bg-white text-right font-mono" onchange="saveManualRate('forex_sell', '${c.code}', this.value)"></div></div></div>`;
    }).join('');
}

function generateManualInterestInputs() {
    const container = document.getElementById('manual-inputs-interest');
    container.innerHTML = INTEREST_RATES.map(ir => {
        const overrideVal = manualOverrides.interest[ir.term] || '';
        return `<div class="bg-gray-50 p-3 rounded-lg border flex items-center justify-between gap-4"><div><span class="font-bold text-lg stanchart-blue">${ir.term}</span></div><div class="text-right"><label class="sr-only">Manual rate for ${ir.term}</label><input type="number" step="0.01" min="0" value="${overrideVal}" placeholder="Default: ${ir.rate.toFixed(2)}%" class="w-40 p-2 border rounded bg-white text-right font-mono" onchange="saveManualRate('interest', '${ir.term}', this.value)"><div class="text-xs text-gray-500 mt-1">Rate (%)</div></div></div>`;
    }).join('');
}

function saveManualRate(type, key, value) {
    const parsedValue = parseFloat(value);
    if (value && !isNaN(parsedValue) && parsedValue >= 0) {
        manualOverrides[type][key] = parsedValue;
        showToast(`${type.includes('buy') ? 'Buying' : type.includes('sell') ? 'Selling' : 'Interest'} rate updated for ${key}`, 'success');
    } else {
        delete manualOverrides[type][key];
        showToast(`Manual override removed for ${key}`, 'success');
    }
    saveOverrides();
    updateBoard();
}

function resetAllRates() {
    showConfirmModal('This will remove all manual overrides. Are you sure?', () => {
        manualOverrides = { forex_buy: {}, forex_sell: {}, interest: {} };
        saveOverrides();
        updateBoard();
        if (!manualOverlay.classList.contains('hidden')) {
            generateManualForexInputs();
            generateManualInterestInputs();
        }
        showToast('All manual overrides have been reset', 'success');
    });
}

// --- CONFIRM MODAL LOGIC ---
function showConfirmModal(message, onConfirm) {
    document.getElementById('confirm-message').textContent = message;
    confirmCallback = onConfirm;
    confirmModal.classList.remove('hidden');
    setTimeout(() => confirmModalContent.classList.remove('scale-95', 'opacity-0'), 10);
}

function hideConfirmModal() {
    confirmModalContent.classList.add('scale-95', 'opacity-0');
    setTimeout(() => {
        confirmModal.classList.add('hidden');
        confirmCallback = null;
    }, 200);
}

// --- INITIALIZATION & EVENT LISTENERS ---
document.addEventListener('DOMContentLoaded', async () => {
    document.getElementById('confirm-ok-btn').addEventListener('click', () => {
        if (confirmCallback) confirmCallback();
        hideConfirmModal();
    });
    document.getElementById('confirm-cancel-btn').addEventListener('click', hideConfirmModal);
    
    loadOverrides();
    createBoardElements();
    await updateBoard();
    
    setInterval(updateTimestamp, 1000);
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        if (!manualOverlay.classList.contains('hidden')) closeManualPanel();
        else if (!confirmModal.classList.contains('hidden')) hideConfirmModal();
    }
    if (e.ctrlKey && e.key === 'm') {
        e.preventDefault();
        openManualPanel('forex');
    }
});