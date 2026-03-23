
const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
dotenv.config();

async function resetDb() {
    const url = process.env.DATABASE_URL;
    const serverUrl = url.substring(0, url.lastIndexOf('/'));
    
    try {
        const connection = await mysql.createConnection(serverUrl);
        console.log('Connected to MySQL server.');
        
        console.log('Dropping database QrSolDb...');
        await connection.query('DROP DATABASE IF EXISTS QrSolDb');
        
        console.log('Creating database QrSolDb...');
        await connection.query('CREATE DATABASE QrSolDb');
        
        console.log('Database reset successfully!');
        await connection.end();
    } catch (err) {
        console.error('Error resetting database:', err);
    }
}

resetDb();
