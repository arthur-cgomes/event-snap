import {
  Controller,
  Delete,
  Get,
  Param,
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

@ApiBearerAuth()
@ApiTags('User')
@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}

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

  @UseGuards(AuthGuard())
  @Delete('/:userId')
  @ApiOperation({
    summary: 'Exclui um usuário',
  })
  @ApiOkResponse({ type: DeleteResponseDto })
  @ApiNotFoundResponse({ description: 'Usuário não encontrado' })
  async deleteUser(@Param('userId') userId: string) {
    return { message: await this.userService.deleteUser(userId) };
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

  @Get('/admin/dash/active-users')
  @ApiOperation({ summary: 'Retorna usuários ativos recentes (paginado)' })
  @ApiQuery({ name: 'take', required: false })
  @ApiQuery({ name: 'skip', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'sort', required: false })
  @ApiQuery({ name: 'order', required: false })
  async getUsersActiveDashAdmin(
    @Query('take') take = 10,
    @Query('skip') skip = 0,
    @Query('search') search: string,
    @Query('sort') sort: string = 'lastLogin',
    @Query('order') order: 'ASC' | 'DESC' = 'DESC',
  ) {
    return this.userService.getUsersActiveDashAdmin(
      take,
      skip,
      search,
      sort,
      order,
    );
  }

  @Get('/admin/dash/inactive-users')
  @ApiOperation({ summary: 'Retorna usuários inativos (paginado)' })
  @ApiQuery({ name: 'take', required: false })
  @ApiQuery({ name: 'skip', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'sort', required: false })
  @ApiQuery({ name: 'order', required: false })
  async getUsersInactiveDashAdmin(
    @Query('take') take = 10,
    @Query('skip') skip = 0,
    @Query('search') search: string,
    @Query('sort') sort: string = 'lastLogin',
    @Query('order') order: 'ASC' | 'DESC' = 'ASC',
  ) {
    return this.userService.getUsersInactiveDashAdmin(
      take,
      skip,
      search,
      sort,
      order,
    );
  }
}
