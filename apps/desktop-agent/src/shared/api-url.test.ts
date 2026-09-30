import { describe, expect, it } from "vitest";

import {
  LOCAL_API_URL,
  PRODUCTION_API_URL,
  resolveApiBaseUrl,
  resolveRendererApiUrl,
} from "./api-url";

describe("main-process API URL", () => {
  it("pins packaged (released) builds to production, whatever the env says", () => {
    expect(resolveApiBaseUrl(true, "http://localhost:5000/api")).toBe(PRODUCTION_API_URL);
  });

  it("uses the configured URL in dev", () => {
    expect(resolveApiBaseUrl(false, "http://192.168.1.10:5000/api")).toBe("http://192.168.1.10:5000/api");
  });

  it("falls back to the LOCAL backend in dev, never production", () => {
    expect(resolveApiBaseUrl(false, undefined)).toBe(LOCAL_API_URL);
    expect(resolveApiBaseUrl(false, "")).toBe(LOCAL_API_URL);
  });
});

describe("renderer API URL", () => {
  it("uses the build-time URL when present", () => {
    expect(resolveRendererApiUrl("https://staging.example.com/api", false)).toBe("https://staging.example.com/api");
  });

  it("falls back by build mode", () => {
    expect(resolveRendererApiUrl(undefined, true)).toBe(LOCAL_API_URL);
    expect(resolveRendererApiUrl(undefined, false)).toBe(PRODUCTION_API_URL);
  });
});
