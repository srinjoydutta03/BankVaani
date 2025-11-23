import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI!;
const client = new MongoClient(uri);

// Lazy connect helper to reuse the same client across routes
async function getDb() {
  await client.connect();
  return client.db(process.env.MONGODB_DB ?? 'voicebank');
}

export { getDb };
