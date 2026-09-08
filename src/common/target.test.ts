import { describe, expect, it } from "vitest";
import { createRabbitmqTargetId, encodePathSegment } from "./target";

describe("target helpers", () => {
  it("creates URL-safe ids", () => {
    expect(createRabbitmqTargetId("ns", "rabbit", "operator")).toBe("operator/ns/rabbit");
    expect(createRabbitmqTargetId("ns", "weird name!", "service")).toBe("service/ns/weird_name_");
  });
  it("encodes the default vhost", () => {
    expect(encodePathSegment("/")).toBe("%2F");
    expect(encodePathSegment("a b")).toBe("a%20b");
  });
});
