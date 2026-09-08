import type { Request, Response } from "express";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

type Controller = (req: Request, res: Response) => Promise<void>;

const applicationFindMany = jest.fn<(args: any) => Promise<any>>();
const applicationFindUnique = jest.fn<(args: any) => Promise<any>>();
const applicationCreate = jest.fn<(args: any) => Promise<any>>();
const applicationUpdate = jest.fn<(args: any) => Promise<any>>();
const leaseFindFirst = jest.fn<(args: any) => Promise<any>>();
const leaseCreate = jest.fn<(args: any) => Promise<any>>();
const propertyFindUnique = jest.fn<(args: any) => Promise<any>>();
const propertyUpdate = jest.fn<(args: any) => Promise<any>>();

const transactionClient = {
  application: {
    create: applicationCreate,
  },
  lease: {
    create: leaseCreate,
  },
};

const transaction = jest.fn<
  (handler: (client: typeof transactionClient) => Promise<any>) => Promise<any>
>();

const prismaMock = {
  $transaction: transaction,
  application: {
    findMany: applicationFindMany,
    findUnique: applicationFindUnique,
    update: applicationUpdate,
  },
  lease: {
    findFirst: leaseFindFirst,
    create: leaseCreate,
  },
  property: {
    findUnique: propertyFindUnique,
    update: propertyUpdate,
  },
};

const PrismaClient = jest.fn(() => prismaMock);

jest.unstable_mockModule("@prisma/client", () => ({
  PrismaClient,
}));

let listApplication: Controller;
let createApplication: Controller;
let updateApplicationStatus: Controller;

const createResponse = () => {
  const res = {} as Response;
  res.status = jest.fn<Response["status"]>().mockReturnValue(res);
  res.json = jest.fn<Response["json"]>().mockReturnValue(res);
  return res;
};

const createRequest = ({
  body = {},
  params = {},
  query = {},
}: {
  body?: Record<string, unknown>;
  params?: Record<string, string>;
  query?: Record<string, string>;
} = {}) =>
  ({
    body,
    params,
    query,
  }) as Request;

const buildApplication = () => ({
  id: 1,
  applicationDate: new Date("2026-01-01T00:00:00.000Z"),
  status: "Pending",
  propertyId: 10,
  tenantCognitoId: "tenant-123",
  name: "Test Tenant",
  email: "tenant@example.com",
  phoneNumber: "555-1234",
  message: "I would like to rent this property.",
  property: {
    id: 10,
    name: "Test Property",
    pricePerMonth: 1800,
    securityDeposit: 1800,
    location: {
      address: "123 Test Ave",
    },
    manager: {
      cognitoId: "manager-123",
      name: "Test Manager",
    },
  },
  tenant: {
    cognitoId: "tenant-123",
    name: "Test Tenant",
  },
});

const applicationBody = () => ({
  applicationDate: "2026-02-01T00:00:00.000Z",
  status: "Pending",
  propertyId: 10,
  tenantCognitoId: "tenant-123",
  name: "Test Tenant",
  email: "tenant@example.com",
  phoneNumber: "555-1234",
  message: "I would like to rent this property.",
});

beforeAll(async () => {
  const controller = await import(
    "../../../controllers/applicationController.js"
  );
  listApplication = controller.listApplication;
  createApplication = controller.createApplication;
  updateApplicationStatus = controller.updateApplicationStatus;
});

describe("applicationController", () => {
  beforeEach(() => {
    applicationFindMany.mockReset();
    applicationFindUnique.mockReset();
    applicationCreate.mockReset();
    applicationUpdate.mockReset();
    leaseFindFirst.mockReset();
    leaseCreate.mockReset();
    propertyFindUnique.mockReset();
    propertyUpdate.mockReset();
    transaction.mockReset();
    transaction.mockImplementation(async (handler) =>
      handler(transactionClient),
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("listApplication filters tenant applications", async () => {
    const application = buildApplication();
    const lease = {
      id: 20,
      startDate: new Date("2099-01-01T00:00:00.000Z"),
      propertyId: application.propertyId,
      tenantCognitoId: application.tenantCognitoId,
    };
    applicationFindMany.mockResolvedValue([application]);
    leaseFindFirst.mockResolvedValue(lease);
    const req = createRequest({
      query: { userId: "tenant-123", userType: "tenant" },
    });
    const res = createResponse();

    await listApplication(req, res);

    expect(applicationFindMany).toHaveBeenCalledWith({
      where: { tenantCognitoId: "tenant-123" },
      include: {
        property: {
          include: {
            location: true,
            manager: true,
          },
        },
        tenant: true,
      },
    });
    expect(leaseFindFirst).toHaveBeenCalledWith({
      where: {
        tenant: { cognitoId: "tenant-123" },
        propertyId: 10,
      },
      orderBy: { startDate: "desc" },
    });
    expect(res.json).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 1,
        property: expect.objectContaining({
          address: "123 Test Ave",
        }),
        manager: application.property.manager,
        lease: expect.objectContaining({
          id: 20,
          nextPaymentDate: new Date("2099-01-01T00:00:00.000Z"),
        }),
      }),
    ]);
  });

  it("listApplication filters manager applications", async () => {
    const application = buildApplication();
    applicationFindMany.mockResolvedValue([application]);
    leaseFindFirst.mockResolvedValue(null);
    const req = createRequest({
      query: { userId: "manager-123", userType: "manager" },
    });
    const res = createResponse();

    await listApplication(req, res);

    expect(applicationFindMany).toHaveBeenCalledWith({
      where: { property: { managerCognitoId: "manager-123" } },
      include: {
        property: {
          include: {
            location: true,
            manager: true,
          },
        },
        tenant: true,
      },
    });
    expect(res.json).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 1,
        property: expect.objectContaining({
          address: "123 Test Ave",
        }),
        manager: application.property.manager,
        lease: null,
      }),
    ]);
  });

  it("listApplication moves past lease start dates to the next payment date", async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-01-15T00:00:00.000Z"));

    const application = buildApplication();
    const lease = {
      id: 20,
      startDate: new Date("2026-01-01T00:00:00.000Z"),
      propertyId: application.propertyId,
      tenantCognitoId: application.tenantCognitoId,
    };
    applicationFindMany.mockResolvedValue([application]);
    leaseFindFirst.mockResolvedValue(lease);
    const req = createRequest();
    const res = createResponse();

    await listApplication(req, res);

    expect(applicationFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {} }),
    );
    expect(res.json).toHaveBeenCalledWith([
      expect.objectContaining({
        lease: expect.objectContaining({
          nextPaymentDate: new Date("2026-02-01T00:00:00.000Z"),
        }),
      }),
    ]);
  });

  it("listApplication returns 500 when retrieving applications fails", async () => {
    applicationFindMany.mockRejectedValue(new Error("Database error"));
    const req = createRequest();
    const res = createResponse();

    await listApplication(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      message: "Error retrieving applications: Database error",
    });
  });

  it("createApplication creates a lease and application in a transaction", async () => {
    const body = applicationBody();
    const property = {
      pricePerMonth: 1800,
      securityDeposit: 1800,
    };
    const lease = { id: 30 };
    const newApplication = {
      id: 40,
      ...body,
      lease,
    };
    propertyFindUnique.mockResolvedValue(property);
    leaseCreate.mockResolvedValue(lease);
    applicationCreate.mockResolvedValue(newApplication);
    const req = createRequest({ body });
    const res = createResponse();

    await createApplication(req, res);

    expect(propertyFindUnique).toHaveBeenCalledWith({
      where: { id: body.propertyId },
      select: { pricePerMonth: true, securityDeposit: true },
    });
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(leaseCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        startDate: expect.any(Date),
        endDate: expect.any(Date),
        rent: property.pricePerMonth,
        deposit: property.securityDeposit,
        property: { connect: { id: body.propertyId } },
        tenant: { connect: { cognitoId: body.tenantCognitoId } },
      }),
    });
    expect(applicationCreate).toHaveBeenCalledWith({
      data: {
        applicationDate: new Date(body.applicationDate),
        status: body.status,
        name: body.name,
        email: body.email,
        phoneNumber: body.phoneNumber,
        message: body.message,
        property: { connect: { id: body.propertyId } },
        tenant: { connect: { cognitoId: body.tenantCognitoId } },
        lease: { connect: { id: lease.id } },
      },
      include: {
        property: true,
        tenant: true,
        lease: true,
      },
    });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(newApplication);
  });

  it("createApplication returns 404 when the property is missing", async () => {
    propertyFindUnique.mockResolvedValue(null);
    const req = createRequest({ body: applicationBody() });
    const res = createResponse();

    await createApplication(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ message: "Property not found" });
    expect(transaction).not.toHaveBeenCalled();
    expect(leaseCreate).not.toHaveBeenCalled();
    expect(applicationCreate).not.toHaveBeenCalled();
  });

  it("createApplication returns 500 when the transaction fails", async () => {
    propertyFindUnique.mockResolvedValue({
      pricePerMonth: 1800,
      securityDeposit: 1800,
    });
    transaction.mockRejectedValue(new Error("Transaction failed"));
    const req = createRequest({ body: applicationBody() });
    const res = createResponse();

    await createApplication(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      message: "Error creating application: Transaction failed",
    });
  });

  it("updateApplicationStatus with Approved creates/connects a lease", async () => {
    const application = buildApplication();
    const newLease = {
      id: 30,
      propertyId: application.propertyId,
      tenantCognitoId: application.tenantCognitoId,
    };
    const updatedApplication = {
      ...application,
      status: "Approved",
      leaseId: newLease.id,
      lease: newLease,
    };
    applicationFindUnique
      .mockResolvedValueOnce(application)
      .mockResolvedValueOnce(updatedApplication);
    leaseCreate.mockResolvedValue(newLease);
    propertyUpdate.mockResolvedValue({});
    applicationUpdate.mockResolvedValue(updatedApplication);
    const req = createRequest({
      params: { id: "1" },
      body: { status: "Approved" },
    });
    const res = createResponse();

    await updateApplicationStatus(req, res);

    expect(leaseCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        startDate: expect.any(Date),
        endDate: expect.any(Date),
        rent: application.property.pricePerMonth,
        deposit: application.property.securityDeposit,
        propertyId: application.propertyId,
        tenantCognitoId: application.tenantCognitoId,
      }),
    });
    expect(propertyUpdate).toHaveBeenCalledWith({
      where: { id: application.propertyId },
      data: {
        tenants: { connect: { cognitoId: application.tenantCognitoId } },
      },
    });
    expect(applicationUpdate).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { status: "Approved", leaseId: newLease.id },
      include: {
        property: true,
        tenant: true,
        lease: true,
      },
    });
    expect(applicationFindUnique).toHaveBeenLastCalledWith({
      where: { id: 1 },
      include: {
        property: true,
        tenant: true,
        lease: true,
      },
    });
    expect(res.json).toHaveBeenCalledWith(updatedApplication);
  });

  it("updateApplicationStatus updates status without creating a lease", async () => {
    const application = buildApplication();
    const updatedApplication = {
      ...application,
      status: "Denied",
      lease: null,
    };
    applicationFindUnique
      .mockResolvedValueOnce(application)
      .mockResolvedValueOnce(updatedApplication);
    applicationUpdate.mockResolvedValue(updatedApplication);
    const req = createRequest({
      params: { id: "1" },
      body: { status: "Denied" },
    });
    const res = createResponse();

    await updateApplicationStatus(req, res);

    expect(leaseCreate).not.toHaveBeenCalled();
    expect(propertyUpdate).not.toHaveBeenCalled();
    expect(applicationUpdate).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { status: "Denied" },
    });
    expect(res.json).toHaveBeenCalledWith(updatedApplication);
  });

  it("missing application returns 404", async () => {
    applicationFindUnique.mockResolvedValue(null);
    const req = createRequest({
      params: { id: "999" },
      body: { status: "Approved" },
    });
    const res = createResponse();

    await updateApplicationStatus(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ message: "Application not found" });
    expect(leaseCreate).not.toHaveBeenCalled();
    expect(propertyUpdate).not.toHaveBeenCalled();
    expect(applicationUpdate).not.toHaveBeenCalled();
  });

  it("updateApplicationStatus returns 500 when updating status fails", async () => {
    const application = buildApplication();
    applicationFindUnique.mockResolvedValueOnce(application);
    applicationUpdate.mockRejectedValue(new Error("Database error"));
    const req = createRequest({
      params: { id: "1" },
      body: { status: "Denied" },
    });
    const res = createResponse();

    await updateApplicationStatus(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      message: "Error updating application status: Database error",
    });
  });
});
