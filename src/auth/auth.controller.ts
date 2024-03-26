import {
  Req,
  Res,
  Controller,
  Post,
  UseGuards,
  HttpCode,
  Inject,
  Body,
  BadRequestException,
  UnprocessableEntityException,
  Get,
  Redirect,
} from '@nestjs/common';
import { CookieOptions, Request, Response } from 'express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiExcludeEndpoint,
  ApiTags,
} from '@nestjs/swagger';
import { ConfigType } from '@nestjs/config';
import { OtpTransport } from '@prisma/client';
import {
  AuthenticatedRequest,
  BaseController,
  JwtAuthGuard,
  UserType,
  UtilsService,
  ValidatedUser,
} from 'src/common';
import { appConfigFactory, authConfigFactory } from 'src/configs';
import {
  AuthService,
  InvalidVerifyCodeResponse,
  ValidAuthResponse,
} from './auth.service';
import { GoogleOAuthGuard, LocalAuthGuard } from './guards';
import {
  ForgotPasswordRequestDto,
  RegisterUserRequestDto,
  ResetPasswordRequestDto,
  SendCodeRequestDto,
  LoginRequestDto,
} from './dto';
import { SendCodeResponse } from '../otp';

@ApiTags('Auth')
@Controller('auth')
export class AuthController extends BaseController {
  constructor(
    @Inject(appConfigFactory.KEY)
    private readonly appConfig: ConfigType<typeof appConfigFactory>,
    @Inject(authConfigFactory.KEY)
    private readonly config: ConfigType<typeof authConfigFactory>,
    private readonly authService: AuthService,
    private readonly utilsService: UtilsService,
  ) {
    super();
  }

  //Utility function to generate cookie option
  private getCookieOptions(options?: CookieOptions) {
    const isProduction = this.utilsService.isProduction();
    return {
      expires: options?.expires,
      domain:
        options?.domain !== undefined
          ? options.domain
          : isProduction
            ? this.appConfig.domain
            : 'localhost',
      httpOnly: options?.httpOnly !== undefined ? options.httpOnly : true,
      sameSite:
        options?.sameSite !== undefined
          ? options.sameSite
          : isProduction
            ? 'strict'
            : 'none',
      secure: options?.secure !== undefined ? options.secure : true,
    };
  }



  //Utility function to set a cookie
  private setCookie(
    res: Response,
    key: string,
    value: string,
    options?: CookieOptions,
  ): void {
    res.cookie(key, value, this.getCookieOptions(options));
  }


  //Utility function to remove a cookie
  private removeCookie(
    res: Response,
    key: string,
    options?: CookieOptions,
  ): void {
    res.clearCookie(key, this.getCookieOptions(options));
  }

  //Utility function to get the name of the authentication cookie based on the user type
  private getAuthCookie(ut: UserType) {
    return this.utilsService.getCookiePrefix(ut) + 'authToken';
  }


  //Utility function to set the authentication cookie
  private setAuthCookie(
    res: Response,
    accessToken: string,
    userType: UserType,
  ): void {
    const expirationTime = this.config.authCookieExpirationTime();

    this.setCookie(res, this.getAuthCookie(userType), accessToken, {
      expires: expirationTime,
    });
  }


  //Endpoint to send verification code 
  @Post('send-code')
  async sendCode(@Body() data: SendCodeRequestDto) {
    if (data.mobile && !data.country) {
      throw new BadRequestException();
    }
    const response = {} as Record<'email' | 'mobile', SendCodeResponse>;
    if (data.email) {
      response.email = await this.authService.sendCode(
        data.email,
        OtpTransport.Email,
        data.type,
      );
    }
    if (data.mobile) {
      response.mobile = await this.authService.sendCode(
        data.mobile,
        OtpTransport.Mobile,
        data.type,
      );
    }
    return response;
  }

  //Register a new user 
  @Post('register')
  async register(
    @Res({ passthrough: true }) res: Response,
    @Body() data: RegisterUserRequestDto,
  ) {
    const response = await this.authService.registerUser({
      firstname: data.firstname,
      lastname: data.lastname,
      email: data.email,
      password: data.password,
      dialCode: data.dialCode,
      mobile: data.mobile,
      country: data.country,
      emailVerificationCode: data.emailVerificationCode,
      mobileVerificationCode: data.mobileVerificationCode,
    });

    if (
      (response as InvalidVerifyCodeResponse).email ||
      (response as InvalidVerifyCodeResponse).mobile
    ) {
      throw new UnprocessableEntityException({
        statusCode: 422,
        message: 'Invalid verification code',
        meta: response as InvalidVerifyCodeResponse,
      });
    }

    const { accessToken, type } = response as ValidAuthResponse;
    this.setAuthCookie(res, accessToken, type);
    return { status: 'success' };
  }

  //Handle user login
  @ApiBody({ type: () => LoginRequestDto })
  @UseGuards(LocalAuthGuard)
  @HttpCode(200)
  @Post('login')
  async login(
    @Req() req: Request & { user: ValidatedUser },
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accessToken, type } = await this.authService.login(
      req.user.id,
      req.user.type,
    );
    this.setAuthCookie(res, accessToken, type);
    return { status: 'success' };
  }


  //Google Auth redirection endpoint 
  @UseGuards(GoogleOAuthGuard)
  @Get('google')
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  googleOAuth() {}

  @ApiExcludeEndpoint()
  @UseGuards(GoogleOAuthGuard)
  @Get('google/callback')
  @Redirect()
  async googleWebOAuthCallback(
    @Req() req: Request & { user: ValidatedUser },
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accessToken, type } = await this.authService.login(
      req.user.id,
      req.user.type,
    );
    this.setAuthCookie(res, accessToken, type);
    return {
      url: this.appConfig.appWebUrl as string,
    };
  }

  //Logout 
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('logout')
  async logout(
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const ctx = this.getContext(req);
    this.removeCookie(res, this.getAuthCookie(ctx.user.type));
    return { status: 'success' };
  }


  //Forget password 
  @Post('forgot-password')
  @HttpCode(200)
  async forgotPassword(@Body() data: ForgotPasswordRequestDto) {
    if (!data.email && !data.mobile) throw BadRequestException;
    return await this.authService.forgotPassword(data.email, data.mobile);
  }


  //Reset password
  @Post('reset-password')
  @HttpCode(200)
  async resetPassword(@Body() data: ResetPasswordRequestDto) {
    if (!data.email && !data.mobile) throw new BadRequestException();
    await this.authService.resetPassword(
      data.code,
      data.newPassword,
      data.mobile,
      data.email,
    );
    return { status: 'success' };
  }
}
