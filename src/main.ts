import express from "express";
import { client } from "./database";
import redisClient from "./cache/init.js";
import routes from "./router";
import cors from "cors";
const app = express();
const port = process.env.PORT || 3001;
import bodyParser from "body-parser";
import { Server } from "socket.io";
import { dbCollection } from "./database/collection";
import md5 from "md5";
import { Chess as ChessV2 } from "./engine/chess";
import { TGame } from "./router/game";
import { verifyToken } from "./services/jwt";
import * as cron from "node-cron";
import TelegramBot from "node-telegram-bot-api";

const ABSENT_GAME_KEY = "absentGames";

// Replace with your bot token
const token = "7327954703:AAGxjpHMPNnnvUsBaKFJXkBp9xMkK8pL8dE";

// Create a bot instance
const bot = new TelegramBot(token, { polling: true });
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

async function addAbsentGame(game_id: string, user: string) {
  const leaveTime = Date.now();
  const absentGames = await redisClient.get(ABSENT_GAME_KEY);

  let absentGamesList = absentGames ? JSON.parse(absentGames) : [];

  const gameAlreadyAbsent = absentGamesList.find((game) => game.game_id === game_id);

  if (gameAlreadyAbsent) {
    if (!gameAlreadyAbsent.user.includes(user)) {
      gameAlreadyAbsent.user.push(user);
      gameAlreadyAbsent.leaveTimes.push(leaveTime);
    }
  } else {
    const gameAbsent = { game_id, user: [user], leaveTimes: [leaveTime] };
    absentGamesList.push(gameAbsent);
  }
  await redisClient.set(ABSENT_GAME_KEY, JSON.stringify(absentGamesList));
}

async function removeAbsentGame(game_id: string, user: string) {
  const absentGames = await redisClient.get(ABSENT_GAME_KEY);
  if (absentGames) {
    let absentGamesList = JSON.parse(absentGames);
    let gameAbsent = absentGamesList.find((game) => game.game_id === game_id);

    if (gameAbsent) {
      const userIndex = gameAbsent.user.indexOf(user);
      if (userIndex !== -1) {
        gameAbsent.user.splice(userIndex, 1);
        gameAbsent.leaveTimes.splice(userIndex, 1);
      }

      if (gameAbsent.user.length === 0) {
        absentGamesList = absentGamesList.filter((game) => game.game_id !== game_id);
      }
    }

    await redisClient.set(ABSENT_GAME_KEY, JSON.stringify(absentGamesList));
  }
}

// Schedule the task to run every 2 hours
cron.schedule("0 */2 * * *", syncGames);

(async function main() {
  app.use(cors());
  app.use(express.json());
  app.use(bodyParser.urlencoded({ extended: false }));
  app.use(
    express.json({
      type: ["application/json", "text/plain"],
    })
  );

  let corsOptions = {
    origin: ["http://localhost:3000", "http://localhost:5173", "https://localhost:5173", "http://miniapp.dechess.io"],
    credentials: true,
  };

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

  setInterval(async () => {
    const currentTime = Date.now();
    const absentGames = await redisClient.get(ABSENT_GAME_KEY);
    if (absentGames) {
      let absentGamesList = JSON.parse(absentGames);
      for (let i = absentGamesList.length - 1; i >= 0; i--) {
        const { game_id, user, leaveTimes } = absentGamesList[i];
        for (let j = user.length - 1; j >= 0; j--) {
          if (currentTime - leaveTimes[j] > 2 * 60 * 1000) {
            // 2 minutes in milliseconds
            const cachedData = await redisClient.get(game_id);
            if (cachedData) {
              const board = JSON.parse(cachedData);
              if (board.player_1 === user[j]) {
                board.winner = board.player_2;
              } else if (board.player_2 === user[j]) {
                board.winner = board.player_1;
              }
              board.isGameOver = true;
              await redisClient.set(game_id, JSON.stringify(board));
              io.to(game_id).emit("gameOver", { winner: board.winner });
            }
            absentGamesList.splice(i, 1); // Remove the game from the list
            break;
          }
        }
      }
      await redisClient.set(ABSENT_GAME_KEY, JSON.stringify(absentGamesList));
    }
  }, 2 * 60 * 1000);

  io.use(async (socket, next) => {
    if (socket.handshake.headers.authorization) {
      const token = socket.handshake.headers.authorization.toString();
      const verified = await verifyToken(token);
      (socket as any).user = verified;
      return next();
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
            fen: chess.fen(),
            isPaymentMatch: false,
            payAmount: 10_000_000_000_000,
            pays: {
              gameIndex: null,
              player1: 0,
              player2: 0,
            },
            playerTimer1: timeStep * 60,
            playerTimer2: timeStep * 60,
            isGameOver: false,
            isGameDraw: false,
            winner: null,
            loser: null,
            history: [new ChessV2().fen()],
            startTime: Date.now(),
            player1Moves: 0,
            player2Moves: 0,
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

    socket.on("chatId", async function (data) {
      const { chatId, gameId } = data;
      socket.join(gameId);

      const cachedDate = await redisClient.get(gameId);

      if (cachedDate) {
        const cachedBoard = JSON.parse(cachedDate);
        bot.sendMessage(chatId, `${cachedBoard.fen}`);
      } else {
        console.error(`Game with Id ${gameId} not found in cache`);
      }
    });

    socket.on("gameOver", async function (data) {
      const user = (socket as any).user;
      const { game_id, winner, loser, isGameDraw, isGameOver } = data;
      socket.join(game_id);

      const cachedDate = await redisClient.get(game_id);

      if (cachedDate) {
        const cachedBoard = JSON.parse(cachedDate);
        cachedBoard.isGameOver = isGameOver;
        cachedBoard.isGameDraw = isGameDraw;
        cachedBoard.winner = winner;
        cachedBoard.loser = loser;

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

      const { from, to, turn, address, isPromotion, fen, game_id, promotion, timers, san, lastMove, startTime, playerTimer1, playerTimer2, player1Moves, player2Moves, isCheck, isCapture } = move; //fake fen'
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
      board.playerTimer1 = playerTimer1;
      board.playerTimer2 = playerTimer2;
      board.history = [...board.history, fen];
      board.player1Moves = player1Moves;
      board.player2Moves = player2Moves;

      io.to(game_id).emit("newmove", {
        game_id: game_id,
        from,
        to,
        board: chess.board(),
        turn: chess.turn(),
        fen: chess.fen(),
        timers,
        san,
        lastMove,
        startTime,
        playerTimer1,
        playerTimer2,
        history: board.history,
        player1Moves,
        player2Moves,
        isCapture,
        isCheck,
        isPromotion,
      });

      await redisClient.set(game_id, JSON.stringify(board));
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
            console.log(game);
            socket.emit("rejoinGame", { status: 200, game_id: game.game_id, user: (socket as any).user.address, opponent: game.player_1 === (socket as any).user.address ? game.player_2 : game.player_1 });
          }
        }
      } catch (err) {
        console.error(err);
      }
      socket.emit("rejoinGame", { status: 404, message: "No active game found for this user." });
    });

    socket.on("joinGame", async function (data) {
      console.log("joinGame");
      const user = (socket as any).user;
      const cachedBoard = await redisClient.get(data.game_id);
      const board = JSON.parse(cachedBoard);
      const game_id = await redisClient.get("activeGame:" + (socket as any).user.address);
      if (game_id) {
        removeAbsentGame(game_id, user.address);
      }
      socket.join(board.game_id);
      console.log("emit rejoin");
      io.to(board.game_id).emit("joinGame");
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

    socket.on("disconnect", async function (data) {
      try {
        console.log("7s200:socket:disconnect");
        const gameId = await redisClient.get("activeGame:" + (socket as any).user.address);
        if (gameId) {
          addAbsentGame(gameId, (socket as any).user.address);
        }
        io.to(gameId).emit("opponentDisconnect");
      } catch (err) {
        console.error("7s200:socket:disconnect:err", err);
      }
    });
  });
})();
