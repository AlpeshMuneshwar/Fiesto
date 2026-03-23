
const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
dotenv.config();

async function testConnection() {
    const url = process.env.DATABASE_URL;
    console.log('Testing connection to:', url);
    
    try {
        // Remove DB name from URL to connect to the server first
        const serverUrl = url.substring(0, url.lastIndexOf('/'));
        const connection = await mysql.createConnection(serverUrl);
        console.log('Connected to MySQL server!');
        
        const [rows] = await connection.query('SHOW DATABASES LIKE "QrSolDb"');
        if (rows.length === 0) {
            console.log('Database QrSolDb does not exist. Creating...');
            await connection.query('CREATE DATABASE QrSolDb');
            console.log('Database created!');
        } else {
            console.log('Database QrSolDb exists.');
        }
        await connection.end();
    } catch (err) {
        console.error('Error connecting to MySQL:', err);
    }
}

testConnection();
