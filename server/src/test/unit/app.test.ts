import { describe, expect, it } from "@jest/globals";
import request from "supertest";
import app from "../../app";

describe("app", () => {
  it("GET / returns the home route message", async () => {
    const response = await request(app).get("/").expect(200);

    expect(response.text).toBe("This is home route");
  });
});
