import { Router } from "express";
import { gameController } from "./game";
import { userController } from "./user";
import { authenToken } from "../auth/auth";
import { tournamentController } from "./tournament";

const routes = Router();

routes.get("/user/ping", userController.ping);
routes.get("/users", userController.getAllUser);
routes.post("/create-user", userController.createUser);
routes.get("/get-user", authenToken, userController.getUser);

routes.get("/login-message", userController.message);
routes.post("/login-verify-account", userController.verify);

routes.post("/new-game", gameController.newGame);
routes.get("/legal-moves/:gameId/:position", gameController.legalMoves);
routes.post("/make-move/:from/:to", gameController.makeMove);

routes.post("/new-game-v2", authenToken, gameController.newGameV2);
routes.get("/load-game-v2", gameController.loadGameV2);
routes.get("/get-game-v2", authenToken, gameController.getGamesV2);
routes.post("/update-winner-v2", authenToken, gameController.updateWinnerV2);

routes.get("/load-tournament-game-v2", tournamentController.loadTournamentGameV2);

export default routes;
