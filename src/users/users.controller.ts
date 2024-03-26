/* eslint-disable prettier/prettier */
// Importing necessary decorators and modules from NestJS and other libraries
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiParam, ApiTags } from '@nestjs/swagger';
import { UserStatus } from '@prisma/client'; 
import { UsersService } from './users.service';
import {
  ChangePasswordRequestDto,
  GetUsersRequestDto,
  UpdateProfileDetailsRequestDto,
  UpdateProfileImageRequestDto,
  UpdateUserProfileRequestDto,
} from './dto'; 
import { AuthenticatedRequest, BaseController, JwtAuthGuard, Roles, RolesGuard, UserType } from 'src/common';

// Adding Swagger tags for API documentation
@ApiTags('User')

// Specifying Bearer token authentication for Swagger documentation
@ApiBearerAuth() 

// Applying JWT authentication guard to this controller
@UseGuards(JwtAuthGuard) 

// Setting up controller endpoint as '/users'
@Controller('users') 
export class UsersController extends BaseController {
  constructor(private readonly usersService: UsersService) {
    super(); 
  }

  // Decorator to specify roles allowed to access this route and applying RolesGuard
  @Roles(UserType.Admin)
  @UseGuards(RolesGuard)

  @Get() 
  async getUsers(@Query() query: GetUsersRequestDto) {
    return await this.usersService.getAll({
      search: query.search,
      skip: query.skip,
      take: query.take,
    }); 
  }

  // Endpoint for fetching current user's profile
  @Get('me') 
  async getProfile(@Req() req: AuthenticatedRequest) {
    const ctx = this.getContext(req); // Getting context information from the request
    return await this.usersService.getProfile(ctx.user.id); // Fetching user profile using the UsersService
  }

  // Endpoint for updating current user's profile details
  @Patch('me') 
  async updateProfileDetails(
    @Req() req: AuthenticatedRequest,
    @Body() data: UpdateProfileDetailsRequestDto,
  ) {
    // Validation for mobile number
    if (data.mobile && (!data.dialCode || !data.country)) {
      throw new BadRequestException(); 
    }
    // Getting context information from the request
    const ctx = this.getContext(req); 
    await this.usersService.updateProfileDetails({
      userId: ctx.user.id,
      username: data.username,
      firstname: data.firstname,
      lastname: data.lastname,
      email: data.email,
      dialCode: data.dialCode,
      mobile: data.mobile,
      country: data.country,
    }); 
    return { status: 'success' }; // Returning success status
  }


  @Roles(UserType.Admin)
  @UseGuards(RolesGuard)
  // Endpoint for fetching user profile by ID
  @Get(':userId') 
  async getUserProfile(@Param('userId', ParseUUIDPipe) userId: string) {
    return await this.usersService.getProfile(userId); 
  }


  @Roles(UserType.Admin)
  @UseGuards(RolesGuard)
  @Patch(':userId') // Endpoint for updating user profile details by Administrator
  async updateUserProfileDetails(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() data: UpdateUserProfileRequestDto,
  ) {
    return await this.usersService.updateProfileDetailsByAdministrator({
      userId,
      username: data.username,
      firstname: data.firstname,
      lastname: data.lastname,
      email: data.email,
      dialCode: data.dialCode,
      mobile: data.mobile,
      country: data.country,
      password: data.password,
    }); // Updating user profile details by Administrator using the UsersService
  }

  @Post('me/profile-image') // Endpoint for updating current user's profile image
  updateProfileImage(
    @Req() req: AuthenticatedRequest,
    @Body() data: UpdateProfileImageRequestDto,
  ) {
    const ctx = this.getContext(req); // Getting context information from the request
    return this.usersService.updateProfileImage(ctx.user.id, data.profileImage); // Updating user profile image using the UsersService
  }

  @Post('me/change-password') // Endpoint for changing current user's password
  async changePassword(
    @Req() req: AuthenticatedRequest,
    @Body() data: ChangePasswordRequestDto,
  ) {
    const ctx = this.getContext(req); // Getting context information from the request
    await this.usersService.changePassword(
      ctx.user.id,
      data.oldPassword,
      data.newPassword,
    ); // Changing user's password using the UsersService
    return { status: 'success' }; 
  }

  // Swagger documentation for API parameter
  @ApiParam({ name: 'status', enum: UserStatus })
  @Roles(UserType.Admin)
  @UseGuards(RolesGuard)
  @Post(':userId/:status')
  async setUserStatus(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Param('status', new ParseEnumPipe(UserStatus)) status: UserStatus,
  ) {
    await this.usersService.setStatus(userId, status);
    return { status: 'success' }; 
  }
}
