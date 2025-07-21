import express from "express";

import {
  getTenant,
  createTenant,
  updateTenant,
  getCurrentResidence,
  addFavoriteProperty,
  removeFavoriteProperty,
} from "../controllers/tenantControllers";

const router = express.Router();

router.get("/:cognitoId", getTenant);

router.put("/:cognitoId", updateTenant);
router.post("/", createTenant);

router.get("/:cognitoId/current-residences", getCurrentResidence);
router.post("/:cognitoId/favorites/:propertyId", addFavoriteProperty);
router.delete("/:cognitoId/favorites/:propertyId", removeFavoriteProperty);

export default router;
