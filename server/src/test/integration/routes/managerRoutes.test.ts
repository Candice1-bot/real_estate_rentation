import { Amenity, Highlight, PrismaClient, PropertyType } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "@jest/globals";
import jwt from "jsonwebtoken";
import request from "supertest";
import app from "../../../app";

const prisma = new PrismaClient();
const cognitoId = "manager-routes-test-user";
const propertyName = "Manager Routes Test Property";
const locationAddress = "456 Manager Routes Test Ave";
const token = jwt.sign(
  { sub: cognitoId, "custom:role": "manager" },
  "test-secret",
);

const authHeader = `Bearer ${token}`;

const deleteTestData = async () => {
  await prisma.property.deleteMany({
    where: { name: propertyName },
  });

  await prisma.manager.deleteMany({
    where: { cognitoId },
  });

  await prisma.location.deleteMany({
    where: { address: locationAddress },
  });
};

const createTestManager = async () => {
  return prisma.manager.create({
    data: {
      cognitoId,
      name: "Test Manager",
      email: "manager@example.com",
      phoneNumber: "555-1234",
    },
  });
};

const createTestProperty = async () => {
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
      description: "Property created for manager route integration tests.",
      pricePerMonth: 2000,
      securityDeposit: 2000,
      applicationFee: 75,
      photoUrls: [],
      amenities: [Amenity.AirConditioning],
      highlights: [Highlight.HighSpeedInternetAccess],
      isPetsAllowed: true,
      isParkingIncluded: true,
      beds: 2,
      baths: 1,
      squareFeet: 900,
      propertyType: PropertyType.Apartment,
      locationId: location.id,
      managerCognitoId: cognitoId,
    },
  });
};

describe("managerRoutes integration", () => {
  beforeEach(async () => {
    await deleteTestData();
  });

  afterAll(async () => {
    await deleteTestData();
    await prisma.$disconnect();
  });

  // tests: router.get("/:cognitoId", getManager);
  // router.put("/:cognitoId", updateManager);
  // router.post("/", createManager);
  it("creates, gets, and updates a manager in the database", async () => {
    const manager = {
      cognitoId,
      name: "Test Manager",
      email: "manager@example.com",
      phoneNumber: "555-1234",
    };

    const createResponse = await request(app)
      .post("/managers")
      .set("Authorization", authHeader)
      .send(manager)
      .expect(201);

    expect(createResponse.body).toEqual(expect.objectContaining(manager));

    const savedManager = await prisma.manager.findUnique({
      where: { cognitoId },
    });

    expect(savedManager).toEqual(expect.objectContaining(manager));

    const getResponse = await request(app)
      .get(`/managers/${cognitoId}`)
      .set("Authorization", authHeader)
      .expect(200);

    expect(getResponse.body).toEqual(expect.objectContaining(manager));

    const updates = {
      name: "Updated Manager",
      email: "updated-manager@example.com",
      phoneNumber: "555-9999",
    };

    const updateResponse = await request(app)
      .put(`/managers/${cognitoId}`)
      .set("Authorization", authHeader)
      .send(updates)
      .expect(200);

    expect(updateResponse.body).toEqual(
      expect.objectContaining({
        cognitoId,
        ...updates,
      }),
    );

    const updatedManager = await prisma.manager.findUnique({
      where: { cognitoId },
    });

    expect(updatedManager).toEqual(
      expect.objectContaining({
        cognitoId,
        ...updates,
      }),
    );
  });

  // tests: router.get("/:cognitoId/properties", getManagerProperties);
  it("gets a manager's properties from the database", async () => {
    await createTestManager();
    const property = await createTestProperty();

    const response = await request(app)
      .get(`/managers/${cognitoId}/properties`)
      .set("Authorization", authHeader)
      .expect(200);

    expect(response.body).toEqual([
      expect.objectContaining({
        id: property.id,
        name: propertyName,
        managerCognitoId: cognitoId,
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
});
