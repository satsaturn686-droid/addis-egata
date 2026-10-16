import { Router } from "express";

import {
  requireAdmin,
  requireTelegramAuth,
} from "../middleware/auth.js";

import {
  deleteAdminDraw,
} from "../services/admin-draw-delete.js";

const router = Router();

router.use(
  requireTelegramAuth,
  requireAdmin,
);

/*
 * DELETE /admin/draw-delete/:drawId
 *
 * Only non-executed draws may be deleted.
 *
 * The service performs the deletion inside
 * one database transaction and preserves
 * an audit record.
 */
router.delete(
  "/:drawId",
  async (req, res) => {
    try {
      if (!req.user) {
        res.status(401).json({
          error:
            "AUTHENTICATION_REQUIRED",
          message:
            "Authentication is required.",
        });
        return;
      }

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

      await deleteAdminDraw(
        req.user.id,
        drawId,
      );

      res.status(200).json({
        ok: true,
        message:
          "The draw was deleted successfully.",
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "DRAW_DELETE_FAILED";

      const clientErrors =
        new Set([
          "INVALID_ADMIN_USER_ID",
          "INVALID_DRAW_ID",
          "DRAW_NOT_FOUND",
          "DRAW_NOT_DELETABLE",
        ]);

      if (clientErrors.has(message)) {
        res.status(400).json({
          error: message,
          message:
            message ===
            "DRAW_NOT_DELETABLE"
              ? "This draw cannot be deleted because it has already started or has an official result."
              : "The draw could not be deleted.",
        });
        return;
      }

      console.error(
        "Delete draw error:",
        error,
      );

      res.status(500).json({
        error:
          "DRAW_DELETE_FAILED",
        message:
          "The draw could not be deleted.",
      });
    }
  },
);

export default router;
