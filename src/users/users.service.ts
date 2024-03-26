/* eslint-disable prettier/prettier */
// Import necessary modules and dependencies
import { join } from 'path';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { PrismaService } from '../prisma';
import {OtpContext, OtpService, SendCodeResponse, VerifyCodeResponse} from '../otp';
import { userConfigFactory } from 'src/configs';
import { StorageService, UserType, UtilsService, ValidatedUser } from 'src/common';
import { Prisma } from '@prisma/client';

// Define the Injectable UsersService class
@Injectable()
export class UsersService {
  constructor(
    @Inject(userConfigFactory.KEY)
    private readonly config: ConfigType<typeof userConfigFactory>,
    private readonly prisma: PrismaService,
    private readonly utilsService: UtilsService,
    private readonly storageService: StorageService,
    private readonly otpService: OtpService,
  ) {}

   // Method to retrieve profile image URL
  private getProfileImageUrl(profileImage: string): string {
    return this.storageService.getFileUrl(
      profileImage,
      this.config.profileImagePath,
    );
  }
 // Method to hash password
  private hashPassword(password: string): { salt: string; hash: string } {
      // Generate salt for hashing
    const salt = this.utilsService.generateSalt(this.config.passwordSaltLength);
        // Hash the password using generated salt
    const hash = this.utilsService.hashPassword(
      password,      
      salt,          
      this.config.passwordHashLength,  
    );
    // Return salt and hash
    return { salt, hash };
  }
  
// Method to check if a username is valid
  private isValidUsername(username: string): boolean {
    return /^[a-z][a-z0-9_]{3,20}$/.test(username);
  }

  // Method to check if an email already exists in the database
  async isEmailExist(email: string, excludeUserId?: string): Promise<boolean> {
    return (
      (await this.prisma.user.count({
        where: {
          email: email.toLowerCase(),  
          NOT: {
            id: excludeUserId,         // Exclude the provided user ID from the search if specified
          },
        },
      })) !== 0
    );
  }

  // Method to check if a username already exists in the database
  async isUsernameExist(
    username: string,
    excludeUserId?: string,
  ): Promise<boolean> {
    return (
      (await this.prisma.user.count({
        where: {
          username,    // Check for exact username match
          NOT: {
            id: excludeUserId,   // Exclude the provided user ID from the search if specified
          },
        },
      })) !== 0
    );
  }

  // Method to check if a mobile number already exists in the database
  async isMobileExist(
    mobile: string,
    excludeUserId?: string,
  ): Promise<boolean> {
    return (
      (await this.prisma.user.count({
        where: {
          mobile,          // Check for exact mobile number match

          NOT: {
            id: excludeUserId,   // Exclude the provided user ID from the search if specified
          },
        },
      })) !== 0
    );
  }

  // Method to retrieve a user by ID
  async getById(userId: string): Promise<User> {
    return await this.prisma.user.findUniqueOrThrow({
      where: {
        id: userId,       // Search for user by ID
      },
    });
  }

  // Method to retrieve a user by email
  async getByEmail(email: string): Promise<User | null> {
    return await this.prisma.user.findUnique({
      where: {
        email: email.toLowerCase(),
      },
    });
  }

  // Method to retrieve a user by mobile number
  async getByMobile(mobile: string): Promise<User | null> {
    return await this.prisma.user.findUnique({
      where: {
        mobile,     // Search for user by mobile number
      },
    });
  }

  // Method to retrieve user metadata by ID
  async getMetaById(userId: string): Promise<UserMeta> {
    return await this.prisma.userMeta.findUniqueOrThrow({
      where: {
        userId,      // Search for user metadata by user ID
      },
    });
  }

  // Method to retrieve user metadata by email
  async getMetaByEmail(email: string): Promise<UserMeta> {
    return await this.prisma.userMeta.findFirstOrThrow({
      where: {
        user: {
          email: email.toLowerCase(),      // Convert email to lowercase for case-insensitive comparison
        },
      },
    });
  }
  // Method to validate user credentials (email and password)
  async validateCredentials(
    email: string,
    password: string,
  ): Promise<ValidatedUser | false | null> {
    const user = await this.getByEmail(email);    // user by email 
    if (!user) return null;       // Return null if user not found

    const userMeta = await this.getMetaById(user.id);     // Retrieve user metadata by user ID
    const passwordHash = this.utilsService.hashPassword(
        // Hash the provided password
      password,
      userMeta.passwordSalt || '',        
      userMeta.passwordHash
        ? userMeta.passwordHash.length / 2
        : this.config.passwordHashLength,      
    );
    if (userMeta.passwordHash === passwordHash) {
      // If password hash matches, return validated user object
      return {
        id: user.id,
        type: UserType.User,
      };
    }
// Return false if password validation fails
    return false;      
  }


  // Method to create a new user
  async create(data: {
    firstname: string;
    lastname: string;
    email: string;
    password?: string;
    dialCode?: string;
    mobile?: string;
    country?: string;
    googleId?: string;
    profileImage?: string;
  }): Promise<User> {
       // Check if email already exists
    if (await this.isEmailExist(data.email)) {
      throw new Error('Email already exist');
    }
    // Check if mobile number already exists
    if (data.mobile && (await this.isMobileExist(data.mobile))) {
      throw new Error('Mobile already exist');
    }

    let passwordSalt = null;
    let passwordHash = null;
    // Hash the password if provided
    if (data.password) {
      const { salt, hash } = this.hashPassword(data.password);
      passwordSalt = salt;
      passwordHash = hash;
    }

    // Create a new user using Prisma
    return await this.prisma.user.create({
      data: {
        firstname: data.firstname,
        lastname: data.lastname,
        email: data.email.toLowerCase(),
        dialCode: data.dialCode,
        mobile: data.mobile,
        profileImage: data.profileImage,
        country: data.country,
        meta: {
          create: {
            passwordHash,
            passwordSalt,
            googleId: data.googleId,
          },
        },
      },
    });
  }

  // Method to get or create a user by Google ID
  async getOrCreateByGoogle(data: {
    googleId: string;
    email: string;
    firstname?: string;
    lastname?: string;
    profileImage?: string;
  }): Promise<ValidatedUser> {
    let user = await this.prisma.user.findFirst({
      where: {
        meta: {
          googleId: data.googleId,
        },
      },
    });
    if (!user) {
            // If user with Google ID doesn't exist, create one
      const isEmailExist = await this.isEmailExist(data.email);
      if (isEmailExist) {
        // Update existing user with Google ID
        user = await this.prisma.user.update({
          data: {
            meta: {
              update: {
                googleId: data.googleId,
              },
            },
          },
          where: { email: data.email.toLowerCase() },
        });
      } else {
         // Create a new user with Google ID
        user = await this.create({
          firstname: data.firstname || '',
          lastname: data.lastname || '',
          email: data.email,
          profileImage: data.profileImage,
          googleId: data.googleId,
        });
      }
    }
// Return validated user
    return {
      id: user.id,
      type: UserType.User,
    };
  }

// Method to get user profile by ID
  async getProfile(userId: string): Promise<User> {
    const user = await this.getById(userId);
    // If user has a profile image, retrieve its URL
    if (user.profileImage) {
      user.profileImage = this.getProfileImageUrl(user.profileImage);
    }
    return user;
  }
  // Method to update user profile details
  async updateProfileDetails(
    data: {
      userId: string;
      username?: string;
      firstname?: string;
      lastname?: string;
      email?: string;
      dialCode?: string;
      mobile?: string;
      country?: string;
    },
    options?: { tx?: Prisma.TransactionClient },
  ): Promise<User> {
    const client = options?.tx ? options.tx : this.prisma;

    // Check if the provided email already exists, excluding the current user
    if (data.email && (await this.isEmailExist(data.email, data.userId))) {
      throw new Error('Email already exist');
    }
    // Check if the provided username is valid
    if (data.username && !this.isValidUsername(data.username)) {
      throw new Error('Invalid username');
    }
      // Check if the provided username already exists, excluding the current user
    if (
      data.username &&
      (await this.isUsernameExist(data.username, data.userId))
    ) {
      throw new Error('Username already exist');
    }
    // Check if the provided mobile number already exists, excluding the current user
    if (data.mobile && (await this.isMobileExist(data.mobile, data.userId))) {
      throw new Error('Mobile already exist');
    }
 // Update user details using Prisma
    return await client.user.update({
      data: {
        username: data.username && data.username.toLowerCase(),
        firstname: data.firstname,
        lastname: data.lastname,
        email: data.email && data.email.toLowerCase(),
        dialCode: data.dialCode,
        mobile: data.mobile,
        country: data.country,
      },
      where: {
        id: data.userId,
      },
    });
  }


  // Method to update user profile details by administrator
  async updateProfileDetailsByAdministrator(data: {
    userId: string;
    username?: string;
    firstname?: string;
    lastname?: string;
    email?: string;
    dialCode?: string;
    mobile?: string;
    country?: string;
    password?: string;
  }) {
        // Perform the database transaction

    await this.prisma.$transaction(async (tx) => {
      // Update user profile details
      const user = await this.updateProfileDetails(
        {
          userId: data.userId,
          username: data.username,
          firstname: data.firstname,
          lastname: data.lastname,
          email: data.email,
          dialCode: data.dialCode,
          mobile: data.mobile,
          country: data.country,
        },
        { tx },
      );
   
      // If a new password is provided, update the password
      if (data.password) {
        const { salt, hash } = this.hashPassword(data.password);
        const passwordSalt = salt;
        const passwordHash = hash;
             
        // Update user's password hash and salt
        await tx.userMeta.update({
          data: {
            passwordHash,
            passwordSalt,
          },
          where: {
            userId: data.userId,
          },
        });
      }

      return user;
    });
  }

  
  // Method to update user profile image
  async updateProfileImage(
    userId: string,
    profileImage: string,
  ): Promise<{ profileImage: string | null }> {
    const user = await this.getById(userId);

   // Perform the database transaction
    return await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { profileImage },
      });
     
         // If user had a previous profile image, remove it from storage
      if (user.profileImage) {
        // Remove previous profile image from storage
        await this.storageService.removeFile(
          join(this.config.profileImagePath, user.profileImage),
        );
      }
      // Move the new profile image to storage
      await this.storageService.move(
        profileImage,
        this.config.profileImagePath,
      );

      return {
        profileImage: this.getProfileImageUrl(profileImage),
      };
    });
  }
   
  
  // Method to change user password
  async changePassword(
    userId: string,
    oldPassword: string,
    newPassword: string,
  ): Promise<User> {
    const user = await this.getById(userId);
    const userMeta = await this.getMetaById(user.id);

    // Validate old password
    const hashedPassword = this.utilsService.hashPassword(
      oldPassword,
      userMeta.passwordSalt || '',
      userMeta.passwordHash
        ? userMeta.passwordHash.length / 2
        : this.config.passwordHashLength,
    );

    // If old password doesn't match, throw an error
    if (hashedPassword !== userMeta.passwordHash)
      throw new Error('Password does not match');

    const { salt, hash } = this.hashPassword(newPassword);
    const passwordSalt = salt;
    const passwordHash = hash;

    
    // Update user's password in database
    await this.prisma.userMeta.update({
      data: {
        passwordHash,
        passwordSalt,
      },
      where: {
        userId,
      },
    });
    return user;
  }

  
  // Method to send reset password verification code
  async sendResetPasswordVerificationCode(email?: string, mobile?: string) {
    let user: User | null | undefined;

    if (email) user = await this.getByEmail(email);
    if (!user && mobile) user = await this.getByMobile(mobile);
    if (!user) throw new Error('User does not exist');

    const response: { email?: SendCodeResponse; mobile?: SendCodeResponse } =
      {};
     
      
    // Send OTP code to mobile if provided

    if (mobile) {
      response.mobile = await this.otpService.send({
        context: OtpContext.ResetPassword,
        target: mobile,
        transport: OtpTransport.Mobile,
      });
    }
        // Send OTP code to email if provided
    if (email) {
      response.email = await this.otpService.send({
        context: OtpContext.ResetPassword,
        target: email,
        transport: OtpTransport.Email,
        transportParams: {
          username: user.firstname.concat(' ', user.lastname),
        },
      });
    }
    return response;
  }





  // Method to reset user password
  async resetPassword(
    code: string,
    newPassword: string,
    mobile?: string,
    email?: string,
  ): Promise<User> {
    // Get user by email or mobile
    let user: User | null | undefined;
    if (email) {
      user = await this.getByEmail(email);
    }
    if (!user && mobile) {
      user = await this.getByMobile(mobile);
    }
    if (!user) throw new Error('User not found');

    // Validate verification code
    let response: VerifyCodeResponse | null | undefined;

    if (mobile)
      response = await this.otpService.verify(
        code,
        mobile,
        OtpTransport.Mobile,
      );
    if (email)
      response = await this.otpService.verify(code, email, OtpTransport.Email);
    if (!response) throw new Error('Invalid email or mobile');
    if (response.status === false)
      throw new Error('Incorrect verification code');

    // Reset user password
    const { salt: passwordSalt, hash: passwordHash } =
      this.hashPassword(newPassword);

    await this.prisma.userMeta.update({
      data: {
        passwordSalt,
        passwordHash,
      },
      where: { userId: user.id },
    });
    return user;
  }

  
  // Method to set user status
  async setStatus(userId: string, status: UserStatus): Promise<User> {
    return await this.prisma.user.update({
      data: { status },
      where: {
        id: userId,
      },
    });
  }

  // Method to get all users with search, skip, and take options
  async getAll(options?: {
    search?: string;
    skip?: number;
    take?: number;
  }): Promise<{
    count: number;
    skip: number;
    take: number;
    data: User[];
  }> {
    // Prepare search filter
    const where: Prisma.UserWhereInput = {};
    if (options?.search) {
      const search = options.search.trim().split(' ');
      if (search.length) {
        where.AND = [];

        for (const part of search) {
          where.AND.push({
            OR: [
              {
                firstname: {
                  contains: part,
                  mode: 'insensitive',
                },
              },
              {
                lastname: {
                  contains: part,
                  mode: 'insensitive',
                },
              },
              {
                username: {
                  contains: part,
                  mode: 'insensitive',
                },
              },
              {
                email: {
                  contains: part,
                  mode: 'insensitive',
                },
              },
            ],
          });
        }
      } else {
        where.OR = [
          {
            firstname: {
              contains: options.search,
              mode: 'insensitive',
            },
          },
          {
            lastname: {
              contains: options.search,
              mode: 'insensitive',
            },
          },
          {
            username: {
              contains: options.search,
              mode: 'insensitive',
            },
          },
          {
            email: {
              contains: options.search,
              mode: 'insensitive',
            },
          },
        ];
      }
    }

    
    // Count total users matching the filter
    const totalUsers = await this.prisma.user.count({
      where,
    });
    const users = await this.prisma.user.findMany({
      where,
      orderBy: { createdAt: Prisma.SortOrder.desc },
      skip: options?.skip || 0,
      take: options?.take || 10,
    });
    
    // Map users to include profile image URL
    const response = await Promise.all(
      users.map(async (user) => {
        return {
          ...user,
          profileImage: user.profileImage
            ? this.getProfileImageUrl(user.profileImage)
            : null,
        };
      }),
    );

    
    // Return pagination metadata and user data
    return {
      count: totalUsers,
      skip: options?.skip || 0,
      take: options?.take || 10,
      data: response,
    };
  }
}
