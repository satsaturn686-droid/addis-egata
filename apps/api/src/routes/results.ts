import { Router } from "express";
import {
  getCurrentLiveDrawState,
  getLiveDrawState,
  getPublicDrawResult,
  getPublishedResults,
} from "../services/results.js";

const router = Router();

router.get("/results", async (_req, res) => {
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

/**
 * Returns the currently running live draw.
 *
 * This route is intentionally declared before
 * /:drawId so the literal "live" path is never
 * interpreted as a draw ID.
 */
router.get(
  "/results/live",
  async (_req, res) => {
    try {
      const live =
        await getCurrentLiveDrawState();

      res.status(200).json({
        live,
      });
    } catch (error) {
      console.error(
        "Get current live draw error:",
        error,
      );

      res.status(500).json({
        error:
          "LIVE_DRAW_LOAD_FAILED",
        message:
          "The current live draw could not be loaded.",
      });
    }
  },
);

router.get(
  "/results/live/:drawId",
  async (req, res) => {
    try {
      const drawId =
        req.params.drawId?.trim();

      if (!drawId) {
        res.status(400).json({
          error:
            "INVALID_DRAW_ID",
          message:
            "A draw ID is required.",
        });
        return;
      }

      const live =
        await getLiveDrawState(
          drawId,
        );

      if (!live) {
        res.status(404).json({
          error:
            "LIVE_DRAW_NOT_FOUND",
          message:
            "The requested live draw could not be found.",
        });
        return;
      }

      res.status(200).json({
        live,
      });
    } catch (error) {
      console.error(
        "Get live draw state error:",
        error,
      );

      if (
        error instanceof Error &&
        error.message ===
          "INVALID_DRAW_ID"
      ) {
        res.status(400).json({
          error:
            "INVALID_DRAW_ID",
          message:
            "The draw ID is invalid.",
        });
        return;
      }

      res.status(500).json({
        error:
          "LIVE_DRAW_LOAD_FAILED",
        message:
          "The live draw could not be loaded.",
      });
    }
  },
);

router.get(
  "/results/:drawId",
  async (req, res) => {
    try {
      const drawId =
        req.params.drawId?.trim();

      if (!drawId) {
        res.status(400).json({
          error:
            "INVALID_DRAW_ID",
          message:
            "A draw ID is required.",
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
            "The requested published result could not be found.",
        });
        return;
      }

      res.status(200).json({
        result,
      });
    } catch (error) {
      console.error(
        "Get public draw result error:",
        error,
      );

      if (
        error instanceof Error &&
        error.message ===
          "INVALID_DRAW_ID"
      ) {
        res.status(400).json({
          error:
            "INVALID_DRAW_ID",
          message:
            "The draw ID is invalid.",
        });
        return;
      }

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
