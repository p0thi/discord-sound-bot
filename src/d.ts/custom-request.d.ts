import { Client } from "discord.js";

declare module "express-serve-static-core" {
  export interface Request {
    bot?: Client;
    userId?: string;
  }
}
