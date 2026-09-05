import { NextFunction, Request, Response } from "express";
import { describe, expect, it, jest } from "@jest/globals";
import jwt from "jsonwebtoken";
import { authMiddleware } from "../../middleware/authMiddleware";

const createResponse = () => {
  const res = {} as Response;
  res.status = jest.fn<Response["status"]>().mockReturnValue(res);
  res.json = jest.fn<Response["json"]>().mockReturnValue(res);
  return res;
};

const createRequest = (authorization?: string) =>
  ({
    headers: authorization ? { authorization } : {},
  }) as Request;

describe("authMiddleware", () => {
  it("returns 401 when the authorization header is missing", () => {
    const req = createRequest();
    const res = createResponse();
    const next: NextFunction = jest.fn();

    authMiddleware(["tenant"])(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ message: "Unauthorized" });
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 400 when the token cannot be decoded", () => {
    const req = createRequest("Bearer invalid-token");
    const res = createResponse();
    const next: NextFunction = jest.fn();

    authMiddleware(["tenant"])(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: "Invalid token" });
    expect(next).not.toHaveBeenCalled();
  });

  it("sets req.user and calls next when the user role is allowed", () => {
    const token = jwt.sign(
      { sub: "user-123", "custom:role": "tenant" },
      "test-secret",
    );
    const req = createRequest(`Bearer ${token}`);
    const res = createResponse();
    const next: NextFunction = jest.fn();

    authMiddleware(["tenant"])(req, res, next);

    expect(req.user).toEqual({ id: "user-123", role: "tenant" });
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("returns 403 when the user role is not allowed", () => {
    const token = jwt.sign(
      { sub: "manager-123", "custom:role": "manager" },
      "test-secret",
    );
    const req = createRequest(`Bearer ${token}`);
    const res = createResponse();
    const next: NextFunction = jest.fn();

    authMiddleware(["tenant"])(req, res, next);

    expect(req.user).toEqual({ id: "manager-123", role: "manager" });
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ message: "Access Denied" });
    expect(next).not.toHaveBeenCalled();
  });
});
