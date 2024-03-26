// Import necessary modules from Nest.js
import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SetMetadata } from '@nestjs/common';
import { UserType } from '@Common'; // Import UserType enum from a common module

// Define a decorator called Roles that accepts an array of roles
export const Roles = (...roles: UserType[]) => SetMetadata('roles', roles);

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  // Method to determine if the user has required roles to access a resource
  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<string[]>('roles', [
      context.getHandler(), 
      context.getClass(), 
    ]);
    if (!roles) {
      return false;
    }
    const request = context.switchToHttp().getRequest();
    if (!request.user.type) return false;
    return this.validateRoles(roles, request.user.type);
  }

  // Method to validate user's roles against required roles
  validateRoles(roles: string[], userRole: string) {
    return roles.some((role) => userRole.toLowerCase() === role.toLowerCase());
  }
}
