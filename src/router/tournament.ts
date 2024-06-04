import { dbCollection } from "../database/collection";

export const tournamentController = {
  loadTournamentGameV2: async (req, res) => {
    const { game_id } = req.query;
    const query = { game_id: game_id };

    const { collection: gameCollection } = await dbCollection<any>(process.env.DB_DECHESS!, "tournament");
    const game = await gameCollection.findOne(query);

    res.json({ game });
  },
};
