const { MongoClient } = require('mongodb');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/';
const MONGO_DB_NAME = process.env.MONGO_DB_NAME || 'vyapar_db';

let db = null;
let client = null;

async function connectDB() {
  if (db) return db;
  try {
    client = new MongoClient(MONGO_URI);
    await client.connect();
    db = client.db(MONGO_DB_NAME);
    console.log('DATABASE READY: MongoDB Connected Successfully');
    return db;
  } catch (err) {
    console.error('DATABASE ERROR: MongoDB Connection Failed:', err);
    throw err;
  }
}

function getDB() {
  if (!db) {
    throw new Error('Database not initialized. Call connectDB() first.');
  }
  return db;
}

module.exports = {
  connectDB,
  getDB,
  MONGO_DB_NAME
};
