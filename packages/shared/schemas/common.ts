import { z } from 'zod';

// Success response schema factory
export const SuccessResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    success: z.literal(true),
    data: dataSchema,
  });

// Error response schema
export const ErrorResponseSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});

// Standard error codes (per architecture.md)
export const ErrorCode = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONTENT_NOT_GENERATED: 'CONTENT_NOT_GENERATED',
  GENERATION_IN_PROGRESS: 'GENERATION_IN_PROGRESS',
  GENERATION_FAILED: 'GENERATION_FAILED',
  RATE_LIMITED: 'RATE_LIMITED',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  // AI-specific error codes
  AI_TIMEOUT: 'AI_TIMEOUT',
  AI_CONTEXT_TOO_LONG: 'AI_CONTEXT_TOO_LONG',
  AI_CONTENT_BLOCKED: 'AI_CONTENT_BLOCKED', // Gemini SAFETY filter
  AI_RECITATION_DETECTED: 'AI_RECITATION_DETECTED', // Gemini recitation detection
  AI_SERVICE_UNAVAILABLE: 'AI_SERVICE_UNAVAILABLE', // Gemini service overloaded
  // TTS-specific error codes (Story 3-4, updated in 3-4-R1 for Gemini)
  TTS_TIMEOUT: 'TTS_TIMEOUT',
  TTS_RATE_LIMITED: 'TTS_RATE_LIMITED',
  TTS_GENERATION_FAILED: 'TTS_GENERATION_FAILED',
  // Storage-specific error codes (Story 3-5)
  STORAGE_UPLOAD_FAILED: 'STORAGE_UPLOAD_FAILED',
  STORAGE_DELETE_FAILED: 'STORAGE_DELETE_FAILED',
  STORAGE_NOT_FOUND: 'STORAGE_NOT_FOUND',
  STORAGE_FILE_TOO_LARGE: 'STORAGE_FILE_TOO_LARGE',
  // Database error code (Story 3-8)
  DATABASE_ERROR: 'DATABASE_ERROR',
  // Webhook error code (Story 7-11)
  WEBHOOK_PROCESSING_ERROR: 'WEBHOOK_PROCESSING_ERROR',
  // Generic internal error (CHANGE-024-B)
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCodeType = (typeof ErrorCode)[keyof typeof ErrorCode];

// Health check response schemas
export const HealthDataSchema = z.object({
  status: z.enum(['healthy', 'degraded', 'unhealthy']),
  timestamp: z.number(),
  version: z.string(),
});

export const HealthResponseSchema = SuccessResponseSchema(HealthDataSchema);

// Type inference helpers
export type SuccessResponse<T extends z.ZodTypeAny> = z.infer<
  ReturnType<typeof SuccessResponseSchema<T>>
>;
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
export type HealthData = z.infer<typeof HealthDataSchema>;
export type HealthResponse = z.infer<typeof HealthResponseSchema>;
