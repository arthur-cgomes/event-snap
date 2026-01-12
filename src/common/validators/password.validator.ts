import {
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
} from 'class-validator';

/**
 * Custom validator for strong passwords
 *
 * Requirements:
 * - At least 8 characters long
 * - Contains at least one uppercase letter
 * - Contains at least one lowercase letter
 * - Contains at least one number
 * - Contains at least one special character
 *
 * @example
 * ```typescript
 * @IsStrongPassword()
 * password: string;
 * ```
 */
export function IsStrongPassword(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      name: 'isStrongPassword',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: any, args: ValidationArguments) {
          if (typeof value !== 'string') return false;

          // At least 8 characters
          if (value.length < 8) return false;

          // Contains uppercase letter
          if (!/[A-Z]/.test(value)) return false;

          // Contains lowercase letter
          if (!/[a-z]/.test(value)) return false;

          // Contains number
          if (!/[0-9]/.test(value)) return false;

          // Contains special character
          if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(value))
            return false;

          return true;
        },
        defaultMessage(args: ValidationArguments) {
          return 'Password must be at least 8 characters long and contain at least one uppercase letter, one lowercase letter, one number, and one special character';
        },
      },
    });
  };
}
