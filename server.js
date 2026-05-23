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
    // Add SSL configurations if deploying in secure environments
    ssl: connectionString.includes('localhost') || connectionString.includes('127.0.0.1') ? false : { rejectUnauthorized: false }
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

// Wildcard fallback to serve the static frontend
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start listening
app.listen(PORT, () => {
    console.log(`ChegoJá Admin API Server running on port ${PORT}`);
});
