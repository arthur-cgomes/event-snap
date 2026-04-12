import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthGuard } from '@nestjs/passport';
import { UserService } from '../user/user.service';
import { AuthService } from './auth.service';
import { ConfirmResetDto } from './dto/confirm-reset..dto';
import { ConfirmSignupDto } from './dto/confirm-signup.dto';
import { ConfirmUpdateUserDto } from './dto/confirm-update.dto';
import { AuthPayload } from './interfaces/auth.interface';
import { ForceResetPasswordDto } from './dto/force-reset-password.dto';
import { RequestEmailDto } from './dto/request-email.dto';
import { SocialLoginDto } from './dto/social-login.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UserType } from '../../common/enum/user-type.enum';
import { User } from '../user/entity/user.entity';
import { AuditService } from '../../common/services/audit.service';

@ApiBearerAuth()
@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private userService: UserService,
    private auditService: AuditService,
  ) {}

  @Post('login')
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @ApiOperation({
    summary: 'Autenticação do usuário',
  })
  async login(@Body() auth: AuthPayload) {
    return await this.authService.validateUserByPassword(auth);
  }

  @Post('social-login')
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @ApiOperation({
    summary: 'Login social via Firebase (Google/Apple/Facebook)',
  })
  async socialLogin(@Body() dto: SocialLoginDto) {
    return await this.authService.socialLogin(dto.firebaseToken);
  }

  @UseGuards(AuthGuard())
  @Get('me')
  @ApiOperation({ summary: 'Valida token e retorna dados do usuário' })
  async me(@CurrentUser() user: User) {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      userType: user.userType,
    };
  }

  @Post('request-signup')
  @Throttle({ default: { ttl: 60000, limit: 3 } })
  @ApiOperation({
    summary: 'Solicita código para cadastro do usuário',
  })
  async requestSignup(@Body() dto: RequestEmailDto) {
    await this.userService.checkEmailAvailable(dto.email);
    return await this.authService.generateAndSendCode(dto.email, 'signup');
  }

  @Post('confirm-signup')
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @ApiOperation({
    summary: 'Cadastro de usuário',
  })
  async confirmSignup(@Body() dto: ConfirmSignupDto) {
    const { name, phone, dateOfBirth, email, password, code } = dto;
    await this.authService.validateCode(email, code, 'signup');
    const createdUser = await this.userService.createUser({
      name,
      phone,
      dateOfBirth,
      email,
      password,
    });

    return createdUser;
  }

  @Post('request-reset')
  @Throttle({ default: { ttl: 60000, limit: 3 } })
  @ApiOperation({
    summary: 'Solicita código para recuperar senha do usuário',
  })
  async requestReset(@Body() dto: RequestEmailDto) {
    const user = await this.userService.findByEmail(dto.email);
    if (!user) throw new NotFoundException('user not found');
    return await this.authService.generateAndSendCode(dto.email, 'reset');
  }

  @Post('confirm-reset')
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @ApiOperation({
    summary: 'Recupera senha do usuário',
  })
  async confirmReset(@Body() dto: ConfirmResetDto) {
    const { email, code, newPassword } = dto;
    await this.authService.validateCode(email, code, 'reset');
    await this.userService.resetPasswordByEmail(email, newPassword);

    return { message: 'password reset successfully' };
  }

  @Post('/:userId/request-update')
  @ApiOperation({ summary: 'Solicita código para atualizar dados do usuário' })
  async requestUserUpdate(@Param('userId') userId: string) {
    const user = await this.userService.getUserById(userId);
    await this.authService.generateAndSendCode(user.email, 'update');

    return { message: 'Código de verificação enviado para o email' };
  }

  @Post('/:userId/confirm-update')
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

  @Post('logout')
  @UseGuards(AuthGuard())
  @ApiOperation({ summary: 'Logout - invalida o token atual' })
  async logout(@Req() req: any) {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (token) {
      await this.authService.logout(token);
    }
    return { message: 'logged out successfully' };
  }

  @UseGuards(AuthGuard(), RolesGuard)
  @Roles(UserType.ADMIN)
  @Post('admin/force-reset/:userId')
  @ApiOperation({
    summary: 'ADMIN: Força a troca de senha do usuário sem validação de código',
  })
  async forceResetPassword(
    @Param('userId') userId: string,
    @Body() dto: ForceResetPasswordDto,
    @CurrentUser() user: User,
  ) {
    const result = await this.authService.forceResetPassword(
      userId,
      dto.password,
    );
    await this.auditService.log(
      user.id,
      user.email,
      'FORCE_RESET_PASSWORD',
      userId,
    );
    return result;
  }
}
