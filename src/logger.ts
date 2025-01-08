import { Client } from "@opensearch-project/opensearch";

const client = new Client({
  node: process.env.OPENSEARCH_URL,
  auth: {
    username: process.env.OPENSEARCH_USERNAME,
    password: process.env.OPENSEARCH_PASSWORD,
  },
});

export const logToOpenSearch = async (message: string) => {
  try {
    await client.index({
      index: "desschess-event",
      body: {
        timestamp: new Date().toISOString(),
        message,
      },
    });
  } catch (error) {
    console.error("Failed to log to OpenSearch:", error);
  }
};
