import "dotenv/config";
import express from "express";
import cors from "cors";
import { checkDatabase } from "./db.js";

const app = express();

const PORT = Number(process.env.PORT) || 10000;

app.use(
  cors({
    origin: true,
    credentials: true,
  }),
);

app.use(express.json({ limit: "5mb" }));

app.get("/health", async (_req, res) => {
  const databaseOk = await checkDatabase();

  res.status(databaseOk ? 200 : 503).json({
    ok: databaseOk,
    service: "addis-egata-api",
    database: databaseOk ? "connected" : "unavailable",
    timestamp: new Date().toISOString(),
  });
});

app.get("/", (_req, res) => {
  res.status(200).json({
    name: "Addis ዕጣ",
    message: "API is running",
  });
});

app.use((_req, res) => {
  res.status(404).json({
    error: "NOT_FOUND",
    message: "The requested endpoint does not exist.",
  });
});

app.use(
  (
    err: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error("Unhandled server error:", err);

    res.status(500).json({
      error: "INTERNAL_SERVER_ERROR",
      message: "An unexpected server error occurred.",
    });
  },
);

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Addis ዕጣ API running on port ${PORT}`);
});
