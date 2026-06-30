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

// 3.5. POST /api/drivers/register - Register new driver or rider
app.post('/api/drivers/register', async (req, res) => {
    const { name, phone, vehicle_desc, vehicle_plate, vehicle_type } = req.body;
    
    if (!name || !phone || !vehicle_desc || !vehicle_plate) {
        return res.status(400).json({ error: "Name, phone, vehicle description, and plate are required." });
    }

    const type = vehicle_type === 'moto' ? 'moto' : 'carro';
    
    // Auto-generate high fidelity document placeholders based on vehicle type
    const avatar = type === 'moto' ? 
        `https://randomuser.me/api/portraits/men/${Math.floor(Math.random() * 50) + 50}.jpg` : 
        `https://randomuser.me/api/portraits/men/${Math.floor(Math.random() * 50) + 1}.jpg`;
        
    const cnh_url = type === 'moto' ? 
        "https://pub-f9009c0a0d1c42ee9e6eb41742ccf75f.r2.dev/cnh-carlos.svg" : 
        "https://pub-f9009c0a0d1c42ee9e6eb41742ccf75f.r2.dev/cnh-mariana.svg";
        
    const res_url = "https://pub-f9009c0a0d1c42ee9e6eb41742ccf75f.r2.dev/comprovante-carlos.svg";

    try {
        const queryText = `
            INSERT INTO drivers (name, phone, vehicle_desc, vehicle_plate, vehicle_type, avatar, cnh_url, res_url, overall_status, active, rating)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', false, 5.00)
            RETURNING *
        `;
        const values = [name, phone, vehicle_desc, vehicle_plate, type, avatar, cnh_url, res_url];
        const result = await pool.query(queryText, values);
        
        console.log(`[REGISTER] Registered new ${type}: ${name}`);
        res.json({
            success: true,
            message: `Driver/Rider ${name} registered successfully.`,
            driver: result.rows[0]
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to register driver/rider: " + err.message });
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
    const { id, multiplier, base_fare, rate_per_km, rate_per_minute, start_time, end_time } = req.body;

    if (!id) {
        return res.status(400).json({ error: "Parameter 'id' is required." });
    }

    try {
        await pool.query(`
            UPDATE dynamics 
            SET multiplier = COALESCE($2, multiplier),
                base_fare = COALESCE($3, base_fare),
                rate_per_km = COALESCE($4, rate_per_km),
                rate_per_minute = COALESCE($5, rate_per_minute),
                start_time = COALESCE($6, start_time),
                end_time = COALESCE($7, end_time)
            WHERE id = $1
        `, [id, multiplier, base_fare, rate_per_km, rate_per_minute, start_time, end_time]);

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

// 11. GET /api/drivers/search - Find driver by phone number
app.get('/api/drivers/search', async (req, res) => {
    const { phone } = req.query;
    if (!phone) {
        return res.status(400).json({ error: "Phone number is required." });
    }
    
    // Normalize phone input (digits only)
    const cleanPhone = phone.replace(/\D/g, '');

    try {
        const result = await pool.query("SELECT * FROM drivers WHERE regexp_replace(phone, '\\D', '', 'g') = $1", [cleanPhone]);
        
        if (result.rows.length === 0) {
            return res.json({ found: false });
        }
        
        res.json({ found: true, driver: result.rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to search driver: " + err.message });
    }
});

// 12. POST /api/drivers/update-docs - Update driver documents URLs and reset approvals
app.post('/api/drivers/update-docs', async (req, res) => {
    const { id, cnh_url, res_url } = req.body;
    
    if (!id) {
        return res.status(400).json({ error: "Driver ID is required." });
    }

    try {
        let queryText = "UPDATE drivers SET ";
        const values = [id];
        let paramIndex = 2;

        if (cnh_url) {
            queryText += `cnh_url = $${paramIndex}, cnh_approved = false, `;
            values.push(cnh_url);
            paramIndex++;
        }
        if (res_url) {
            queryText += `res_url = $${paramIndex}, res_approved = false, `;
            values.push(res_url);
            paramIndex++;
        }

        // Reset overall status to pending since documents changed
        queryText += `overall_status = 'pending', active = false WHERE id = $1 RETURNING *`;
        
        // Remove trailing comma if exists before overall_status
        queryText = queryText.replace(', overall_status', 'overall_status');
        queryText = queryText.replace(', active = false', ', active = false');

        const result = await pool.query(queryText, values);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Driver not found." });
        }

        console.log(`[DOCS] Updated documents for driver ID ${id}`);
        res.json({
            success: true,
            message: "Driver documents updated successfully. Pending new approval.",
            driver: result.rows[0]
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to update driver documents: " + err.message });
    }
});

// 13. POST /api/drivers/update-location - Update active status and coordinates
app.post('/api/drivers/update-location', async (req, res) => {
    const { id, active, lat, lng } = req.body;
    
    if (!id) {
        return res.status(400).json({ error: "Driver ID is required." });
    }

    try {
        const queryText = `
            UPDATE drivers 
            SET active = COALESCE($2, active),
                lat = COALESCE($3, lat),
                lng = COALESCE($4, lng)
            WHERE id = $1
            RETURNING *
        `;
        const values = [id, active, lat, lng];
        const result = await pool.query(queryText, values);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Driver not found." });
        }

        res.json({
            success: true,
            message: "Location/status updated successfully.",
            driver: result.rows[0]
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to update location: " + err.message });
    }
});

// 14. GET /api/drivers/online - Retrieve all online approved drivers
app.get('/api/drivers/online', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT id, name, phone, vehicle_desc, vehicle_plate, vehicle_type, avatar, lat, lng, rating
            FROM drivers
            WHERE active = true AND overall_status = 'approved'
        `);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to fetch online drivers: " + err.message });
    }
});

// Temporary migration endpoint
app.post('/api/migrate-data', async (req, res) => {
    const { clients, drivers, dynamics, trips } = req.body;

    if (!clients || !drivers || !dynamics || !trips) {
        return res.status(400).json({ error: "Missing migration data payload." });
    }

    const targetDbUrls = [
        "postgres://postgres:1pan66Rn5b9vVq1atgr6O6I1vmX3un7q@g6f93arlsyi0onk3ovmvbjof-supabase-db:5432/postgres",
        "postgres://postgres:1pan66Rn5b9vVq1atgr6O6I1vmX3un7q@gz5q6hkbtsqdcoan8q8e9qhw:5432/postgres",
        "postgres://postgres:1pan66Rn5b9vVq1atgr6O6I1vmX3un7q@supabase-db:5432/postgres"
    ];

    let targetClient = null;
    let connectedUrl = "";

    const { Client } = require('pg');

    for (const url of targetDbUrls) {
        const masked = url.replace(/:([^:@]+)@/, ":******@");
        console.log(`[MIGRATION-API] Attempting connection to: ${masked}`);
        const c = new Client({ connectionString: url, connectionTimeoutMillis: 3000 });
        try {
            await c.connect();
            console.log(`[MIGRATION-API] Connected using: ${masked}`);
            targetClient = c;
            connectedUrl = url;
            break;
        } catch (err) {
            console.log(`[MIGRATION-API] Failed to connect to ${masked}: ${err.message}`);
        }
    }

    if (!targetClient) {
        return res.status(500).json({ error: "Could not connect to any target Supabase database hosts." });
    }

    try {
        console.log("[MIGRATION-API] Cleaning target tables...");
        await targetClient.query("DROP TABLE IF EXISTS trips CASCADE;");
        await targetClient.query("DROP TABLE IF EXISTS drivers CASCADE;");
        await targetClient.query("DROP TABLE IF EXISTS clients CASCADE;");
        await targetClient.query("DROP TABLE IF EXISTS dynamics CASCADE;");

        console.log("[MIGRATION-API] Creating schema...");
        await targetClient.query(`
            CREATE TABLE drivers (
                id SERIAL PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                phone VARCHAR(20) NOT NULL,
                cnh_approved BOOLEAN DEFAULT FALSE,
                res_approved BOOLEAN DEFAULT FALSE,
                cnh_url VARCHAR(255),
                res_url VARCHAR(255),
                overall_status VARCHAR(20) DEFAULT 'pending',
                lat DOUBLE PRECISION DEFAULT -23.5616,
                lng DOUBLE PRECISION DEFAULT -46.6560,
                active BOOLEAN DEFAULT FALSE,
                avatar VARCHAR(255),
                rating NUMERIC(3, 2) DEFAULT 5.00,
                vehicle_desc VARCHAR(100),
                vehicle_plate VARCHAR(20),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await targetClient.query(`
            CREATE TABLE clients (
                id SERIAL PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                phone VARCHAR(20) NOT NULL UNIQUE,
                email VARCHAR(100),
                avatar VARCHAR(255),
                rating NUMERIC(3, 2) DEFAULT 5.00,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await targetClient.query(`
            CREATE TABLE dynamics (
                id SERIAL PRIMARY KEY,
                name VARCHAR(100) NOT NULL UNIQUE,
                multiplier NUMERIC(3, 2) DEFAULT 1.00,
                base_fare NUMERIC(6, 2) DEFAULT 5.00,
                rate_per_km NUMERIC(6, 2) DEFAULT 2.00,
                rate_per_minute NUMERIC(6, 2) DEFAULT 0.50,
                active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await targetClient.query(`
            CREATE TABLE trips (
                id SERIAL PRIMARY KEY,
                client_id INT REFERENCES clients(id) ON DELETE SET NULL,
                driver_id INT REFERENCES drivers(id) ON DELETE SET NULL,
                pickup_address VARCHAR(255) NOT NULL,
                pickup_lat DOUBLE PRECISION NOT NULL,
                pickup_lng DOUBLE PRECISION NOT NULL,
                dest_address VARCHAR(255) NOT NULL,
                dest_lat DOUBLE PRECISION NOT NULL,
                dest_lng DOUBLE PRECISION NOT NULL,
                fare NUMERIC(8, 2) NOT NULL,
                status VARCHAR(30) DEFAULT 'requested',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        console.log("[MIGRATION-API] Seeding clients...");
        for (const row of clients) {
            await targetClient.query(`
                INSERT INTO clients (id, name, phone, email, avatar, rating, created_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
            `, [row.id, row.name, row.phone, row.email, row.avatar, row.rating, row.created_at]);
        }
        await targetClient.query("SELECT setval('clients_id_seq', COALESCE((SELECT MAX(id)+1 FROM clients), 1), false)");

        console.log("[MIGRATION-API] Seeding drivers...");
        for (const row of drivers) {
            await targetClient.query(`
                INSERT INTO drivers (id, name, phone, cnh_approved, res_approved, cnh_url, res_url, overall_status, lat, lng, active, avatar, rating, vehicle_desc, vehicle_plate, created_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
            `, [row.id, row.name, row.phone, row.cnh_approved, row.res_approved, row.cnh_url, row.res_url, row.overall_status, row.lat, row.lng, row.active, row.avatar, row.rating, row.vehicle_desc, row.vehicle_plate, row.created_at]);
        }
        await targetClient.query("SELECT setval('drivers_id_seq', COALESCE((SELECT MAX(id)+1 FROM drivers), 1), false)");

        console.log("[MIGRATION-API] Seeding dynamics...");
        for (const row of dynamics) {
            await targetClient.query(`
                INSERT INTO dynamics (id, name, multiplier, base_fare, rate_per_km, rate_per_minute, active, created_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            `, [row.id, row.name, row.multiplier, row.base_fare, row.rate_per_km, row.rate_per_minute, row.active, row.created_at]);
        }
        await targetClient.query("SELECT setval('dynamics_id_seq', COALESCE((SELECT MAX(id)+1 FROM dynamics), 1), false)");

        console.log("[MIGRATION-API] Seeding trips...");
        for (const row of trips) {
            await targetClient.query(`
                INSERT INTO trips (id, client_id, driver_id, pickup_address, pickup_lat, pickup_lng, dest_address, dest_lat, dest_lng, fare, status, created_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            `, [row.id, row.client_id, row.driver_id, row.pickup_address, row.pickup_lat, row.pickup_lng, row.dest_address, row.dest_lat, row.dest_lng, row.fare, row.status, row.created_at]);
        }
        await targetClient.query("SELECT setval('trips_id_seq', COALESCE((SELECT MAX(id)+1 FROM trips), 1), false)");

        console.log("[MIGRATION-API] Migration completed successfully!");
        res.json({
            success: true,
            message: "Database migrated to Supabase successfully!",
            connectedUrl: connectedUrl.replace(/:([^:@]+)@/, ":******@"),
            databaseUrlEnv: connectedUrl
        });
    } catch (err) {
        console.error("[MIGRATION-API] Error:", err.message);
        res.status(500).json({ error: "Migration error: " + err.message });
    } finally {
        await targetClient.end();
    }
});

// Wildcard fallback to serve the static frontend
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start listening
app.listen(PORT, () => {
    console.log(`ChegoJá Admin API Server running on port ${PORT}`);
});
