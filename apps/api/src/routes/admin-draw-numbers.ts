import { Router } from "express";

import {
  getAdminDrawNumbers,
} from "../services/admin-draw-numbers.js";

const router = Router();

router.get(
  "/:drawId/numbers",
  async (req, res) => {
    try {
      const drawId =
        typeof req.params.drawId === "string"
          ? req.params.drawId.trim()
          : "";

      if (!drawId) {
        res.status(400).json({
          error: "INVALID_DRAW_ID",
          message:
            "Draw ID is required.",
        });

        return;
      }

      const result =
        await getAdminDrawNumbers(
          drawId,
        );

      res.status(200).json(result);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message ===
          "DRAW_NOT_FOUND"
      ) {
        res.status(404).json({
          error: "DRAW_NOT_FOUND",
          message:
            "The requested draw was not found.",
        });

        return;
      }

      if (
        error instanceof Error &&
        error.message ===
          "INVALID_DRAW_ID"
      ) {
        res.status(400).json({
          error: "INVALID_DRAW_ID",
          message:
            "Draw ID is required.",
        });

        return;
      }

      console.error(
        "Failed to load admin draw numbers:",
        error,
      );

      res.status(500).json({
        error:
          "ADMIN_DRAW_NUMBERS_FAILED",
        message:
          "የቁጥሮችን ዝርዝር መጫን አልተቻለም።",
      });
    }
  },
);

export default router;
