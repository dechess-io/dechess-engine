import TelegramBot from "node-telegram-bot-api";

// Replace with your bot token
const token = "";

// Create a bot instance
export const bot = new TelegramBot(token, { polling: true });
