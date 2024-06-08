import { MongoClient } from "mongodb";

const uri = "mongodb://0.0.0.0:27017/";
export const client = new MongoClient(uri);
