import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  // APP
  PORT: Joi.number().port().default(4000),

  NODE_ENV: Joi.string().valid('development', 'production', 'test').required(),

  ENABLE_SWAGGER: Joi.boolean().default(false),

  // DATABASE
  DATABASE_URL: Joi.string().uri().required(),
});
