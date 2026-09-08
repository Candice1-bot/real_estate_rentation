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
type SqlMock = {
  text: string;
  values: unknown[];
};

const queryRaw = jest.fn<(...args: any[]) => Promise<any>>();
const propertyFindUnique = jest.fn<(args: any) => Promise<any>>();
const propertyCreate = jest.fn<(args: any) => Promise<any>>();

const sqlValue = (value: unknown) => {
  if (
    value &&
    typeof value === "object" &&
    "text" in value &&
    "values" in value
  ) {
    return value as SqlMock;
  }

  return { text: "?", values: [value] };
};

const sql = jest.fn((strings: TemplateStringsArray, ...values: unknown[]) => {
  return strings.reduce<SqlMock>(
    (query, part, index) => {
      query.text += part;

      if (index < values.length) {
        const value = sqlValue(values[index]);
        query.text += value.text;
        query.values.push(...value.values);
      }

      return query;
    },
    { text: "", values: [] },
  );
});

const join = jest.fn<(values: unknown[], separator?: string) => SqlMock>(
  (values, separator = ", ") => {
    const sqlValues = values.map(sqlValue);

    return {
      text: sqlValues.map((value) => value.text).join(separator),
      values: sqlValues.flatMap((value) => value.values),
    };
  },
);

const prismaMock = {
  $queryRaw: queryRaw,
  property: {
    findUnique: propertyFindUnique,
    create: propertyCreate,
  },
};

const PrismaClient = jest.fn(() => prismaMock);
const Prisma = {
  empty: { text: "", values: [] },
  join,
  sql,
};

const axiosGet = jest.fn<
  (
    url: string,
    config?: unknown,
  ) => Promise<{ data: { lon?: string; lat?: string }[] }>
>();
const uploadDone = jest.fn<() => Promise<{ Location?: string }>>();
const Upload = jest.fn<(params: unknown) => { done: typeof uploadDone }>(
  () => ({
    done: uploadDone,
  }),
);
const S3Client = jest.fn();
const wktToGeoJSON = jest.fn<(wkt: string) => { coordinates: number[] }>();

jest.unstable_mockModule("@prisma/client", () => ({
  Prisma,
  PrismaClient,
}));

jest.unstable_mockModule("axios", () => ({
  default: {
    get: axiosGet,
  },
}));

jest.unstable_mockModule("@aws-sdk/client-s3", () => ({
  S3Client,
}));

jest.unstable_mockModule("@aws-sdk/lib-storage", () => ({
  Upload,
}));

jest.unstable_mockModule("@terraformer/wkt", () => ({
  wktToGeoJSON,
}));

let createProperty: Controller;
let getProperties: Controller;
let getProperty: Controller;

const createResponse = () => {
  const res = {} as Response;
  res.status = jest.fn<Response["status"]>().mockReturnValue(res);
  res.json = jest.fn<Response["json"]>().mockReturnValue(res);
  return res;
};

const createRequest = ({
  body = {},
  files,
  params = {},
  query = {},
}: {
  body?: Record<string, unknown>;
  files?: unknown[];
  params?: Record<string, string>;
  query?: Record<string, unknown>;
} = {}) => {
  const req = {
    body,
    params,
    query,
  } as {
    body: Record<string, unknown>;
    files?: unknown[];
    params: Record<string, string>;
    query: Record<string, unknown>;
  };

  if (files !== undefined) {
    req.files = files;
  }

  return req as unknown as Request;
};

const propertyBody = () => ({
  name: "Test Property",
  description: "A test property.",
  pricePerMonth: "1900",
  securityDeposit: "1900",
  applicationFee: "65",
  amenities: "AirConditioning,Parking",
  highlights: "HighSpeedInternetAccess,CloseToTransit",
  isPetsAllowed: "true",
  isParkingIncluded: "false",
  beds: "2",
  baths: "1.5",
  squareFeet: "900",
  propertyType: "Apartment",
  address: "123 Test Ave",
  city: "New York",
  state: "NY",
  country: "United States",
  postalCode: "10001",
  managerCognitoId: "manager-123",
});

beforeAll(async () => {
  const controller = await import(
    "../../../controllers/propertyController.js"
  );
  createProperty = controller.createProperty;
  getProperties = controller.getProperties;
  getProperty = controller.getProperty;
});

describe("propertyController", () => {
  beforeEach(() => {
    process.env.S3_BUCKET_NAME = "test-bucket";
    queryRaw.mockReset();
    propertyFindUnique.mockReset();
    propertyCreate.mockReset();
    sql.mockClear();
    join.mockClear();
    axiosGet.mockReset();
    uploadDone.mockReset();
    Upload.mockClear();
    S3Client.mockClear();
    wktToGeoJSON.mockReset();
  });

  it("createProperty converts string form fields into numbers, booleans, and arrays", async () => {
    const req = createRequest({
      body: propertyBody(),
      files: [
        {
          originalname: "front.jpg",
          buffer: Buffer.from("image"),
          mimetype: "image/jpeg",
        },
      ],
    });
    const res = createResponse();
    const location = { id: 10 };
    const createdProperty = {
      id: 20,
      name: "Test Property",
    };
    uploadDone.mockResolvedValue({
      Location: "https://cdn.example.com/front.jpg",
    });
    axiosGet.mockResolvedValue({
      data: [{ lon: "-73.935242", lat: "40.730610" }],
    });
    queryRaw.mockResolvedValue([location]);
    propertyCreate.mockResolvedValue(createdProperty);

    await createProperty(req, res);

    expect(Upload).toHaveBeenCalledWith({
      client: expect.any(Object),
      params: {
        Bucket: "test-bucket",
        Key: expect.stringMatching(/^properties\/\d+-front\.jpg$/),
        Body: Buffer.from("image"),
        ContentType: "image/jpeg",
      },
    });
    expect(propertyCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: "Test Property",
        description: "A test property.",
        photoUrls: ["https://cdn.example.com/front.jpg"],
        locationId: location.id,
        managerCognitoId: "manager-123",
        amenities: ["AirConditioning", "Parking"],
        highlights: ["HighSpeedInternetAccess", "CloseToTransit"],
        isPetsAllowed: true,
        isParkingIncluded: false,
        pricePerMonth: 1900,
        securityDeposit: 1900,
        applicationFee: 65,
        beds: 2,
        baths: 1.5,
        squareFeet: 900,
        propertyType: "Apartment",
      }),
      include: {
        location: true,
        manager: true,
      },
    });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(createdProperty);
  });

  it("createProperty uses 0, 0 when geocoding does not return coordinates", async () => {
    const req = createRequest({
      body: propertyBody(),
    });
    const res = createResponse();
    axiosGet.mockResolvedValue({ data: [] });
    queryRaw.mockResolvedValue([{ id: 10 }]);
    propertyCreate.mockResolvedValue({ id: 20 });

    await createProperty(req, res);

    const locationInsertCall = queryRaw.mock.calls[0];
    expect(locationInsertCall).toEqual(
      expect.arrayContaining([
        "123 Test Ave",
        "New York",
        "NY",
        "United States",
        "10001",
        0,
        0,
      ]),
    );
    expect(propertyCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          locationId: 10,
        }),
      }),
    );
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it("createProperty uses 0, 0 when geocoding returns partial coordinates", async () => {
    const req = createRequest({
      body: propertyBody(),
    });
    const res = createResponse();
    axiosGet.mockResolvedValue({
      data: [{ lon: "-73.935242" }],
    });
    queryRaw.mockResolvedValue([{ id: 10 }]);
    propertyCreate.mockResolvedValue({ id: 20 });

    await createProperty(req, res);

    const locationInsertCall = queryRaw.mock.calls[0];
    expect(locationInsertCall).toEqual(
      expect.arrayContaining([0, 0]),
    );
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it("createProperty returns 500 when an external service fails", async () => {
    const req = createRequest({
      body: propertyBody(),
    });
    const res = createResponse();
    axiosGet.mockRejectedValue(new Error("geocoding unavailable"));

    await createProperty(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      message: "Error creating property: geocoding unavailable",
    });
    expect(propertyCreate).not.toHaveBeenCalled();
  });

  it("createProperty returns 500 when the upload service fails", async () => {
    const req = createRequest({
      body: propertyBody(),
      files: [
        {
          originalname: "front.jpg",
          buffer: Buffer.from("image"),
          mimetype: "image/jpeg",
        },
      ],
    });
    const res = createResponse();
    uploadDone.mockRejectedValue(new Error("S3 unavailable"));

    await createProperty(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      message: "Error creating property: S3 unavailable",
    });
    expect(axiosGet).not.toHaveBeenCalled();
    expect(propertyCreate).not.toHaveBeenCalled();
  });

  it("createProperty defaults non-string amenities and highlights to empty arrays", async () => {
    const req = createRequest({
      body: {
        ...propertyBody(),
        amenities: ["Parking"],
        highlights: undefined,
        isPetsAllowed: "false",
        isParkingIncluded: "true",
      },
    });
    const res = createResponse();
    axiosGet.mockResolvedValue({
      data: [{ lon: "-73.935242", lat: "40.730610" }],
    });
    queryRaw.mockResolvedValue([{ id: 10 }]);
    propertyCreate.mockResolvedValue({ id: 20 });

    await createProperty(req, res);

    expect(propertyCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          amenities: [],
          highlights: [],
          isPetsAllowed: false,
          isParkingIncluded: true,
        }),
      }),
    );
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it("getProperties applies price, beds, and amenities filters", async () => {
    const req = createRequest({
      query: {
        priceMin: "1000",
        priceMax: "2500",
        beds: "2",
        amenities: "AirConditioning,Parking",
      },
    });
    const res = createResponse();
    const properties = [{ id: 1, name: "Filtered Property" }];
    queryRaw.mockResolvedValue(properties);

    await getProperties(req, res);

    const completeQuery = queryRaw.mock.calls[0][0] as SqlMock;
    expect(completeQuery.text).toContain('p."pricePerMonth" >= ?');
    expect(completeQuery.text).toContain('p."pricePerMonth" <= ?');
    expect(completeQuery.text).toContain("p.beds >= ?");
    expect(completeQuery.text).toContain(
      'p.amenities @> ARRAY[?, ?]::"Amenity"[]',
    );
    expect(completeQuery.values).toEqual(
      expect.arrayContaining([1000, 2500, 2, "AirConditioning", "Parking"]),
    );
    expect(res.json).toHaveBeenCalledWith(properties);
  });

  it("getProperties applies favorite, baths, size, type, date, and location filters", async () => {
    const req = createRequest({
      query: {
        favoriteIds: "3,4",
        baths: "2",
        propertyType: "Apartment",
        squareFeetMin: "700",
        squareFeetMax: "1200",
        availableFrom: "2026-02-01",
        latitude: "40.730610",
        longitude: "-73.935242",
      },
    });
    const res = createResponse();
    const properties = [{ id: 3, name: "Matched Property" }];
    queryRaw.mockResolvedValue(properties);

    await getProperties(req, res);

    const completeQuery = queryRaw.mock.calls[0][0] as SqlMock;
    expect(completeQuery.text).toContain("p.id IN (?, ?)");
    expect(completeQuery.text).toContain("p.baths >= ?");
    expect(completeQuery.text).toContain('p."squareFeet" >= ?');
    expect(completeQuery.text).toContain('p."squareFeet" <= ?');
    expect(completeQuery.text).toContain(
      'p."propertyType" = ?::"PropertyType"',
    );
    expect(completeQuery.text).toContain('l."startDate" <= ?::timestamp');
    expect(completeQuery.text).toContain("ST_DWithin(");
    expect(completeQuery.values).toEqual(
      expect.arrayContaining([
        3,
        4,
        2,
        700,
        1200,
        "Apartment",
        "2026-02-01T00:00:00.000Z",
        -73.935242,
        40.73061,
        1000 / 111,
      ]),
    );
    expect(res.json).toHaveBeenCalledWith(properties);
  });

  it("getProperties returns all properties when no filters are provided", async () => {
    const properties = [{ id: 1, name: "Any Property" }];
    queryRaw.mockResolvedValue(properties);
    const req = createRequest();
    const res = createResponse();

    await getProperties(req, res);

    const completeQuery = queryRaw.mock.calls[0][0] as SqlMock;
    expect(completeQuery.text).toContain('FROM "Property" p');
    expect(completeQuery.text).not.toContain("WHERE");
    expect(completeQuery.values).toEqual([]);
    expect(res.json).toHaveBeenCalledWith(properties);
  });

  it("getProperties ignores any filter values and invalid dates", async () => {
    queryRaw.mockResolvedValue([]);
    const req = createRequest({
      query: {
        beds: "any",
        baths: "any",
        propertyType: "any",
        amenities: "any",
        availableFrom: "not-a-date",
      },
    });
    const res = createResponse();

    await getProperties(req, res);

    const completeQuery = queryRaw.mock.calls[0][0] as SqlMock;
    expect(completeQuery.text).not.toContain("WHERE");
    expect(completeQuery.values).toEqual([]);
  });

  it("getProperties ignores non-string availableFrom values", async () => {
    queryRaw.mockResolvedValue([]);
    const req = createRequest({
      query: {
        availableFrom: ["2026-02-01"],
      },
    });
    const res = createResponse();

    await getProperties(req, res);

    const completeQuery = queryRaw.mock.calls[0][0] as SqlMock;
    expect(completeQuery.text).not.toContain("WHERE");
    expect(completeQuery.values).toEqual([]);
  });

  it("getProperties returns 500 when the query fails", async () => {
    queryRaw.mockRejectedValue(new Error("Query failed"));
    const req = createRequest();
    const res = createResponse();

    await getProperties(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      message: "Error retrieving properties: Query failed",
    });
  });

  it("getProperty returns a property with formatted coordinates", async () => {
    const property = {
      id: 10,
      name: "Test Property",
      location: {
        id: 99,
        address: "123 Test Ave",
      },
    };
    propertyFindUnique.mockResolvedValue(property);
    queryRaw.mockResolvedValue([
      { coordinates: "POINT(-73.935242 40.730610)" },
    ]);
    wktToGeoJSON.mockReturnValue({
      coordinates: [-73.935242, 40.73061],
    });
    const req = createRequest({ params: { id: "10" } });
    const res = createResponse();

    await getProperty(req, res);

    expect(propertyFindUnique).toHaveBeenCalledWith({
      where: { id: 10 },
      include: { location: true },
    });
    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(wktToGeoJSON).toHaveBeenCalledWith(
      "POINT(-73.935242 40.730610)",
    );
    expect(res.json).toHaveBeenCalledWith({
      ...property,
      location: {
        ...property.location,
        coordinates: {
          longitude: -73.935242,
          latitude: 40.73061,
        },
      },
    });
  });

  it("getProperty returns 404 when the property is missing", async () => {
    propertyFindUnique.mockResolvedValue(null);
    const req = createRequest({ params: { id: "404" } });
    const res = createResponse();

    await getProperty(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ message: "Property not found" });
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it("getProperty returns 500 when coordinates are missing", async () => {
    const property = {
      id: 10,
      name: "Test Property",
      location: {
        id: 99,
        address: "123 Test Ave",
      },
    };
    propertyFindUnique.mockResolvedValue(property);
    queryRaw.mockResolvedValue([]);
    wktToGeoJSON.mockImplementation(() => {
      throw new Error("Coordinates missing");
    });
    const req = createRequest({ params: { id: "10" } });
    const res = createResponse();

    await getProperty(req, res);

    expect(wktToGeoJSON).toHaveBeenCalledWith("");
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      message: "Error retrieving property: Coordinates missing",
    });
  });

  it("getProperty returns 500 when the lookup fails", async () => {
    propertyFindUnique.mockRejectedValue(new Error("Database error"));
    const req = createRequest({ params: { id: "10" } });
    const res = createResponse();

    await getProperty(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      message: "Error retrieving property: Database error",
    });
  });
});
