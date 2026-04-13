import { MongoClient } from "mongodb";

let client: MongoClient | null = null;

export async function connectMongo() {
  const uri = process.env.MONGODB_URI;
  if (!uri) return null;

  client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 5000,
  });

  await client.connect();
  return client;
}

export function getMongoClient() {
  return client;
}

export async function disconnectMongo() {
  if (!client) return;
  await client.close();
  client = null;
}

