import { MongoMemoryServer } from "mongodb-memory-server";
import type { TestProject } from "vitest/node";

// One throwaway MongoDB for the whole test run. Each test file connects to its
// own database on it (see test/setup.ts), so files never see each other's data.
export default async function setup(project: TestProject) {
  const mongo = await MongoMemoryServer.create();
  project.provide("mongoUri", mongo.getUri());
  return async () => {
    await mongo.stop();
  };
}

declare module "vitest" {
  export interface ProvidedContext {
    mongoUri: string;
  }
}
