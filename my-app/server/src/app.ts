//handles api requests and communincates with the database
import express from "express";
import cors from "cors";
import "dotenv/config";

import testDbRouter from "./routes/testDb.js";

const app = express();

// Middleware
app.use(cors({
  origin: process.env.CLIENT_URL ?? "http://localhost:5173",
}));

app.use(express.json());

// Routes
app.use("/api/test-db", testDbRouter);

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

// Start server
const PORT = Number(process.env.PORT ?? 3000);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});