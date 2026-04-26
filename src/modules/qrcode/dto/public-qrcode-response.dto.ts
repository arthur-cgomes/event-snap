import { ApiProperty } from '@nestjs/swagger';
import { QrCodePlan } from '../../../common/enum/qrcode-plan.enum';
import { QrCodeType } from '../../../common/enum/qrcode-type.enum';

export class PublicQrCodeResponseDto {
  @ApiProperty() token: string;
  @ApiProperty() eventName: string;
  @ApiProperty() descriptionEvent: string;
  @ApiProperty() eventColor: string;
  @ApiProperty() expirationDate: Date;
  @ApiProperty({ enum: QrCodeType }) type: QrCodeType;
  @ApiProperty({ enum: QrCodePlan }) plan: QrCodePlan;
  @ApiProperty() uploadEnabled: boolean;
  @ApiProperty() galleryEnabled: boolean;
  @ApiProperty() viewCount: number;
  @ApiProperty({ nullable: true }) eventLocation: string;
  @ApiProperty({ nullable: true }) eventDateTime: Date;
  @ApiProperty({ nullable: true }) dressCode: string;
  @ApiProperty({ nullable: true }) coverImageUrl: string;
  @ApiProperty({ nullable: true }) recommendations: string;
  @ApiProperty({ nullable: true }) ownerName: string;
}
