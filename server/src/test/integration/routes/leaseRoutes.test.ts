import {
  Amenity,
  Highlight,
  PaymentStatus,
  PrismaClient,
  PropertyType,
} from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "@jest/globals";
import jwt from "jsonwebtoken";
import request from "supertest";
import app from "../../../app";

const prisma = new PrismaClient();
const tenantCognitoId = "lease-routes-test-tenant";
const managerCognitoId = "lease-routes-test-manager";
const propertyName = "Lease Routes Test Property";
const locationAddress = "321 Lease Routes Test Ave";
const authHeader = `Bearer ${jwt.sign(
  { sub: tenantCognitoId, "custom:role": "tenant" },
  "test-secret",
)}`;

const deleteTestData = async () => {
  await prisma.payment.deleteMany({
    where: {
      lease: {
        OR: [{ tenantCognitoId }, { property: { name: propertyName } }],
      },
    },
  });

  await prisma.lease.deleteMany({
    where: {
      OR: [{ tenantCognitoId }, { property: { name: propertyName } }],
    },
  });

  await prisma.property.deleteMany({
    where: { name: propertyName },
  });

  await prisma.tenant.deleteMany({
    where: { cognitoId: tenantCognitoId },
  });

  await prisma.manager.deleteMany({
    where: { cognitoId: managerCognitoId },
  });

  await prisma.location.deleteMany({
    where: { address: locationAddress },
  });
};

const createTestData = async () => {
  const tenant = await prisma.tenant.create({
    data: {
      cognitoId: tenantCognitoId,
      name: "Test Tenant",
      email: "tenant@example.com",
      phoneNumber: "555-1234",
    },
  });

  const manager = await prisma.manager.create({
    data: {
      cognitoId: managerCognitoId,
      name: "Test Manager",
      email: "manager@example.com",
      phoneNumber: "555-0000",
    },
  });

  const [location] = await prisma.$queryRaw<{ id: number }[]>`
    INSERT INTO "Location" (
      "country",
      "city",
      "state",
      "address",
      "postalCode",
      "coordinates"
    )
    VALUES (
      'United States',
      'New York',
      'NY',
      ${locationAddress},
      '10001',
      ST_GeomFromText('POINT(-73.935242 40.730610)', 4326)
    )
    RETURNING id;
  `;

  const property = await prisma.property.create({
    data: {
      name: propertyName,
      description: "Property created for lease route integration tests.",
      pricePerMonth: 1750,
      securityDeposit: 1750,
      applicationFee: 55,
      photoUrls: [],
      amenities: [Amenity.AirConditioning],
      highlights: [Highlight.HighSpeedInternetAccess],
      isPetsAllowed: true,
      isParkingIncluded: false,
      beds: 2,
      baths: 1,
      squareFeet: 800,
      propertyType: PropertyType.Apartment,
      locationId: location.id,
      managerCognitoId: manager.cognitoId,
    },
  });

  const lease = await prisma.lease.create({
    data: {
      startDate: new Date("2026-01-01T00:00:00.000Z"),
      endDate: new Date("2027-01-01T00:00:00.000Z"),
      rent: property.pricePerMonth,
      deposit: property.securityDeposit,
      propertyId: property.id,
      tenantCognitoId: tenant.cognitoId,
    },
  });

  const payment = await prisma.payment.create({
    data: {
      amountDue: property.pricePerMonth,
      amountPaid: 1000,
      dueDate: new Date("2026-02-01T00:00:00.000Z"),
      paymentDate: new Date("2026-01-28T00:00:00.000Z"),
      paymentStatus: PaymentStatus.PartiallyPaid,
      leaseId: lease.id,
    },
  });

  return { lease, payment, property, tenant };
};

describe("leaseRoutes integration", () => {
  beforeEach(async () => {
    await deleteTestData();
  });

  afterAll(async () => {
    await deleteTestData();
    await prisma.$disconnect();
  });

  // tests: router.get("/", authMiddleware(["manager", "tenant"]), getLeases);
  it("gets leases from the database", async () => {
    const { lease, property, tenant } = await createTestData();

    const response = await request(app)
      .get("/leases")
      .set("Authorization", authHeader)
      .expect(200);

    expect(response.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: lease.id,
          rent: property.pricePerMonth,
          deposit: property.securityDeposit,
          propertyId: property.id,
          tenantCognitoId: tenant.cognitoId,
          property: expect.objectContaining({
            id: property.id,
            name: propertyName,
          }),
          tenant: expect.objectContaining({
            cognitoId: tenant.cognitoId,
          }),
        }),
      ]),
    );
  });

  // tests: router.get("/:id/payments", authMiddleware(["manager", "tenant"]), getLeasePayments);
  it("gets payments for a lease from the database", async () => {
    const { lease, payment, property } = await createTestData();

    const response = await request(app)
      .get(`/leases/${lease.id}/payments`)
      .set("Authorization", authHeader)
      .expect(200);

    expect(response.body).toEqual([
      expect.objectContaining({
        id: payment.id,
        leaseId: lease.id,
        amountDue: property.pricePerMonth,
        amountPaid: payment.amountPaid,
        paymentStatus: PaymentStatus.PartiallyPaid,
      }),
    ]);
  });
});
