import { dbCollection } from "../database/collection";
import jwt from "jsonwebtoken";
import { verifyPersonalMessageSignature } from "@mysten/sui/verify";
export function randomIntFromInterval(min, max) {
  return Math.floor(Math.random() * (max - min + 1) + min);
}
export const userController = {
  createUser: async (req, res) => {
    const { address, password } = req.body;
    const query = { address };
    const { collection } = await dbCollection<any>(process.env.DB_DECHESS!, process.env.DB_DECHESS_COLLECTION_USERS!);
    const user = await collection.findOne(query);
    if (user) {
      const queryPassword = { address, password };
      const temp = await collection.findOne(queryPassword);
      if (temp) {
        const accessToken = jwt.sign({ address: temp.address }, process.env.ACCESS_TOKEN_SECRET, {
          expiresIn: "24h",
        });
        res.json({ status: 200, message: "LOGIN_SUCCESS", data: accessToken });
        return;
      }
      res.json({ status: 405, message: "ERROR_PASSWORD" });
      return;
    }
    console.log("7s200:register");

    await collection.insertOne({ address, password });
    const accessToken = jwt.sign({ address }, process.env.ACCESS_TOKEN_SECRET, {
      expiresIn: "24h",
    });

    res.json({ status: 200, message: "REGISTER_SUCCESS", data: accessToken });
  },
  ping: async (req, res) => {
    res.json("user:router:ping");
  },
  message: async (req, res) => {
    const { address } = req.body;
    const message = `login::${address}::${randomIntFromInterval(1, 10000)}::${new Date().getTime()}`;
    res.json({ status: 200, message });
  },
  verify: async (req, res) => {
    try {
      const { address, message, signature } = req.body;

      const publicKey = await verifyPersonalMessageSignature(new TextEncoder().encode(message), signature);
      if (address !== publicKey.toSuiAddress()) {
        res.json({ status: 401, message: "Verify message failed!" });
      }
      const token = await jwt.sign({ address: publicKey.toSuiAddress() }, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "24h",
      });
      res.json({ status: 200, token });
    } catch (error) {
      res.json({ status: 500, message: "Verify failed!" });
    }
  },
  getAllUser: async (req, res) => {
    const { collection } = await dbCollection<any>(process.env.DB_DECHESS!, process.env.DB_DECHESS_COLLECTION_USERS!);
    const user = await collection.find().toArray();
    if (user) {
      res.json(user);
      return;
    }
    res.json(null);
  },
  getUser: async (req, res) => {
    if (req.userData) {
      res.json({ status: 200, message: "GET_USER_DATA_SUCCESS", data: { address: req.userData.address } });
      return;
    }
    res.json({ status: 404, message: "GET_USER_DATA_FAILD" });
  },
};
