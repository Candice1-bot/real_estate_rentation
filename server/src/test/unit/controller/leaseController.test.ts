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

const leaseFindMany = jest.fn<(args: any) => Promise<any>>();
const paymentFindMany = jest.fn<(args: any) => Promise<any>>();

const prismaMock = {
  lease: {
    findMany: leaseFindMany,
  },
  payment: {
    findMany: paymentFindMany,
  },
};

const PrismaClient = jest.fn(() => prismaMock);

jest.unstable_mockModule("@prisma/client", () => ({
  PrismaClient,
}));

let getLeases: Controller;
let getLeasePayments: Controller;

const createResponse = () => {
  const res = {} as Response;
  res.status = jest.fn<Response["status"]>().mockReturnValue(res);
  res.json = jest.fn<Response["json"]>().mockReturnValue(res);
  return res;
};

const createRequest = ({
  params = {},
}: {
  params?: Record<string, string>;
} = {}) =>
  ({
    params,
  }) as Request;

beforeAll(async () => {
  const controller = await import("../../../controllers/leaseController.js");
  getLeases = controller.getLeases;
  getLeasePayments = controller.getLeasePayments;
});

describe("leaseController", () => {
  beforeEach(() => {
    leaseFindMany.mockReset();
    paymentFindMany.mockReset();
  });

  it("getLeases returns leases with tenant and property details", async () => {
    const leases = [
      {
        id: 1,
        rent: 1800,
        tenantCognitoId: "tenant-123",
        tenant: { cognitoId: "tenant-123", name: "Test Tenant" },
        property: { id: 10, name: "Test Property" },
      },
    ];
    leaseFindMany.mockResolvedValue(leases);
    const req = createRequest();
    const res = createResponse();

    await getLeases(req, res);

    expect(leaseFindMany).toHaveBeenCalledWith({
      include: { tenant: true, property: true },
    });
    expect(res.json).toHaveBeenCalledWith(leases);
    expect(res.status).not.toHaveBeenCalled();
  });

  it("getLeases returns 500 when retrieving leases fails", async () => {
    leaseFindMany.mockRejectedValue(new Error("Database error"));
    const req = createRequest();
    const res = createResponse();

    await getLeases(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      message: "Error retrieving leases: Database error",
    });
  });

  it("getLeasePayments returns payments for the requested lease id", async () => {
    const payments = [
      {
        id: 5,
        leaseId: 42,
        amountDue: 1800,
        amountPaid: 1800,
        paymentStatus: "Paid",
      },
    ];
    paymentFindMany.mockResolvedValue(payments);
    const req = createRequest({ params: { id: "42" } });
    const res = createResponse();

    await getLeasePayments(req, res);

    expect(paymentFindMany).toHaveBeenCalledWith({
      where: { leaseId: 42 },
    });
    expect(res.json).toHaveBeenCalledWith(payments);
    expect(res.status).not.toHaveBeenCalled();
  });

  it("getLeasePayments returns 500 when retrieving payments fails", async () => {
    paymentFindMany.mockRejectedValue(new Error("Database error"));
    const req = createRequest({ params: { id: "42" } });
    const res = createResponse();

    await getLeasePayments(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      message: "Error retrieving payments: Database error",
    });
  });
});
