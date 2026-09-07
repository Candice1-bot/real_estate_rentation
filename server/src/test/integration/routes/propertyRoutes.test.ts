import {
  Amenity,
  Highlight,
  PrismaClient,
  PropertyType,
} from "@prisma/client";
import type { Express } from "express";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import jwt from "jsonwebtoken";
import request from "supertest";

const prisma = new PrismaClient();
const managerCognitoId = "property-routes-test-manager";
const propertyName = "Property Routes Test Property";
const locationAddress = "654 Property Routes Test Ave";
const authHeader = `Bearer ${jwt.sign(
  { sub: managerCognitoId, "custom:role": "manager" },
  "test-secret",
)}`;

const mockAxiosGet = jest.fn<
  () => Promise<{ data: { lon: string; lat: string }[] }>
>();

jest.unstable_mockModule("axios", () => ({
  default: {
    get: mockAxiosGet,
  },
}));

let app: Express;

const deleteTestData = async () => {
  await prisma.payment.deleteMany({
    where: {
      lease: {
        property: { name: propertyName },
      },
    },
  });

  await prisma.application.deleteMany({
    where: {
      property: { name: propertyName },
    },
  });

  await prisma.lease.deleteMany({
    where: {
      property: { name: propertyName },
    },
  });

  await prisma.property.deleteMany({
    where: { name: propertyName },
  });

  await prisma.manager.deleteMany({
    where: { cognitoId: managerCognitoId },
  });

  await prisma.location.deleteMany({
    where: { address: locationAddress },
  });
};

const createTestManager = async () => {
  return prisma.manager.create({
    data: {
      cognitoId: managerCognitoId,
      name: "Test Manager",
      email: "manager@example.com",
      phoneNumber: "555-1234",
    },
  });
};

const createTestProperty = async () => {
  const manager = await createTestManager();
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
      description: "Property created for property route integration tests.",
      pricePerMonth: 1900,
      securityDeposit: 1900,
      applicationFee: 65,
      photoUrls: [],
      amenities: [Amenity.AirConditioning, Amenity.Parking],
      highlights: [Highlight.HighSpeedInternetAccess],
      isPetsAllowed: true,
      isParkingIncluded: true,
      beds: 2,
      baths: 1,
      squareFeet: 900,
      propertyType: PropertyType.Apartment,
      locationId: location.id,
      managerCognitoId: manager.cognitoId,
    },
  });

  return { property, manager };
};

beforeAll(async () => {
  const appModule = await import("../../../app.js");
  app = appModule.default as unknown as Express;
});

describe("propertyRoutes integration", () => {
  beforeEach(async () => {
    mockAxiosGet.mockReset();
    await deleteTestData();
  });

  afterAll(async () => {
    await deleteTestData();
    await prisma.$disconnect();
  });

  // tests: router.get("/", getProperties);
  // router.get("/:id", getProperty);
  it("gets properties and a property by id from the database", async () => {
    const { property } = await createTestProperty();

    const listResponse = await request(app)
      .get("/properties")
      .query({ favoriteIds: String(property.id) })
      .expect(200);

    expect(listResponse.body).toEqual([
      expect.objectContaining({
        id: property.id,
        name: propertyName,
        managerCognitoId,
        location: expect.objectContaining({
          address: locationAddress,
          coordinates: {
            longitude: -73.935242,
            latitude: 40.73061,
          },
        }),
      }),
    ]);

    const getResponse = await request(app)
      .get(`/properties/${property.id}`)
      .expect(200);

    expect(getResponse.body).toEqual(
      expect.objectContaining({
        id: property.id,
        name: propertyName,
        managerCognitoId,
        location: expect.objectContaining({
          address: locationAddress,
          coordinates: {
            longitude: -73.935242,
            latitude: 40.73061,
          },
        }),
      }),
    );
  });

  // tests: router.post("/", authMiddleware(["manager"]), upload.array("photos"), createProperty);
  it("creates a property in the database", async () => {
    await createTestManager();
    mockAxiosGet.mockResolvedValue({
      data: [{ lon: "-73.935242", lat: "40.730610" }],
    });

    const createResponse = await request(app)
      .post("/properties")
      .set("Authorization", authHeader)
      .field("name", propertyName)
      .field("description", "Property created through the API.")
      .field("pricePerMonth", "1900")
      .field("securityDeposit", "1900")
      .field("applicationFee", "65")
      .field("amenities", "AirConditioning,Parking")
      .field("highlights", "HighSpeedInternetAccess")
      .field("isPetsAllowed", "true")
      .field("isParkingIncluded", "true")
      .field("beds", "2")
      .field("baths", "1")
      .field("squareFeet", "900")
      .field("propertyType", PropertyType.Apartment)
      .field("address", locationAddress)
      .field("city", "New York")
      .field("state", "NY")
      .field("country", "United States")
      .field("postalCode", "10001")
      .field("managerCognitoId", managerCognitoId)
      .expect(201);

    expect(createResponse.body).toEqual(
      expect.objectContaining({
        name: propertyName,
        pricePerMonth: 1900,
        securityDeposit: 1900,
        applicationFee: 65,
        amenities: [Amenity.AirConditioning, Amenity.Parking],
        highlights: [Highlight.HighSpeedInternetAccess],
        isPetsAllowed: true,
        isParkingIncluded: true,
        beds: 2,
        baths: 1,
        squareFeet: 900,
        propertyType: PropertyType.Apartment,
        managerCognitoId,
        location: expect.objectContaining({
          address: locationAddress,
        }),
        manager: expect.objectContaining({
          cognitoId: managerCognitoId,
        }),
      }),
    );

    const savedProperty = await prisma.property.findUnique({
      where: { id: createResponse.body.id },
      include: { location: true, manager: true },
    });

    expect(savedProperty).toEqual(
      expect.objectContaining({
        name: propertyName,
        pricePerMonth: 1900,
        securityDeposit: 1900,
        applicationFee: 65,
        managerCognitoId,
        manager: expect.objectContaining({
          cognitoId: managerCognitoId,
        }),
        location: expect.objectContaining({
          address: locationAddress,
        }),
      }),
    );

    const getResponse = await request(app)
      .get(`/properties/${createResponse.body.id}`)
      .expect(200);

    expect(getResponse.body.location.coordinates).toEqual({
      longitude: -73.935242,
      latitude: 40.73061,
    });
  });
});
