/* eslint-disable prettier/prettier */
import { Inject, UnprocessableEntityException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ConfigType } from '@nestjs/config';
import { Profile, Strategy, VerifyCallback } from 'passport-google-oauth20';
import { GOOGLE_OAUTH } from '../auth.constants';
import { UsersService } from '../../users';
import { appConfigFactory, googleConfigFactory } from 'src/configs';



// Custom Passport strategy for Google Auth
export class GoogleStrategy extends PassportStrategy(Strategy, GOOGLE_OAUTH) {
  constructor(
    // Injecting application and Google Auth configuration
    @Inject(appConfigFactory.KEY)
    appConfig: ConfigType<typeof appConfigFactory>,
    @Inject(googleConfigFactory.KEY)
    config: ConfigType<typeof googleConfigFactory>,
    private readonly usersService: UsersService,    // Injecting the users service for handling user operations
  ) {
    // Calling the constructor of the superclass (PassportStrategy)
    super({
      // Configuring the Google OAuth 2.0 strategy with client ID, secret, scope, and callback URL
      clientID: config.oauth.clientId,
      clientSecret: config.oauth.secret,
      scope: config.oauth.scope,
      callbackURL: `${appConfig.serverUrl}/auth/google/callback`,
    });
  }

  // Method to validate and process user profile obtained from Google
  async validate(
    accessToken: string,
    refreshToken: string,
    profile: Profile,
    done: VerifyCallback,
  ): Promise<void> {
      // Destructuring profile data obtained from Google
    const { given_name, family_name, email, picture, sub } = profile._json;
    // Check if email is available in the profile data
    if (!email) {
            // If email is not available, return an error response
      done(new UnprocessableEntityException('Profile email not public'));
      return;
    }
// Get or create the user in the database based on Google profile data
    const user = await this.usersService.getOrCreateByGoogle({
      googleId: sub,
      email,
      firstname: given_name,
      lastname: family_name,
      profileImage: picture,
    });

    // Pass the authenticated user to Passport for further processing
    done(null, user);
  }
}
