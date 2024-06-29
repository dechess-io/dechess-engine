import { dbCollection } from "../database/collection";
import { Chess as ChessV2 } from "../engine/chess";
import md5 from "md5";

export type TGame = {
  game_id: string;
  player_1: string;
  player_2: string;
  board: any;
  score: any;
  turn_player: string;
  move_number: number;
  fen: string;
};

export const gameController = {
  // V2 chess2.ts
  newGameV2: async (req, res) => {
    console.log(req);
    const { isPaymentMatch, gameIndex } = req.body.params;
    const time = Date.now();
    const id = md5(time);

    const chess = new ChessV2();

    const board = {
      game_id: id,
      player_1: "",
      player_2: "",
      board: chess.board(),
      score: 0,
      turn_player: chess.turn(),
      move_number: chess.moveNumber(),
      fen: chess.fen(),
      isPaymentMatch: false,
      payAmount: 10_000_000_000_000,
      pays: {
        gameIndex: gameIndex ? gameIndex : null,
        player1: isPaymentMatch ? 10_000_000_000_000 : 0,
        player2: 0,
      },
    };

    const { collection } = await dbCollection<TGame>(process.env.DB_DECHESS!, process.env.DB_DECHESS_COLLECTION_GAMES!);
    const insert = await collection.insertOne(board);

    res.json({ status: 200, board });
  },

  loadGameV2: async (req, res) => {
    const { game_id } = req.query;
    const query = { game_id: game_id };

    const { collection: gameCollection } = await dbCollection<TGame>(process.env.DB_DECHESS!, process.env.DB_DECHESS_COLLECTION_GAMES!);
    const game = await gameCollection.findOne(query);

    res.json({ game });
  },

  getGamesV2: async (req, res) => {
    const { collection: gameCollection } = await dbCollection<TGame>(process.env.DB_DECHESS!, process.env.DB_DECHESS_COLLECTION_GAMES!);
    const games = await gameCollection.find().toArray();
    res.json({ status: 200, games });
  },

  updateWinnerV2: async (req, res) => {
    const { game_id } = req.body.params;
    const query = { game_id: game_id };
    console.log("7s200:qeury", query);
    const { collection: gameCollection } = await dbCollection<TGame>(process.env.DB_DECHESS!, process.env.DB_DECHESS_COLLECTION_GAMES!);
    const game = await gameCollection.findOne(query);
    if ((game as any).isPaymentMatch) {
      const chess = new ChessV2(game.fen);

      if ((game as any).isGameOver || (game as any).isGameDraw) {
      }
    }
  },
};
