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
// src/routes/chatRoute.ts
const express_1 = require("express");
const openai_1 = __importDefault(require("openai"));
const router = (0, express_1.Router)();
const openai = new openai_1.default({
    apiKey: process.env.OPENAI_API_KEY,
});
const formatLocation = (location) => {
    if (!location)
        return "N/A";
    if (typeof location === "string")
        return location;
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
const formatCurrency = (value) => typeof value === "number" ? `$${value.toLocaleString()}` : "N/A";
const formatMonthlyPrice = (value) => typeof value === "number" ? `${formatCurrency(value)}/month` : "N/A";
const formatBoolean = (value) => {
    if (typeof value !== "boolean")
        return "N/A";
    return value ? "yes" : "no";
};
router.post("/", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { messages, properties } = req.body;
        if (!Array.isArray(messages)) {
            res.status(400).json({ error: "messages is required" });
            return;
        }
        const safeMessages = messages
            .filter((message) => (message.role === "user" || message.role === "assistant") &&
            typeof message.content === "string" &&
            message.content.trim().length > 0)
            .slice(-12);
        if (!safeMessages.some((message) => message.role === "user")) {
            res.status(400).json({ error: "at least one user message is required" });
            return;
        }
        const propertyContext = (Array.isArray(properties) ? properties : [])
            .slice(0, 30)
            .map((p) => {
            var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
            const price = (_a = p.pricePerMonth) !== null && _a !== void 0 ? _a : p.price;
            const beds = (_b = p.beds) !== null && _b !== void 0 ? _b : p.bedrooms;
            const baths = (_c = p.baths) !== null && _c !== void 0 ? _c : p.bathrooms;
            return [
                `ID: ${p.id}`,
                `Name: ${(_e = (_d = p.name) !== null && _d !== void 0 ? _d : p.title) !== null && _e !== void 0 ? _e : "N/A"}`,
                `Link: ${(_f = p.link) !== null && _f !== void 0 ? _f : `/search/${p.id}`}`,
                `Location: ${formatLocation(p.location) || "N/A"}`,
                `Price: ${formatMonthlyPrice(price)}`,
                `Beds: ${beds !== null && beds !== void 0 ? beds : "N/A"}`,
                `Baths: ${baths !== null && baths !== void 0 ? baths : "N/A"}`,
                `Square feet: ${(_g = p.squareFeet) !== null && _g !== void 0 ? _g : "N/A"}`,
                `Type: ${(_h = p.propertyType) !== null && _h !== void 0 ? _h : "N/A"}`,
                `Amenities: ${((_j = p.amenities) === null || _j === void 0 ? void 0 : _j.join(", ")) || "N/A"}`,
                `Highlights: ${((_k = p.highlights) === null || _k === void 0 ? void 0 : _k.join(", ")) || "N/A"}`,
                `Pets allowed: ${formatBoolean(p.isPetsAllowed)}`,
                `Parking included: ${formatBoolean(p.isParkingIncluded)}`,
                `Rating: ${typeof p.averageRating === "number" &&
                    typeof p.numberOfReviews === "number"
                    ? `${p.averageRating}/5 from ${p.numberOfReviews} reviews`
                    : "N/A"}`,
            ].join(", ");
        })
            .join("\n");
        const conversation = safeMessages
            .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
            .join("\n");
        const response = yield openai.responses.create({
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
    }
    catch (error) {
        console.error("Chat API error:", error);
        res.status(500).json({ error: "Failed to generate response" });
    }
}));
exports.default = router;
