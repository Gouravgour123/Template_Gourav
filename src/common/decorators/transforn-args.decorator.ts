// Import necessary functions from class-transformer and class-validator libraries
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';

// Define a decorator function named TransformArgs
export function TransformArgs() {
  return function (
    target: any,
    propertyName: string | symbol,
    descriptor: PropertyDescriptor,
  ) {
    // Store the original method to be invoked later
    const originalMethod = descriptor.value;
    descriptor.value = function (...args: any[]) {
      const typedParams: Record<string, any> = Reflect.getOwnMetadata(
        'transformtype',
        target,
        propertyName,
      );

      // Map over each argument and transform them according to their types
      const transformedArgs = args.map((arg, argIndex) => {
        // Check if type information is available for the argument
        if (arg && typedParams[argIndex]) {
          switch (typedParams[argIndex]) {
            case Number:
            case String:
            case RegExp:
            case Date:
              return typedParams[argIndex](arg);
            case Boolean:
              return arg === 'false' || arg === '0' ? false : Boolean(arg);
            default:
              arg = plainToInstance(typedParams[argIndex], arg, {
                enableImplicitConversion: true,
              });
              // Validate the transformed object using class-validator
              const errors = validateSync(arg, {
                whitelist: true,
                forbidUnknownValues: true,
              });
              // If validation fails, throw an error
              if (errors.length) {
                const err = new Error('TransformArgs validation error');
                err.cause = JSON.stringify(errors);
                throw err;
              }
              return arg;
          }
        } else {
          return arg;
        }
      });

      return originalMethod.apply(this, transformedArgs);
    };
  };
}
