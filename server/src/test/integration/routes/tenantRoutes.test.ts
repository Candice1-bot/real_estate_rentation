import express from "express";
import type { Express, Request, Response } from "express";
import {
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import request from "supertest";

const mockGetTenant = jest.fn((req: Request, res: Response) => {
  res.status(200).json({
    controller: "getTenant",
    cognitoId: req.params.cognitoId,
  });
});

const mockCreateTenant = jest.fn((req: Request, res: Response) => {
  res.status(201).json({
    controller: "createTenant",
    body: req.body,
  });
});

const mockUpdateTenant = jest.fn((req: Request, res: Response) => {
  res.status(200).json({
    controller: "updateTenant",
    cognitoId: req.params.cognitoId,
    body: req.body,
  });
});

const mockGetCurrentResidence = jest.fn((req: Request, res: Response) => {
  res.status(200).json({
    controller: "getCurrentResidence",
    cognitoId: req.params.cognitoId,
  });
});

const mockAddFavoriteProperty = jest.fn((req: Request, res: Response) => {
  res.status(200).json({
    controller: "addFavoriteProperty",
    cognitoId: req.params.cognitoId,
    propertyId: req.params.propertyId,
  });
});

const mockRemoveFavoriteProperty = jest.fn((req: Request, res: Response) => {
  res.status(200).json({
    controller: "removeFavoriteProperty",
    cognitoId: req.params.cognitoId,
    propertyId: req.params.propertyId,
  });
});

jest.unstable_mockModule("../../../controllers/tenantControllers", () => ({
  getTenant: mockGetTenant,
  createTenant: mockCreateTenant,
  updateTenant: mockUpdateTenant,
  getCurrentResidence: mockGetCurrentResidence,
  addFavoriteProperty: mockAddFavoriteProperty,
  removeFavoriteProperty: mockRemoveFavoriteProperty,
}));

let app: Express;

beforeAll(async () => {
  const tenantRoutes = (await import("../../../routes/tenantRoutes.js"))
    .default;

  app = express();

  app.use(express.json());

  app.use("/tenants", tenantRoutes);
});

describe("tenantRoutes integration", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("routes GET /tenants/:cognitoId to getTenant", async () => {
    await request(app).get("/tenants/tenant-123").expect(200).expect({
      controller: "getTenant",
      cognitoId: "tenant-123",
    });

    expect(mockGetTenant).toHaveBeenCalledTimes(1);
  });

  it("routes POST /tenants to createTenant", async () => {
    const newTenant = {
      cognitoId: "tenant-123",
      name: "Test Tenant",
      email: "tenant@example.com",
      phoneNumber: "555-1234",
    };

    await request(app).post("/tenants").send(newTenant).expect(201).expect({
      controller: "createTenant",
      body: newTenant,
    });

    expect(mockCreateTenant).toHaveBeenCalledTimes(1);
  });

  it("routes PUT /tenants/:cognitoId to updateTenant", async () => {
    const updates = {
      name: "Updated Tenant",
      email: "updated@example.com",
      phoneNumber: "555-9999",
    };

    await request(app)
      .put("/tenants/tenant-123")
      .send(updates)
      .expect(200)
      .expect({
        controller: "updateTenant",
        cognitoId: "tenant-123",
        body: updates,
      });

    expect(mockUpdateTenant).toHaveBeenCalledTimes(1);
  });

  it("routes GET /tenants/:cognitoId/current-residences to getCurrentResidence", async () => {
    await request(app)
      .get("/tenants/tenant-123/current-residences")
      .expect(200)
      .expect({
        controller: "getCurrentResidence",
        cognitoId: "tenant-123",
      });

    expect(mockGetCurrentResidence).toHaveBeenCalledTimes(1);
  });

  it("routes POST /tenants/:cognitoId/favorites/:propertyId to addFavoriteProperty", async () => {
    await request(app)
      .post("/tenants/tenant-123/favorites/42")
      .expect(200)
      .expect({
        controller: "addFavoriteProperty",
        cognitoId: "tenant-123",
        propertyId: "42",
      });

    expect(mockAddFavoriteProperty).toHaveBeenCalledTimes(1);
  });

  it("routes DELETE /tenants/:cognitoId/favorites/:propertyId to removeFavoriteProperty", async () => {
    await request(app)
      .delete("/tenants/tenant-123/favorites/42")
      .expect(200)
      .expect({
        controller: "removeFavoriteProperty",
        cognitoId: "tenant-123",
        propertyId: "42",
      });

    expect(mockRemoveFavoriteProperty).toHaveBeenCalledTimes(1);
  });
});
