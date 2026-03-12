import { IsString, MaxLength } from 'class-validator';

export class DeleteUploadDto {
  @IsString()
  @MaxLength(500)
  key: string;
}
