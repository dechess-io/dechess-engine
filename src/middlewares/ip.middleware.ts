import requestIp from "request-ip";

export const ipMiddleware = function (req, res, next) {
  const clientIp = requestIp.getClientIp(req);
  req.clientIP = clientIp;
  next();
};
