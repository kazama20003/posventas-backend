import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
  port: Number(process.env.PORT),
  nodeEnv: process.env.NODE_ENV as 'development' | 'production' | 'test',
  enableSwagger: process.env.ENABLE_SWAGGER === 'true',
}));
