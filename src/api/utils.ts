import { Response } from "express";
import log from "../log";

const _sendError = (res: Response, msg: string, code = 400) => {
  log.error(msg);
  res.status(code).send({
    status: "error",
    message: msg,
  });
};

export { _sendError };
