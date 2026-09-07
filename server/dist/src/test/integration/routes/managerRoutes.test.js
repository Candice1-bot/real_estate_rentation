"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const globals_1 = require("@jest/globals");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const supertest_1 = __importDefault(require("supertest"));
const app_1 = __importDefault(require("../../../app"));
const prisma = new client_1.PrismaClient();
const cognitoId = "manager-routes-test-user";
const propertyName = "Manager Routes Test Property";
const locationAddress = "456 Manager Routes Test Ave";
const token = jsonwebtoken_1.default.sign({ sub: cognitoId, "custom:role": "manager" }, "test-secret");
const authHeader = `Bearer ${token}`;
const deleteTestData = () => __awaiter(void 0, void 0, void 0, function* () {
    yield prisma.property.deleteMany({
        where: { name: propertyName },
    });
    yield prisma.manager.deleteMany({
        where: { cognitoId },
    });
    yield prisma.location.deleteMany({
        where: { address: locationAddress },
    });
});
const createTestManager = () => __awaiter(void 0, void 0, void 0, function* () {
    return prisma.manager.create({
        data: {
            cognitoId,
            name: "Test Manager",
            email: "manager@example.com",
            phoneNumber: "555-1234",
        },
    });
});
const createTestProperty = () => __awaiter(void 0, void 0, void 0, function* () {
    const [location] = yield prisma.$queryRaw `
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
            amenities: [client_1.Amenity.AirConditioning],
            highlights: [client_1.Highlight.HighSpeedInternetAccess],
            isPetsAllowed: true,
            isParkingIncluded: true,
            beds: 2,
            baths: 1,
            squareFeet: 900,
            propertyType: client_1.PropertyType.Apartment,
            locationId: location.id,
            managerCognitoId: cognitoId,
        },
    });
});
(0, globals_1.describe)("managerRoutes integration", () => {
    (0, globals_1.beforeEach)(() => __awaiter(void 0, void 0, void 0, function* () {
        yield deleteTestData();
    }));
    (0, globals_1.afterAll)(() => __awaiter(void 0, void 0, void 0, function* () {
        yield deleteTestData();
        yield prisma.$disconnect();
    }));
    // tests: router.get("/:cognitoId", getManager);
    // router.put("/:cognitoId", updateManager);
    // router.post("/", createManager);
    (0, globals_1.it)("creates, gets, and updates a manager in the database", () => __awaiter(void 0, void 0, void 0, function* () {
        const manager = {
            cognitoId,
            name: "Test Manager",
            email: "manager@example.com",
            phoneNumber: "555-1234",
        };
        const createResponse = yield (0, supertest_1.default)(app_1.default)
            .post("/managers")
            .set("Authorization", authHeader)
            .send(manager)
            .expect(201);
        (0, globals_1.expect)(createResponse.body).toEqual(globals_1.expect.objectContaining(manager));
        const savedManager = yield prisma.manager.findUnique({
            where: { cognitoId },
        });
        (0, globals_1.expect)(savedManager).toEqual(globals_1.expect.objectContaining(manager));
        const getResponse = yield (0, supertest_1.default)(app_1.default)
            .get(`/managers/${cognitoId}`)
            .set("Authorization", authHeader)
            .expect(200);
        (0, globals_1.expect)(getResponse.body).toEqual(globals_1.expect.objectContaining(manager));
        const updates = {
            name: "Updated Manager",
            email: "updated-manager@example.com",
            phoneNumber: "555-9999",
        };
        const updateResponse = yield (0, supertest_1.default)(app_1.default)
            .put(`/managers/${cognitoId}`)
            .set("Authorization", authHeader)
            .send(updates)
            .expect(200);
        (0, globals_1.expect)(updateResponse.body).toEqual(globals_1.expect.objectContaining(Object.assign({ cognitoId }, updates)));
        const updatedManager = yield prisma.manager.findUnique({
            where: { cognitoId },
        });
        (0, globals_1.expect)(updatedManager).toEqual(globals_1.expect.objectContaining(Object.assign({ cognitoId }, updates)));
    }));
    // tests: router.get("/:cognitoId/properties", getManagerProperties);
    (0, globals_1.it)("gets a manager's properties from the database", () => __awaiter(void 0, void 0, void 0, function* () {
        yield createTestManager();
        const property = yield createTestProperty();
        const response = yield (0, supertest_1.default)(app_1.default)
            .get(`/managers/${cognitoId}/properties`)
            .set("Authorization", authHeader)
            .expect(200);
        (0, globals_1.expect)(response.body).toEqual([
            globals_1.expect.objectContaining({
                id: property.id,
                name: propertyName,
                managerCognitoId: cognitoId,
                location: globals_1.expect.objectContaining({
                    address: locationAddress,
                    coordinates: {
                        longitude: -73.935242,
                        latitude: 40.73061,
                    },
                }),
            }),
        ]);
    }));
});
