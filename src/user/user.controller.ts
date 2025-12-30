import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { DeleteResponseDto } from '../common/dto/delete-response.dto';
import { GetAllResponseDto } from '../common/dto/get-all.dto';
import { UserDto } from './dto/user.dto';
import { User } from './entity/user.entity';
import { UserService } from './user.service';
import { DashAdminQueryDto } from './dto/get-dashboard.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@ApiBearerAuth()
@ApiTags('User')
@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @UseGuards(AuthGuard())
  @Put('/:userId/update')
  @ApiOperation({
    summary: 'Atualiza um usuário',
  })
  @ApiOkResponse({ type: UserDto })
  @ApiNotFoundResponse({ description: 'Usuário não encontrado' })
  async updateUser(
    @Param('userId') userId: string,
    @Body() updateUserDto: UpdateUserDto,
  ) {
    return await this.userService.updateUser(userId, updateUserDto);
  }

  @UseGuards(AuthGuard())
  @Delete('/:userId/delete')
  @ApiOperation({
    summary: 'Exclui um usuário',
  })
  @ApiOkResponse({ type: DeleteResponseDto })
  @ApiNotFoundResponse({ description: 'Usuário não encontrado' })
  async deleteUser(@Param('userId') userId: string) {
    return { message: await this.userService.deleteUser(userId) };
  }

  @Get('/:userId')
  @ApiOperation({
    summary: 'Retorna um usuário pelo id',
  })
  @ApiOkResponse({ type: UserDto })
  @ApiNotFoundResponse({ description: 'Usuário não encontrado' })
  async getUserById(@Param('userId') userId: string) {
    return await this.userService.getUserById(userId);
  }

  @Get()
  @ApiOperation({
    summary: 'Busca todos os usuários',
  })
  @ApiQuery({ name: 'take', required: false })
  @ApiQuery({ name: 'skip', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'sort', required: false })
  @ApiQuery({ name: 'order', required: false })
  @ApiOkResponse({ type: GetAllResponseDto<User> })
  async getAllUsers(
    @Query('take') take = 10,
    @Query('skip') skip = 0,
    @Query('search') search: string,
    @Query('sort') sort: string = 'name',
    @Query('order') order: 'ASC' | 'DESC' = 'ASC',
  ) {
    return await this.userService.getAllUsers(take, skip, search, sort, order);
  }

  @Get('/admin/dash')
  @ApiOperation({
    summary: 'Retorna dados do dashboard administrativo',
  })
  async getDash(@Query() q: DashAdminQueryDto) {
    const { start, end, tz } = q;
    return this.userService.getDashAdmin({ start, end, tz });
  }

  @Get('/admin/dash/created-users')
  @ApiOperation({ summary: 'Retorna usuários criados (paginado)' })
  @ApiQuery({ name: 'take', required: false })
  @ApiQuery({ name: 'skip', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'sort', required: false })
  @ApiQuery({ name: 'order', required: false })
  async getUsersCreatedDashAdmin(
    @Query('take') take = 10,
    @Query('skip') skip = 0,
    @Query('search') search: string,
    @Query('sort') sort: string = 'createdAt',
    @Query('order') order: 'ASC' | 'DESC' = 'DESC',
  ) {
    return this.userService.getUsersCreatedDashAdmin(
      take,
      skip,
      search,
      sort,
      order,
    );
  }

  @Get('/admin/dash/status-users')
  @ApiOperation({ summary: 'Retorna usuários ativos recentes (paginado)' })
  @ApiQuery({ name: 'take', required: false })
  @ApiQuery({ name: 'skip', required: false })
  @ApiQuery({ name: 'status', required: true })
  @ApiQuery({ name: 'sort', required: false })
  @ApiQuery({ name: 'order', required: false })
  async getUsersByStatusDashAdmin(
    @Query('take') take = 10,
    @Query('skip') skip = 0,
    @Query('status') status: 'active' | 'inactive' = 'active',
    @Query('sort') sort: string = 'lastLogin',
    @Query('order') order: 'ASC' | 'DESC' = 'DESC',
  ) {
    return this.userService.getUsersByStatusDashAdmin(
      take,
      skip,
      status,
      sort,
      order,
    );
  }

  @Get('/admin/dash/without-qrcodes')
  @ApiOperation({ summary: 'Retorna usuários sem QR codes (paginado)' })
  @ApiQuery({ name: 'take', required: false })
  @ApiQuery({ name: 'skip', required: false })
  @ApiQuery({ name: 'sort', required: false })
  @ApiQuery({ name: 'order', required: false })
  async getUsersWithoutQrCodes(
    @Query('take') take = 10,
    @Query('skip') skip = 0,
    @Query('sort') sort: string = 'lastLogin',
    @Query('order') order: 'ASC' | 'DESC' = 'ASC',
  ) {
    return this.userService.getUsersWithoutQrCodes(take, skip, sort, order);
  }
}
