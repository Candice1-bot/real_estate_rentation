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
const cognitoId = "tenant-routes-test-user";
const managerCognitoId = "tenant-routes-test-manager";
const propertyName = "Tenant Routes Test Property";
const locationAddress = "123 Tenant Routes Test Ave";
const token = jsonwebtoken_1.default.sign({ sub: cognitoId, "custom:role": "tenant" }, "test-secret");
const authHeader = `Bearer ${token}`;
const deleteTestData = () => __awaiter(void 0, void 0, void 0, function* () {
    yield prisma.property.deleteMany({
        where: { name: propertyName },
    });
    yield prisma.tenant.deleteMany({
        where: { cognitoId },
    });
    yield prisma.manager.deleteMany({
        where: { cognitoId: managerCognitoId },
    });
    yield prisma.location.deleteMany({
        where: { address: locationAddress },
    });
});
const createTestTenant = () => __awaiter(void 0, void 0, void 0, function* () {
    return prisma.tenant.create({
        data: {
            cognitoId,
            name: "Test Tenant",
            email: "tenant@example.com",
            phoneNumber: "555-1234",
        },
    });
});
const createTestProperty = () => __awaiter(void 0, void 0, void 0, function* () {
    yield prisma.manager.create({
        data: {
            cognitoId: managerCognitoId,
            name: "Test Manager",
            email: "manager@example.com",
            phoneNumber: "555-0000",
        },
    });
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
            description: "Property created for tenant route integration tests.",
            pricePerMonth: 1500,
            securityDeposit: 1500,
            applicationFee: 50,
            photoUrls: [],
            amenities: [client_1.Amenity.AirConditioning],
            highlights: [client_1.Highlight.HighSpeedInternetAccess],
            isPetsAllowed: true,
            isParkingIncluded: false,
            beds: 1,
            baths: 1,
            squareFeet: 700,
            propertyType: client_1.PropertyType.Apartment,
            locationId: location.id,
            managerCognitoId,
        },
    });
});
(0, globals_1.describe)("tenantRoutes integration", () => {
    (0, globals_1.beforeEach)(() => __awaiter(void 0, void 0, void 0, function* () {
        yield deleteTestData();
    }));
    (0, globals_1.afterAll)(() => __awaiter(void 0, void 0, void 0, function* () {
        yield deleteTestData();
        yield prisma.$disconnect();
    }));
    // test: router.get("/:cognitoId", getTenant);
    // router.put("/:cognitoId", updateTenant);
    // router.post("/", createTenant);
    (0, globals_1.it)("creates, gets, and updates a tenant in the database", () => __awaiter(void 0, void 0, void 0, function* () {
        const tenant = {
            cognitoId,
            name: "Test Tenant",
            email: "tenant@example.com",
            phoneNumber: "555-1234",
        };
        const createResponse = yield (0, supertest_1.default)(app_1.default)
            .post("/tenants")
            .set("Authorization", authHeader)
            .send(tenant)
            .expect(201);
        (0, globals_1.expect)(createResponse.body).toEqual(globals_1.expect.objectContaining(tenant));
        const savedTenant = yield prisma.tenant.findUnique({
            where: { cognitoId },
        });
        (0, globals_1.expect)(savedTenant).toEqual(globals_1.expect.objectContaining(tenant));
        const getResponse = yield (0, supertest_1.default)(app_1.default)
            .get(`/tenants/${cognitoId}`)
            .set("Authorization", authHeader)
            .expect(200);
        (0, globals_1.expect)(getResponse.body).toEqual(globals_1.expect.objectContaining(Object.assign(Object.assign({}, tenant), { favorites: [] })));
        const updates = {
            name: "Updated Tenant",
            email: "updated@example.com",
            phoneNumber: "555-9999",
        };
        const updateResponse = yield (0, supertest_1.default)(app_1.default)
            .put(`/tenants/${cognitoId}`)
            .set("Authorization", authHeader)
            .send(updates)
            .expect(200);
        (0, globals_1.expect)(updateResponse.body).toEqual(globals_1.expect.objectContaining(Object.assign({ cognitoId }, updates)));
        const updatedTenant = yield prisma.tenant.findUnique({
            where: { cognitoId },
        });
        (0, globals_1.expect)(updatedTenant).toEqual(globals_1.expect.objectContaining(Object.assign({ cognitoId }, updates)));
    }));
    // test: router.get("/:cognitoId/current-residences", getCurrentResidence);
    (0, globals_1.it)("gets a tenant's current residences from the database", () => __awaiter(void 0, void 0, void 0, function* () {
        yield createTestTenant();
        const property = yield createTestProperty();
        yield prisma.tenant.update({
            where: { cognitoId },
            data: {
                properties: {
                    connect: { id: property.id },
                },
            },
        });
        const response = yield (0, supertest_1.default)(app_1.default)
            .get(`/tenants/${cognitoId}/current-residences`)
            .set("Authorization", authHeader)
            .expect(200);
        (0, globals_1.expect)(response.body).toEqual([
            globals_1.expect.objectContaining({
                id: property.id,
                name: propertyName,
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
    // test: router.post("/:cognitoId/favorites/:propertyId", addFavoriteProperty);
    // router.delete("/:cognitoId/favorites/:propertyId", removeFavoriteProperty);
    (0, globals_1.it)("adds and removes a favorite property in the database", () => __awaiter(void 0, void 0, void 0, function* () {
        yield createTestTenant();
        const property = yield createTestProperty();
        const addResponse = yield (0, supertest_1.default)(app_1.default)
            .post(`/tenants/${cognitoId}/favorites/${property.id}`)
            .set("Authorization", authHeader)
            .expect(200);
        (0, globals_1.expect)(addResponse.body.favorites).toEqual([
            globals_1.expect.objectContaining({
                id: property.id,
                name: propertyName,
            }),
        ]);
        const tenantWithFavorite = yield prisma.tenant.findUnique({
            where: { cognitoId },
            include: { favorites: true },
        });
        (0, globals_1.expect)(tenantWithFavorite === null || tenantWithFavorite === void 0 ? void 0 : tenantWithFavorite.favorites).toEqual([
            globals_1.expect.objectContaining({
                id: property.id,
                name: propertyName,
            }),
        ]);
        const removeResponse = yield (0, supertest_1.default)(app_1.default)
            .delete(`/tenants/${cognitoId}/favorites/${property.id}`)
            .set("Authorization", authHeader)
            .expect(200);
        (0, globals_1.expect)(removeResponse.body.favorites).toEqual([]);
        const tenantWithoutFavorite = yield prisma.tenant.findUnique({
            where: { cognitoId },
            include: { favorites: true },
        });
        (0, globals_1.expect)(tenantWithoutFavorite === null || tenantWithoutFavorite === void 0 ? void 0 : tenantWithoutFavorite.favorites).toEqual([]);
    }));
});
