import * as anchor from "@project-serum/anchor";
import { Connection, PublicKey, Keypair, SystemProgram } from "@solana/web3.js";
import { readFileSync } from "fs";
import path from "path";
import { client } from "../database";

const connection = new Connection("https://api.devnet.solana.com", "confirmed");

const idlPath = path.resolve(__dirname, "../abi/contracts.json");
const idl = JSON.parse(readFileSync(idlPath, "utf8"));

const programId = new PublicKey("4YJdg3btfUVYP6PZsGLhaJMLaBxFzmM1MWvkS2BYKHPi");
const adminAddress = "GWWs2ADkx6SwGAQEwokhmTMBEdrTuMEqbtw2dAPge1j4";

const walletKeypair = Keypair.fromSecretKey(
  Uint8Array.from([
    42, 152, 94, 181, 253, 182, 196, 158, 153, 199, 183, 98, 173, 239, 131, 73, 99, 166, 213, 148, 35, 121, 174, 198, 106, 114, 187, 231, 171, 216, 1, 241, 230, 110, 233, 179, 158, 194, 121, 107, 33, 254, 229, 165, 59, 37, 198, 138, 213,
    74, 83, 82, 128, 53, 7, 237, 147, 249, 255, 93, 35, 198, 245, 191,
  ])
);

// Set up the provider
const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(walletKeypair), { preflightCommitment: "confirmed" });
// Load the program
const program = new anchor.Program(idl, programId, provider);

export const getSolanaAdminWallet = () => {
  return walletKeypair.publicKey.toString();
};

export const initializeGame = async (board: any, player1Pubkey, player2Pubkey) => {
  try {
    const gameAccount = Keypair.generate();
    console.table({
      player1Pubkey: new PublicKey(player1Pubkey),
      player2Pubkey: new PublicKey(player2Pubkey),
    });
    const txn = await program.methods
      .initializeGame(new PublicKey(player1Pubkey), new PublicKey(player2Pubkey))
      .accounts({
        game: gameAccount.publicKey,
        admin: walletKeypair.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([gameAccount, walletKeypair])
      .rpc();

    const collection = client.db(process.env.DB_DECHESS!).collection(process.env.DB_DECHESS_COLLECTION_GAMES!);
    board.transactionCreate = txn;
    board.gamePDA = gameAccount.publicKey;
    const newGame = await collection.insertOne(board);
    return { gamePDA: gameAccount.publicKey, transactionCreate: txn };
  } catch (error) {
    return null;
  }
};

export const makeMove = async (gamePDA: any, from: string, to: string) => {
  try {
    // Convert gamePDA to PublicKey if it's not already
    console.table({ from, to });
    if (typeof gamePDA === "string") {
      gamePDA = new PublicKey(gamePDA); // Convert string to PublicKey
    }

    // Ensure the PDA is valid
    if (!gamePDA) {
      throw new Error("Invalid Game PDA");
    }

    // Ensure from and to moves are valid
    if (!from || !to) {
      throw new Error("Invalid move positions");
    }

    // Call makeMove on the program
    const moveSignature = await program.methods
      .makeMove(from, to) // Pass move positions
      .accounts({
        game: gamePDA, // The public key of the game account
        admin: walletKeypair.publicKey, // The admin public key
      })
      .signers([walletKeypair]) // Signer must be admin's keypair
      .rpc();

    return moveSignature;
  } catch (error) {
    console.error("7s200:err", error);
    return null;
  }
};
