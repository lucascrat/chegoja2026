const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Configure Multer for processing file uploads in memory
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB file size limit
});

// Configure Cloudflare R2 (via direct REST API)
const r2AccountId = process.env.R2_ACCOUNT_ID || "b94b59f6ac6870ef08ad4ea5384fc042";
const r2Bucket = process.env.R2_BUCKET || "chegoja";
const r2PublicUrl = process.env.R2_PUBLIC || "https://pub-f9009c0a0d1c42ee9e6eb41742ccf75f.r2.dev";
const r2Token = process.env.R2_TOKEN;

// Enable CORS and JSON parsing
app.use(cors());
app.use(express.json());

// Serve static dashboard files from the "public" directory
app.use(express.static(path.join(__dirname, 'public')));

// ==========================================
// FILE UPLOAD TO CLOUDFLARE R2 ENDPOINT
// ==========================================

// 0. POST /api/upload - Stream file to Cloudflare R2 and return public CDN URL
app.post('/api/upload', upload.single('file'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: "No file uploaded. Please upload a file via multipart form under the field name 'file'." });
    }

    try {
        const file = req.file;
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        const fileName = `${uniqueSuffix}${path.extname(file.originalname)}`;

        const url = `https://api.cloudflare.com/client/v4/accounts/${r2AccountId}/r2/buckets/${r2Bucket}/objects/${fileName}`;

        console.log(`[R2 UPLOAD] Streaming ${file.originalname} (mimetype: ${file.mimetype}) to Cloudflare REST API...`);
        const uploadRes = await fetch(url, {
            method: "PUT",
            headers: {
                "Authorization": `Bearer ${r2Token}`,
                "Content-Type": file.mimetype
            },
            body: file.buffer
        });

        if (!uploadRes.ok) {
            const errorText = await uploadRes.text();
            throw new Error(`Cloudflare REST API responded with status ${uploadRes.status}: ${errorText}`);
        }

        const publicUrl = `${r2PublicUrl}/${fileName}`;

        console.log(`[R2 UPLOAD] Successfully uploaded ${file.originalname} to R2 as ${fileName}. URL: ${publicUrl}`);

        res.json({
            success: true,
            message: "File uploaded successfully to Cloudflare R2",
            filename: fileName,
            url: publicUrl
        });
    } catch (err) {
        console.error("[R2 ERROR]", err);
        res.status(500).json({ error: "Failed to upload file to Cloudflare R2: " + err.message });
    }
});

// Connect to PostgreSQL using Pool
const connectionString = process.env.DATABASE_URL || "postgres://chegoja_admin:Cj_2026_SecureDbPassword!@84.247.138.242:5439/chegoja_prod";
const pool = new Pool({
    connectionString,
    ssl: false
});

pool.on('error', (err) => {
    console.error('Unexpected error on inactive database client', err);
});

// ==========================================
// REST API ENDPOINTS
// ==========================================

// 1. GET /api/kpis - Live administrative metrics
app.get('/api/kpis', async (req, res) => {
    try {
        // Query earnings
        const earningsRes = await pool.query("SELECT COALESCE(SUM(fare), 0) as total FROM trips WHERE status = 'concluded'");
        const totalEarnings = parseFloat(earningsRes.rows[0].total);

        // Query trips count
        const tripsRes = await pool.query("SELECT COUNT(*) as count FROM trips");
        const totalTrips = parseInt(tripsRes.rows[0].count);

        // Query active drivers count
        const activeDriversRes = await pool.query("SELECT COUNT(*) as count FROM drivers WHERE active = true AND overall_status = 'approved'");
        const activeDrivers = parseInt(activeDriversRes.rows[0].count);

        // Query pending approvals
        const pendingRes = await pool.query("SELECT COUNT(*) as count FROM drivers WHERE overall_status = 'pending'");
        const pendingApprovals = parseInt(pendingRes.rows[0].count);

        res.json({
            earnings: totalEarnings,
            trips: totalTrips,
            activeDrivers,
            pendingApprovals
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to fetch administrative KPIs" });
    }
});

// 2. GET /api/drivers - Retrieve all drivers and candidates
app.get('/api/drivers', async (req, res) => {
    try {
        const driversRes = await pool.query("SELECT * FROM drivers ORDER BY id ASC");
        res.json(driversRes.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to fetch drivers list" });
    }
});

// 3. POST /api/drivers/approve - Document approval triggers
app.post('/api/drivers/approve', async (req, res) => {
    const { id, documentType } = req.body;
    
    if (!id || !documentType) {
        return res.status(400).json({ error: "Parameters 'id' and 'documentType' are required." });
    }

    try {
        let fieldToUpdate = '';
        if (documentType === 'cnh') {
            fieldToUpdate = 'cnh_approved';
        } else if (documentType === 'res') {
            fieldToUpdate = 'res_approved';
        } else {
            return res.status(400).json({ error: "Invalid documentType. Must be 'cnh' or 'res'." });
        }

        // Update document status
        await pool.query(`UPDATE drivers SET ${fieldToUpdate} = true WHERE id = $1`, [id]);

        // Query driver to check if both are approved
        const driverRes = await pool.query("SELECT cnh_approved, res_approved, name FROM drivers WHERE id = $1", [id]);
        if (driverRes.rows.length === 0) {
            return res.status(404).json({ error: "Driver not found." });
        }

        const driver = driverRes.rows[0];
        let overallStatus = 'pending';
        let active = false;

        if (driver.cnh_approved && driver.res_approved) {
            overallStatus = 'approved';
            active = true;
            await pool.query("UPDATE drivers SET overall_status = 'approved', active = true WHERE id = $1", [id]);
        }

        res.json({
            success: true,
            message: `Document '${documentType}' approved for ${driver.name}.`,
            overallStatus,
            active
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to approve driver document." });
    }
});

// 4. GET /api/trips - Retrieve all trips
app.get('/api/trips', async (req, res) => {
    try {
        const tripsRes = await pool.query(`
            SELECT t.*, c.name as client_name, d.name as driver_name 
            FROM trips t
            LEFT JOIN clients c ON t.client_id = c.id
            LEFT JOIN drivers d ON t.driver_id = d.id
            ORDER BY t.created_at DESC
        `);
        res.json(tripsRes.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to fetch trip history" });
    }
});

// 5. GET /api/dynamics - Retrieve dynamic pricing list
app.get('/api/dynamics', async (req, res) => {
    try {
        const dynamicsRes = await pool.query("SELECT * FROM dynamics ORDER BY id ASC");
        res.json(dynamicsRes.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to fetch dynamic pricing configurations" });
    }
});

// 6. POST /api/dynamics/update - Update dynamic multiplier/fares
app.post('/api/dynamics/update', async (req, res) => {
    const { id, multiplier, base_fare, rate_per_km, rate_per_minute } = req.body;

    if (!id) {
        return res.status(400).json({ error: "Parameter 'id' is required." });
    }

    try {
        await pool.query(`
            UPDATE dynamics 
            SET multiplier = COALESCE($2, multiplier),
                base_fare = COALESCE($3, base_fare),
                rate_per_km = COALESCE($4, rate_per_km),
                rate_per_minute = COALESCE($5, rate_per_minute)
            WHERE id = $1
        `, [id, multiplier, base_fare, rate_per_km, rate_per_minute]);

        res.json({ success: true, message: "Dynamic pricing configuration updated successfully." });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to update dynamic pricing" });
    }
});

// 7. GET /api/clients - Retrieve all clients/passengers
app.get('/api/clients', async (req, res) => {
    try {
        const clientsRes = await pool.query("SELECT * FROM clients ORDER BY id ASC");
        res.json(clientsRes.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to fetch clients list" });
    }
});

// Operational settings storage (in memory on server, synced dynamically)
let serverSettings = {
    searchRadius: 15
};

// 8. GET /api/settings - Retrieve global settings
app.get('/api/settings', (req, res) => {
    res.json(serverSettings);
});

// 9. POST /api/settings/update - Update global settings
app.post('/api/settings/update', (req, res) => {
    const { searchRadius } = req.body;
    if (searchRadius !== undefined) {
        serverSettings.searchRadius = parseFloat(searchRadius);
        console.log(`[SETTINGS] Search radius updated to ${serverSettings.searchRadius} km`);
        return res.json({ success: true, settings: serverSettings });
    }
    res.status(400).json({ error: "Invalid operational settings parameters." });
});

// 10. POST /api/places/load - Return landmarks for city adaptively
app.post('/api/places/load', (req, res) => {
    const { city, coords } = req.body;
    if (!city) {
        return res.status(400).json({ error: "Parameter 'city' is required." });
    }

    const normalizedCity = city.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    let places = [];

    // Coordinates mapping or fallbacks
    const refCoords = coords || [-23.5616, -46.6560];

    if (normalizedCity.includes("crateus")) {
        // High fidelity Crateús landmarks!
        places = [
            { name: "Praça da Matriz (Centro)", address: "Praça Monsenhor Hipólito, Centro, Crateús - CE", category: "turismo", lat: -5.1764, lng: -40.6698 },
            { name: "Crateús Shopping", address: "Av. Sargento Hermínio, 333, Crateús - CE", category: "shopping", lat: -5.1792, lng: -40.6651 },
            { name: "Hospital Regional de Crateús", address: "Rua Coronel Júlio, 120, Crateús - CE", category: "saude", lat: -5.1831, lng: -40.6724 },
            { name: "IFCE Campus Crateús", address: "Av. Geraldo Barbosa, s/n, Venâncios, Crateús - CE", category: "educacao", lat: -5.1612, lng: -40.6547 },
            { name: "Parque Dom Fragoso", address: "Av. Dr. João da Silva, Centro, Crateús - CE", category: "lazer", lat: -5.1735, lng: -40.6711 },
            { name: "Aeroporto de Crateús (Lúcio Lima)", address: "Rodovia CE-187, Crateús - CE", category: "transporte", lat: -5.2014, lng: -40.6802 },
            { name: "Teatro Rosa de Morais", address: "Rua Doutor Moreira da Rocha, Centro, Crateús - CE", category: "turismo", lat: -5.1748, lng: -40.6687 },
            { name: "Banco do Brasil (Centro)", address: "Rua Dom Pedro II, 250, Crateús - CE", category: "banco", lat: -5.1755, lng: -40.6692 }
        ];
    } else if (normalizedCity.includes("juazeiro") || normalizedCity.includes("cariri")) {
        // Juazeiro do Norte CE
        places = [
            { name: "Horto do Padre Cícero", address: "Colina do Horto, Juazeiro do Norte - CE", category: "turismo", lat: -7.1812, lng: -39.3301 },
            { name: "Cariri Garden Shopping", address: "Av. Padre Cícero, 2555, Juazeiro do Norte - CE", category: "shopping", lat: -7.2188, lng: -39.3142 },
            { name: "Hospital Regional do Cariri", address: "Rua Catulo da Paixão Cearense, Juazeiro do Norte - CE", category: "saude", lat: -7.2104, lng: -39.3082 },
            { name: "Aeroporto Orlando Bezerra", address: "Av. Virgílio Távora, s/n, Juazeiro do Norte - CE", category: "transporte", lat: -7.2201, lng: -39.2704 },
            { name: "Praça Padre Cícero (Centro)", address: "Rua São Pedro, Centro, Juazeiro do Norte - CE", category: "turismo", lat: -7.2052, lng: -39.3101 }
        ];
    } else {
        // Default: São Paulo landmarks (with coordinates slightly offset from mapCenter for high fidelity routing)
        const lat = refCoords[0];
        const lng = refCoords[1];
        places = [
            { name: "MASP - Museu de Arte", address: "Av. Paulista, 1578, Bela Vista, São Paulo - SP", category: "turismo", lat: -23.5615, lng: -46.6562 },
            { name: "Shopping Cidade São Paulo", address: "Av. Paulista, 1230, Bela Vista, São Paulo - SP", category: "shopping", lat: -23.5645, lng: -46.6521 },
            { name: "Parque do Ibirapuera (Portão 3)", address: "Av. Pedro Álvares Cabral, s/n, São Paulo - SP", category: "lazer", lat: -23.5874, lng: -46.6576 },
            { name: "Aeroporto de Congonhas", address: "Av. Washington Luís, s/n, Vila Congonhas, São Paulo - SP", category: "transporte", lat: -23.6263, lng: -46.6601 },
            { name: "Hospital Sírio-Libanês", address: "Rua Dona Adma Jafet, 91, Bela Vista, São Paulo - SP", category: "saude", lat: -23.5578, lng: -46.6551 },
            { name: "Rua Augusta, 500", address: "Rua Augusta, 500, Consolação, São Paulo - SP", category: "turismo", lat: -23.5505, lng: -46.6592 },
            { name: "Instituto de Física da USP", address: "Rua do Matão, 1371, Butantã, São Paulo - SP", category: "educacao", lat: -23.5592, lng: -46.7314 },
            { name: "Igreja da Sé (Catedral)", address: "Praça da Sé, Centro, São Paulo - SP", category: "religiao", lat: -23.5512, lng: -46.6341 }
        ];
    }

    res.json({ success: true, city, places });
});

// Wildcard fallback to serve the static frontend
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start listening
app.listen(PORT, () => {
    console.log(`ChegoJá Admin API Server running on port ${PORT}`);
});
