import type { Express } from "express";
import {
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import request from "supertest";

const mockResponsesCreate =
  jest.fn<
    (params: {
      model: string;
      instructions: string;
      input: string;
    }) => Promise<{ output_text: string }>
  >();

const MockOpenAI = jest.fn(() => ({
  responses: {
    create: mockResponsesCreate,
  },
}));

jest.unstable_mockModule("openai", () => ({
  default: MockOpenAI,
}));

let app: Express;

beforeAll(async () => {
  const appModule = await import("../../../app.js");
  app = appModule.default as unknown as Express;
});

describe("chatRoutes integration", () => {
  beforeEach(() => {
    mockResponsesCreate.mockReset();
  });

  // tests: router.post("/", async (req, res) => { ... });
  it("returns an answer from OpenAI", async () => {
    mockResponsesCreate.mockResolvedValue({
      output_text: "Sunny Downtown Apartment is a good fit. See /search/1.",
    });

    const response = await request(app)
      .post("/api/chat")
      .send({
        messages: [
          {
            role: "user",
            content: "Which apartment has parking?",
          },
        ],
        properties: [
          {
            id: 1,
            name: "Sunny Downtown Apartment",
            location: {
              address: "123 Colorado Blvd",
              city: "Pasadena",
              state: "CA",
              country: "United States",
              postalCode: "91105",
            },
            pricePerMonth: 1500,
            beds: 2,
            baths: 1,
            squareFeet: 800,
            propertyType: "Apartment",
            amenities: ["AirConditioning", "Parking"],
            highlights: ["CloseToTransit"],
            averageRating: 4.5,
            numberOfReviews: 10,
            isPetsAllowed: true,
            isParkingIncluded: true,
          },
        ],
      })
      .expect(200);

    expect(response.body).toEqual({
      answer: "Sunny Downtown Apartment is a good fit. See /search/1.",
    });
    expect(mockResponsesCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gpt-5.2",
        input: expect.stringContaining("Sunny Downtown Apartment"),
      }),
    );
    expect(mockResponsesCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.stringContaining("USER: Which apartment has parking?"),
      }),
    );
  });
  // bad path 1:
  it("returns 400 when messages is missing", async () => {
    await request(app)
      .post("/api/chat")
      .send({})
      .expect(400)
      .expect({ error: "messages is required" });

    expect(mockResponsesCreate).not.toHaveBeenCalled();
  });
  // bad path 2
  it("returns 400 when there is no user message", async () => {
    await request(app)
      .post("/api/chat")
      .send({
        messages: [
          {
            role: "assistant",
            content: "How can I help?",
          },
        ],
      })
      .expect(400)
      .expect({ error: "at least one user message is required" });

    expect(mockResponsesCreate).not.toHaveBeenCalled();
  });
});
