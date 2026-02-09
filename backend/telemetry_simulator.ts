
import { Client } from 'pg';

const client = new Client({
  connectionString: process.env.DATABASE_URL || 'postgresql://m7_admin:m7_master_password@m7app-postgres-1:5432/m7_logistica'
});

async function simulateTelemetry() {
  try {
    await client.connect();
    console.log('🔌 Telemetry Simulator Connected');
    
    // Get active vehicles (plates)
    const res = await client.query("SELECT plate FROM vehicles WHERE status_id = 'EST-01' LIMIT 5"); // Simular solo 5 activos
    const plates = res.rows.map(r => r.plate);
    
    if (plates.length === 0) {
        console.log('No active vehicles to simulate.');
        return;
    }

    // Simulation Loop
    setInterval(async () => {
        for (const plate of plates) {
            const data = generateMockData(plate);
            await saveTelemetry(data);
        }
    }, 5000); // Every 5 seconds

  } catch (err) {
    console.error('Connection error', err);
  }
}

function generateMockData(plate: string) {
    // Randomize slightly based on previous state (simplified for now: random)
    const speed = Math.floor(Math.random() * 80) + 10; // 10-90 km/h
    const rpm = Math.floor(Math.random() * 2000) + 1000; // 1000-3000 RPM
    const fuel = Math.max(10, 100 - Math.floor(Math.random() * 10)); // Slow drain? No, just mock
    const temp = 85 + Math.floor(Math.random() * 10);
    const voltage = 13.5 + (Math.random() * 1);
    
    // Generar DTC con baja probabilidad
    let dtc = null;
    if (Math.random() > 0.95) {
        const codes = ['P0300', 'P0171', 'P0420', 'P0113'];
        dtc = JSON.stringify([codes[Math.floor(Math.random() * codes.length)]]);
    }

    // Mock Location (Bogotá aprox)
    const lat = 4.6097 + (Math.random() * 0.1 - 0.05);
    const lng = -74.0817 + (Math.random() * 0.1 - 0.05);

    return { plate, speed, rpm, fuel, temp, voltage, dtc, lat, lng, odo: 15000 + Math.floor(Math.random()*100) };
}

async function saveTelemetry(data: any) {
    try {
        await client.query(`
            INSERT INTO vehicle_telemetry 
            (vehicle_plate, speed, rpm, fuel_level, engine_temp, battery_voltage, dtc_codes, latitude, longitude, odometer)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        `, [data.plate, data.speed, data.rpm, data.fuel, data.temp, data.voltage, data.dtc, data.lat, data.lng, data.odo]);
        // console.log(`📡 [${data.plate}] Telemetry sent: ${data.speed}km/h | DTC: ${data.dtc || 'OK'}`);
    } catch (e) {
        console.error('Error saving telemetry', e);
    }
}

simulateTelemetry();
