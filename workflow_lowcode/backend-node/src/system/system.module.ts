import { Module } from '@nestjs/common'
import { AuthController } from './controller/auth.controller'
import { ClientController } from './controller/client.controller'
import {
  DictDataController,
  DictTypeController,
  MemberGroupController,
  MenuController,
  OrganizationController,
  PostController,
  RoleController,
  UserController,
} from './controller/system.controller'
import { AuthRepository } from './repository/auth.repository'
import { ClientRepository } from './repository/client.repository'
import { SystemRepository } from './repository/system.repository'
import { AuthService } from './service/auth.service'
import { ClientService } from './service/client.service'
import { SystemService } from './service/system.service'

/**
 * 系统管理模块（对齐 Java `com.workflow.system`）。
 *
 * 依赖方向：system → framework → common（由 eslint 边界规则强制）。
 * 注意：本模块**不依赖 engine**。
 */
@Module({
  controllers: [
    AuthController,
    ClientController,
    UserController,
    RoleController,
    MenuController,
    OrganizationController,
    PostController,
    MemberGroupController,
    DictTypeController,
    DictDataController,
  ],
  providers: [AuthRepository, ClientRepository, SystemRepository, AuthService, ClientService, SystemService],
  exports: [AuthService, ClientService, SystemService, AuthRepository, ClientRepository, SystemRepository],
})
export class SystemModule {}