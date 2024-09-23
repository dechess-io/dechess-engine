import jwt from "jsonwebtoken";
import { dbCollection } from "../database/collection";
export async function authenToken(req, res, next) {
  const authorizationClient = req.headers["authorization"];
  const token = authorizationClient && authorizationClient.split(" ")[1];
  if (!token) return res.sendStatus(401);

  try {
    const user = await jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    console.log("-> user", user);
    const { collection } = await dbCollection<any>(process.env.DB_DECHESS!, process.env.DB_DECHESS_COLLECTION_USERS!);
    const userData = await collection.findOne({ address: user.address });
    req.userData = userData;
    next();
  } catch (e) {
    return res.sendStatus(403);
  }
}
