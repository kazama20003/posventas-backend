import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import type { Request } from 'express';
import type { Profile, VerifyCallback } from 'passport-google-oauth20';
import { Strategy } from 'passport-google-oauth20';
import { AuthService } from '../auth.service';

function readQueryValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : undefined;
}

type ParsedGoogleState = {
  tenantSlug?: string;
  businessName?: string;
};

function parseGoogleState(rawState: string | undefined): ParsedGoogleState {
  const raw = readQueryValue(rawState);
  if (!raw) {
    return {};
  }

  try {
    const decoded = Buffer.from(raw, 'base64url').toString('utf8');
    const parsed = JSON.parse(decoded) as Record<string, unknown>;
    return {
      tenantSlug: readQueryValue(parsed.tenantSlug),
      businessName: readQueryValue(parsed.businessName),
    };
  } catch {
    // Backward compatibility with old state format: plain tenantSlug
    return {
      tenantSlug: raw,
    };
  }
}

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(
    private readonly config: ConfigService,
    private readonly authService: AuthService,
  ) {
    super({
      clientID: config.getOrThrow<string>('GOOGLE_CLIENT_ID'),
      clientSecret: config.getOrThrow<string>('GOOGLE_CLIENT_SECRET'),
      callbackURL: config.getOrThrow<string>('GOOGLE_CALLBACK_URL'),
      scope: ['email', 'profile'],
      passReqToCallback: true,
    });
  }

  async validate(
    req: Request,
    accessToken: string,
    refreshToken: string,
    profile: Profile,
    done: VerifyCallback,
  ): Promise<void> {
    try {
      const state = parseGoogleState(
        typeof req.query.state === 'string' ? req.query.state : undefined,
      );

      const email = profile.emails?.[0]?.value?.trim().toLowerCase();
      if (!email) {
        throw new UnauthorizedException(
          'Google no devolvio email valido para autenticar.',
        );
      }

      const authResult = await this.authService.loginWithGoogle({
        tenantSlug: state.tenantSlug,
        businessName: state.businessName,
        providerAccountId: profile.id,
        email,
        displayName: profile.displayName || undefined,
        avatarUrl: profile.photos?.[0]?.value || undefined,
        accessToken,
        refreshToken: refreshToken || undefined,
      });

      done(null, authResult);
    } catch (error) {
      done(error as Error, undefined);
    }
  }
}
