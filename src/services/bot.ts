import TelegramBot from "node-telegram-bot-api";

// Replace with your bot token
const token = "7327954703:AAFrrU8HoojYN4m6UQxb9x6Oe0fjDDO4Dp8";

// Create a bot instance
export const bot = new TelegramBot(token, { polling: true });
