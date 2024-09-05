import { dbCollection } from "../database/collection";
import jwt from "jsonwebtoken";
import { verifyPersonalMessageSignature } from "@mysten/sui/verify";
import { CheckProofRequest, TonProofService } from "../services/ton";
import { createAuthToken, createPayloadToken, decodeAuthToken, verifyInitData, verifyToken } from "../services/jwt";
import { TonApiService } from "../services/tonAPI";
import { unauthorized } from "../services/http-utils";
import { INIT_BEGINER_ELO } from "../utils/elo";
import { sign } from "tweetnacl";
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
        return res.json({ status: 401, message: "Verify message failed!" });
      }

      const token = await jwt.sign({ address: publicKey.toSuiAddress() }, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "24h",
      });
      return res.json({ status: 200, token });
    } catch (error) {
      res.json({ status: 500, message: "Verify failed!" });
    }
  },
  telegramLogin: async (req, res) => {
    const { data } = req.body;

    const isValidated = verifyInitData(data);

    console.log("7s200:isValidated", isValidated);

    if(!isValidated) {
      return res.json({ status: 401, message: "INVALID_INIT_DATA" });
    }

    const user = data.user;

    const { collection } = await dbCollection<any>(process.env.DB_DECHESS!, process.env.DB_DECHESS_COLLECTION_USERS!);

    let existUser = await collection.findOne({ address: user.id });

    if (!existUser) {
      existUser = await collection.insertOne({ address: user.id, elo: 0, isEarly: false, accessCode: null, username: user.username });
    }

    const token = jwt.sign({ address: user.id }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: "1h" });
    res.json({ status: 200, message: "LOGIN_SUCCESS", data: token });
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
    console.log("-> req", req.userData);
    try {
      const { collection } = await dbCollection<any>(process.env.DB_DECHESS!, process.env.DB_DECHESS_COLLECTION_USERS!);
      const userInfo = await collection.findOne({ address: req.userData.address });
      if (!userInfo) {
        return res.json({ status: 503, message: "GET_USER_DATA_FAILD" });
      }

      return res.json({ status: 200, message: "GET_USER_DATA_SUCCESS", data: { userInfo } });
    } catch (error) {
      console.log("7s200:error", error);
      return res.json({ status: 400, message: "GET_USER_DATA_FAILD" });
    }
  },
  generatePayload: async (req, res) => {
    const service = new TonProofService();
    const payload = service.generatePayload();
    const payloadToken = await createPayloadToken({ payload: payload });
    res.json({ status: 200, data: payloadToken, message: "GENERATE_PAYLOAD_SUCCESS" });
  },
  checkProof: async (req, res) => {
    try {
      const client = TonApiService.create(req.body.network as any);
      const service = new TonProofService();

      const isValid = await service.checkProof(req.body, (address) => client.getWalletPublicKey(address));
      if (!isValid) {
        return res.json({ status: 404, message: "INVALID_PROOF" });
      }

      const payloadToken = req.body.proof.payload;
      if (!(await verifyToken(payloadToken))) {
        return res.json({ status: 404, message: "INVALID_TOKEN" });
      }
      const { collection } = await dbCollection<any>(process.env.DB_DECHESS!, process.env.DB_DECHESS_COLLECTION_USERS!);
      const userInfo = await collection.findOne({ address: req.body.address });
      if (!userInfo) {
        const newUser = await collection.insertOne({ address: req.body.address, elo: 0, isEarly: false, accessCode: null });
        console.log("newuser", newUser);
        if (!newUser) {
          return res.json({ status: 500, message: "CREATE_USER_FAILED" });
        }
      }

      const token = await createAuthToken({ address: req.body.address, network: req.body.network as any });
      res.json({ status: 200, data: token, message: "GENERATE_PAYLOAD_SUCCESS" });
    } catch (e) {
      return res.json({ status: 404, message: "INVALID_REQUEST" });
    }
  },
  getAccountInfo: async (req, res) => {
    console.log("7s200:req", req);
    try {
      const token = req.headers.authorization.replace("Bearer ", "");
      if (!token || !(await verifyToken(token))) {
        return unauthorized({ error: "Unauthorized" });
      }

      const payload = decodeAuthToken(token);
      if (!payload?.address || !payload?.network) {
        return unauthorized({ error: "Invalid token" });
      }

      const client = TonApiService.create(payload.network);
      const user = await client.getAccountInfo(payload.address);
      res.json({ status: 200, data: user, message: "GET_ACCOUNT_INFO_SUCCESS" });
    } catch (e) {
      return res.json({ status: 404, message: "INVALID_REQUEST" });
    }
  },
  updateElo: async (req, res) => {
    const Ra = 1400;
    const Rb = 1200;
    const E_A = 1 / (1 + Math.pow(10, (Rb - Ra) / 400));
    const E_B = 1 / (1 + Math.pow(10, (Ra - Rb) / 400));
    const newRaWin = Ra + 32 * (1 - E_A);
    const newRaLoss = Ra + 32 * (0 - E_A);
    const newRaDraw = Ra + 32 * (0.5 - E_A);

    const newRbWin = Rb + 32 * (1 - E_B);
    const newRbLoss = Rb + 32 * (0 - E_B);
    const newRbDraw = Rb + 32 * (0.5 - E_B);

    res.json({
      newRaWin,
      newRaLoss,
      newRaDraw,
      newRbWin,
      newRbLoss,
      newRbDraw,
    });
  },
  newUserWithElo: async (req, res) => {
    try {
      console.log("7s200:req", req.body);
      const { collection } = await dbCollection<any>(process.env.DB_DECHESS!, process.env.DB_DECHESS_COLLECTION_USERS!);
      const userInfo = await collection.findOne({ address: req.body.address });
      console.log("7s200:userInfo", userInfo);
      if (userInfo) {
        return res.json({
          status: 501,
          message: "USER_EXITED",
        });
      }
      const newUser = await collection.insertOne({ address: req.body.address, elo: INIT_BEGINER_ELO });
      if (!newUser) {
        return res.json({
          status: 503,
          message: "CREATE_USER_FAILED",
        });
      }
      return res.json({
        status: 200,
        message: "CREATE_USER_SUCCESS",
      });
    } catch (error) {
      return res.json({
        status: 503,
        message: "CREATE_USER_FAILeD",
      });
    }
  },
  submitEarlyAccess: async (req, res) => {
    const { code } = req.body;
    const isValidCode = EARLY_ACCESS_CODE.find((e) => e.toLocaleLowerCase() === code.toLocaleLowerCase());
    if (!isValidCode) {
      return res.json({
        status: 501,
        message: "EARLY_ACCESS_CODE_UNVALID!",
      });
    }

    const { collection } = await dbCollection<any>(process.env.DB_DECHESS!, process.env.DB_DECHESS_COLLECTION_USERS!);
    const userInfo = await collection.findOne({ address: req.userData.address });
    if (!userInfo) {
      return res.json({
        status: 501,
        message: "USER_NOT_EXITEDS",
      });
    }
    if (userInfo.isEarly) {
      return res.json({
        status: 501,
        message: "USER_ACCESSED_BEFORE",
      });
    }
    const docs = {
      $set: {
        isEarly: true,
        accessCode: code.toLocaleLowerCase(),
      },
    };

    const updated = await collection.findOneAndUpdate({ address: userInfo.address }, docs);
    if (!updated) {
      return res.json({
        status: 501,
        message: "USER_SUBMIT_ACCESS_CODE_FAILED!",
      });
    }
    res.json({ success: true, status: 200, access_code: code });
  },
};

const EARLY_ACCESS_CODE = ["Dawning"];
