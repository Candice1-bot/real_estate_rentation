// components/ChatWidget.tsx
"use client";

import { Property } from "@/types/prismaTypes";
import { useMemo, useState, type ReactNode } from "react";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

type PropertySummary = {
  id: number | string;
  name: string;
  link: string;
  location: string;
  pricePerMonth: number;
  beds: number;
  baths: number;
  squareFeet?: number;
  propertyType?: string;
  amenities?: string[];
  highlights?: string[];
  averageRating?: number | null;
  numberOfReviews?: number | null;
  isPetsAllowed?: boolean;
  isParkingIncluded?: boolean;
};

type PropertyWithLocation = Property & {
  location?: {
    address?: string | null;
    city?: string | null;
    state?: string | null;
    country?: string | null;
    postalCode?: string | null;
  };
};

type ChatWidgetProps = {
  properties?: PropertyWithLocation[];
};

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";

const MESSAGE_LINK_PATTERN =
  /\[([^\]]+)\]\((https?:\/\/[^\s)]+|\/search\/\d+)\)|(https?:\/\/[^\s)]+|\/search\/\d+)/g;
const MESSAGE_BOLD_PATTERN = /\*\*([^*]+)\*\*/g;

const getLocationText = (location?: PropertyWithLocation["location"]) =>
  [
    location?.address,
    location?.city,
    location?.state,
    location?.country,
    location?.postalCode,
  ]
    .filter(Boolean)
    .join(", ") || "Location unavailable";

const getPropertySummary = (
  property: PropertyWithLocation,
): PropertySummary => ({
  id: property.id,
  name: property.name,
  link: `/search/${property.id}`,
  location: getLocationText(property.location),
  pricePerMonth: property.pricePerMonth,
  beds: property.beds,
  baths: property.baths,
  squareFeet: property.squareFeet,
  propertyType: property.propertyType,
  amenities: property.amenities?.map(String),
  highlights: property.highlights?.map(String),
  averageRating: property.averageRating,
  numberOfReviews: property.numberOfReviews,
  isPetsAllowed: property.isPetsAllowed,
  isParkingIncluded: property.isParkingIncluded,
});

const renderBoldText = (text: string, keyPrefix: string) => {
  const parts: ReactNode[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(MESSAGE_BOLD_PATTERN)) {
    const index = match.index ?? 0;
    const label = match[1] ?? "";

    if (index > lastIndex) {
      parts.push(text.slice(lastIndex, index));
    }

    parts.push(
      <strong key={`${keyPrefix}-bold-${index}`} className="font-semibold">
        {label}
      </strong>,
    );

    lastIndex = index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length ? parts : [text];
};

const renderMessageContent = (content: string) => {
  const parts: ReactNode[] = [];
  let lastIndex = 0;

  for (const match of content.matchAll(MESSAGE_LINK_PATTERN)) {
    const index = match.index ?? 0;
    const href = match[2] ?? match[3];
    const label = match[1] ?? href;
    const isExternal = href.startsWith("http");

    if (index > lastIndex) {
      parts.push(
        ...renderBoldText(content.slice(lastIndex, index), `text-${lastIndex}`),
      );
    }

    parts.push(
      <a
        key={`${href}-${index}`}
        href={href}
        target={isExternal ? "_blank" : undefined}
        rel={isExternal ? "noreferrer" : undefined}
        className="font-medium underline underline-offset-2 hover:opacity-80"
      >
        {renderBoldText(label, `link-${index}`)}
      </a>,
    );

    lastIndex = index + match[0].length;
  }

  if (lastIndex < content.length) {
    parts.push(
      ...renderBoldText(content.slice(lastIndex), `text-${lastIndex}`),
    );
  }

  return parts.length ? parts : content;
};

const ChatWidget = ({ properties = [] }: ChatWidgetProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content: "Hi, I can help you compare rental properties.",
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const propertySummaries = useMemo(
    () => properties.map(getPropertySummary),
    [properties],
  );

  async function handleSend() {
    const text = input.trim();
    if (!text || isLoading) return;

    const nextMessages: ChatMessage[] = [
      ...messages,
      { role: "user", content: text },
    ];

    setMessages(nextMessages);
    setInput("");
    setIsLoading(true);

    try {
      const response = await fetch(
        `${API_BASE_URL.replace(/\/$/, "")}/api/chat`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messages: nextMessages,
            properties: propertySummaries,
          }),
        },
      );

      if (!response.ok) {
        throw new Error("Failed to send message");
      }

      const data = await response.json();

      setMessages([
        ...nextMessages,
        {
          role: "assistant",
          content: data.answer || "Sorry, I could not answer that.",
        },
      ]);
    } catch (error) {
      console.error(error);

      setMessages([
        ...nextMessages,
        {
          role: "assistant",
          content: "Sorry, something went wrong. Please try again.",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="fixed bottom-6 right-6 z-50">
      {isOpen && (
        <div className="mb-4 flex h-[500px] w-[360px] flex-col rounded-2xl border bg-white shadow-xl">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h2 className="font-semibold">Rental Assistant</h2>
            <button
              onClick={() => setIsOpen(false)}
              className="text-sm text-gray-500 hover:text-gray-900"
            >
              ✕
            </button>
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {messages.map((message, index) => (
              <div
                key={index}
                className={`max-w-[85%] whitespace-pre-wrap rounded-xl px-3 py-2 text-sm ${
                  message.role === "user"
                    ? "ml-auto bg-black text-white"
                    : "mr-auto bg-gray-100 text-gray-900"
                }`}
              >
                {renderMessageContent(message.content)}
              </div>
            ))}

            {isLoading && (
              <div className="mr-auto max-w-[85%] rounded-xl bg-gray-100 px-3 py-2 text-sm text-gray-500">
                Thinking...
              </div>
            )}
          </div>

          <div className="flex gap-2 border-t p-3">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleSend();
                }
              }}
              placeholder="Ask about these properties..."
              className="flex-1 rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black"
            />

            <button
              onClick={handleSend}
              disabled={isLoading}
              className="rounded-lg bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
            >
              Send
            </button>
          </div>
        </div>
      )}

      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className="rounded-full bg-black px-5 py-4 text-white shadow-lg hover:bg-gray-800"
      >
        Chat
      </button>
    </div>
  );
};

export default ChatWidget;
