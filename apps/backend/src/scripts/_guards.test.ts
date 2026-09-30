import { describe, expect, it } from "vitest";

import { getMongoHosts, isLocalMongoUri, localDatabaseProblem } from "./_guards";

describe("dev database guard", () => {
  it.each([
    "mongodb://127.0.0.1:27017/workforce_dev",
    "mongodb://localhost/workforce_dev",
    "mongodb://mongo:27017/workforce_dev",
    "mongodb://[::1]:27017/workforce_dev",
    "mongodb://user:pass@localhost:27017/db?authSource=admin",
  ])("accepts local URI %s", (uri) => {
    expect(isLocalMongoUri(uri)).toBe(true);
    expect(localDatabaseProblem(uri, "development")).toBeNull();
  });

  it.each([
    "mongodb+srv://user:pass@cluster0.example.mongodb.net/prod",
    "mongodb://user:pass@10.0.0.5:27017/prod",
    "mongodb://db.prosyncedu.com:27017/prod",
    // one remote member in a replica set is enough to refuse
    "mongodb://localhost:27017,db.example.com:27017/prod?replicaSet=rs0",
    "",
    "not-a-uri",
  ])("refuses non-local URI %s", (uri) => {
    expect(isLocalMongoUri(uri)).toBe(false);
    expect(localDatabaseProblem(uri, "development")).not.toBeNull();
  });

  it("refuses whenever NODE_ENV is production, even for localhost", () => {
    expect(localDatabaseProblem("mongodb://127.0.0.1:27017/db", "production")).toMatch(/production/);
  });

  it("parses every host of a multi-host URI", () => {
    expect(getMongoHosts("mongodb://a:1,b:2,[::1]:3/db")).toEqual(["a", "b", "[::1]"]);
  });
});
