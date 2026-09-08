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

const managerFindUnique = jest.fn<(args: any) => Promise<any>>();
const managerCreate = jest.fn<(args: any) => Promise<any>>();
const managerUpdate = jest.fn<(args: any) => Promise<any>>();
const propertyFindMany = jest.fn<(args: any) => Promise<any>>();
const queryRaw = jest.fn<(...args: any[]) => Promise<any>>();
const wktToGeoJSON = jest.fn<(wkt: string) => { coordinates: number[] }>();

const prismaMock = {
  $queryRaw: queryRaw,
  manager: {
    findUnique: managerFindUnique,
    create: managerCreate,
    update: managerUpdate,
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

let getManager: Controller;
let createManager: Controller;
let updateManager: Controller;
let getManagerProperties: Controller;

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

const managerBody = () => ({
  cognitoId: "manager-123",
  name: "Test Manager",
  email: "manager@example.com",
  phoneNumber: "555-0000",
});

beforeAll(async () => {
  const controller = await import("../../../controllers/managerController.js");
  getManager = controller.getManager;
  createManager = controller.createManager;
  updateManager = controller.updateManager;
  getManagerProperties = controller.getManagerProperties;
});

describe("managerController", () => {
  beforeEach(() => {
    managerFindUnique.mockReset();
    managerCreate.mockReset();
    managerUpdate.mockReset();
    propertyFindMany.mockReset();
    queryRaw.mockReset();
    wktToGeoJSON.mockReset();
  });

  it("getManager returns the matching manager", async () => {
    const manager = managerBody();
    managerFindUnique.mockResolvedValue(manager);
    const req = createRequest({ params: { cognitoId: manager.cognitoId } });
    const res = createResponse();

    await getManager(req, res);

    expect(managerFindUnique).toHaveBeenCalledWith({
      where: { cognitoId: manager.cognitoId },
    });
    expect(res.json).toHaveBeenCalledWith(manager);
    expect(res.status).not.toHaveBeenCalled();
  });

  it("getManager returns 404 when the manager is missing", async () => {
    managerFindUnique.mockResolvedValue(null);
    const req = createRequest({ params: { cognitoId: "missing-manager" } });
    const res = createResponse();

    await getManager(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ message: "Manager not found" });
  });

  it("getManager returns 500 when the lookup fails", async () => {
    managerFindUnique.mockRejectedValue(new Error("Database error"));
    const req = createRequest({ params: { cognitoId: "manager-123" } });
    const res = createResponse();

    await getManager(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      message: "Error retrieving manager: Database error",
    });
  });

  it("createManager creates a manager", async () => {
    const manager = managerBody();
    managerCreate.mockResolvedValue(manager);
    const req = createRequest({ body: manager });
    const res = createResponse();

    await createManager(req, res);

    expect(managerCreate).toHaveBeenCalledWith({
      data: manager,
    });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(manager);
  });

  it("createManager returns 500 when creation fails", async () => {
    managerCreate.mockRejectedValue(new Error("Create failed"));
    const req = createRequest({ body: managerBody() });
    const res = createResponse();

    await createManager(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      message: "Error creating manager: Create failed",
    });
  });

  it("updateManager updates a manager by cognito id", async () => {
    const updatedManager = {
      ...managerBody(),
      name: "Updated Manager",
      email: "updated-manager@example.com",
    };
    managerUpdate.mockResolvedValue(updatedManager);
    const req = createRequest({
      params: { cognitoId: "manager-123" },
      body: {
        name: updatedManager.name,
        email: updatedManager.email,
        phoneNumber: updatedManager.phoneNumber,
      },
    });
    const res = createResponse();

    await updateManager(req, res);

    expect(managerUpdate).toHaveBeenCalledWith({
      where: { cognitoId: "manager-123" },
      data: {
        name: updatedManager.name,
        email: updatedManager.email,
        phoneNumber: updatedManager.phoneNumber,
      },
    });
    expect(res.json).toHaveBeenCalledWith(updatedManager);
  });

  it("updateManager returns 500 when update fails", async () => {
    managerUpdate.mockRejectedValue(new Error("Update failed"));
    const req = createRequest({
      params: { cognitoId: "manager-123" },
      body: managerBody(),
    });
    const res = createResponse();

    await updateManager(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      message: "Error updating manager: Update failed",
    });
  });

  it("getManagerProperties returns properties with formatted coordinates", async () => {
    const property = {
      id: 10,
      name: "Test Property",
      managerCognitoId: "manager-123",
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
    const req = createRequest({ params: { cognitoId: "manager-123" } });
    const res = createResponse();

    await getManagerProperties(req, res);

    expect(propertyFindMany).toHaveBeenCalledWith({
      where: { managerCognitoId: "manager-123" },
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

  it("getManagerProperties returns 500 when coordinates are missing", async () => {
    const property = {
      id: 10,
      name: "Test Property",
      managerCognitoId: "manager-123",
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
    const req = createRequest({ params: { cognitoId: "manager-123" } });
    const res = createResponse();

    await getManagerProperties(req, res);

    expect(wktToGeoJSON).toHaveBeenCalledWith("");
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      message: "Error retrieving manager property: Coordinates missing",
    });
  });

  it("getManagerProperties returns 500 when retrieving properties fails", async () => {
    propertyFindMany.mockRejectedValue(new Error("Database error"));
    const req = createRequest({ params: { cognitoId: "manager-123" } });
    const res = createResponse();

    await getManagerProperties(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      message: "Error retrieving manager property: Database error",
    });
  });
});
