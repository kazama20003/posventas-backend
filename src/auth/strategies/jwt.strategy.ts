import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Request } from 'express';
import type { AuthJwtPayload } from '../types/auth-jwt-payload.type';

function extractCookieToken(
  request: Request | undefined,
  cookieName: string,
): string | null {
  if (!request || !request.headers?.cookie) {
    return null;
  }

  const cookies = request.headers.cookie.split(';');

  for (const chunk of cookies) {
    const [namePart, ...valueParts] = chunk.trim().split('=');
    if (!namePart || namePart !== cookieName) {
      continue;
    }

    const value = valueParts.join('=').trim();
    if (!value) {
      return null;
    }

    return decodeURIComponent(value);
  }

  return null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService) {
    const cookieName = config.getOrThrow<string>('AUTH_COOKIE_NAME');
    const secret = config.getOrThrow<string>('JWT_SECRET');

    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req) => extractCookieToken(req as Request, cookieName),
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  validate(payload: AuthJwtPayload): AuthJwtPayload {
    return payload;
  }
}
