import { Router } from "express";

import {
  getDrawById,
  getDrawPrizes,
  getOpenDraws,
} from "../services/draws.js";

const router = Router();

router.get("/", async (_req, res) => {
  try {
    const draws = await getOpenDraws();

    res.status(200).json({
      draws,
    });
  } catch (error) {
    console.error("Get open draws error:", error);

    res.status(500).json({
      error: "DRAW_LIST_FAILED",
      message: "Draws could not be loaded.",
    });
  }
});

router.get("/:drawId", async (req, res) => {
  try {
    const drawId = req.params.drawId?.trim();

    if (!drawId) {
      res.status(400).json({
        error: "INVALID_DRAW_ID",
        message: "Draw ID is required.",
      });
      return;
    }

    const draw = await getDrawById(drawId);

    if (!draw) {
      res.status(404).json({
        error: "DRAW_NOT_FOUND",
        message: "The requested draw does not exist.",
      });
      return;
    }

    const prizes = await getDrawPrizes(drawId);

    res.status(200).json({
      draw,
      prizes,
    });
  } catch (error) {
    console.error("Get draw error:", error);

    res.status(500).json({
      error: "DRAW_LOAD_FAILED",
      message: "The draw could not be loaded.",
    });
  }
});

export default router;
