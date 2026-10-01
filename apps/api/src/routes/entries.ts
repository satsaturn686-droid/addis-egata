import { Router } from "express";

import { requireTelegramAuth } from "../middleware/auth.js";
import {
  getEntryById,
  getUserEntries,
  reserveNumber,
} from "../services/entries.js";

const router = Router();

const RESERVATION_MINUTES = 30;

function getNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);

    if (Number.isInteger(parsed)) {
      return parsed;
    }
  }

  return null;
}

router.get(
  "/mine",
  requireTelegramAuth,
  async (req, res) => {
    try {
      if (!req.user) {
        res.status(401).json({
          error: "AUTHENTICATION_REQUIRED",
          message: "Authentication is required.",
        });
        return;
      }

      const entries = await getUserEntries(req.user.id);

      res.status(200).json({
        entries,
      });
    } catch (error) {
      console.error("Get user entries error:", error);

      res.status(500).json({
        error: "ENTRIES_LOAD_FAILED",
        message: "Your numbers could not be loaded.",
      });
    }
  },
);

router.post(
  "/reserve",
  requireTelegramAuth,
  async (req, res) => {
    try {
      if (!req.user) {
        res.status(401).json({
          error: "AUTHENTICATION_REQUIRED",
          message: "Authentication is required.",
        });
        return;
      }

      const drawId =
        typeof req.body?.drawId === "string"
          ? req.body.drawId.trim()
          : "";

      const number = getNumber(req.body?.number);

      if (!drawId) {
        res.status(400).json({
          error: "INVALID_DRAW_ID",
          message: "Draw ID is required.",
        });
        return;
      }

      if (number === null) {
        res.status(400).json({
          error: "INVALID_NUMBER",
          message: "A valid number is required.",
        });
        return;
      }

      /*
       * Reservation time is intentionally not accepted
       * from the client. The server always uses 30 minutes.
       */
      const entry = await reserveNumber(
        drawId,
        req.user.id,
        number,
      );

      res.status(201).json({
        entry,
        reservationMinutes: RESERVATION_MINUTES,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "ENTRY_RESERVATION_FAILED";

      const clientErrors = new Set([
        "DRAW_NOT_FOUND",
        "NUMBER_OUT_OF_RANGE",
        "DRAW_NOT_OPEN",
        "DRAW_NOT_STARTED",
        "DRAW_DEADLINE_PASSED",
        "NUMBER_UNAVAILABLE",
        "INVALID_DRAW_ID",
        "INVALID_USER_ID",
        "INVALID_NUMBER",
      ]);

      if (clientErrors.has(message)) {
        res.status(400).json({
          error: message,
          message: "The number could not be reserved.",
        });
        return;
      }

      console.error("Reserve number error:", error);

      res.status(500).json({
        error: "ENTRY_RESERVATION_FAILED",
        message: "The number could not be reserved.",
      });
    }
  },
);

router.get(
  "/:entryId",
  requireTelegramAuth,
  async (req, res) => {
    try {
      if (!req.user) {
        res.status(401).json({
          error: "AUTHENTICATION_REQUIRED",
          message: "Authentication is required.",
        });
        return;
      }

      const rawEntryId = req.params.entryId;
      const entryId = Array.isArray(rawEntryId)
        ? rawEntryId[0]?.trim() ?? ""
        : rawEntryId.trim();

      if (!entryId) {
        res.status(400).json({
          error: "INVALID_ENTRY_ID",
          message: "Entry ID is required.",
        });
        return;
      }

      const entry = await getEntryById(entryId);

      if (!entry) {
        res.status(404).json({
          error: "ENTRY_NOT_FOUND",
          message: "The requested entry does not exist.",
        });
        return;
      }

      if (entry.userId !== req.user.id) {
        res.status(403).json({
          error: "ENTRY_ACCESS_DENIED",
          message: "You cannot access this entry.",
        });
        return;
      }

      res.status(200).json({
        entry,
      });
    } catch (error) {
      console.error("Get entry error:", error);

      res.status(500).json({
        error: "ENTRY_LOAD_FAILED",
        message: "The entry could not be loaded.",
      });
    }
  },
);

export default router;
