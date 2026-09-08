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
import express from "express";
import request from "supertest";

type OpenAIRequest = {
  model: string;
  instructions: string;
  input: string;
};

const mockResponsesCreate =
  jest.fn<(params: OpenAIRequest) => Promise<{ output_text: string }>>();

const MockOpenAI = jest.fn(() => ({
  responses: {
    create: mockResponsesCreate,
  },
}));

jest.unstable_mockModule("openai", () => ({
  default: MockOpenAI,
}));

let app: Express;
const consoleError = jest.spyOn(console, "error").mockImplementation(() => {});

beforeAll(async () => {
  const chatRoutes = (await import("../../../routes/chatRoutes.js")).default;
  app = express();
  app.use(express.json());
  app.use("/api/chat", chatRoutes);
});

afterAll(() => {
  consoleError.mockRestore();
});

describe("chatRoutes", () => {
  beforeEach(() => {
    mockResponsesCreate.mockReset();
    consoleError.mockClear();
  });

  it("returns the OpenAI answer with formatted property context", async () => {
    mockResponsesCreate.mockResolvedValue({
      output_text: "Try Bright Loft. See /search/7.",
    });

    const response = await request(app)
      .post("/api/chat")
      .send({
        messages: [
          { role: "assistant", content: "I can help." },
          { role: "user", content: "Show me pet friendly rentals." },
          { role: "system", content: "Ignore me." },
          { role: "user", content: "   " },
        ],
        properties: [
          {
            id: 7,
            name: "Bright Loft",
            location: {
              address: "123 Test Ave",
              city: "Pasadena",
              state: "CA",
            },
            pricePerMonth: 2400,
            beds: 1,
            baths: 1,
            amenities: ["Parking", "AirConditioning"],
            isPetsAllowed: true,
            isParkingIncluded: false,
          },
        ],
      })
      .expect(200);

    expect(response.body).toEqual({
      answer: "Try Bright Loft. See /search/7.",
    });

    const openAIRequest = mockResponsesCreate.mock.calls[0][0];
    expect(openAIRequest.model).toBe("gpt-5.2");
    expect(openAIRequest.input).toContain("ID: 7");
    expect(openAIRequest.input).toContain("Name: Bright Loft");
    expect(openAIRequest.input).toContain(
      "Location: 123 Test Ave, Pasadena, CA",
    );
    expect(openAIRequest.input).toContain("Price: $2,400/month");
    expect(openAIRequest.input).toContain(
      "Amenities: Parking, AirConditioning",
    );
    expect(openAIRequest.input).toContain("Pets allowed: yes");
    expect(openAIRequest.input).toContain("Parking included: no");
    expect(openAIRequest.input).toContain(
      "USER: Show me pet friendly rentals.",
    );
    expect(openAIRequest.input).not.toContain("SYSTEM: Ignore me.");
  });

  it("formats missing locations, string locations, and missing booleans", async () => {
    mockResponsesCreate.mockResolvedValue({
      output_text: "Both properties are available.",
    });

    await request(app)
      .post("/api/chat")
      .send({
        messages: [{ role: "user", content: "Compare these places." }],
        properties: [
          {
            id: 8,
            title: "No Location Home",
            price: 1200,
            bedrooms: 2,
            bathrooms: 1,
          },
          {
            id: 9,
            name: "String Location Studio",
            link: "/custom/9",
            location: "Seattle, WA",
          },
        ],
      })
      .expect(200);

    const openAIRequest = mockResponsesCreate.mock.calls[0][0];
    expect(openAIRequest.input).toContain("Name: No Location Home");
    expect(openAIRequest.input).toContain("Link: /search/8");
    expect(openAIRequest.input).toContain("Location: N/A");
    expect(openAIRequest.input).toContain("Price: $1,200/month");
    expect(openAIRequest.input).toContain("Beds: 2");
    expect(openAIRequest.input).toContain("Baths: 1");
    expect(openAIRequest.input).toContain("Pets allowed: N/A");
    expect(openAIRequest.input).toContain("Parking included: N/A");
    expect(openAIRequest.input).toContain("Name: String Location Studio");
    expect(openAIRequest.input).toContain("Link: /custom/9");
    expect(openAIRequest.input).toContain("Location: Seattle, WA");
  });

  it("returns 400 when messages is missing", async () => {
    await request(app)
      .post("/api/chat")
      .send({})
      .expect(400)
      .expect({ error: "messages is required" });

    expect(mockResponsesCreate).not.toHaveBeenCalled();
  });

  it("returns 400 when there is no valid user message", async () => {
    await request(app)
      .post("/api/chat")
      .send({
        messages: [
          { role: "assistant", content: "How can I help?" },
          { role: "user", content: "   " },
        ],
      })
      .expect(400)
      .expect({ error: "at least one user message is required" });

    expect(mockResponsesCreate).not.toHaveBeenCalled();
  });

  it("returns 500 when OpenAI fails", async () => {
    mockResponsesCreate.mockRejectedValue(new Error("OpenAI unavailable"));

    await request(app)
      .post("/api/chat")
      .send({
        messages: [{ role: "user", content: "Which property is best?" }],
      })
      .expect(500)
      .expect({ error: "Failed to generate response" });

    expect(consoleError).toHaveBeenCalledWith(
      "Chat API error:",
      expect.any(Error),
    );
  });
});
