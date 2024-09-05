import { CHAIN } from "@tonconnect/ui-react";
import { decodeJwt, JWTPayload, jwtVerify, SignJWT } from "jose";
import crypto from 'crypto';
/**
 * Secret key for the token.
 */
const JWT_SECRET_KEY = process.env.ACCESS_TOKEN_SECRET;

/**
 * Payload of the token.
 */
export type AuthToken = {
  address: string;
  network: CHAIN;
};

export type PayloadToken = {
  payload: string;
};

/**
 * Create a token with the given payload.
 */
function buildCreateToken<T extends JWTPayload>(expirationTime: string): (payload: T) => Promise<string> {
  return async (payload: T) => {
    const encoder = new TextEncoder();
    const key = encoder.encode(JWT_SECRET_KEY);
    return new SignJWT(payload).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime(expirationTime).sign(key);
  };
}

export const createAuthToken = buildCreateToken<AuthToken>("1D");
export const createPayloadToken = buildCreateToken<PayloadToken>("15m");

/**
 * Verify the given token.
 */
export async function verifyToken(token: string): Promise<JWTPayload | null> {
  const encoder = new TextEncoder();
  const key = encoder.encode(JWT_SECRET_KEY);
  try {
    const { payload } = await jwtVerify(token, key);
    return payload;
  } catch (e) {
    return null;
  }
}

/**
 * Decode the given token.
 */
function buildDecodeToken<T extends JWTPayload>(): (token: string) => T | null {
  return (token: string) => {
    try {
      return decodeJwt(token) as T;
    } catch (e) {
      return null;
    }
  };
}

export const decodeAuthToken = buildDecodeToken<AuthToken>();
export const decodePayloadToken = buildDecodeToken<PayloadToken>();

export const verifyInitData = (telegramInitData: string): boolean => {
  const urlParams = new URLSearchParams(telegramInitData);

  const hash = urlParams.get('hash');
  urlParams.delete('hash');
  urlParams.sort();

  let dataCheckString = '';
  for (const [key, value] of urlParams.entries()) {
      dataCheckString += `${key}=${value}\n`;
  }
  dataCheckString = dataCheckString.slice(0, -1);

  const secret = crypto.createHmac('sha256', 'WebAppData').update("7327954703:AAFWceo5wQtQ2Qbbf7iQJhua9o2cReQ7_to");
  const calculatedHash = crypto.createHmac('sha256', secret.digest()).update(dataCheckString).digest('hex');

  return calculatedHash === hash;
}

