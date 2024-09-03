import TelegramBot from "node-telegram-bot-api";

// Replace with your bot token
const token = "7327954703:AAFWceo5wQtQ2Qbbf7iQJhua9o2cReQ7_to";

// Create a bot instance
export const bot = new TelegramBot(token, { polling: true });
