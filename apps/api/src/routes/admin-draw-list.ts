import { Router } from "express";

import {
  requireAdmin,
  requireTelegramAuth,
} from "../middleware/auth.js";

import {
  getAdminDrawList,
} from "../services/admin-draw-list.js";

const router = Router();

router.use(
  requireTelegramAuth,
  requireAdmin,
);

router.get(
  "/",
  async (_req, res) => {
    try {
      const draws =
        await getAdminDrawList();

      res.status(200).json({
        draws,
      });
    } catch (error) {
      console.error(
        "Get admin draw list error:",
        error,
      );

      res.status(500).json({
        error:
          "ADMIN_DRAW_LIST_FAILED",
        message:
          "The draw list could not be loaded.",
      });
    }
  },
);

export default router;
