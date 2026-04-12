import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  RawBodyRequest,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Request } from 'express';
import { PaymentService } from './payment.service';
import { CreateCheckoutDto } from './dto/create-checkout.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { User } from '../user/entity/user.entity';

@ApiTags('Payment')
@Controller('payment')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Post('checkout')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Criar sessão de checkout Stripe' })
  @ApiResponse({ status: 201, description: 'Sessão criada com sucesso' })
  async createCheckout(
    @Body() dto: CreateCheckoutDto,
    @CurrentUser() user: User,
  ) {
    return this.paymentService.createCheckoutSession(dto.qrCodeId, user);
  }

  @Post('webhook')
  @ApiOperation({ summary: 'Webhook do Stripe (uso interno)' })
  @ApiResponse({ status: 200, description: 'Webhook processado' })
  async handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
  ) {
    await this.paymentService.handleWebhook(req.rawBody, signature);
    return { received: true };
  }

  @Get('status/:qrCodeId')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Verificar status de pagamento de um QR Code' })
  @ApiResponse({ status: 200, description: 'Status do pagamento' })
  async getPaymentStatus(
    @Param('qrCodeId') qrCodeId: string,
    @CurrentUser() user: User,
  ) {
    return this.paymentService.getPaymentStatus(qrCodeId, user);
  }
}
