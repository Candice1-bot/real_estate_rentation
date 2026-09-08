import type { Request, Response } from "express";
import {
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

type Controller = (req: Request, res: Response) => Promise<void>;

const tenantFindUnique = jest.fn<(args: any) => Promise<any>>();
const tenantCreate = jest.fn<(args: any) => Promise<any>>();
const tenantUpdate = jest.fn<(args: any) => Promise<any>>();
const propertyFindMany = jest.fn<(args: any) => Promise<any>>();
const queryRaw = jest.fn<(...args: any[]) => Promise<any>>();
const wktToGeoJSON = jest.fn<(wkt: string) => { coordinates: number[] }>();

const prismaMock = {
  $queryRaw: queryRaw,
  tenant: {
    findUnique: tenantFindUnique,
    create: tenantCreate,
    update: tenantUpdate,
  },
  property: {
    findMany: propertyFindMany,
  },
};

const PrismaClient = jest.fn(() => prismaMock);

jest.unstable_mockModule("@prisma/client", () => ({
  PrismaClient,
}));

jest.unstable_mockModule("@terraformer/wkt", () => ({
  wktToGeoJSON,
}));

let getTenant: Controller;
let createTenant: Controller;
let updateTenant: Controller;
let getCurrentResidence: Controller;
let addFavoriteProperty: Controller;
let removeFavoriteProperty: Controller;

const createResponse = () => {
  const res = {} as Response;
  res.status = jest.fn<Response["status"]>().mockReturnValue(res);
  res.json = jest.fn<Response["json"]>().mockReturnValue(res);
  return res;
};

const createRequest = ({
  body = {},
  params = {},
}: {
  body?: Record<string, unknown>;
  params?: Record<string, string>;
} = {}) =>
  ({
    body,
    params,
  }) as Request;

const tenantBody = () => ({
  cognitoId: "tenant-123",
  name: "Test Tenant",
  email: "tenant@example.com",
  phoneNumber: "555-1234",
});

beforeAll(async () => {
  const controller = await import("../../../controllers/tenantController.js");
  getTenant = controller.getTenant;
  createTenant = controller.createTenant;
  updateTenant = controller.updateTenant;
  getCurrentResidence = controller.getCurrentResidence;
  addFavoriteProperty = controller.addFavoriteProperty;
  removeFavoriteProperty = controller.removeFavoriteProperty;
});

describe("tenantController", () => {
  beforeEach(() => {
    tenantFindUnique.mockReset();
    tenantCreate.mockReset();
    tenantUpdate.mockReset();
    propertyFindMany.mockReset();
    queryRaw.mockReset();
    wktToGeoJSON.mockReset();
  });

  it("getTenant returns the matching tenant with favorites", async () => {
    const tenant = {
      ...tenantBody(),
      favorites: [{ id: 10, name: "Favorite Property" }],
    };
    tenantFindUnique.mockResolvedValue(tenant);
    const req = createRequest({ params: { cognitoId: tenant.cognitoId } });
    const res = createResponse();

    await getTenant(req, res);

    expect(tenantFindUnique).toHaveBeenCalledWith({
      where: { cognitoId: tenant.cognitoId },
      include: { favorites: true },
    });
    expect(res.json).toHaveBeenCalledWith(tenant);
    expect(res.status).not.toHaveBeenCalled();
  });

  it("getTenant returns 404 when the tenant is missing", async () => {
    tenantFindUnique.mockResolvedValue(null);
    const req = createRequest({ params: { cognitoId: "missing-tenant" } });
    const res = createResponse();

    await getTenant(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ message: "Tenant not found" });
  });

  it("getTenant returns 500 when the lookup fails", async () => {
    tenantFindUnique.mockRejectedValue(new Error("Database error"));
    const req = createRequest({ params: { cognitoId: "tenant-123" } });
    const res = createResponse();

    await getTenant(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      message: "Error retrieving tenant: Database error",
    });
  });

  it("createTenant creates a tenant", async () => {
    const tenant = tenantBody();
    tenantCreate.mockResolvedValue(tenant);
    const req = createRequest({ body: tenant });
    const res = createResponse();

    await createTenant(req, res);

    expect(tenantCreate).toHaveBeenCalledWith({
      data: tenant,
    });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(tenant);
  });

  it("createTenant returns 500 when creation fails", async () => {
    tenantCreate.mockRejectedValue(new Error("Create failed"));
    const req = createRequest({ body: tenantBody() });
    const res = createResponse();

    await createTenant(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      message: "Error creating tenant: Create failed",
    });
  });

  it("updateTenant updates a tenant by cognito id", async () => {
    const updatedTenant = {
      ...tenantBody(),
      name: "Updated Tenant",
      email: "updated-tenant@example.com",
    };
    tenantUpdate.mockResolvedValue(updatedTenant);
    const req = createRequest({
      params: { cognitoId: "tenant-123" },
      body: {
        name: updatedTenant.name,
        email: updatedTenant.email,
        phoneNumber: updatedTenant.phoneNumber,
      },
    });
    const res = createResponse();

    await updateTenant(req, res);

    expect(tenantUpdate).toHaveBeenCalledWith({
      where: { cognitoId: "tenant-123" },
      data: {
        name: updatedTenant.name,
        email: updatedTenant.email,
        phoneNumber: updatedTenant.phoneNumber,
      },
    });
    expect(res.json).toHaveBeenCalledWith(updatedTenant);
  });

  it("updateTenant returns 500 when update fails", async () => {
    tenantUpdate.mockRejectedValue(new Error("Update failed"));
    const req = createRequest({
      params: { cognitoId: "tenant-123" },
      body: tenantBody(),
    });
    const res = createResponse();

    await updateTenant(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      message: "Error updating tenant: Update failed",
    });
  });

  it("getCurrentResidence returns residences with formatted coordinates", async () => {
    const property = {
      id: 10,
      name: "Test Property",
      location: {
        id: 99,
        address: "123 Test Ave",
      },
    };
    propertyFindMany.mockResolvedValue([property]);
    queryRaw.mockResolvedValue([
      { coordinates: "POINT(-73.935242 40.730610)" },
    ]);
    wktToGeoJSON.mockReturnValue({
      coordinates: [-73.935242, 40.73061],
    });
    const req = createRequest({ params: { cognitoId: "tenant-123" } });
    const res = createResponse();

    await getCurrentResidence(req, res);

    expect(propertyFindMany).toHaveBeenCalledWith({
      where: { tenants: { some: { cognitoId: "tenant-123" } } },
      include: { location: true },
    });
    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(wktToGeoJSON).toHaveBeenCalledWith(
      "POINT(-73.935242 40.730610)",
    );
    expect(res.json).toHaveBeenCalledWith([
      expect.objectContaining({
        id: property.id,
        location: expect.objectContaining({
          id: property.location.id,
          coordinates: {
            longitude: -73.935242,
            latitude: 40.73061,
          },
        }),
      }),
    ]);
  });

  it("getCurrentResidence returns 500 when coordinates are missing", async () => {
    const property = {
      id: 10,
      name: "Test Property",
      location: {
        id: 99,
        address: "123 Test Ave",
      },
    };
    propertyFindMany.mockResolvedValue([property]);
    queryRaw.mockResolvedValue([]);
    wktToGeoJSON.mockImplementation(() => {
      throw new Error("Coordinates missing");
    });
    const req = createRequest({ params: { cognitoId: "tenant-123" } });
    const res = createResponse();

    await getCurrentResidence(req, res);

    expect(wktToGeoJSON).toHaveBeenCalledWith("");
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      message: "Error retrieving current residences: Coordinates missing",
    });
  });

  it("getCurrentResidence returns 500 when retrieving properties fails", async () => {
    propertyFindMany.mockRejectedValue(new Error("Database error"));
    const req = createRequest({ params: { cognitoId: "tenant-123" } });
    const res = createResponse();

    await getCurrentResidence(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      message: "Error retrieving current residences: Database error",
    });
  });

  it("addFavoriteProperty connects a new favorite property", async () => {
    const updatedTenant = {
      ...tenantBody(),
      favorites: [{ id: 10, name: "Favorite Property" }],
    };
    tenantFindUnique.mockResolvedValue({
      ...tenantBody(),
      favorites: [],
    });
    tenantUpdate.mockResolvedValue(updatedTenant);
    const req = createRequest({
      params: { cognitoId: "tenant-123", propertyId: "10" },
    });
    const res = createResponse();

    await addFavoriteProperty(req, res);

    expect(tenantFindUnique).toHaveBeenCalledWith({
      where: { cognitoId: "tenant-123" },
      include: { favorites: true },
    });
    expect(tenantUpdate).toHaveBeenCalledWith({
      where: { cognitoId: "tenant-123" },
      data: {
        favorites: {
          connect: { id: 10 },
        },
      },
      include: { favorites: true },
    });
    expect(res.json).toHaveBeenCalledWith(updatedTenant);
  });

  it("addFavoriteProperty handles tenants without favorites as empty", async () => {
    const updatedTenant = {
      ...tenantBody(),
      favorites: [{ id: 10, name: "Favorite Property" }],
    };
    tenantFindUnique.mockResolvedValue(null);
    tenantUpdate.mockResolvedValue(updatedTenant);
    const req = createRequest({
      params: { cognitoId: "tenant-123", propertyId: "10" },
    });
    const res = createResponse();

    await addFavoriteProperty(req, res);

    expect(tenantUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          favorites: {
            connect: { id: 10 },
          },
        },
      }),
    );
    expect(res.json).toHaveBeenCalledWith(updatedTenant);
  });

  it("addFavoriteProperty returns 409 when the favorite already exists", async () => {
    tenantFindUnique.mockResolvedValue({
      ...tenantBody(),
      favorites: [{ id: 10, name: "Favorite Property" }],
    });
    const req = createRequest({
      params: { cognitoId: "tenant-123", propertyId: "10" },
    });
    const res = createResponse();

    await addFavoriteProperty(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      message: "Property already added as favorite",
    });
    expect(tenantUpdate).not.toHaveBeenCalled();
  });

  it("addFavoriteProperty returns 500 when adding a favorite fails", async () => {
    tenantFindUnique.mockRejectedValue(new Error("Database error"));
    const req = createRequest({
      params: { cognitoId: "tenant-123", propertyId: "10" },
    });
    const res = createResponse();

    await addFavoriteProperty(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      message: "Error adding favorite property: Database error",
    });
  });

  it("removeFavoriteProperty disconnects a favorite property", async () => {
    const updatedTenant = {
      ...tenantBody(),
      favorites: [],
    };
    tenantUpdate.mockResolvedValue(updatedTenant);
    const req = createRequest({
      params: { cognitoId: "tenant-123", propertyId: "10" },
    });
    const res = createResponse();

    await removeFavoriteProperty(req, res);

    expect(tenantUpdate).toHaveBeenCalledWith({
      where: { cognitoId: "tenant-123" },
      data: {
        favorites: {
          disconnect: { id: 10 },
        },
      },
      include: { favorites: true },
    });
    expect(res.json).toHaveBeenCalledWith(updatedTenant);
  });

  it("removeFavoriteProperty returns 500 when removing a favorite fails", async () => {
    tenantUpdate.mockRejectedValue(new Error("Database error"));
    const req = createRequest({
      params: { cognitoId: "tenant-123", propertyId: "10" },
    });
    const res = createResponse();

    await removeFavoriteProperty(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      message: "Error removing favorite property: Database error",
    });
  });
});
