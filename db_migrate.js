const { Client } = require('pg');
require('dotenv').config();

// Use connection string from environment or fall back to our newly provisioned Coolify database
const connectionString = process.env.DATABASE_URL || "postgres://chegoja_admin:Cj_2026_SecureDbPassword!@84.247.138.242:5439/chegoja_prod";

async function main() {
    console.log("=== Connecting to PostgreSQL database for migration ===");
    console.log("Connection URL:", connectionString.replace(/:([^:@]+)@/, ":******@")); // Hide password in logs

    const client = new Client({ connectionString });
    try {
        await client.connect();
        console.log("Connection successful!");

        console.log("\n1. Dropping existing tables if they exist...");
        await client.query("DROP TABLE IF EXISTS trips CASCADE;");
        await client.query("DROP TABLE IF EXISTS drivers CASCADE;");
        await client.query("DROP TABLE IF EXISTS clients CASCADE;");
        await client.query("DROP TABLE IF EXISTS dynamics CASCADE;");
        console.log("Tables dropped.");

        console.log("\n2. Creating tables...");
        
        // Drivers Table
        await client.query(`
            CREATE TABLE drivers (
                id SERIAL PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                phone VARCHAR(20) NOT NULL,
                cnh_approved BOOLEAN DEFAULT FALSE,
                res_approved BOOLEAN DEFAULT FALSE,
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

        // Clients Table
        await client.query(`
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

        // Dynamics Table
        await client.query(`
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

        // Trips Table
        await client.query(`
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

        console.log("\n3. Seeding initial data...");

        // Seed Drivers (Candidates & Active)
        const driverSeeds = [
            // Candidates
            { name: "Carlos Silva", phone: "11988887777", cnh_approved: false, res_approved: false, overall_status: "pending", lat: -23.5616, lng: -46.6560, active: false, avatar: "https://randomuser.me/api/portraits/men/32.jpg", rating: 5.00, vehicle_desc: "Chevrolet Onix Preto", vehicle_plate: "ABC-1234" },
            { name: "Mariana Santos", phone: "11977776666", cnh_approved: false, res_approved: false, overall_status: "pending", lat: -23.5536, lng: -46.6530, active: false, avatar: "https://randomuser.me/api/portraits/women/44.jpg", rating: 5.00, vehicle_desc: "Hyundai HB20 Branco", vehicle_plate: "XYZ-9876" },
            // Active
            { name: "Renato Souza", phone: "11966665555", cnh_approved: true, res_approved: true, overall_status: "approved", lat: -23.5629, lng: -46.6540, active: true, avatar: "https://randomuser.me/api/portraits/men/85.jpg", rating: 4.80, vehicle_desc: "Toyota Corolla Preto", vehicle_plate: "RUN-8888" },
            { name: "Patricia Lima", phone: "11955554444", cnh_approved: true, res_approved: true, overall_status: "approved", lat: -23.6273, lng: -46.6562, active: true, avatar: "https://randomuser.me/api/portraits/women/12.jpg", rating: 4.90, vehicle_desc: "Volkswagen Polo Prata", vehicle_plate: "CJX-1111" },
            { name: "Ricardo Dias", phone: "11944443333", cnh_approved: true, res_approved: true, overall_status: "approved", lat: -23.5796, lng: -46.6666, active: true, avatar: "https://randomuser.me/api/portraits/men/50.jpg", rating: 4.70, vehicle_desc: "Nissan Versa Cinza", vehicle_plate: "CMT-3333" }
        ];

        for (const dr of driverSeeds) {
            await client.query(`
                INSERT INTO drivers (name, phone, cnh_approved, res_approved, overall_status, lat, lng, active, avatar, rating, vehicle_desc, vehicle_plate)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            `, [dr.name, dr.phone, dr.cnh_approved, dr.res_approved, dr.overall_status, dr.lat, dr.lng, dr.active, dr.avatar, dr.rating, dr.vehicle_desc, dr.vehicle_plate]);
        }
        console.log("- Drivers seeded.");

        // Seed Clients
        await client.query(`
            INSERT INTO clients (name, phone, email, avatar, rating)
            VALUES ($1, $2, $3, $4, $5)
        `, ["Diego", "88992345678", "diego@chegoja.com.br", "https://randomuser.me/api/portraits/men/1.jpg", 5.00]);
        console.log("- Clients seeded.");

        // Seed Dynamics
        const dynamicSeeds = [
            { name: "Avenida Paulista", multiplier: 1.50, base_fare: 5.00, rate_per_km: 2.00, rate_per_minute: 0.50, active: true },
            { name: "Centro Histórico", multiplier: 1.20, base_fare: 5.00, rate_per_km: 2.00, rate_per_minute: 0.50, active: true },
            { name: "Berrini / Vila Olímpia", multiplier: 1.80, base_fare: 6.00, rate_per_km: 2.50, rate_per_minute: 0.80, active: true }
        ];

        for (const dy of dynamicSeeds) {
            await client.query(`
                INSERT INTO dynamics (name, multiplier, base_fare, rate_per_km, rate_per_minute, active)
                VALUES ($1, $2, $3, $4, $5, $6)
            `, [dy.name, dy.multiplier, dy.base_fare, dy.rate_per_km, dy.rate_per_minute, dy.active]);
        }
        console.log("- Dynamic pricing seeded.");

        // Seed Trips
        await client.query(`
            INSERT INTO trips (client_id, driver_id, pickup_address, pickup_lat, pickup_lng, dest_address, dest_lat, dest_lng, fare, status)
            VALUES (1, 3, 'Av. Paulista, 1578', -23.5616, -46.6560, 'Aeroporto de Congonhas', -23.6273, -46.6562, 34.50, 'concluded')
        `);
        console.log("- Trip history seeded.");

        console.log("\n=== Migration completed successfully! ===");
    } catch (e) {
        console.error("Migration failed:", e.message);
    } finally {
        await client.end();
    }
}

main();
