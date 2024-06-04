import { dbCollection } from "../database/collection";
import jwt from "jsonwebtoken";
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
