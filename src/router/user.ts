import { dbCollection } from "../database/collection";
import jwt from "jsonwebtoken";
import { verifyPersonalMessageSignature } from "@mysten/sui/verify";
import { CheckProofRequest, TonProofService } from "../services/ton";
import { createAuthToken, createPayloadToken, decodeAuthToken, verifyToken } from "../services/jwt";
import { TonApiService } from "../services/tonAPI";
import { unauthorized } from "../services/http-utils";
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
};

//  {
//   "address": '0:05c059e253d1e404279800aa40293e7bbcc9525d18f05b017e3e52d800f671e8',
//   "network": '-239',
//   "public_key": '783212be56e7b61132687d2d646e15d85c333d2cb74b22a31aba1d908af1df8f',
//   "proof": {
//     "timestamp": 1718802061,
//     "domain": { "lengthBytes": 18, "value": 'miniapp.dechess.io' },
//     "signature": 'n/eeMa1mNaEEfTKXYJcEYts9eTr18csG3yY8876ceysvbdF36wiq86tsv365xf4pALoJeTmmwe0bkw+n2vDrAA==',
//     "payload": 'eyJhbGciOiJIUzI1NiJ9.eyJwYXlsb2FkIjoiOWZkOWZlMjc4YjRmMWFiZjg3NDcxMTI0ZDM2YTI5MWIyNjNlYjE3ODI5ZGM5MzhhYjFkZjBjYzlkNmJjOGUyNCIsImlhdCI6MTcxODgwMjA1MywiZXhwIjoxNzE4ODAyOTUzfQ.EcZ7hRVLU9bbJoxOJZ6ZXyVaq2dta2sKk_BwczGn1HY',
//     "state_init": 'te6cckECFgEAAwQAAgE0AgEAUQAAAAApqaMXeDISvlbnthEyaH0tZG4V2FwzPSy3SyKjGrodkIrx349AART/APSkE/S88sgLAwIBIAkEBPjygwjXGCDTH9Mf0x8C+CO78mTtRNDTH9Mf0//0BNFRQ7ryoVFRuvKiBfkBVBBk+RDyo/gAJKTIyx9SQMsfUjDL/1IQ9ADJ7VT4DwHTByHAAJ9sUZMg10qW0wfUAvsA6DDgIcAB4wAhwALjAAHAA5Ew4w0DpMjLHxLLH8v/CAcGBQAK9ADJ7VQAbIEBCNcY+gDTPzBSJIEBCPRZ8qeCEGRzdHJwdIAYyMsFywJQBc8WUAP6AhPLassfEss/yXP7AABwgQEI1xj6ANM/yFQgR4EBCPRR8qeCEG5vdGVwdIAYyMsFywJQBs8WUAT6AhTLahLLH8s/yXP7AAIAbtIH+gDU1CL5AAXIygcVy//J0Hd0gBjIywXLAiLPFlAF+gIUy2sSzMzJc/sAyEAUgQEI9FHypwICAUgTCgIBIAwLAFm9JCtvaiaECAoGuQ+gIYRw1AgIR6STfSmRDOaQPp/5g3gSgBt4EBSJhxWfMYQCASAODQARuMl+1E0NcLH4AgFYEg8CASAREAAZrx32omhAEGuQ64WPwAAZrc52omhAIGuQ64X/wAA9sp37UTQgQFA1yH0BDACyMoHy//J0AGBAQj0Cm+hMYALm0AHQ0wMhcbCSXwTgItdJwSCSXwTgAtMfIYIQcGx1Z70ighBkc3RyvbCSXwXgA/pAMCD6RAHIygfL/8nQ7UTQgQFA1yH0BDBcgQEI9ApvoTGzkl8H4AXTP8glghBwbHVnupI4MOMNA4IQZHN0crqSXwbjDRUUAIpQBIEBCPRZMO1E0IEBQNcgyAHPFvQAye1UAXKwjiOCEGRzdHKDHrFwgBhQBcsFUAPPFiP6AhPLassfyz/JgED7AJJfA+IAeAH6APQEMPgnbyIwUAqhIb7y4FCCEHBsdWeDHrFwgBhQBMsFJs8WWPoCGfQAy2kXyx9SYMs/IMmAQPsABlWBMNI='
//   }
//  }
