import { Router } from "express";

import {
  getLiveDrawState,
  getPublishedResults,
  getPublicDrawResult,
} from "../services/results.js";

const router = Router();

/*
 * የተጠናቀቁ የዕጣ ውጤቶች
 *
 * GET /results
 */
router.get("/", async (_req, res) => {
  try {
    const results =
      await getPublishedResults();

    res.status(200).json({
      results,
    });
  } catch (error) {
    console.error(
      "Get published results error:",
      error,
    );

    res.status(500).json({
      error:
        "RESULTS_LOAD_FAILED",
      message:
        "Published results could not be loaded.",
    });
  }
});

/*
 * Live Draw
 *
 * GET /results/live/:drawId
 *
 * executed_at ላይ ተመስርቶ ሰርቨሩ
 * የአሸናፊ መግለጫውን ይቆጣጠራል።
 * ስለዚህ ሁሉም ተመልካቾች
 * ተመሳሳይ ሁኔታ ያያሉ።
 */
router.get(
  "/live/:drawId",
  async (req, res) => {
    try {
      const drawId =
        req.params.drawId?.trim();

      if (!drawId) {
        res.status(400).json({
          error:
            "INVALID_DRAW_ID",
          message:
            "Draw ID is required.",
        });
        return;
      }

      const state =
        await getLiveDrawState(
          drawId,
        );

      if (!state) {
        res.status(404).json({
          error:
            "LIVE_DRAW_NOT_FOUND",
          message:
            "The requested live draw does not exist.",
        });
        return;
      }

      /*
       * Frontend LiveDraw API contract:
       * { live: state }
       */
      res.status(200).json({
        live: state,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "LIVE_DRAW_LOAD_FAILED";

      if (
        message ===
        "INVALID_DRAW_ID"
      ) {
        res.status(400).json({
          error: message,
          message:
            "Draw ID is required.",
        });
        return;
      }

      console.error(
        "Get live draw state error:",
        error,
      );

      res.status(500).json({
        error:
          "LIVE_DRAW_LOAD_FAILED",
        message:
          "The live draw could not be loaded.",
      });
    }
  },
);

/*
 * የአንድ ዕጣ የተጠናቀቀ ውጤት
 *
 * GET /results/:drawId
 */
router.get(
  "/:drawId",
  async (req, res) => {
    try {
      const drawId =
        req.params.drawId?.trim();

      if (!drawId) {
        res.status(400).json({
          error:
            "INVALID_DRAW_ID",
          message:
            "Draw ID is required.",
        });
        return;
      }

      const result =
        await getPublicDrawResult(
          drawId,
        );

      if (!result) {
        res.status(404).json({
          error:
            "RESULT_NOT_FOUND",
          message:
            "The requested draw result does not exist.",
        });
        return;
      }

      res.status(200).json({
        result,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "RESULT_LOAD_FAILED";

      if (
        message ===
        "INVALID_DRAW_ID"
      ) {
        res.status(400).json({
          error: message,
          message:
            "Draw ID is required.",
        });
        return;
      }

      console.error(
        "Get public draw result error:",
        error,
      );

      res.status(500).json({
        error:
          "RESULT_LOAD_FAILED",
        message:
          "The draw result could not be loaded.",
      });
    }
  },
);

export default router;
