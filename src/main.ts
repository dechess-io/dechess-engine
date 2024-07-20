import express from "express";
import { client } from "./database";
import redisClient from "./cache/init.js";
import routes from "./router";
import cors from "cors";
const app = express();
const port = process.env.PORT || 3001;

import bodyParser from "body-parser";
import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import { dbCollection } from "./database/collection";
import md5 from "md5";
import { Chess, Chess as ChessV2, Square } from "./engine/chess2";
import { DEFAULT_0X0_ADDRESS, TGame, gameController } from "./router/game";
import { verifyToken } from "./services/jwt";
import * as cron from "node-cron";

const syncGames = async () => {
  try {
    const redisKeys = await redisClient.keys("*");
    const gamesToSync: any[] = [];

    for (const key of redisKeys) {
      const keyType = await redisClient.type(key);

      if (keyType !== "string") {
        console.log(`Skipping key ${key} of type ${keyType}`);
        continue;
      }
      const gameData = await redisClient.get(key);
      const game = JSON.parse(gameData);

      if (game.isGameOver) {
        gamesToSync.push(game);
      }
    }

    if (gamesToSync.length > 0) {
      const collection = client.db(process.env.DB_DECHESS!).collection(process.env.DB_DECHESS_COLLECTION_GAMES!);
      const bulkOperations = gamesToSync.map((game) => ({
        updateOne: {
          filter: { game_id: game.game_id },
          update: { $set: game },
          upsert: true,
        },
      }));
      await collection.bulkWrite(bulkOperations);
    }
  } catch (err) {
    console.error("Error syncing games:", err);
  }
};

// Schedule the task to run every 2 hours
cron.schedule("0 */2 * * *", syncGames);

(async function main() {
  app.use(cors());
  app.use(express.json());
  app.use(bodyParser.urlencoded({ extended: false }));
  app.use(
    express.json({
      type: ["application/json", "text/plain"],
    }),
  );

  let corsOptions = {
    origin: ["http://localhost:3000", "http://localhost:5173", "https://localhost:5173", "https://miniapp.dechess.io"],
    credentials: true,
  };

  // app.get("/get-game-V2", cors(corsOptions), gameController.getGamesV2);
  // app.use("/", cors(corsOptions), routes);

  app.use(cors(), routes);

  await client.connect().catch((err) => console.log("7s200:err", err));
  await redisClient.connect();

  app.get("/ping", (req, res) => {
    res.json("pong");
  });

  app.get("/remove-all-key", async (req, res) => {
    await redisClient.FLUSHALL();
    res.json({ message: "All keys removed successfully." });
  });

  app.get("/check-redis", async (req, res) => {
    await redisClient.set("de-chess", "health");
    const result = await redisClient.get("de-chess");
    res.json(result);
  });

  app.get("/get-all-redis", async (req, res) => {
    const keys = await redisClient.keys("*");
    const results = {};
    for (let key of keys) {
      const value = await redisClient.get(key);
      results[key] = value;
    }
    res.json(results);
  });

  client.on("close", () => {
    client.connect();
  });

  const http = app.listen(port, () => {
    console.log(`Example app listening on port ${port}`);
  });

  const io = new Server({
    cors: {
      origin: ["https://localhost:5173", "http://miniapp.dechess.io", "https://www.miniapp.dechess.io", "https://miniapp.dechess.io"],
    },
  }).listen(http);

  let waitingQueue = []; // Queue to store users waiting for a match

  io.use(async (socket, next) => {
    if (socket.handshake.headers.authorization) {
      const token = socket.handshake.headers.authorization.toString();
      const verified = await verifyToken(token);
      (socket as any).user = verified;
      return next();
      // jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, async (err, decodedToken) => {
      //   if (err) {
      //     // console.log("7s200:socket:auth:err", err, decodedToken);
      //     // return;
      //   }
      //   // const { collection } = await dbCollection<any>(process.env.DB_DECHESS!, process.env.DB_DECHESS_COLLECTION_USERS!);
      //   // const userData = await collection.findOne({ address: decodedToken.address });
      //   // // console.log("7s200:userData", userData);
      //   // if (!userData) {
      //   //   // console.log("7s200:socket:auth:err:userData", userData, decodedToken);
      //   //   return;
      //   // }
      //   (socket as any).user = decodedToken.address;
      //   return next();
      // });
    } else {
      return;
    }
  }).on("connection", (socket) => {
    console.log("New socket connection", (socket as any).user.address);

    socket.on("createGame", async function ({ timeStep, additionTimePerMove }, callback) {
      const user = (socket as any).user;
      console.log("7s200:waiting", waitingQueue);

      let userIndex = waitingQueue.findIndex((item) => item.user === user.address);

      if (userIndex !== -1) {
        waitingQueue[userIndex].socket = socket;
        waitingQueue[userIndex].callback = callback;
        waitingQueue[userIndex].timeStep = timeStep;
        waitingQueue[userIndex].additionTimePerMove = additionTimePerMove;
        socket.emit("createGame", { status: 202 });
      } else {
        let opponentIndex = waitingQueue.findIndex((item) => item.timeStep === timeStep && item.additionTimePerMove === additionTimePerMove);

        if (opponentIndex !== -1) {
          console.log("success");
          const time = Date.now();
          const id = md5(time);
          const opponent = waitingQueue.splice(opponentIndex, 1)[0]; // Remove opponent from the queue
          const chess = new ChessV2();
          const board = {
            game_id: id,
            player_1: opponent.user,
            player_2: user.address,
            board: chess.board(),
            score: 0,
            turn_player: chess.turn(),
            move_number: chess.moveNumber(),
            time: timeStep,
            timePerMove: additionTimePerMove,
            timers: {
              player1Timer: timeStep * 60,
              player2Timer: timeStep * 60,
            },
            fen: chess.fen(),
            isPaymentMatch: false,
            payAmount: 10_000_000_000_000,
            pays: {
              gameIndex: null,
              player1: 0,
              player2: 0,
            },
            isGameOver: false,
            isGameDraw: false,
            winner: null,
            loser: null,
          };
          // console.log("7s200:board", board);
          await redisClient.set(id, JSON.stringify(board));
          console.log(id);
          await redisClient.set("activeGame:" + user.address, id.trim());
          await redisClient.set("activeGame:" + opponent.user, id.trim());
          socket.join(board.game_id);
          opponent.socket.join(board.game_id);
          socket.emit("createGame", { status: 200, board });
          opponent.socket.emit("createGame", { status: 200, board });
        } else {
          // No matching opponent found, add the current user to the waiting queue
          waitingQueue.push({ user: user.address, socket, callback, timeStep, additionTimePerMove });
          socket.emit("createGame", { status: 202 });
        }
      }
    });

    socket.on("endGame", async function (data) {
      const user = (socket as any).user;
      const { game_id, isGameDraw, isGameOver } = data;
      socket.join(game_id);

      const cachedData = await redisClient.get(game_id);

      if (cachedData) {
        const cachedBoard = JSON.parse(cachedData);
        cachedBoard.isGameDraw = isGameDraw;
        cachedBoard.isGameOver = isGameOver;
        console.log("Hello");
        await redisClient.set(game_id, JSON.stringify(cachedBoard));
      } else {
        console.error(`Game with Id ${game_id} not found in cache`);
      }
    });

    socket.on("abort", async function (data) {
      const user = (socket as any).user;
      const { game_id, winner, loser } = data;
      socket.join(game_id);
      const cachedData = await redisClient.get(game_id);

      if (cachedData) {
        const cachedBoard = JSON.parse(cachedData);
        cachedBoard.isGameOver = true;
        cachedBoard.winner = winner;
        cachedBoard.loser = loser;

        await redisClient.set(game_id, JSON.stringify(cachedBoard));
      } else {
        console.error(`Game with Id ${game_id} not found in cache`);
      }
      socket.to(game_id).emit("opponentAbort");
    });

    socket.on("resign", async function (data) {
      console.log("resign");
      console.log(data);
      const user = (socket as any).user;
      const { game_id, loser, winner } = data;
      socket.join(game_id);
      const cachedData = await redisClient.get(game_id);

      if (cachedData) {
        const cachedBoard = JSON.parse(cachedData);
        cachedBoard.isGameOver = true;
        cachedBoard.winner = winner;
        cachedBoard.loser = loser;

        await redisClient.set(game_id, JSON.stringify(cachedBoard));
      } else {
        console.error(`Game with Id ${game_id} not found in cache`);
      }
      socket.to(game_id).emit("opponentResign");
    });

    socket.on("drawRequest", (data) => {
      const { game_id } = data;
      socket.to(game_id).emit("opponentDrawRequest");
    });

    socket.on("confirmDraw", async function (data) {
      console.log("confirmDraw");
      const user = (socket as any).user;
      const { game_id } = data;
      socket.join(game_id);
      const cachedData = await redisClient.get(game_id);

      if (cachedData) {
        const cachedBoard = JSON.parse(cachedData);
        cachedBoard.isGameOver = true;
        cachedBoard.isGameDraw = true;
        await redisClient.set(game_id, JSON.stringify(cachedBoard));
      } else {
        console.error(`Game with Id ${game_id} not found in cache`);
      }
      io.to(game_id).emit("drawConfirmed");
    });

    socket.on("cancelCreateGame", async function (callback) {
      const user = (socket as any).user;
      waitingQueue = waitingQueue.filter((item) => item.user !== user.address);
      callback({ status: 200, message: "Game creation cancelled successfully." });
    });

    socket.on("move", async function (move) {
      const user = (socket as any).user;

      const { from, to, turn, address, isPromotion, fen, game_id, promotion, timers, san, lastMove, startTime } = move; //fake fen'
      socket.join(game_id);

      let board: any;
      const cachedData = await redisClient.get(game_id);

      if (cachedData) {
        board = JSON.parse(cachedData);
      } else {
        return;
      }

      if ((board as any).isGameDraw || (board as any).isGameOver) {
        return;
      }
      if (board.player_1 !== user.address && board.turn_player === "w") {
        return;
      }
      if (board.player_2 !== user.address && board.turn_player === "b") {
        return;
      }

      const chess = new ChessV2(fen);
      try {
        if (!isPromotion) {
          chess.move({
            from: from,
            to: to,
          });
        } else {
          chess.move({
            from: from,
            to: to,
            promotion: promotion,
          });
        }
      } catch (error) {
        // console.log(error);
      }
      const isGameOver = chess.isGameOver();
      const isGameDraw = chess.isDraw();
      board.isGameDraw = isGameDraw;
      board.isGameOver = isGameOver;
      board.board = chess.board();
      board.move_number = chess.moveNumber();
      board.fen = chess.fen();
      board.turn_player = chess.turn();
      board.startTime = startTime;

      io.to(game_id).emit("newmove", { game_id: game_id, from, to, board: chess.board(), turn: chess.turn(), fen: chess.fen(), timers, san, lastMove, startTime });

      await redisClient.set(game_id, JSON.stringify(board));
      // console.log("7s200:move:7", { game_id: game_id, from, to, board: chess.board(), turn: chess.turn(), fen: chess.fen() });
    });

    socket.on("message", async function (data) {
      const { game_id, message } = data;
      socket.join(game_id);
      socket.to(game_id).emit("message", message);
    });

    socket.on("reconnect", async function () {
      try {
        const redisKeys = await redisClient.keys("*");
        for (const key of redisKeys) {
          if (key.startsWith("activeGame:")) {
            continue;
          }
          const gameData = await redisClient.get(key);
          const game = JSON.parse(gameData);
          if (game.isGameOver === false && (game.player_1 === (socket as any).user.address || game.player_2 === (socket as any).user.address)) {
            socket.emit("rejoinGame", { status: 200, game_id: game.game_id, user: (socket as any).user.address, opponent: game.player_1 === (socket as any).user.address ? game.player_2 : game.player_1 });
          }
        }
      } catch (err) {
        console.error(err);
      }
      socket.emit("rejoinGame", { status: 404, message: "No active game found for this user." });
    });

    socket.on("joinGame", async function (data) {
      // const { collection } = await dbCollection<TGame>(process.env.DB_DECHESS!, process.env.DB_DECHESS_COLLECTION_GAMES!);
      // const board = await collection.findOne({ game_id: data.game_id });

      const cachedBoard = await redisClient.get(data.game_id);
      const board = JSON.parse(cachedBoard);
      socket.join(board.game_id);

      // if (board.player_1.length === 0 && board.player_2.length === 0) {
      //   const updateDoc = {
      //     $set: {
      //       player_1: (socket as any).user,
      //     },
      //   };
      //   await collection.findOneAndUpdate({ game_id: data.game_id }, updateDoc);
      //   socket.join(data.game_id);
      // }
      // if (board.player_1.length > 0 && (socket as any).user !== board.player_1) {
      //   const updateDoc = {
      //     $set: {
      //       player_2: (socket as any).user,
      //     },
      //   };
      //   await collection.findOneAndUpdate({ game_id: data.game_id }, updateDoc);
      //   socket.join(data.game_id);
      // }
      // if (board.player_2.length > 0 && (socket as any).user !== board.player_2) {
      //   const updateDoc = {
      //     $set: {
      //       player_1: (socket as any).user,
      //     },
      //   };
      //   await collection.findOneAndUpdate({ game_id: data.game_id }, updateDoc);
      //   socket.join(data.game_id);
      // }
      socket.join(data.game_id);
    });

    socket.on("tournament", async function (data) {
      const { collection } = await dbCollection<any>(process.env.DB_DECHESS!, "tournament");
      // const board = await collection.find().toArray();
      // console.log("7s200:joinTournament:board", board);
      if (data.player1 && data.player2 && data.tournamnetIndex) {
        const board = await collection.findOne({ player1: data.player1, player2: data.player2, tournamentIndex: data.tournamentIndex, game_id: `${data.player1}-${data.player2}-${data.tournamentIndex}` });
        if (!board) {
          const chess = new ChessV2();
          const board = {
            board: chess.board(),
            fen: chess.fen(),
            player1: data.player1,
            player2: data.player2,
            turn_player: chess.turn(),
            game_id: `${data.player1}-${data.player2}-${data.tournamentIndex}`,
          };
          const newBoard = await collection.insertOne(board);
          socket.join(`${data.player1}-${data.player2}-${data.tournamentIndex}`);
        }
      }
    });

    socket.on("jointournamentgame", async function (data) {
      socket.join(data.game_id);
    });
    socket.on("tournamentmove", async function (move) {
      const { from, to, turn, address, isPromotion, fen, game_id } = move; //fake fen'
      socket.join(game_id);

      const { collection } = await dbCollection<any>(process.env.DB_DECHESS!, "tournament");
      const board = await collection.findOne({ game_id: game_id });
      console.log("7s200:board", board);
      if (board.player1 === "" || board.player2 === "" || board.player2 === DEFAULT_0X0_ADDRESS) {
        return;
      }
      if ((board as any).isGameDraw || (board as any).isGameOver) {
        return;
      }
      const chess = new ChessV2(fen);
      try {
        console.log("7s200:move:promotion");
        if (!isPromotion) {
          chess.move({
            from: from,
            to: to,
            // promotion: "q",
          });
        }
      } catch (error) {
        console.log("7s200:move:err");
      }
      const isGameOver = chess.isGameOver();
      const isGameDraw = chess.isDraw();
      const newBoard = {
        $set: {
          board: chess.board(),
          turn_player: chess.turn(),
          move_number: chess.moveNumber(),
          fen: chess.fen(),
          isGameDraw: isGameDraw,
          isGameOver: isGameOver,
        },
      };
      io.to(game_id).emit("tournamentnewmove", { game_id: game_id, from, to, board: chess.board(), turn: chess.turn(), fen: chess.fen() });
      await collection
        .findOneAndUpdate({ game_id: board.game_id }, newBoard)
        .then((data) => {
          if (data) {
          }
        })
        .catch((err) => {});
    });

    socket.on("disconnect", async function (data) {
      try {
        console.log("7s200:socket:disconnect");
        const gameId = await redisClient.get("activeGame:" + (socket as any).user.address);
        io.to(gameId).emit("opponentDisconnect");
      } catch (err) {
        console.error("7s200:socket:disconnect:err", err);
      }
    });
  });
})();
