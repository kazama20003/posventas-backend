import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  // APP
  PORT: Joi.number().port().default(4000),

  NODE_ENV: Joi.string().valid('development', 'production', 'test').required(),

  ENABLE_SWAGGER: Joi.boolean().default(false),
  CORS_ORIGIN: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.string().uri().required(),
    otherwise: Joi.string().uri().default('http://localhost:3000'),
  }),

  // DATABASE
  DATABASE_URL: Joi.string().uri().required(),

  // AUTH - JWT / COOKIE
  JWT_SECRET: Joi.string().min(16).required(),
  JWT_EXPIRES_IN: Joi.string().default('7d'),
  AUTH_COOKIE_NAME: Joi.string().default('posventas_token'),
  AUTH_COOKIE_DOMAIN: Joi.string().optional(),
  AUTH_COOKIE_SECURE: Joi.boolean().default(false),
  AUTH_COOKIE_SAME_SITE: Joi.string()
    .valid('lax', 'strict', 'none')
    .default('lax'),
  AUTH_COOKIE_MAX_AGE_SECONDS: Joi.number()
    .integer()
    .positive()
    .default(604800),

  // AUTH - GOOGLE OAuth
  GOOGLE_CLIENT_ID: Joi.string().required(),
  GOOGLE_CLIENT_SECRET: Joi.string().required(),
  GOOGLE_CALLBACK_URL: Joi.string().uri().required(),
  GOOGLE_SUCCESS_REDIRECT_URL: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.string()
      .pattern(/^https?:\/\/.+$/)
      .required(),
    otherwise: Joi.string()
      .pattern(/^https?:\/\/.+$/)
      .default('http://localhost:3000'),
  }),
  GOOGLE_FAILURE_REDIRECT_URL: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.string().uri().required(),
    otherwise: Joi.string()
      .uri()
      .default('http://localhost:3000/login?error=google_auth'),
  }),

  // UPLOADS - AWS S3
  AWS_REGION: Joi.string().required(),
  AWS_ACCESS_KEY_ID: Joi.string().required(),
  AWS_SECRET_ACCESS_KEY: Joi.string().required(),
  AWS_S3_BUCKET: Joi.string().required(),
  AWS_S3_PUBLIC_BASE_URL: Joi.string()
    .pattern(/^https?:\/\/.+$/)
    .optional(),
});
