import { dbCollection } from "../database/collection";
import { landingpage_validate_email } from "../validator/lading-page.validator";

export const landingpageController = {
  submit: async (req, res) => {
    const { email } = req.body;
    const { error, value } = landingpage_validate_email.validate(req.body, { abortEarly: false });
    console.log("7s200:validate:", error, value);
    if (error) {
      return res.json({ error: true, message: error.message });
    }
    const { collection } = await dbCollection<any>(process.env.DB_DECHESS!, "ladingpage");
    const exitedEmail = await collection.findOne({ email });
    if (exitedEmail) {
      return res.json({ error: true, message: "Email exited!" });
    }
    const exitedIP = await collection.find({ ip: req.clientIP });
    if (exitedIP) {
      return res.json({ error: true, message: "You are submited a email!" });
    }

    const insert = await collection.insertOne({ email, ip: req.clientIP });

    res.json({ error: false, data: insert });
  },
  get: async (req, res) => {
    const { collection } = await dbCollection<any>(process.env.DB_DECHESS!, "ladingpage");
    const emails = await collection.find().toArray();
    if (emails) {
      return res.json({ data: emails });
    }
    return res.json({ data: [] });
  },
};
