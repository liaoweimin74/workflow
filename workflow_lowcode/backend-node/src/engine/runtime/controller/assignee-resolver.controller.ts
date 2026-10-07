import { Controller, Get } from '@nestjs/common'
import { R } from '../../../common/domain/r'
import { JavaStatusOk } from '../../../framework/http/java-status.decorator'
import {
  listAssigneeResolvers,
  type AssigneeResolverMeta,
} from '../assignee-resolver-registry'

/**
 * 选人函数清单（设计器面板下拉数据源）。
 *
 * 返回业务系统经 `registerAssigneeResolver` 注册的全部选人函数元数据
 * （注册名 / 中文名 / 描述 / 参数声明），按注册名排序。
 * 设计器「办理人/审批人设置 → 自定义选人函数」据此渲染下拉与参数配置表单。
 */
@Controller('api/v1/assignee-resolvers')
@JavaStatusOk()
export class AssigneeResolverController {
  /** 选人函数元数据清单（含内置样例与业务系统注册的扩展函数）。 */
  @Get()
  list(): R<AssigneeResolverMeta[]> {
    return R.ok(listAssigneeResolvers())
  }
}
