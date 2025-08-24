import {
  Body,
  ConflictException,
  Controller,
  NotFoundException,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserService } from '../user/user.service';
import { AuthService } from './auth.service';
import { ConfirmResetDto } from './dto/confirm-reset..dto';
import { ConfirmSignupDto } from './dto/confirm-signup.dto';
import { ConfirmUpdateUserDto } from './dto/confirm-update.dto';
import { AuthPayload } from './interfaces/auth.interface';

@ApiBearerAuth()
@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private userService: UserService,
  ) {}

  @Post('login')
  @ApiOperation({
    summary: 'Autenticação do usuário',
  })
  async login(@Body() auth: AuthPayload) {
    return await this.authService.validateUserByPassword(auth);
  }

  @Post('request-signup')
  @ApiOperation({
    summary: 'Solicita código para cadastro do usuário',
  })
  async requestSignup(@Body('email') email: string) {
    const existing = await this.userService.findByEmail(email);
    if (existing) throw new ConflictException('email already registered');
    return await this.authService.generateAndSendCode(email, 'signup');
  }

  @Post('confirm-signup')
  @ApiOperation({
    summary: 'Cadastro de usuário',
  })
  async confirmSignup(@Body() dto: ConfirmSignupDto) {
    const { name, phone, email, password, code } = dto;
    await this.authService.validateCode(email, code, 'signup');
    const createdUser = await this.userService.createUser({
      name,
      phone,
      email,
      password,
    });

    return createdUser;
  }

  @Post('request-reset')
  @ApiOperation({
    summary: 'Solicita código para recuperar senha do usuário',
  })
  async requestReset(@Body('email') email: string) {
    const user = await this.userService.findByEmail(email);
    if (!user) throw new NotFoundException('user not found');
    return await this.authService.generateAndSendCode(email, 'reset');
  }

  @Post('confirm-reset')
  @ApiOperation({
    summary: 'Recupera senha do usuário',
  })
  async confirmReset(@Body() dto: ConfirmResetDto) {
    const { email, code, newPassword } = dto;
    await this.authService.validateCode(email, code, 'reset');
    await this.userService.resetPasswordByEmail(email, newPassword);

    return { message: 'password reset successfully' };
  }

  @UseGuards(AuthGuard())
  @Put('/:userId/request-update')
  @ApiOperation({ summary: 'Solicita código para atualizar dados do usuário' })
  async requestUserUpdate(@Param('userId') userId: string) {
    const user = await this.userService.getUserById(userId);
    await this.authService.generateAndSendCode(user.email, 'update');

    return { message: 'Código de verificação enviado para o email' };
  }

  @UseGuards(AuthGuard())
  @Put('/:userId/confirm-update')
  @ApiOperation({
    summary: 'Atualiza dados do usuário',
  })
  async confirmUserUpdate(
    @Param('userId') userId: string,
    @Body() dto: ConfirmUpdateUserDto,
  ) {
    const user = await this.userService.getUserById(userId);
    await this.authService.validateCode(user.email, dto.code, 'update');
    const { code, ...updateData } = dto;

    return await this.userService.updateUser(userId, updateData);
  }
}
