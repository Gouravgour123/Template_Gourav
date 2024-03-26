/* eslint-disable prettier/prettier */
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { Strategy } from 'passport-local';
import { ValidatedUser } from 'src/common';
import { LOCAL_AUTH } from '../auth.constants';
import { UsersService } from '../../users';
import { AdminService } from '../../admin';



// Custom Passport strategy for local (username/password) authentication
@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy, LOCAL_AUTH) {
  constructor(
    private readonly usersService: UsersService,
    private readonly adminService: AdminService,
  ) {
    // Calling the constructor of the superclass (PassportStrategy)
    super({
      usernameField: 'email',
    });
  }

  // Method to validate the provided email and password for local authentication
  async validate(email: string, password: string): Promise<ValidatedUser> {
    let user: false | ValidatedUser | null;

    // Validate credentials against user accounts
    user = await this.usersService.validateCredentials(email, password);

    // If user credentials are not found in user accounts, validate against admin accounts
    if (user === null) {
      user = await this.adminService.validateCredentials(email, password);
    }
    if (user) return user;

    if (user === false) throw new UnauthorizedException('Incorrect password');
    throw new UnauthorizedException('User does not exist');
  }
}