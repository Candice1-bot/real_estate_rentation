import express from "express";
import { describe, it } from "@jest/globals";
import jwt from "jsonwebtoken";
import request from "supertest";
import { authMiddleware } from "../../../middleware/authMiddleware";

const app = express();

// create a tiny test app specially for authMiddleware
app.get("/protected", authMiddleware(["tenant"]), (req, res) => {
  res.status(200).json({
    message: "Protected route reached",
    user: req.user,
  });
});

describe("authMiddleware integration", () => {
  it("allows a tenant to reach a protected route", async () => {
    const token = jwt.sign(
      { sub: "tenant-123", "custom:role": "tenant" },
      "test-secret",
    );

    await request(app)
      .get("/protected")
      .set("Authorization", `Bearer ${token}`)
      .expect(200)
      .expect({
        message: "Protected route reached",
        user: { id: "tenant-123", role: "tenant" },
      });
  });
});
