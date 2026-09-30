/**
 * Guards that keep development tooling away from real data.
 *
 * A database counts as local only when every host in the URI is loopback or
 * the dev compose service name. SRV URIs (Atlas) are never local.
 */
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "mongo"]);

export const getMongoHosts = (uri: string): string[] => {
  const match = /^mongodb(\+srv)?:\/\/(?:[^@/]*@)?([^/?]+)/i.exec(uri.trim());
  if (!match) return [];
  return match[2].split(",").map((entry) => {
    const host = entry.trim();
    if (host.startsWith("[")) return host.slice(0, host.indexOf("]") + 1);
    return host.split(":")[0];
  });
};

export const isLocalMongoUri = (uri: string): boolean => {
  if (!uri || /^mongodb\+srv:\/\//i.test(uri.trim())) return false;
  const hosts = getMongoHosts(uri);
  return hosts.length > 0 && hosts.every((host) => LOCAL_HOSTS.has(host.toLowerCase()));
};

/**
 * Returns a reason the URI must not be used for dev work, or null when safe.
 */
export const localDatabaseProblem = (
  uri: string,
  nodeEnv = process.env.NODE_ENV,
): string | null => {
  if (nodeEnv === "production") return "NODE_ENV is production";
  if (!uri) return "MONGO_URI is empty (run `pnpm setup:dev`)";
  if (!isLocalMongoUri(uri)) {
    const hosts = getMongoHosts(uri).join(", ") || "unparseable URI";
    return `MONGO_URI points at a non-local database (${hosts})`;
  }
  return null;
};

export const assertLocalDatabase = (
  uri: string,
  { allowOverride, context }: { allowOverride: boolean; context: string },
) => {
  const problem = localDatabaseProblem(uri);
  if (!problem) return;
  if (allowOverride && process.env.ALLOW_REMOTE_DB === "true") {
    console.warn(`[${context}] WARNING: ${problem}; continuing because ALLOW_REMOTE_DB=true`);
    return;
  }
  console.error(
    `\n[${context}] Refusing to run: ${problem}.\n` +
      `Development must use the local database from \`pnpm db:dev\` ` +
      `(mongodb://127.0.0.1:27017/workforce_dev). See docs/local-development.md.\n`,
  );
  process.exit(1);
};
