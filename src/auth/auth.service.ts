import { Injectable } from '@nestjs/common';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { OtpTransport, User } from '@prisma/client';
import { JwtPayload, UserType } from 'src/common';
import { SendCodeRequestType } from './dto';
import { UsersService } from '../users';
import {
  OtpContext,
  OtpService,
  SendCodeResponse,
  VerifyCodeResponse,
} from '../otp';


//Define types for valid and invalid responses during authentication
export type ValidAuthResponse = {
  accessToken: string;
  type: UserType;
};

export type InvalidVerifyCodeResponse = {
  email: VerifyCodeResponse;
  mobile?: VerifyCodeResponse;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly usersService: UsersService,
    private readonly otpService: OtpService,
  ) {}


   //Generate jwt token
  private generateJwt(payload: JwtPayload, options?: JwtSignOptions): string {
    return this.jwtService.sign(payload, options);
  }


  //Send verification code for registration 
  async sendCode(
    target: string,
    transport: OtpTransport,
    type: SendCodeRequestType,
  ): Promise<SendCodeResponse> {
    if (type === SendCodeRequestType.Register) {
      //Check if email or mobile already exists
      if (
        transport === OtpTransport.Email &&
        (await this.usersService.isEmailExist(target))
      ) {
        throw new Error('Email already in use');
      }
      if (
        transport === OtpTransport.Mobile &&
        (await this.usersService.isMobileExist(target))
      ) {
        throw new Error('Mobile already in use');
      }

      //Send verification code
      return await this.otpService.send({
        context: OtpContext.Register,
        target,
        ...(transport === OtpTransport.Email
          ? {
              transport,
              transportParams: {
                username: 'User',
              },
            }
          : { transport }),
      });
    }

    throw new Error('Unknown send code request type found');
  }


  //Login user and generate jwt token 
  async login(userId: string, type: UserType): Promise<ValidAuthResponse> {
    return {
      accessToken: this.generateJwt({
        sub: userId,
        type,
      }),
      type,
    };
  }


  //Registration user and generate jwt token
  async registerUser(data: {
    firstname: string;
    lastname: string;
    email: string;
    password: string;
    dialCode?: string;
    mobile?: string;
    country: string;
    emailVerificationCode: string;
    mobileVerificationCode?: string;
  }): Promise<InvalidVerifyCodeResponse | ValidAuthResponse> {

    //Verify email and mobile otp codes
    const [verifyEmailOtpResponse, verifyMobileOtpResponse] = await Promise.all(
      [
        this.otpService.verify(
          data.emailVerificationCode,
          data.email,
          OtpTransport.Email,
        ),
        data.mobile &&
          this.otpService.verify(
            data.mobileVerificationCode || '',
            data.mobile,
            OtpTransport.Mobile,
          ),
      ],
    );

    //If verification code are invalid return invalid response
    if (
      !verifyEmailOtpResponse.status ||
      (verifyMobileOtpResponse && !verifyMobileOtpResponse.status)
    ) {
      return {
        email: verifyEmailOtpResponse,
        mobile: verifyMobileOtpResponse || undefined,
      };
    }

    //Create user and generate jwt token
    const user = await this.usersService.create({
      firstname: data.firstname,
      lastname: data.lastname,
      email: data.email,
      password: data.password,
      dialCode: data.dialCode,
      mobile: data.mobile,
      country: data.country,
    });
    return {
      accessToken: this.generateJwt({
        sub: user.id,
        type: UserType.User,
      }),
      type: UserType.User,
    };
  }

  //Send reset password verification code 
  async forgotPassword(
    email?: string,
    mobile?: string,
  ): Promise<{ email?: SendCodeResponse; mobile?: SendCodeResponse }> {
    return await this.usersService.sendResetPasswordVerificationCode(
      email,
      mobile,
    );
  }


  //Reset password by user
  async resetPassword(
    code: string,
    newPassword: string,
    mobile?: string,
    email?: string,
  ): Promise<User> {
    return await this.usersService.resetPassword(
      code,
      newPassword,
      mobile,
      email,
    );
  }
}
