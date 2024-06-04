import { MongoClient } from "mongodb";

const uri = "mongodb://localhost:27017";
export const client = new MongoClient(uri);
