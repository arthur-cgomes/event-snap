import {
  Body,
  Controller,
  ForbiddenException,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { AuthPayload } from './interfaces/auth.interface';
import { UserService } from '../user/user.service';
import { ResetPasswordDto } from '../user/dto/reset-password.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private userService: UserService,
  ) {}

  @ApiOperation({
    description: 'Autentica o usuário',
  })
  @ApiResponse({
    type: ForbiddenException,
    description: 'Senha inválida',
  })
  @Post()
  async login(@Body() auth: AuthPayload) {
    return await this.authService.validateUserByPassword(auth);
  }

  @ApiOperation({
    summary: 'Recuperação de senha do usuário',
    description:
      'Permite que o usuário recupere sua senha usando o nome e o email.',
  })
  @ApiNotFoundResponse({
    description: 'Usuário não encontrado',
  })
  @Patch('/reset-password')
  async resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
    const { name, email, newPassword } = resetPasswordDto;
    await this.userService.resetPassword(name, email, newPassword);
    return { message: 'Senha alterada com sucesso!' };
  }
}
