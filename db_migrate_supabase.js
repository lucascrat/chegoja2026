const { Client } = require('pg');

const sourceDbUrl = "postgres://chegoja_admin:Cj_2026_SecureDbPassword!@84.247.138.242:5439/chegoja_prod";

// Hostnames to try for the new Supabase DB inside Coolify
const targetDbUrls = [
    "postgres://postgres:1pan66Rn5b9vVq1atgr6O6I1vmX3un7q@g6f93arlsyi0onk3ovmvbjof-supabase-db:5432/postgres",
    "postgres://postgres:1pan66Rn5b9vVq1atgr6O6I1vmX3un7q@gz5q6hkbtsqdcoan8q8e9qhw:5432/postgres",
    "postgres://postgres:1pan66Rn5b9vVq1atgr6O6I1vmX3un7q@supabase-db:5432/postgres"
];

async function main() {
    console.log("=== Starting Database Migration to Supabase on Coolify ===");

    // 1. Connect to Source DB
    console.log("Connecting to Source Database...");
    const sourceClient = new Client({ connectionString: sourceDbUrl });
    try {
        await sourceClient.connect();
        console.log("Connected to Source DB successfully.");
    } catch (e) {
        console.error("Failed to connect to source DB:", e.message);
        process.exit(1);
    }

    // 2. Connect to Target DB (Supabase)
    let targetClient = null;
    let connectedUrl = "";
    for (const url of targetDbUrls) {
        const masked = url.replace(/:([^:@]+)@/, ":******@");
        console.log(`Attempting to connect to Target DB: ${masked}`);
        const client = new Client({ connectionString: url, connectionTimeoutMillis: 4000 });
        try {
            await client.connect();
            console.log(`Connected to Target DB successfully via ${masked}`);
            targetClient = client;
            connectedUrl = url;
            break;
        } catch (err) {
            console.log(`Failed to connect to ${masked}: ${err.message}`);
        }
    }

    if (!targetClient) {
        console.error("Migration aborted: Could not connect to any target Supabase database hostnames.");
        await sourceClient.end();
        process.exit(1);
    }

    try {
        // 3. Drop existing tables in Target DB if they exist (to clean up)
        console.log("\nCleaning target database tables...");
        await targetClient.query("DROP TABLE IF EXISTS trips CASCADE;");
        await targetClient.query("DROP TABLE IF EXISTS drivers CASCADE;");
        await targetClient.query("DROP TABLE IF EXISTS clients CASCADE;");
        await targetClient.query("DROP TABLE IF EXISTS dynamics CASCADE;");
        console.log("Target tables cleaned.");

        // 4. Create Tables in Target DB
        console.log("\nCreating schema in target database...");
        
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
        console.log("- 'drivers' table created.");

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
        console.log("- 'clients' table created.");

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
        console.log("- 'dynamics' table created.");

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
        console.log("- 'trips' table created.");

        // 5. Migrate Data
        console.log("\nMigrating data from source to target...");

        // A. Migrate Clients
        console.log("Migrating 'clients'...");
        const clientsRes = await sourceClient.query("SELECT * FROM clients");
        console.log(`Found ${clientsRes.rows.length} clients to migrate.`);
        for (const row of clientsRes.rows) {
            await targetClient.query(`
                INSERT INTO clients (id, name, phone, email, avatar, rating, created_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
            `, [row.id, row.name, row.phone, row.email, row.avatar, row.rating, row.created_at]);
        }
        await targetClient.query("SELECT setval('clients_id_seq', COALESCE((SELECT MAX(id)+1 FROM clients), 1), false)");
        console.log("Clients migration completed.");

        // B. Migrate Drivers
        console.log("Migrating 'drivers'...");
        const driversRes = await sourceClient.query("SELECT * FROM drivers");
        console.log(`Found ${driversRes.rows.length} drivers to migrate.`);
        for (const row of driversRes.rows) {
            await targetClient.query(`
                INSERT INTO drivers (id, name, phone, cnh_approved, res_approved, cnh_url, res_url, overall_status, lat, lng, active, avatar, rating, vehicle_desc, vehicle_plate, created_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
            `, [row.id, row.name, row.phone, row.cnh_approved, row.res_approved, row.cnh_url, row.res_url, row.overall_status, row.lat, row.lng, row.active, row.avatar, row.rating, row.vehicle_desc, row.vehicle_plate, row.created_at]);
        }
        await targetClient.query("SELECT setval('drivers_id_seq', COALESCE((SELECT MAX(id)+1 FROM drivers), 1), false)");
        console.log("Drivers migration completed.");

        // C. Migrate Dynamics
        console.log("Migrating 'dynamics'...");
        const dynamicsRes = await sourceClient.query("SELECT * FROM dynamics");
        console.log(`Found ${dynamicsRes.rows.length} dynamics configurations to migrate.`);
        for (const row of dynamicsRes.rows) {
            await targetClient.query(`
                INSERT INTO dynamics (id, name, multiplier, base_fare, rate_per_km, rate_per_minute, active, created_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            `, [row.id, row.name, row.multiplier, row.base_fare, row.rate_per_km, row.rate_per_minute, row.active, row.created_at]);
        }
        await targetClient.query("SELECT setval('dynamics_id_seq', COALESCE((SELECT MAX(id)+1 FROM dynamics), 1), false)");
        console.log("Dynamics migration completed.");

        // D. Migrate Trips
        console.log("Migrating 'trips'...");
        const tripsRes = await sourceClient.query("SELECT * FROM trips");
        console.log(`Found ${tripsRes.rows.length} trips to migrate.`);
        for (const row of tripsRes.rows) {
            await targetClient.query(`
                INSERT INTO trips (id, client_id, driver_id, pickup_address, pickup_lat, pickup_lng, dest_address, dest_lat, dest_lng, fare, status, created_at)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            `, [row.id, row.client_id, row.driver_id, row.pickup_address, row.pickup_lat, row.pickup_lng, row.dest_address, row.dest_lat, row.dest_lng, row.fare, row.status, row.created_at]);
        }
        await targetClient.query("SELECT setval('trips_id_seq', COALESCE((SELECT MAX(id)+1 FROM trips), 1), false)");
        console.log("Trips migration completed.");

        console.log("\n=== DATABASE MIGRATION COMPLETED SUCCESSFULLY ===");
    } catch (err) {
        console.error("Migration error:", err.message);
    } finally {
        await sourceClient.end();
        await targetClient.end();
    }
}

main();
