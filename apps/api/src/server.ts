import "dotenv/config";
import express from "express";
import cors from "cors";

import { checkDatabase } from "./db.js";
import authRouter from "./routes/auth.js";
import drawsRouter from "./routes/draws.js";
import entriesRouter from "./routes/entries.js";
import paymentsRouter from "./routes/payments.js";
import resultsRouter from "./routes/results.js";
import adminPaymentsRouter from "./routes/admin-payments.js";
import adminDrawsRouter from "./routes/admin-draws.js";
import adminDrawExecutionRouter from "./routes/admin-draw-execution.js";

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

/*
 * Telegram authentication
 *
 * GET /auth/me
 */
app.use("/auth", authRouter);

/*
 * Public draws
 *
 * GET /draws
 * GET /draws/:drawId
 */
app.use("/draws", drawsRouter);

/*
 * Public published results
 *
 * GET /results
 * GET /results/:drawId
 */
app.use("/results", resultsRouter);

/*
 * Entries and number reservations
 *
 * GET /entries/mine
 * POST /entries/reserve
 * GET /entries/:entryId
 */
app.use("/entries", entriesRouter);

/*
 * Manual Telebirr payments
 *
 * GET /payments/mine
 * POST /payments/telebirr
 * GET /payments/:paymentId
 */
app.use("/payments", paymentsRouter);

/*
 * Admin payment verification
 *
 * GET /admin/payments/pending
 * POST /admin/payments/:paymentId/approve
 * POST /admin/payments/:paymentId/reject
 */
app.use(
  "/admin/payments",
  adminPaymentsRouter,
);

/*
 * Admin draw management
 *
 * POST /admin/draws
 * POST /admin/draws/:drawId/open
 * POST /admin/draws/:drawId/close
 */
app.use(
  "/admin/draws",
  adminDrawsRouter,
);

/*
 * Admin draw execution
 *
 * POST /admin/draw-execution/:drawId/execute
 *
 * The draw engine securely selects winners and
 * publishes the immutable result.
 */
app.use(
  "/admin/draw-execution",
  adminDrawExecutionRouter,
);

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
    console.error(
      "Unhandled server error:",
      err,
    );

    res.status(500).json({
      error: "INTERNAL_SERVER_ERROR",
      message:
        "An unexpected server error occurred.",
    });
  },
);

app.listen(PORT, "0.0.0.0", () => {
  console.log(
    `Addis ዕጣ API running on port ${PORT}`,
  );
});
