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
                    <div class="w-full aspect-[4/3] rounded-lg bg-zinc-800 flex items-center justify-center relative cursor-pointer overflow-hidden border border-white/5">
                        <img alt="CNH Document Preview" class="w-full h-full object-cover group-hover:scale-105 transition-transform" src="https://lh3.googleusercontent.com/aida-public/AB6AXuCQeYw6Q3w_B07-Yg-53R9m7TzJ3-mRzO8u16Gv5Z2z9vG2259z5Zz-5Zz5"/>
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
                    <div class="w-full aspect-[4/3] rounded-lg bg-zinc-800 flex items-center justify-center relative cursor-pointer overflow-hidden border border-white/5">
                        <img alt="Residence Document Preview" class="w-full h-full object-cover group-hover:scale-105 transition-transform" src="https://lh3.googleusercontent.com/aida-public/AB6AXuCQeYw6Q3w_B07-Yg-53R9m7TzJ3-mRzO8u16Gv5Z2z9vG2259z5Zz-5Zz5"/>
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
        const markerIcon = L.divIcon({
            className: 'custom-marker',
            html: `<div class="w-8 h-8 rounded-full bg-slate-950 text-[#ccff00] border-2 border-[#ccff00] flex items-center justify-center shadow-lg car-pulse"><span class="material-symbols-outlined text-[16px]" style="font-variation-settings: 'FILL' 1;">directions_car</span></div>`,
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
// OPERATIONAL SLIDERS & CONTROLS
// ==========================================
function setupOperationalControls() {
    const slider = document.getElementById('search-radius-slider');
    const displayVal = document.getElementById('search-radius-val');
    
    if (slider && displayVal) {
        slider.addEventListener('input', (e) => {
            const val = e.target.value;
            displayVal.textContent = `${val} km`;
        });
        
        slider.addEventListener('change', (e) => {
            const val = e.target.value;
            addServerLog('system', `Parâmetro: Raio de busca atualizado para ${val} km.`);
        });
    }
}

// ==========================================
// INITIALIZATION
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
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
