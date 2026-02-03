/**
 * Shared validation helpers for agent input validation.
 */

import type { ValidationResult, ValidationError } from '../framework/types';

export function ok(): ValidationResult {
  return { valid: true, errors: [] };
}

export function fail(errors: ValidationError[]): ValidationResult {
  return { valid: false, errors };
}

export function fieldError(field: string, message: string, code = 'INVALID'): ValidationError {
  return { field, message, code };
}

/** Validate that required string fields are present and non-empty */
export function requireStrings(
  params: Record<string, unknown>,
  fields: string[],
): ValidationError[] {
  const errors: ValidationError[] = [];
  for (const field of fields) {
    const value = params[field];
    if (typeof value !== 'string' || value.trim().length === 0) {
      errors.push(fieldError(field, `${field} is required and must be a non-empty string`, 'REQUIRED'));
    }
  }
  return errors;
}

/** Validate a field is one of the allowed values */
export function requireOneOf(
  params: Record<string, unknown>,
  field: string,
  allowed: string[],
): ValidationError | null {
  const value = params[field];
  if (typeof value !== 'string' || !allowed.includes(value)) {
    return fieldError(
      field,
      `${field} must be one of: ${allowed.join(', ')}`,
      'INVALID_ENUM',
    );
  }
  return null;
}

/** Validate a number is within range */
export function requireNumberInRange(
  params: Record<string, unknown>,
  field: string,
  min: number,
  max: number,
): ValidationError | null {
  const value = params[field];
  if (typeof value !== 'number' || value < min || value > max) {
    return fieldError(
      field,
      `${field} must be a number between ${min} and ${max}`,
      'OUT_OF_RANGE',
    );
  }
  return null;
}
