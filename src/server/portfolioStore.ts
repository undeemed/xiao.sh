import { ConvexHttpClient } from "convex/browser";

type LocalStore = {
  visitCount: number;
  siteStartTime: number;
};

const CONVEX_FUNCTIONS = {
  trackVisit: "portfolio:trackVisit",
  getSiteStartTime: "portfolio:getSiteStartTime",
} as const;

const globalStore = globalThis as typeof globalThis & {
  __xiaoPortfolioStore?: LocalStore;
};

function getLocalStore(): LocalStore {
  if (!globalStore.__xiaoPortfolioStore) {
    globalStore.__xiaoPortfolioStore = {
      visitCount: 1337,
      siteStartTime: Date.now(),
    };
  }

  return globalStore.__xiaoPortfolioStore;
}

function getConvexClient() {
  const url = process.env.CONVEX_URL;
  if (!url) return null;
  return new ConvexHttpClient(url);
}

type ConvexArgs = Record<string, unknown>;

async function runConvexMutation(
  client: ConvexHttpClient,
  functionName: string,
  args: ConvexArgs = {}
) {
  const mutation = client.mutation as unknown as (
    fn: string,
    mutationArgs: ConvexArgs
  ) => Promise<unknown>;
  return mutation(functionName, args);
}

async function runConvexQuery(
  client: ConvexHttpClient,
  functionName: string,
  args: ConvexArgs = {}
) {
  const query = client.query as unknown as (
    fn: string,
    queryArgs: ConvexArgs
  ) => Promise<unknown>;
  return query(functionName, args);
}

async function runWithConvex<T>(
  operation: (client: ConvexHttpClient) => Promise<T>,
  fallback: () => T
) {
  const client = getConvexClient();
  if (!client) return fallback();

  try {
    return await operation(client);
  } catch {
    return fallback();
  }
}

export async function recordVisitAndGetCount() {
  return runWithConvex(
    async (client) => {
      const result = await runConvexMutation(client, CONVEX_FUNCTIONS.trackVisit);
      return typeof result === "number" ? result : getLocalStore().visitCount;
    },
    () => {
      const store = getLocalStore();
      store.visitCount += 1;
      return store.visitCount;
    }
  );
}

export async function getSiteStartTime() {
  return runWithConvex(
    async (client) => {
      const result = await runConvexQuery(client, CONVEX_FUNCTIONS.getSiteStartTime);
      return typeof result === "number" ? result : getLocalStore().siteStartTime;
    },
    () => getLocalStore().siteStartTime
  );
}
