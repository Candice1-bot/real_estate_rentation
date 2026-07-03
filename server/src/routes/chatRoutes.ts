// src/routes/chatRoute.ts
import { Router } from "express";
import OpenAI from "openai";

const router = Router();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type PropertySummary = {
  id: number | string;
  name?: string;
  title?: string;
  link?: string;
  location?:
    | string
    | {
        address?: string | null;
        city?: string | null;
        state?: string | null;
        country?: string | null;
        postalCode?: string | null;
      };
  pricePerMonth?: number;
  price?: number;
  beds?: number;
  bedrooms?: number;
  baths?: number;
  bathrooms?: number;
  squareFeet?: number;
  propertyType?: string;
  amenities?: string[];
  highlights?: string[];
  averageRating?: number | null;
  numberOfReviews?: number | null;
  isPetsAllowed?: boolean;
  isParkingIncluded?: boolean;
};

const formatLocation = (location: PropertySummary["location"]) => {
  if (!location) return "N/A";
  if (typeof location === "string") return location;

  return [
    location.address,
    location.city,
    location.state,
    location.country,
    location.postalCode,
  ]
    .filter(Boolean)
    .join(", ");
};

const formatCurrency = (value?: number) =>
  typeof value === "number" ? `$${value.toLocaleString()}` : "N/A";

const formatMonthlyPrice = (value?: number) =>
  typeof value === "number" ? `${formatCurrency(value)}/month` : "N/A";

const formatBoolean = (value?: boolean) => {
  if (typeof value !== "boolean") return "N/A";
  return value ? "yes" : "no";
};

router.post("/", async (req, res) => {
  try {
    const { messages, properties } = req.body as {
      messages: ChatMessage[];
      properties?: PropertySummary[];
    };

    if (!Array.isArray(messages)) {
      res.status(400).json({ error: "messages is required" });
      return;
    }

    const safeMessages = messages
      .filter(
        (message) =>
          (message.role === "user" || message.role === "assistant") &&
          typeof message.content === "string" &&
          message.content.trim().length > 0,
      )
      .slice(-12);

    if (!safeMessages.some((message) => message.role === "user")) {
      res.status(400).json({ error: "at least one user message is required" });
      return;
    }

    const propertyContext = (Array.isArray(properties) ? properties : [])
      .slice(0, 30)
      .map((p) => {
        const price = p.pricePerMonth ?? p.price;
        const beds = p.beds ?? p.bedrooms;
        const baths = p.baths ?? p.bathrooms;

        return [
          `ID: ${p.id}`,
          `Name: ${p.name ?? p.title ?? "N/A"}`,
          `Link: ${p.link ?? `/search/${p.id}`}`,
          `Location: ${formatLocation(p.location) || "N/A"}`,
          `Price: ${formatMonthlyPrice(price)}`,
          `Beds: ${beds ?? "N/A"}`,
          `Baths: ${baths ?? "N/A"}`,
          `Square feet: ${p.squareFeet ?? "N/A"}`,
          `Type: ${p.propertyType ?? "N/A"}`,
          `Amenities: ${p.amenities?.join(", ") || "N/A"}`,
          `Highlights: ${p.highlights?.join(", ") || "N/A"}`,
          `Pets allowed: ${formatBoolean(p.isPetsAllowed)}`,
          `Parking included: ${formatBoolean(p.isParkingIncluded)}`,
          `Rating: ${
            typeof p.averageRating === "number" &&
            typeof p.numberOfReviews === "number"
              ? `${p.averageRating}/5 from ${p.numberOfReviews} reviews`
              : "N/A"
          }`,
        ].join(", ");
      })
      .join("\n");

    const conversation = safeMessages
      .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
      .join("\n");

    const response = await openai.responses.create({
      model: "gpt-5.2",
      instructions: `
You are a helpful assistant for a real-estate rental website.
Answer based only on the provided property context when the user asks about properties.
When you mention or recommend a specific property, include its property link as a plain URL like /search/123.
If the answer is not available from the context, say you do not have enough information.
Keep answers concise and practical.
      `,
      input: `
Current available properties:
${propertyContext || "No property context provided."}

Conversation:
${conversation}
      `,
    });

    res.json({ answer: response.output_text });
  } catch (error) {
    console.error("Chat API error:", error);
    res.status(500).json({ error: "Failed to generate response" });
  }
});

export default router;
