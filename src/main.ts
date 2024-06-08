import express from "express";
import { client } from "./database";
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
import abi from "./abi/dechesscontract.json";
import { MongoClient } from "mongodb";

(async function main() {
  app.use(cors());
  app.use(express.json());
  app.use(bodyParser.urlencoded({ extended: false }));

  let corsOptions = {
    origin: ["http://localhost:3000"],
    credentials: true,
  };

  app.get("/ping", (req, res) => {
    res.json("pong 17");
  });
  // app.get("/get-game-V2", cors(corsOptions), gameController.getGamesV2);
  // app.use("/", cors(corsOptions), routes);
  app.use(cors(), routes);

  await client.connect().catch((err) => console.log("7s200:err", err));
  client.on("close", () => {
    client.connect();
  });

  const http = app.listen(port, () => {
    console.log(`Example app listening on port ${port}`);
  });

  const io = new Server({
    cors: {
      origin: ["http://localhost:3000"],
    },
  }).listen(http);

  const waitingQueue = []; // Queue to store users waiting for a match

  io.use((socket, next) => {
    if (socket.handshake.headers.authorization) {
      const token = socket.handshake.headers.authorization.toString();
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, async (err, decodedToken) => {
        if (err) {
          // console.log("7s200:socket:auth:err", err, decodedToken);
          return;
        }
        // const { collection } = await dbCollection<any>(process.env.DB_DECHESS!, process.env.DB_DECHESS_COLLECTION_USERS!);
        // const userData = await collection.findOne({ address: decodedToken.address });
        // // console.log("7s200:userData", userData);
        // if (!userData) {
        //   // console.log("7s200:socket:auth:err:userData", userData, decodedToken);
        //   return;
        // }
        (socket as any).user = decodedToken.address;
        return next();
      });
    } else {
      // console.log("7s200:socketerr:");
      return;
    }
  }).on("connection", (socket) => {
    console.log("New socket connection", (socket as any).user);

    socket.on("createGame", async function (callback) {
      const user = (socket as any).user;

      if (waitingQueue.length > 0) {
        const time = Date.now();
        const id = md5(time);
        const opponent = waitingQueue.shift();
        const chess = new ChessV2();
        const board = {
          game_id: id,
          player_1: opponent.user,
          player_2: user,
          board: chess.board(),
          score: 0,
          turn_player: chess.turn(),
          move_number: chess.moveNumber(),
          fen: chess.fen(),
          isPaymentMatch: false,
          payAmount: 10_000_000_000_000,
          pays: {
            gameIndex: null,
            player1: 0,
            player2: 0,
          },
        };

        const { collection } = await dbCollection<TGame>(process.env.DB_DECHESS!, process.env.DB_DECHESS_COLLECTION_GAMES!);
        const insert = await collection.insertOne(board);
        if (insert) {
          socket.join(board.game_id);
          opponent.socket.join(board.game_id);
          socket.emit("createGame", { status: 200, board });
          opponent.socket.emit("createGame", { status: 200, board });
        } else {
          callback({ status: 500 });
          opponent.callback({ status: 500 });
        }
      } else {
        waitingQueue.push({ user, socket, callback });
        // Inform the current player about waiting
        socket.emit("createGame", { status: 202 });
      }
    });

    socket.on("move", async function (move) {
      const user = (socket as any).user;

      const { from, to, turn, address, isPromotion, fen, game_id, promotion } = move; //fake fen'
      console.log(isPromotion);
      socket.join(game_id);

      const { collection } = await dbCollection<TGame>(process.env.DB_DECHESS!, process.env.DB_DECHESS_COLLECTION_GAMES!);
      const board = await collection.findOne({ game_id: game_id });
      if ((board as any).isGameDraw || (board as any).isGameOver) {
        return;
      }
      if (board.player_1 !== user && board.turn_player === "w") {
        return;
      }
      if (board.player_2 !== user && board.turn_player === "b") {
        return;
      }

      const chess = new ChessV2(fen);
      try {
        if (!isPromotion) {
          chess.move({
            from: from,
            to: to,
            // promotion: "q",
          });
        } else {
          chess.move({
            from: from,
            to: to,
            promotion: promotion,
          });
        }
      } catch (error) {
        console.log(error);
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

      io.to(game_id).emit("newmove", { game_id: game_id, from, to, board: chess.board(), turn: chess.turn(), fen: chess.fen() });
      // console.log("7s200:move:7", { game_id: game_id, from, to, board: chess.board(), turn: chess.turn(), fen: chess.fen() });

      await collection
        .findOneAndUpdate({ game_id: board.game_id }, newBoard)
        .then((data) => {
          if (data) {
            // console.log("7s200:move:8");
            //  io.to(board.game_id).emit("newMove", { from, to, board: chess.board(), turn: chess.turn(), fen: chess.fen() });
          }
        })
        .catch((err) => {
          // console.log("7s200:err", err);
        });
    });

    socket.on("joinGame", async function (data) {
      const { collection } = await dbCollection<TGame>(process.env.DB_DECHESS!, process.env.DB_DECHESS_COLLECTION_GAMES!);
      const board = await collection.findOne({ game_id: data.game_id });

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

    socket.on("disconnect", function () {
      console.log("7s200:socket:disconnect");
    });
  });
})();
