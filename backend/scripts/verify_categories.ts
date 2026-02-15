
import pool from '../config/database.js';

const verifyCategories = async () => {
    try {
        console.log('--- VERIFYING CATEGORY CRUD ---');

        // 1. CREATE
        console.log('Creating Test Category...');
        const newIdQuery = await pool.query("INSERT INTO categories (id, name, description) VALUES ('CAT-TEST-01', 'Test Category', 'Created by script') RETURNING *");
        console.log('Created:', newIdQuery.rows[0]);

        // 2. READ
        console.log('Reading Categories...');
        const readQuery = await pool.query("SELECT * FROM categories WHERE id = 'CAT-TEST-01'");
        if (readQuery.rows.length === 0) throw new Error('Category not found!');
        console.log('Read Success:', readQuery.rows[0]);

        // 3. UPDATE
        console.log('Updating Category...');
        await pool.query("UPDATE categories SET name = 'Updated Test Category' WHERE id = 'CAT-TEST-01'");
        const updateCheck = await pool.query("SELECT name FROM categories WHERE id = 'CAT-TEST-01'");
        console.log('Updated Name:', updateCheck.rows[0].name);

        // 4. DELETE
        console.log('Deleting Test Category...');
        await pool.query("DELETE FROM categories WHERE id = 'CAT-TEST-01'");
        
        // 5. CONFIRM DELETE
        const deleteCheck = await pool.query("SELECT * FROM categories WHERE id = 'CAT-TEST-01'");
        console.log('Exists after delete:', deleteCheck.rows.length > 0);

        console.log('--- VERIFICATION SUCCESSFUL ---');
        process.exit(0);

    } catch (error) {
        console.error('Verification Failed:', error);
        process.exit(1);
    }
};

verifyCategories();
