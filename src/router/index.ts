import { Router } from "express";
import { gameController } from "./game";
import { userController } from "./user";
import { authenToken } from "../auth/auth";
import { tournamentController } from "./tournament";
import { landingpageController } from "./landing-page";
import { ipMiddleware } from "../middlewares/ip.middleware";

const routes = Router();

routes.get("/user/ping", userController.ping);
routes.get("/users", userController.getAllUser);
routes.post("/create-user", userController.createUser);
routes.get("/get-user", authenToken, userController.getUser);
routes.post("/elo", userController.updateElo);
routes.post("/new-user-with-elo", userController.newUserWithElo);
routes.post("/early-access", authenToken, userController.submitEarlyAccess);
routes.post("/telegram-login", userController.telegramLogin);
routes.get("/get-referral-link", authenToken, userController.getReferralLink);

routes.get("/login-message", userController.message);
routes.post("/login-verify-account", userController.verify);

// ton
routes.post("/generate_payload", userController.generatePayload);
routes.post("/check_proof", userController.checkProof);
routes.get("/get_account_info", userController.getAccountInfo);

// lading-page
routes.post("/landing-page/email-support", ipMiddleware, landingpageController.submit);
routes.get("/landing-page/get", landingpageController.get);

routes.post("/new-game-v2", authenToken, gameController.newGameV2);
routes.get("/load-game-v2", gameController.loadGameV2);
routes.get("/get-game-v2", authenToken, gameController.getGamesV2);
routes.post("/update-winner-v2", authenToken, gameController.updateWinnerV2);

routes.get("/load-tournament-game-v2", tournamentController.loadTournamentGameV2);

export default routes;
