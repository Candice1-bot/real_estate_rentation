import { Amenity, Highlight, PrismaClient, PropertyType } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "@jest/globals";
import jwt from "jsonwebtoken";
import request from "supertest";
import app from "../../../app";

const prisma = new PrismaClient();
const cognitoId = "tenant-routes-test-user";
const managerCognitoId = "tenant-routes-test-manager";
const propertyName = "Tenant Routes Test Property";
const locationAddress = "123 Tenant Routes Test Ave";
const token = jwt.sign(
  { sub: cognitoId, "custom:role": "tenant" },
  "test-secret",
);

const authHeader = `Bearer ${token}`;

const deleteTestData = async () => {
  await prisma.property.deleteMany({
    where: { name: propertyName },
  });

  await prisma.tenant.deleteMany({
    where: { cognitoId },
  });

  await prisma.manager.deleteMany({
    where: { cognitoId: managerCognitoId },
  });

  await prisma.location.deleteMany({
    where: { address: locationAddress },
  });
};

const createTestTenant = async () => {
  return prisma.tenant.create({
    data: {
      cognitoId,
      name: "Test Tenant",
      email: "tenant@example.com",
      phoneNumber: "555-1234",
    },
  });
};

const createTestProperty = async () => {
  await prisma.manager.create({
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

  return prisma.property.create({
    data: {
      name: propertyName,
      description: "Property created for tenant route integration tests.",
      pricePerMonth: 1500,
      securityDeposit: 1500,
      applicationFee: 50,
      photoUrls: [],
      amenities: [Amenity.AirConditioning],
      highlights: [Highlight.HighSpeedInternetAccess],
      isPetsAllowed: true,
      isParkingIncluded: false,
      beds: 1,
      baths: 1,
      squareFeet: 700,
      propertyType: PropertyType.Apartment,
      locationId: location.id,
      managerCognitoId,
    },
  });
};

describe("tenantRoutes integration", () => {
  beforeEach(async () => {
    await deleteTestData();
  });

  afterAll(async () => {
    await deleteTestData();
    await prisma.$disconnect();
  });

  // test: router.get("/:cognitoId", getTenant);
  // router.put("/:cognitoId", updateTenant);
  // router.post("/", createTenant);
  it("creates, gets, and updates a tenant in the database", async () => {
    const tenant = {
      cognitoId,
      name: "Test Tenant",
      email: "tenant@example.com",
      phoneNumber: "555-1234",
    };

    const createResponse = await request(app)
      .post("/tenants")
      .set("Authorization", authHeader)
      .send(tenant)
      .expect(201);

    expect(createResponse.body).toEqual(expect.objectContaining(tenant));

    const savedTenant = await prisma.tenant.findUnique({
      where: { cognitoId },
    });

    expect(savedTenant).toEqual(expect.objectContaining(tenant));

    const getResponse = await request(app)
      .get(`/tenants/${cognitoId}`)
      .set("Authorization", authHeader)
      .expect(200);

    expect(getResponse.body).toEqual(
      expect.objectContaining({
        ...tenant,
        favorites: [],
      }),
    );

    const updates = {
      name: "Updated Tenant",
      email: "updated@example.com",
      phoneNumber: "555-9999",
    };

    const updateResponse = await request(app)
      .put(`/tenants/${cognitoId}`)
      .set("Authorization", authHeader)
      .send(updates)
      .expect(200);

    expect(updateResponse.body).toEqual(
      expect.objectContaining({
        cognitoId,
        ...updates,
      }),
    );

    const updatedTenant = await prisma.tenant.findUnique({
      where: { cognitoId },
    });

    expect(updatedTenant).toEqual(
      expect.objectContaining({
        cognitoId,
        ...updates,
      }),
    );
  });

  // test: router.get("/:cognitoId/current-residences", getCurrentResidence);
  it("gets a tenant's current residences from the database", async () => {
    await createTestTenant();
    const property = await createTestProperty();

    await prisma.tenant.update({
      where: { cognitoId },
      data: {
        properties: {
          connect: { id: property.id },
        },
      },
    });

    const response = await request(app)
      .get(`/tenants/${cognitoId}/current-residences`)
      .set("Authorization", authHeader)
      .expect(200);

    expect(response.body).toEqual([
      expect.objectContaining({
        id: property.id,
        name: propertyName,
        location: expect.objectContaining({
          address: locationAddress,
          coordinates: {
            longitude: -73.935242,
            latitude: 40.73061,
          },
        }),
      }),
    ]);
  });

  // test: router.post("/:cognitoId/favorites/:propertyId", addFavoriteProperty);
  // router.delete("/:cognitoId/favorites/:propertyId", removeFavoriteProperty);
  it("adds and removes a favorite property in the database", async () => {
    await createTestTenant();
    const property = await createTestProperty();

    const addResponse = await request(app)
      .post(`/tenants/${cognitoId}/favorites/${property.id}`)
      .set("Authorization", authHeader)
      .expect(200);

    expect(addResponse.body.favorites).toEqual([
      expect.objectContaining({
        id: property.id,
        name: propertyName,
      }),
    ]);

    const tenantWithFavorite = await prisma.tenant.findUnique({
      where: { cognitoId },
      include: { favorites: true },
    });

    expect(tenantWithFavorite?.favorites).toEqual([
      expect.objectContaining({
        id: property.id,
        name: propertyName,
      }),
    ]);

    const removeResponse = await request(app)
      .delete(`/tenants/${cognitoId}/favorites/${property.id}`)
      .set("Authorization", authHeader)
      .expect(200);

    expect(removeResponse.body.favorites).toEqual([]);

    const tenantWithoutFavorite = await prisma.tenant.findUnique({
      where: { cognitoId },
      include: { favorites: true },
    });

    expect(tenantWithoutFavorite?.favorites).toEqual([]);
  });
});
