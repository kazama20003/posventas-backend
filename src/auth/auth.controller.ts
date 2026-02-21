import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { GoogleAuthGuard } from './guards/google-auth.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { AuthJwtPayload } from './types/auth-jwt-payload.type';

type RequestWithAuthUser = Request & {
  user?: {
    token: string;
    user: unknown;
    tenant?: {
      slug: string;
    };
  };
};

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  private cookieName(): string {
    return this.config.getOrThrow<string>('AUTH_COOKIE_NAME');
  }

  private cookieMaxAgeMs(): number {
    const seconds = this.config.getOrThrow<number>(
      'AUTH_COOKIE_MAX_AGE_SECONDS',
    );
    return seconds * 1000;
  }

  private isSecureCookie(): boolean {
    const forceSecure =
      this.config.getOrThrow<boolean>('AUTH_COOKIE_SECURE') === true;
    const nodeEnv = this.config.getOrThrow<string>('NODE_ENV');

    return forceSecure || nodeEnv === 'production';
  }

  private cookieSameSite(): 'lax' | 'strict' | 'none' {
    const configured = this.config
      .getOrThrow<string>('AUTH_COOKIE_SAME_SITE')
      .toLowerCase();

    if (configured === 'strict' || configured === 'none') {
      return configured;
    }

    return 'lax';
  }

  private cookieDomain(): string | undefined {
    const domain = this.config.get<string>('AUTH_COOKIE_DOMAIN');
    if (!domain) {
      return undefined;
    }

    const normalized = domain.trim();
    return normalized.length > 0 ? normalized : undefined;
  }

  private setAuthCookie(res: Response, token: string): void {
    const domain = this.cookieDomain();
    res.cookie(this.cookieName(), token, {
      httpOnly: true,
      secure: this.isSecureCookie(),
      sameSite: this.cookieSameSite(),
      path: '/',
      maxAge: this.cookieMaxAgeMs(),
      domain,
    });
  }

  private clearAuthCookie(res: Response): void {
    const domain = this.cookieDomain();
    res.clearCookie(this.cookieName(), {
      httpOnly: true,
      secure: this.isSecureCookie(),
      sameSite: this.cookieSameSite(),
      path: '/',
      domain,
    });
  }

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.register(dto);

    this.setAuthCookie(res, result.token);

    return { user: result.user, tenant: result.tenant };
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(dto);

    this.setAuthCookie(res, result.token);

    return { user: result.user, tenant: result.tenant };
  }

  @Get('google')
  @UseGuards(GoogleAuthGuard)
  googleLogin(): void {
    // Passport redirects to Google OAuth.
  }

  @Get('google/callback')
  @UseGuards(GoogleAuthGuard)
  googleCallback(@Req() req: RequestWithAuthUser, @Res() res: Response) {
    if (!req.user?.token) {
      throw new BadRequestException(
        'No se pudo completar el login con Google.',
      );
    }

    this.setAuthCookie(res, req.user.token);

    return res.redirect(
      this.authService.getGoogleSuccessRedirectUrl(req.user.tenant?.slug),
    );
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  logout(@Res({ passthrough: true }) res: Response) {
    this.clearAuthCookie(res);
    return { ok: true };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@Req() req: Request & { user: AuthJwtPayload }) {
    return req.user;
  }
}
