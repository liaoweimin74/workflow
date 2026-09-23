import { Module } from '@nestjs/common'
import { AuthController } from './controller/auth.controller'
import {
  DictDataController,
  DictTypeController,
  MenuController,
  OrganizationController,
  RoleController,
  UserController,
} from './controller/system.controller'
import { AuthRepository } from './repository/auth.repository'
import { SystemRepository } from './repository/system.repository'
import { AuthService } from './service/auth.service'
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
    UserController,
    RoleController,
    MenuController,
    OrganizationController,
    DictTypeController,
    DictDataController,
  ],
  providers: [AuthRepository, SystemRepository, AuthService, SystemService],
  exports: [AuthService, SystemService, AuthRepository, SystemRepository],
})
export class SystemModule {}