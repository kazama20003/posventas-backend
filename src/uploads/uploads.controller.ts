import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Express, Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthJwtPayload } from '../auth/types/auth-jwt-payload.type';
import { DeleteUploadDto } from './dto/delete-upload.dto';
import { UploadImageDto } from './dto/upload-image.dto';
import { UploadsService } from './uploads.service';

type UploadedImageFile = Express.Multer.File;

@Controller('uploads')
@UseGuards(JwtAuthGuard)
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  @Post('images')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: {
        fileSize: 5 * 1024 * 1024,
      },
    }),
  )
  uploadImage(
    @Req() req: Request & { user: AuthJwtPayload },
    @UploadedFile() file: UploadedImageFile | undefined,
    @Body() dto: UploadImageDto,
  ) {
    if (!file) {
      throw new BadRequestException(
        'Debes enviar una imagen en el campo file.',
      );
    }

    return this.uploadsService.uploadImage(req.user.tenantId, file, dto.folder);
  }

  @Delete('images')
  deleteImage(
    @Req() req: Request & { user: AuthJwtPayload },
    @Body() dto: DeleteUploadDto,
  ) {
    return this.uploadsService.deleteImage(req.user.tenantId, dto.key);
  }
}
