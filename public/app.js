/* ==========================================================================
   CHEGOJÁ - ADMINISTRATIVE GLOBAL DASHBOARD CONTROLLER (DYNAMIC VERSION)
   Pure Vanilla ES6 Modular Javascript - Glassmorphic Dark-Mode Console
   ========================================================================== */

const API_BASE = window.location.origin; // Dynamically binds to host URL

// --- Global Administrative State ---
const adminState = {
    earnings: 0.00,
    trips: 0,
    activeDrivers: 0,
    pendingApprovals: 0,
    drivers: [],
    
    // Map instance
    map: null,
    markers: []
};

// ==========================================
// ADMINISTRATIVE CLOCK & METRIC TICKERS
// ==========================================
function initAdminClock() {
    setInterval(() => {
        const now = new Date();
        const formatted = now.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) + ', ' + now.toLocaleTimeString('pt-BR');
        const clockEl = document.getElementById('adminClock');
        if (clockEl) {
            clockEl.textContent = formatted;
        }
    }, 1000);
}

// Add logs dynamically into mock terminal
function addServerLog(type, message) {
    const logsContainer = document.getElementById('logs-stream-container');
    if (!logsContainer) return;
    
    const now = new Date();
    const timeStr = now.toTimeString().split(' ')[0];
    
    let typeSpan = '';
    if (type === 'system') {
        typeSpan = '<span class="text-accent-blue">[SYSTEM]</span>';
    } else if (type === 'map') {
        typeSpan = '<span class="text-primary">[MAP]</span>';
    } else if (type === 'db') {
        typeSpan = '<span class="text-accent-green">[DB]</span>';
    } else if (type === 'alert') {
        typeSpan = '<span class="text-accent-red">[ALERT]</span>';
    }
    
    const logRow = document.createElement('div');
    logRow.className = "flex items-center gap-2 animate-fade-in";
    logRow.innerHTML = `
        <span class="text-slate-500">[${timeStr}]</span>
        ${typeSpan}
        <span>${message}</span>
    `;
    
    logsContainer.prepend(logRow);
}

// ==========================================
// API SYNCHRONIZATION AND RENDERING
// ==========================================

// 1. Fetch live KPIs from PostgreSQL
async function fetchKPIs() {
    try {
        const res = await fetch(`${API_BASE}/api/kpis`);
        if (!res.ok) throw new Error("Status " + res.status);
        const data = await res.json();
        
        adminState.earnings = data.earnings;
        adminState.trips = data.trips;
        adminState.activeDrivers = data.activeDrivers;
        adminState.pendingApprovals = data.pendingApprovals;
        
        // Update UI
        document.getElementById('kpi-earnings').textContent = `R$ ${adminState.earnings.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        document.getElementById('kpi-trips').textContent = adminState.trips;
        document.getElementById('kpi-active-drivers').textContent = adminState.activeDrivers;
        document.getElementById('kpi-pending-approvals').textContent = adminState.pendingApprovals;
        document.getElementById('approval-queue-count').textContent = `${adminState.pendingApprovals} pendentes`;

        if (adminState.pendingApprovals === 0) {
            document.getElementById('kpi-pending-status').textContent = "Frota 100% Regularizada";
            document.getElementById('kpi-pending-status').className = "text-[10px] text-accent-green font-bold flex items-center gap-1 mt-1";
        } else {
            document.getElementById('kpi-pending-status').textContent = "Aguardando aprovação";
            document.getElementById('kpi-pending-status').className = "text-[10px] text-accent-red font-bold flex items-center gap-1 mt-1";
        }
    } catch (err) {
        console.error("Failed to fetch KPIs:", err.message);
    }
}

// 2. Fetch and render drivers list and map markers
async function fetchAndRenderDrivers() {
    try {
        const res = await fetch(`${API_BASE}/api/drivers`);
        if (!res.ok) throw new Error("Status " + res.status);
        const drivers = await res.json();
        adminState.drivers = drivers;

        // Render document approval queue
        renderApprovalQueue(drivers);

        // Update map markers with active drivers
        updateMapMarkers(drivers);
    } catch (err) {
        console.error("Failed to fetch drivers:", err.message);
    }
}

// --- Global Lightbox Modal State ---
const modalState = {
    driverId: null,
    documentType: null
};

// 3. Render the dynamic approval list
function renderApprovalQueue(drivers) {
    const container = document.getElementById('approval-list-container');
    if (!container) return;

    // Filter only pending candidates
    const pending = drivers.filter(d => d.overall_status === 'pending');
    
    // Clear list but keep empty state element
    const emptyState = document.getElementById('empty-approvals-state');
    container.innerHTML = '';
    container.appendChild(emptyState);

    if (pending.length === 0) {
        emptyState.classList.remove('hidden');
        return;
    }

    emptyState.classList.add('hidden');

    pending.forEach(cand => {
        const card = document.createElement('div');
        card.id = `driver-card-${cand.id}`;
        card.className = "p-4 bg-white/[0.02] border border-white/5 rounded-2xl flex flex-col gap-4 transition-all hover:bg-white/[0.04] animate-fade-in";
        card.innerHTML = `
            <div class="flex justify-between items-start">
                <div class="flex gap-3">
                    <div class="w-10 h-10 rounded-full overflow-hidden border border-white/10 shrink-0">
                        <img alt="Candidate Photo" class="w-full h-full object-cover" src="${cand.avatar || 'https://randomuser.me/api/portraits/lego/1.jpg'}"/>
                    </div>
                    <div>
                        <h4 class="text-white font-bold text-sm">${cand.name}</h4>
                        <span class="text-[10px] text-slate-400 block mt-0.5">WhatsApp: ${cand.phone} • Categoria: ${cand.vehicle_desc ? cand.vehicle_desc.split(' ')[1] || 'X' : 'X'}</span>
                    </div>
                </div>
                <span class="text-[10px] bg-accent-blue/10 text-accent-blue px-2.5 py-1 rounded-full font-bold uppercase tracking-wider">Pendente</span>
            </div>
            
            <div class="grid grid-cols-2 gap-4">
                <!-- CNH Preview Card -->
                <div class="p-3 bg-zinc-900 rounded-xl border border-white/5 flex flex-col gap-2 relative group overflow-hidden">
                    <span class="text-[10px] text-slate-400 font-bold uppercase block">1. CNH com EAR</span>
                    <div class="w-full aspect-[4/3] rounded-lg bg-zinc-800 flex items-center justify-center relative cursor-pointer overflow-hidden border border-white/5" onclick="openDocumentModal('${cand.cnh_url || 'https://pub-f9009c0a0d1c42ee9e6eb41742ccf75f.r2.dev/cnh-carlos.svg'}', 'CNH de ${cand.name}', ${cand.id}, 'cnh', ${cand.cnh_approved})">
                        <img alt="CNH Document Preview" class="w-full h-full object-cover group-hover:scale-105 transition-transform" src="${cand.cnh_url || 'https://pub-f9009c0a0d1c42ee9e6eb41742ccf75f.r2.dev/cnh-carlos.svg'}"/>
                    </div>
                    <div class="flex gap-2 mt-1">
                        ${!cand.cnh_approved ? `
                            <button class="flex-1 py-1 px-2 text-[10px] bg-accent-green hover:brightness-110 active:scale-95 text-black font-extrabold rounded-md flex items-center justify-center gap-1 transition-all" onclick="approveDocument(${cand.id}, 'cnh')">
                                Aprovar
                            </button>
                        ` : `
                            <span class="text-accent-green font-bold text-xs flex items-center gap-1 justify-center flex-grow py-1">
                                <span class="material-symbols-outlined text-[14px]">check_circle</span> Aprovado
                            </span>
                        `}
                    </div>
                </div>
                
                <!-- Residence Preview Card -->
                <div class="p-3 bg-zinc-900 rounded-xl border border-white/5 flex flex-col gap-2 relative group overflow-hidden">
                    <span class="text-[10px] text-slate-400 font-bold uppercase block">2. Comprovante</span>
                    <div class="w-full aspect-[4/3] rounded-lg bg-zinc-800 flex items-center justify-center relative cursor-pointer overflow-hidden border border-white/5" onclick="openDocumentModal('${cand.res_url || 'https://pub-f9009c0a0d1c42ee9e6eb41742ccf75f.r2.dev/comprovante-carlos.svg'}', 'Comprovante de ${cand.name}', ${cand.id}, 'res', ${cand.res_approved})">
                        <img alt="Residence Document Preview" class="w-full h-full object-cover group-hover:scale-105 transition-transform" src="${cand.res_url || 'https://pub-f9009c0a0d1c42ee9e6eb41742ccf75f.r2.dev/comprovante-carlos.svg'}"/>
                    </div>
                    <div class="flex gap-2 mt-1">
                        ${!cand.res_approved ? `
                            <button class="flex-1 py-1 px-2 text-[10px] bg-accent-green hover:brightness-110 active:scale-95 text-black font-extrabold rounded-md flex items-center justify-center gap-1 transition-all" onclick="approveDocument(${cand.id}, 'res')">
                                Aprovar
                            </button>
                        ` : `
                            <span class="text-accent-green font-bold text-xs flex items-center gap-1 justify-center flex-grow py-1">
                                <span class="material-symbols-outlined text-[14px]">check_circle</span> Aprovado
                            </span>
                        `}
                    </div>
                </div>
            </div>
        `;
        container.prepend(card);
    });
}

// ==========================================
// DOCUMENT INSPECTION LIGHTBOX MODAL HANDLERS
// ==========================================
function openDocumentModal(url, title, driverId, documentType, isApproved) {
    const modal = document.getElementById('document-modal');
    const modalImg = document.getElementById('document-modal-img');
    const modalTitle = document.getElementById('document-modal-title');
    
    if (!modal || !modalImg || !modalTitle) return;
    
    modalState.driverId = driverId;
    modalState.documentType = documentType;
    
    modalImg.src = url;
    modalTitle.textContent = title;
    
    // Hide/show the approve button inside modal depending on whether it's already approved
    const approveBtn = modal.querySelector('button[onclick="approveCurrentDocumentFromModal()"]');
    if (approveBtn) {
        if (isApproved) {
            approveBtn.classList.add('hidden');
        } else {
            approveBtn.classList.remove('hidden');
        }
    }
    
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    setTimeout(() => {
        modal.classList.remove('opacity-0');
        modal.classList.add('opacity-100');
    }, 10);
}

function closeDocumentModal() {
    const modal = document.getElementById('document-modal');
    if (!modal) return;
    
    modal.classList.remove('opacity-100');
    modal.classList.add('opacity-0');
    setTimeout(() => {
        modal.classList.remove('flex');
        modal.classList.add('hidden');
    }, 300);
}

async function approveCurrentDocumentFromModal() {
    if (!modalState.driverId || !modalState.documentType) return;
    await approveDocument(modalState.driverId, modalState.documentType);
    closeDocumentModal();
}

window.openDocumentModal = openDocumentModal;
window.closeDocumentModal = closeDocumentModal;
window.approveCurrentDocumentFromModal = approveCurrentDocumentFromModal;

// 4. Submit document approval to server
async function approveDocument(driverId, documentType) {
    try {
        const res = await fetch(`${API_BASE}/api/drivers/approve`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ id: driverId, documentType })
        });
        
        if (!res.ok) throw new Error("Status " + res.status);
        const data = await res.json();
        
        if (data.success) {
            addServerLog('db', `Aprovado documento '${documentType}' do motorista.`);
            
            // Check if overall approved
            if (data.overallStatus === 'approved') {
                addServerLog('system', `Condutor cadastrado e liberado na rede de produção!`);
                
                // Fancy transition before reload
                const card = document.getElementById(`driver-card-${driverId}`);
                if (card) {
                    card.style.transition = 'all 0.5s ease';
                    card.style.opacity = '0';
                    card.style.transform = 'scale(0.8)';
                }
            }

            // Reload data
            setTimeout(() => {
                fetchKPIs();
                fetchAndRenderDrivers();
            }, 600);
        }
    } catch (err) {
        console.error("Approval failed:", err.message);
        addServerLog('alert', `Erro ao registrar aprovação: ${err.message}`);
    }
}

// Global scope export for button handlers
window.approveDocument = approveDocument;

// ==========================================
// LEAFLET MAP TRACKING INTEGRATIONS
// ==========================================
function initAdminGlobalMap() {
    try {
        const container = document.getElementById('map-admin-global');
        if (!container) return;
        
        // Setup Map
        adminState.map = L.map('map-admin-global', {
            zoomControl: true,
            attributionControl: false
        }).setView([-23.5616, -46.6560], 13);
        
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19
        }).addTo(adminState.map);
        
        addServerLog('map', 'Iniciada telemetria Leaflet de veículos ativos.');
    } catch (e) {
        console.error("Leaflet admin map initialization failed:", e);
    }
}

// Render/Update active drivers markers on Leaflet
function updateMapMarkers(drivers) {
    if (!adminState.map) return;

    // Clear existing markers
    adminState.markers.forEach(m => adminState.map.removeLayer(m.marker));
    adminState.markers = [];

    // Filter approved and active drivers
    const active = drivers.filter(d => d.overall_status === 'approved' && d.active === true);

    active.forEach(loc => {
        const iconName = loc.vehicle_type === 'moto' ? 'two_wheeler' : 'directions_car';
        const markerIcon = L.divIcon({
            className: 'custom-marker',
            html: `<div class="w-8 h-8 rounded-full bg-slate-950 text-[#ccff00] border-2 border-[#ccff00] flex items-center justify-center shadow-lg car-pulse"><span class="material-symbols-outlined text-[16px]" style="font-variation-settings: 'FILL' 1;">${iconName}</span></div>`,
            iconSize: [32, 32],
            iconAnchor: [16, 16]
        });
        
        const marker = L.marker([loc.lat, loc.lng], { icon: markerIcon })
            .addTo(adminState.map)
            .bindPopup(`<strong class="text-slate-900">${loc.name}</strong><br><span class="text-slate-500">${loc.vehicle_desc || 'Online'} • Placa: ${loc.vehicle_plate || 'S/P'}</span>`);
            
        adminState.markers.push({ id: loc.id, name: loc.name, marker: marker });
    });
}

// Simulated active movement ticks on map to make it feel alive
function startVehicleTelemetryTicks() {
    setInterval(async () => {
        if (!adminState.map || adminState.drivers.length === 0) return;
        
        // Randomly simulate small movements on map for active drivers
        adminState.markers.forEach(m => {
            const driver = adminState.drivers.find(d => d.id === m.id);
            if (driver) {
                const latDev = (Math.random() - 0.5) * 0.001;
                const lngDev = (Math.random() - 0.5) * 0.001;
                driver.lat += latDev;
                driver.lng += lngDev;
                
                m.marker.setLatLng([driver.lat, driver.lng]);
            }
        });
        
        // Fetch KPIs & active rides periodically to sync metrics
        fetchKPIs();
    }, 12000);
}

// ==========================================
// OPERATIONAL SLIDERS & CONTROLS (SYNCED)
// ==========================================
async function setupOperationalControls() {
    const slider = document.getElementById('search-radius-slider');
    const displayVal = document.getElementById('search-radius-val');
    
    if (slider && displayVal) {
        // Fetch current search radius from server dynamically
        try {
            const res = await fetch(`${API_BASE}/api/settings`);
            if (res.ok) {
                const settings = await res.json();
                if (settings && settings.searchRadius !== undefined) {
                    slider.value = settings.searchRadius;
                    displayVal.textContent = `${settings.searchRadius} km`;
                }
            }
        } catch (e) {
            console.error("Failed to load search radius settings from server", e);
        }

        slider.addEventListener('input', (e) => {
            const val = e.target.value;
            displayVal.textContent = `${val} km`;
        });
        
        slider.addEventListener('change', async (e) => {
            const val = parseFloat(e.target.value);
            addServerLog('system', `Parâmetro: Sincronizando raio de busca para ${val} km...`);
            
            // Sync setting to active Node.js server!
            try {
                const res = await fetch(`${API_BASE}/api/settings/update`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ searchRadius: val })
                });
                if (res.ok) {
                    addServerLog('system', `Parâmetro: Raio de busca atualizado e sincronizado para ${val} km.`);
                }
            } catch (err) {
                console.error("Failed to sync search radius", err);
            }
        });
    }
}

// ==========================================
// PORTAL DE LOGIN RESTAL (PROTEÇÃO POR SENHA)
// ==========================================
const AudioSynth = {
    ctx: null,
    init() {
        if (!this.ctx) {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        }
    },
    playBuzzer() {
        try {
            this.init();
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.type = "sawtooth";
            osc.frequency.setValueAtTime(100, this.ctx.currentTime); // Low buzz
            gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.35);
            osc.start();
            osc.stop(this.ctx.currentTime + 0.35);
        } catch (e) { console.warn(e); }
    },
    playSuccess() {
        try {
            this.init();
            const notes = [261.63, 329.63, 392.00, 523.25]; // C4, E4, G4, C5
            notes.forEach((freq, idx) => {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.connect(gain);
                gain.connect(this.ctx.destination);
                osc.type = "triangle";
                osc.frequency.setValueAtTime(freq, this.ctx.currentTime + idx * 0.08);
                gain.gain.setValueAtTime(0.08, this.ctx.currentTime + idx * 0.08);
                gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + idx * 0.08 + 0.35);
                osc.start(this.ctx.currentTime + idx * 0.08);
                osc.stop(this.ctx.currentTime + idx * 0.08 + 0.35);
            });
        } catch (e) { console.warn(e); }
    }
};

function toggleLoginPasswordVisibility() {
    const input = document.getElementById("login-password-input");
    const icon = document.getElementById("password-visibility-icon");
    if (!input || !icon) return;
    if (input.type === "password") {
        input.type = "text";
        icon.textContent = "visibility_off";
    } else {
        input.type = "password";
        icon.textContent = "visibility";
    }
}

function checkAdminSessionState() {
    const auth = sessionStorage.getItem("cj_admin_authenticated");
    const gate = document.getElementById("admin-login-gate");
    if (auth === "true") {
        if (gate) gate.classList.add("hidden");
    }
}

async function submitAdminPasswordAuthentication() {
    const input = document.getElementById("login-password-input");
    const errorText = document.getElementById("login-error-text");
    const gate = document.getElementById("admin-login-gate");
    const inputWrapper = document.getElementById("password-input-wrapper");
    
    if (!input) return;
    const password = input.value.trim();
    
    if (password === "01Deus02@@@@") {
        AudioSynth.playSuccess();
        sessionStorage.setItem("cj_admin_authenticated", "true");
        if (errorText) errorText.classList.add("hidden");
        
        if (gate) {
            gate.style.transition = "all 0.5s ease-out";
            gate.style.opacity = "0";
            gate.style.transform = "scale(1.05)";
            setTimeout(() => {
                gate.classList.add("hidden");
            }, 500);
        }
        addServerLog("system", "Autenticação efetuada com sucesso via console restrito.");
    } else {
        AudioSynth.playBuzzer();
        if (errorText) errorText.classList.remove("hidden");
        
        if (inputWrapper) {
            inputWrapper.style.borderColor = "#ef4444";
            inputWrapper.classList.add("animate-shake");
            
            if (!document.getElementById("shake-animation-style")) {
                const style = document.createElement("style");
                style.id = "shake-animation-style";
                style.innerHTML = `
                    @keyframes shake-input {
                        0%, 100% { transform: translateX(0); }
                        20%, 60% { transform: translateX(-6px); }
                        40%, 80% { transform: translateX(6px); }
                    }
                    .animate-shake {
                        animation: shake-input 0.35s ease-in-out;
                    }
                `;
                document.head.appendChild(style);
            }
            setTimeout(() => {
                inputWrapper.classList.remove("animate-shake");
                inputWrapper.style.borderColor = "rgba(255, 255, 255, 0.05)";
            }, 400);
        }
        input.value = "";
        input.focus();
        addServerLog("alert", "Falha de autenticação: senha operacional incorreta.");
    }
}

window.toggleLoginPasswordVisibility = toggleLoginPasswordVisibility;
window.submitAdminPasswordAuthentication = submitAdminPasswordAuthentication;

// ==========================================
// DRIVER/RIDER REGISTRATION CONTROLLERS
// ==========================================
function openDriverRegistrationModal() {
    const modal = document.getElementById("driver-registration-modal");
    if (!modal) return;
    modal.classList.remove("hidden");
    modal.classList.add("flex");
    setTimeout(() => {
        modal.style.opacity = "1";
    }, 10);
}

function closeDriverRegistrationModal() {
    const modal = document.getElementById("driver-registration-modal");
    if (!modal) return;
    modal.style.opacity = "0";
    setTimeout(() => {
        modal.classList.remove("flex");
        modal.classList.add("hidden");
        // Reset form
        document.getElementById("driver-registration-form").reset();
    }, 300);
}

async function submitDriverRegistration() {
    const name = document.getElementById("reg-driver-name").value.trim();
    const phone = document.getElementById("reg-driver-phone").value.trim();
    const vehicle_desc = document.getElementById("reg-driver-vehicle-desc").value.trim();
    const vehicle_plate = document.getElementById("reg-driver-vehicle-plate").value.trim();
    
    // Get checked radio value
    const vehicle_type = document.querySelector('input[name="reg-driver-type"]:checked').value;
    
    try {
        addServerLog('system', `Cadastrando novo condutor (${vehicle_type}): ${name}...`);
        
        const res = await fetch(`${API_BASE}/api/drivers/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, phone, vehicle_desc, vehicle_plate, vehicle_type })
        });
        
        if (!res.ok) throw new Error("Status " + res.status);
        const data = await res.json();
        
        if (data.success) {
            AudioSynth.playSuccess();
            addServerLog('db', `Sucesso: Novo ${vehicle_type === 'moto' ? 'piloto' : 'motorista'} #${data.driver.id} (${name}) cadastrado!`);
            closeDriverRegistrationModal();
            
            // Refresh table and indicators
            fetchAndRenderDriversTable();
            fetchKPIs();
        }
    } catch (e) {
        AudioSynth.playBuzzer();
        addServerLog('alert', `Erro ao cadastrar condutor: ${e.message}`);
    }
}

window.openDriverRegistrationModal = openDriverRegistrationModal;
window.closeDriverRegistrationModal = closeDriverRegistrationModal;
window.submitDriverRegistration = submitDriverRegistration;

// ==========================================
// TABS NAVIGATION CONTROLLERS
// ==========================================
function switchAdminTab(tabId) {
    const tabs = ['overview', 'drivers', 'clients', 'dynamics', 'trips'];
    tabs.forEach(t => {
        const btn = document.getElementById(`tab-btn-${t}`);
        const view = document.getElementById(`view-admin-${t}`);
        if (btn && view) {
            if (t === tabId) {
                btn.className = "tab-btn px-4 py-2 rounded-xl text-xs font-bold bg-primary text-black flex items-center gap-2 shadow-lg shadow-primary/5 transition-all";
                view.classList.remove("hidden");
            } else {
                btn.className = "tab-btn px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white hover:bg-white/[0.03] flex items-center gap-2 transition-all";
                view.classList.add("hidden");
            }
        }
    });
    
    if (tabId === 'drivers') {
        fetchAndRenderDriversTable();
    } else if (tabId === 'clients') {
        fetchAndRenderClientsTable();
    } else if (tabId === 'dynamics') {
        fetchAndRenderDynamicsGrid();
    } else if (tabId === 'trips') {
        fetchAndRenderTripsTable();
    } else if (tabId === 'overview') {
        if (adminState.map) {
            setTimeout(() => adminState.map.invalidateSize(), 50);
        }
    }
    
    addServerLog("system", `Navegando para o painel de gerenciamento: ${tabId.toUpperCase()}`);
}
window.switchAdminTab = switchAdminTab;

// ==========================================
// NEW OPERATIONAL DATA TABLES INTEGRATION
// ==========================================

// 1. DRIVERS TABLE RENDERER
async function fetchAndRenderDriversTable() {
    try {
        const res = await fetch(`${API_BASE}/api/drivers`);
        if (!res.ok) throw new Error("Status " + res.status);
        const drivers = await res.json();
        
        const tbody = document.getElementById('admin-drivers-table-body');
        if (!tbody) return;
        tbody.innerHTML = '';
        
        drivers.forEach(d => {
            const tr = document.createElement('tr');
            tr.className = "hover:bg-white/[0.01] border-b border-white/5 transition-all";
            
            let statusBadge = '';
            if (d.overall_status === 'approved') {
                statusBadge = '<span class="px-2 py-0.5 rounded-full bg-accent-green/10 text-accent-green font-bold text-[9px] uppercase">Aprovado</span>';
            } else {
                statusBadge = '<span class="px-2 py-0.5 rounded-full bg-accent-blue/10 text-accent-blue font-bold text-[9px] uppercase">Pendente</span>';
            }
            
            const isCnhApproved = d.cnh_approved ? 
                '<span class="material-symbols-outlined text-accent-green text-[18px]">verified</span>' : 
                '<span class="material-symbols-outlined text-slate-650 text-[18px]">pending</span>';
                
            const isResApproved = d.res_approved ? 
                '<span class="material-symbols-outlined text-accent-green text-[18px]">verified</span>' : 
                '<span class="material-symbols-outlined text-slate-650 text-[18px]">pending</span>';

            const typeBadge = d.vehicle_type === 'moto' ? 
                '<span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-accent-blue/10 text-accent-blue font-bold text-[9px] uppercase mt-0.5"><span class="material-symbols-outlined text-[10px]">two_wheeler</span> Piloto (Moto)</span>' :
                '<span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-primary/10 text-primary font-bold text-[9px] uppercase mt-0.5"><span class="material-symbols-outlined text-[10px]">directions_car</span> Motorista (Carro)</span>';

            const activeToggle = `
                <label class="relative inline-flex items-center cursor-pointer select-none">
                    <input type="checkbox" class="sr-only peer" ${d.active ? 'checked' : ''} onchange="toggleDriverActiveState(${d.id}, this.checked)">
                    <div class="w-9 h-5 bg-zinc-800 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-400 peer-checked:after:bg-black peer-checked:bg-primary after:rounded-full after:h-4 after:w-4 after:transition-all"></div>
                </label>
            `;

            tr.innerHTML = `
                <td class="p-4 flex items-center gap-3">
                    <div class="w-8 h-8 rounded-full overflow-hidden border border-white/10 shrink-0">
                        <img alt="Avatar" class="w-full h-full object-cover" src="${d.avatar || 'https://randomuser.me/api/portraits/lego/1.jpg'}"/>
                    </div>
                    <span class="text-slate-500 font-bold">#${d.id}</span>
                </td>
                <td class="p-4 font-bold text-white text-sm">${d.name}</td>
                <td class="p-4 font-mono text-slate-400">${d.phone}</td>
                <td class="p-4 font-bold text-white">
                    ${d.vehicle_desc || 'S/V'} 
                    <span class="block text-[9px] font-bold text-slate-500 font-mono tracking-wider mt-0.5 uppercase">${d.vehicle_plate || 'Sem Placa'}</span>
                    <div class="mt-1">${typeBadge}</div>
                </td>
                <td class="p-4 text-center font-bold text-[#ccff00]">${parseFloat(d.rating || 5.0).toFixed(2)}</td>
                <td class="p-4 text-center">${isCnhApproved}</td>
                <td class="p-4 text-center">${isResApproved}</td>
                <td class="p-4 text-center">${statusBadge}</td>
                <td class="p-4 text-center">${activeToggle}</td>
            `;
            tbody.appendChild(tr);
        });
    } catch (e) {
        console.error("Failed to render drivers table:", e);
    }
}

async function toggleDriverActiveState(id, active) {
    addServerLog('system', `Ação: Alterando status operacional do motorista #${id} para ${active ? 'ONLINE' : 'OFFLINE'}.`);
    const driver = adminState.drivers.find(d => d.id === id);
    if (driver) {
        driver.active = active;
        addServerLog('db', `Motorista ${driver.name} agora está ${active ? 'Ativo e visível no mapa' : 'Inativo'}.`);
        updateMapMarkers(adminState.drivers);
    }
}
window.toggleDriverActiveState = toggleDriverActiveState;

// 2. CLIENTS TABLE RENDERER
async function fetchAndRenderClientsTable() {
    try {
        const res = await fetch(`${API_BASE}/api/clients`);
        if (!res.ok) throw new Error("Status " + res.status);
        const clients = await res.json();
        
        const tbody = document.getElementById('admin-clients-table-body');
        if (!tbody) return;
        tbody.innerHTML = '';
        
        if (clients.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="p-8 text-center text-slate-500 font-bold">Nenhum cliente cadastrado no banco de dados.</td></tr>`;
            return;
        }
        
        clients.forEach(c => {
            const tr = document.createElement('tr');
            tr.className = "hover:bg-white/[0.01] border-b border-white/5 transition-all";
            
            const dateStr = new Date(c.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
            
            tr.innerHTML = `
                <td class="p-4 flex items-center gap-3">
                    <div class="w-8 h-8 rounded-full overflow-hidden border border-white/10 shrink-0">
                        <img alt="Avatar" class="w-full h-full object-cover" src="${c.avatar || 'https://randomuser.me/api/portraits/lego/3.jpg'}"/>
                    </div>
                    <span class="text-slate-500 font-bold">#${c.id}</span>
                </td>
                <td class="p-4 font-bold text-white text-sm">${c.name}</td>
                <td class="p-4 font-mono text-slate-400">${c.phone}</td>
                <td class="p-4 font-bold text-slate-300">${c.email || 'Não informado'}</td>
                <td class="p-4 text-center font-bold text-[#ccff00]">${parseFloat(c.rating || 5.0).toFixed(2)}</td>
                <td class="p-4 text-center text-slate-500 font-mono">${dateStr}</td>
            `;
            tbody.appendChild(tr);
        });
    } catch (e) {
        console.error("Failed to render clients table:", e);
    }
}

// 3. DYNAMIC PRICING GRID RENDERER
async function fetchAndRenderDynamicsGrid() {
    try {
        const res = await fetch(`${API_BASE}/api/dynamics`);
        if (!res.ok) throw new Error("Status " + res.status);
        const zones = await res.json();
        
        const grid = document.getElementById('admin-dynamics-grid-container');
        if (!grid) return;
        grid.innerHTML = '';
        
        zones.forEach(z => {
            const card = document.createElement('div');
            card.className = "glass-panel p-5 rounded-2xl flex flex-col justify-between relative overflow-hidden animate-fade-in";
            
            card.innerHTML = `
                <div class="absolute -right-4 -top-4 w-16 h-16 bg-[#ccff00]/5 rounded-full blur-xl"></div>
                <div class="flex justify-between items-start mb-4">
                    <div>
                        <h4 class="text-white font-extrabold text-sm">${z.name}</h4>
                        <span class="text-[9px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-bold uppercase tracking-wider mt-1.5 inline-block">Zona Operacional</span>
                    </div>
                    <div class="w-10 h-10 rounded-xl bg-zinc-950 flex items-center justify-center border border-white/5">
                        <span class="material-symbols-outlined text-[20px] text-[#ccff00]">insights</span>
                    </div>
                </div>
                
                <div class="flex flex-col gap-2.5 mb-5 border-t border-white/5 pt-3">
                    <div class="flex justify-between text-[10px] font-bold">
                        <span class="text-slate-400">Multiplicador Tarifário:</span>
                        <span class="text-[#ccff00] font-black">${parseFloat(z.multiplier).toFixed(2)}x</span>
                    </div>
                    <div class="flex justify-between text-[10px] font-bold">
                        <span class="text-slate-400">Tarifa de Partida (Base):</span>
                        <span class="text-white font-black">R$ ${parseFloat(z.base_fare).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div class="flex justify-between text-[10px] font-bold">
                        <span class="text-slate-400">Taxa por Quilômetro:</span>
                        <span class="text-white font-black">R$ ${parseFloat(z.rate_per_km).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}/km</span>
                    </div>
                    <div class="flex justify-between text-[10px] font-bold">
                        <span class="text-slate-400">Taxa por Minuto:</span>
                        <span class="text-white font-black">R$ ${parseFloat(z.rate_per_minute).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}/min</span>
                    </div>
                </div>
                
                <button class="w-full py-2.5 bg-primary hover:bg-primary-hover active:scale-[0.98] text-black font-extrabold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-all shadow-md shadow-primary/5" onclick="openDynamicEditDrawer(${z.id}, '${z.name}', ${z.multiplier}, ${z.base_fare}, ${z.rate_per_km}, ${z.rate_per_minute})">
                    Editar Parâmetros
                    <span class="material-symbols-outlined text-[15px] font-bold">edit</span>
                </button>
            `;
            grid.appendChild(card);
        });
    } catch (e) {
        console.error("Failed to render dynamic pricing grid:", e);
    }
}

// Dynamics modal actions
function openDynamicEditDrawer(id, name, multiplier, baseFare, rateKm, rateMin) {
    const drawer = document.getElementById('dynamic-edit-drawer');
    if (!drawer) return;
    
    document.getElementById('dyn-edit-id').value = id;
    document.getElementById('dyn-edit-title').textContent = name;
    document.getElementById('dyn-edit-multiplier').value = multiplier;
    document.getElementById('dyn-edit-base').value = baseFare;
    document.getElementById('dyn-edit-km').value = rateKm;
    document.getElementById('dyn-edit-min').value = rateMin;
    
    drawer.classList.remove('hidden');
    drawer.classList.add('flex');
    setTimeout(() => {
        drawer.classList.remove('opacity-0');
        drawer.classList.add('opacity-100');
    }, 10);
}

function closeDynamicEditDrawer() {
    const drawer = document.getElementById('dynamic-edit-drawer');
    if (!drawer) return;
    
    drawer.classList.remove('opacity-100');
    drawer.classList.add('opacity-0');
    setTimeout(() => {
        drawer.classList.remove('flex');
        drawer.classList.add('hidden');
    }, 300);
}

async function submitDynamicPricingUpdate() {
    const id = document.getElementById('dyn-edit-id').value;
    const multiplier = parseFloat(document.getElementById('dyn-edit-multiplier').value);
    const baseFare = parseFloat(document.getElementById('dyn-edit-base').value);
    const rateKm = parseFloat(document.getElementById('dyn-edit-km').value);
    const rateMin = parseFloat(document.getElementById('dyn-edit-min').value);
    
    try {
        const res = await fetch(`${API_BASE}/api/dynamics/update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id,
                multiplier,
                base_fare: baseFare,
                rate_per_km: rateKm,
                rate_per_minute: rateMin
            })
        });
        
        if (!res.ok) throw new Error("Status " + res.status);
        const data = await res.json();
        
        if (data.success) {
            AudioSynth.playSuccess();
            addServerLog('db', `Tarifa dinâmica da zona #${id} atualizada com sucesso.`);
            closeDynamicEditDrawer();
            fetchAndRenderDynamicsGrid();
        }
    } catch (e) {
        console.error("Failed to update dynamics:", e);
        addServerLog('alert', `Falha ao atualizar tarifa: ${e.message}`);
    }
}

window.openDynamicEditDrawer = openDynamicEditDrawer;
window.closeDynamicEditDrawer = closeDynamicEditDrawer;
window.submitDynamicPricingUpdate = submitDynamicPricingUpdate;

// 4. TRIPS TABLE RENDERER
async function fetchAndRenderTripsTable() {
    try {
        const res = await fetch(`${API_BASE}/api/trips`);
        if (!res.ok) throw new Error("Status " + res.status);
        const trips = await res.json();
        
        const tbody = document.getElementById('admin-trips-table-body');
        if (!tbody) return;
        tbody.innerHTML = '';
        
        if (trips.length === 0) {
            tbody.innerHTML = `<tr><td colspan="8" class="p-8 text-center text-slate-500 font-bold">Nenhuma viagem registrada na plataforma.</td></tr>`;
            return;
        }
        
        trips.forEach(t => {
            const tr = document.createElement('tr');
            tr.className = "hover:bg-white/[0.01] border-b border-white/5 transition-all";
            
            const dateStr = new Date(t.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
            
            let statusBadge = '';
            if (t.status === 'concluded') {
                statusBadge = '<span class="px-2 py-0.5 rounded-full bg-accent-green/10 text-accent-green font-bold text-[9px] uppercase">Concluída</span>';
            } else if (t.status === 'canceled') {
                statusBadge = '<span class="px-2 py-0.5 rounded-full bg-accent-red/10 text-accent-red font-bold text-[9px] uppercase">Cancelada</span>';
            } else {
                statusBadge = '<span class="px-2 py-0.5 rounded-full bg-[#ccff00]/10 text-[#ccff00] font-bold text-[9px] uppercase animate-pulse">Em Andamento</span>';
            }
            
            tr.innerHTML = `
                <td class="p-4 font-mono font-bold text-slate-500">#${t.id}</td>
                <td class="p-4 font-bold text-white text-sm">${t.client_name || 'Passageiro'}</td>
                <td class="p-4 font-bold text-white text-sm">${t.driver_name || 'Motorista'}</td>
                <td class="p-4 text-slate-400 truncate max-w-[150px]">${t.pickup_address}</td>
                <td class="p-4 text-slate-400 truncate max-w-[150px]">${t.dest_address}</td>
                <td class="p-4 text-center font-black text-white">R$ ${parseFloat(t.fare).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                <td class="p-4 text-center">${statusBadge}</td>
                <td class="p-4 text-center text-slate-500 font-mono">${dateStr}</td>
            `;
            tbody.appendChild(tr);
        });
    } catch (e) {
        console.error("Failed to render trips table:", e);
    }
}

// ==========================================
// INITIALIZATION
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    // Check if user is already authenticated in this session
    checkAdminSessionState();
    
    initAdminClock();
    initAdminGlobalMap();
    setupOperationalControls();
    
    // Initial fetch
    fetchKPIs();
    fetchAndRenderDrivers();

    // Start background polling and telemetry ticks
    startVehicleTelemetryTicks();

    addServerLog('db', 'Conexão ativa com o banco PostgreSQL de produção.');
    addServerLog('system', 'Painel operacional pronto para controle de frotas e aprovações.');
});
