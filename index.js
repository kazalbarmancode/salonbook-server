import express from "express";
import cors from "cors";
import "dotenv/config";
import { MongoClient } from "mongodb";

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

if (!process.env.MONGODB_URL) {
  throw new Error("MONGODB_URL is missing from .env");
}

const client = new MongoClient(process.env.MONGODB_URL);

async function startServer() {
  try {
    await client.connect();

    console.log("MongoDB Connected Successfully!");

    const db = client.db("salonbook");

    const futuredCollection = db.collection("futured");

    app.get("/", (req, res) => {
      res.send("SalonBook Server is Running!");
    });

    // future collection all

    app.get("/futured-all",async (req, res) => {
        const result = await futuredCollection.find().toArray()
      res.send(result);
    });

    app.get("/futured", async (req, res) => {
      const result = await futuredCollection.find().limit(6).toArray();
      res.send(result);
    });
    app.listen(port, () => {
      console.log(`Server running on port ${port}`);
    });
  } catch (error) {
    console.error("MongoDB Connection Failed:", error);
    process.exit(1);
  }
}

startServer();
