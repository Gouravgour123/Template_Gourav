// Import necessary modules and classes
import { URL } from 'url';
import { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService, ConfigType } from '@nestjs/config';
import { jwtConfigFactory } from '@Config'; 
import { AuthenticatedUser, JwtPayload, UserType } from '../types'; 
import { UtilsService } from '../providers';
import { JWT_AUTH } from '../common.constants'; 

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, JWT_AUTH) {
  private static readonly utilsService = new UtilsService(new ConfigService());

  constructor(
    @Inject(jwtConfigFactory.KEY)
    config: ConfigType<typeof jwtConfigFactory>, 
  ) {
    // Call the superclass constructor
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        JwtStrategy.fromCookie, // Extract JWT token from cookie
        ExtractJwt.fromAuthHeaderAsBearerToken(), // Extract JWT token from authorization header
      ]),
      ignoreExpiration: false, // Ignore token expiration
      secretOrKey: config.secret, // JWT secret key
    });
  }

  // Get the name of the authentication cookie based on user type
  private static getAuthCookie(ut: UserType): string {
    return JwtStrategy.utilsService.getCookiePrefix(ut) + 'authToken';
  }

  // Extract JWT token from cookie in the request
  private static fromCookie(req: Request): string | null {
    if (req.headers.referer) {
      let authCookie: string | null = null;

      // Determine the requested domain based on the referer header
      const requestedDomain = new URL(req.headers.referer).host;
      if (
        process.env.ADMIN_WEB_URL &&
        requestedDomain === new URL(process.env.ADMIN_WEB_URL).host
      ) {
        authCookie = JwtStrategy.getAuthCookie(UserType.Admin); 
      }
      if (
        process.env.APP_WEB_URL &&
        requestedDomain === new URL(process.env.APP_WEB_URL).host
      ) {
        authCookie = JwtStrategy.getAuthCookie(UserType.User); 
      }

      // Return the JWT token from the authentication cookie
      if (authCookie) {
        return req.cookies[authCookie];
      }
    }

    return null;
  }

  // Validate the JWT payload and return the authenticated user
  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    // Extract necessary information from the JWT payload
    return {
      id: payload.sub, // User ID
      type: payload.type, // User type
    };
  }
}
