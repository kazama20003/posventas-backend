import { ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';

function readQueryStringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : undefined;
}

type GoogleStatePayload = {
  tenantSlug?: string;
  businessName?: string;
};

function encodeState(payload: GoogleStatePayload): string {
  const json = JSON.stringify(payload);
  return Buffer.from(json, 'utf8').toString('base64url');
}

@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {
  constructor(private readonly config: ConfigService) {
    super();
  }

  getAuthenticateOptions(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<Request>();
    const tenantFromQuery = readQueryStringValue(req.query.tenantSlug);
    const businessNameFromQuery = readQueryStringValue(req.query.businessName);
    const existingState = readQueryStringValue(req.query.state);

    return {
      scope: ['email', 'profile'],
      state:
        existingState ??
        encodeState({
          tenantSlug: tenantFromQuery,
          businessName: businessNameFromQuery,
        }),
      accessType: 'offline',
      prompt: 'consent',
      failureRedirect: this.config.getOrThrow<string>(
        'GOOGLE_FAILURE_REDIRECT_URL',
      ),
    };
  }
}
