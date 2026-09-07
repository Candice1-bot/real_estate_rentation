import {
  Amenity,
  ApplicationStatus,
  Highlight,
  PrismaClient,
  PropertyType,
} from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "@jest/globals";
import jwt from "jsonwebtoken";
import request from "supertest";
import app from "../../../app";

const prisma = new PrismaClient();
const tenantCognitoId = "application-routes-test-tenant";
const managerCognitoId = "application-routes-test-manager";
const propertyName = "Application Routes Test Property";
const locationAddress = "789 Application Routes Test Ave";

const tenantAuthHeader = `Bearer ${jwt.sign(
  { sub: tenantCognitoId, "custom:role": "tenant" },
  "test-secret",
)}`;
const managerAuthHeader = `Bearer ${jwt.sign(
  { sub: managerCognitoId, "custom:role": "manager" },
  "test-secret",
)}`;

const deleteTestData = async () => {
  await prisma.application.deleteMany({
    where: {
      OR: [{ tenantCognitoId }, { property: { name: propertyName } }],
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
      description: "Property created for application route integration tests.",
      pricePerMonth: 1800,
      securityDeposit: 1800,
      applicationFee: 60,
      photoUrls: [],
      amenities: [Amenity.AirConditioning],
      highlights: [Highlight.HighSpeedInternetAccess],
      isPetsAllowed: true,
      isParkingIncluded: false,
      beds: 2,
      baths: 1,
      squareFeet: 850,
      propertyType: PropertyType.Apartment,
      locationId: location.id,
      managerCognitoId,
    },
  });

  return { manager, property, tenant };
};

const applicationBody = (propertyId: number) => ({
  applicationDate: "2026-09-07T00:00:00.000Z",
  status: ApplicationStatus.Pending,
  propertyId,
  tenantCognitoId,
  name: "Test Tenant",
  email: "tenant@example.com",
  phoneNumber: "555-1234",
  message: "I would like to rent this property.",
});

describe("applicationRoutes integration", () => {
  beforeEach(async () => {
    await deleteTestData();
  });

  afterAll(async () => {
    await deleteTestData();
    await prisma.$disconnect();
  });

  // test: router.post("/", authMiddleware(["tenant"]), createApplication);
  // router.get("/", authMiddleware(["manager", "tenant"]), listApplication);
  it("creates an application and lists it for the tenant and manager", async () => {
    const { manager, property, tenant } = await createTestData();
    const newApplication = applicationBody(property.id);

    const createResponse = await request(app)
      .post("/applications")
      .set("Authorization", tenantAuthHeader)
      .send(newApplication)
      .expect(201);

    expect(createResponse.body).toEqual(
      expect.objectContaining({
        status: ApplicationStatus.Pending,
        propertyId: property.id,
        tenantCognitoId: tenant.cognitoId,
        name: newApplication.name,
        email: newApplication.email,
        phoneNumber: newApplication.phoneNumber,
        message: newApplication.message,
        property: expect.objectContaining({
          id: property.id,
          managerCognitoId: manager.cognitoId,
        }),
        tenant: expect.objectContaining({
          cognitoId: tenant.cognitoId,
        }),
        lease: expect.objectContaining({
          propertyId: property.id,
          tenantCognitoId: tenant.cognitoId,
          rent: property.pricePerMonth,
          deposit: property.securityDeposit,
        }),
      }),
    );

    const savedApplication = await prisma.application.findUnique({
      where: { id: createResponse.body.id },
      include: { lease: true },
    });

    expect(savedApplication).toEqual(
      expect.objectContaining({
        status: ApplicationStatus.Pending,
        propertyId: property.id,
        tenantCognitoId: tenant.cognitoId,
        lease: expect.objectContaining({
          rent: property.pricePerMonth,
          deposit: property.securityDeposit,
        }),
      }),
    );

    const tenantListResponse = await request(app)
      .get("/applications")
      .query({ userId: tenant.cognitoId, userType: "tenant" })
      .set("Authorization", tenantAuthHeader)
      .expect(200);

    expect(tenantListResponse.body).toEqual([
      expect.objectContaining({
        id: createResponse.body.id,
        tenantCognitoId: tenant.cognitoId,
        property: expect.objectContaining({
          id: property.id,
          address: locationAddress,
        }),
        manager: expect.objectContaining({
          cognitoId: manager.cognitoId,
        }),
        lease: expect.objectContaining({
          propertyId: property.id,
          tenantCognitoId: tenant.cognitoId,
        }),
      }),
    ]);

    const managerListResponse = await request(app)
      .get("/applications")
      .query({ userId: manager.cognitoId, userType: "manager" })
      .set("Authorization", managerAuthHeader)
      .expect(200);

    expect(managerListResponse.body).toEqual([
      expect.objectContaining({
        id: createResponse.body.id,
        tenantCognitoId: tenant.cognitoId,
        property: expect.objectContaining({
          id: property.id,
          address: locationAddress,
        }),
        tenant: expect.objectContaining({
          cognitoId: tenant.cognitoId,
        }),
      }),
    ]);
  });

  // router.put("/:id/status", authMiddleware(["manager"]), updateApplicationStatus);
  it("updates an application status in the database", async () => {
    const { property, tenant } = await createTestData();
    const createResponse = await request(app)
      .post("/applications")
      .set("Authorization", tenantAuthHeader)
      .send(applicationBody(property.id))
      .expect(201);

    const updateResponse = await request(app)
      .put(`/applications/${createResponse.body.id}/status`)
      .set("Authorization", managerAuthHeader)
      .send({ status: ApplicationStatus.Approved })
      .expect(200);

    expect(updateResponse.body).toEqual(
      expect.objectContaining({
        id: createResponse.body.id,
        status: ApplicationStatus.Approved,
        propertyId: property.id,
        tenantCognitoId: tenant.cognitoId,
        lease: expect.objectContaining({
          propertyId: property.id,
          tenantCognitoId: tenant.cognitoId,
        }),
      }),
    );

    const updatedApplication = await prisma.application.findUnique({
      where: { id: createResponse.body.id },
      include: { property: { include: { tenants: true } }, lease: true },
    });

    expect(updatedApplication).toEqual(
      expect.objectContaining({
        status: ApplicationStatus.Approved,
        lease: expect.objectContaining({
          propertyId: property.id,
          tenantCognitoId: tenant.cognitoId,
        }),
      }),
    );
    expect(updatedApplication?.property.tenants).toEqual([
      expect.objectContaining({
        cognitoId: tenant.cognitoId,
      }),
    ]);
  });
});
