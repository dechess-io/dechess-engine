import { createClient } from "redis";

const client = createClient({
  url: process.env.REDIS_URL || "redis://127.0.0.1:6379",
  connectTimeout: 10000,
});

client.on("error", (err) => console.log("Redis Client Error", err));
export default client;
