import { MongoClient } from "mongodb";

let clientPromise;

function getMongoUri() {
  return process.env.MONGODB_URI || process.env.MONGO_URI || "";
}

async function getCollection() {
  const uri = getMongoUri();
  if (!uri) return null;

  if (!clientPromise) {
    const client = new MongoClient(uri, { serverSelectionTimeoutMS: 3500 });
    clientPromise = client.connect().catch((error) => {
      clientPromise = null;
      throw error;
    });
  }

  const client = await clientPromise;
  const databaseName = process.env.MONGODB_DB || "zimba";
  const collection = client.db(databaseName).collection("interactions");
  await collection.createIndex({ sessionId: 1, createdAt: -1 });
  return collection;
}

function tokens(value) {
  return new Set(
    String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((token) => token.length > 2)
  );
}

export async function findRelevantMemory(sessionId, query, limit = 5) {
  if (!sessionId || !query) return [];

  try {
    const collection = await getCollection();
    if (!collection) return [];

    const recent = await collection
      .find({ sessionId }, { projection: { userText: 1, assistantText: 1, model: 1, agent: 1, createdAt: 1 } })
      .sort({ createdAt: -1 })
      .limit(40)
      .toArray();
    const queryTokens = tokens(query);

    return recent
      .map((item) => {
        const textTokens = tokens(`${item.userText} ${item.assistantText}`);
        const score = [...queryTokens].reduce((total, token) => total + (textTokens.has(token) ? 1 : 0), 0);
        return { item, score };
      })
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score || new Date(b.item.createdAt) - new Date(a.item.createdAt))
      .slice(0, limit)
      .map(({ item }) => ({
        userText: String(item.userText || "").slice(0, 900),
        assistantText: String(item.assistantText || "").slice(0, 1400),
        model: item.model,
        agent: item.agent
      }));
  } catch (error) {
    console.warn("Zimba memory read skipped:", error.message);
    return [];
  }
}

export async function saveInteraction({ sessionId, model, agent, userText, assistantText }) {
  if (!sessionId || !userText || !assistantText) return false;

  try {
    const collection = await getCollection();
    if (!collection) return false;
    await collection.insertOne({
      sessionId: String(sessionId).slice(0, 160),
      model: String(model || "Zimba Core").slice(0, 80),
      agent: String(agent || "Generalist").slice(0, 80),
      userText: String(userText).slice(0, 12000),
      assistantText: String(assistantText).slice(0, 24000),
      createdAt: new Date()
    });
    return true;
  } catch (error) {
    console.warn("Zimba memory write skipped:", error.message);
    return false;
  }
}

export function formatMemoryContext(memories) {
  if (!memories.length) return "";
  return memories
    .map((memory, index) => `Memory ${index + 1}\nUser: ${memory.userText}\nZimba: ${memory.assistantText}`)
    .join("\n\n");
}
