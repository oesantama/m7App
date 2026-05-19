import pool from '../config/database';

const migrate = async () => {
    try {
        console.log('--- START LEGACY MIGRATION ---');

        // 1. Alter gh_personal table to add vehicle plate and operation fields
        console.log('Adding placa and operacion columns to gh_personal...');
        await pool.query(`
            ALTER TABLE gh_personal 
            ADD COLUMN IF NOT EXISTS placa VARCHAR(50),
            ADD COLUMN IF NOT EXISTS operacion VARCHAR(255);
        `);
        console.log('Columns added successfully.');

        // 2. Seed element types for stationery (Papelería) and uniforms (Dotación / EPP)
        console.log('Seeding element types in gh_tipos_elementos...');
        await pool.query(`
            INSERT INTO gh_tipos_elementos (nombre, estado_id)
            VALUES 
                ('Papelería', 'EST-01'),
                ('Dotación / EPP', 'EST-01')
            ON CONFLICT (nombre) DO NOTHING;
        `);
        console.log('Element types seeded successfully.');

        console.log('--- LEGACY MIGRATION COMPLETED SUCCESSFULLY ---');
        process.exit(0);
    } catch (e) {
        console.error('ERROR RUNNING LEGACY MIGRATION:', e);
        process.exit(1);
    }
};

migrate();
