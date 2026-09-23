import { Body, Controller, Delete, Get, Param, Post, Put, Query } from '@nestjs/common'
import { R } from '../../../common/domain/r'
import { PageResponse } from '../../../common/domain/page-response'
import { JavaStatusOk } from '../../../framework/http/java-status.decorator'
import { intQueryParam } from '../../../framework/http/query-params'
import {
  ProcessDesignService,
  type DesignSaveRequest,
  type EditorVO,
  type ProcessDraftVO,
} from '../process-design.service'

/**
 * 流程设计器接口，对齐 Java `ProcessDesignController`（前缀 `/api/v1/process-definitions`）。
 *
 * ⚠️ `@JavaStatusOk()` 是契约要求：NestJS 默认 POST → 201，Spring MVC → 200。
 */
@Controller('api/v1/process-definitions')
@JavaStatusOk()
export class ProcessDesignController {
  constructor(private readonly service: ProcessDesignService) {}

  /** 创建草稿。三个参数都是 query 参数（对齐 Java 的 @RequestParam）。 */
  @Post('drafts')
  async createDraft(
    @Query('name') name: string,
    @Query('key') key: string,
    @Query('categoryId') categoryId?: string,
  ): Promise<R<ProcessDraftVO>> {
    return R.ok(await this.service.createDraft(name, key, categoryId ?? null))
  }

  @Get('drafts')
  async listDrafts(
    @Query('page') page?: string,
    @Query('size') size?: string,
  ): Promise<R<PageResponse<ProcessDraftVO>>> {
    return R.ok(await this.service.listDrafts(intQueryParam(page, 'page', 1), intQueryParam(size, 'size', 20)))
  }

  @Get(':id/editor')
  async loadEditor(@Param('id') id: string): Promise<R<EditorVO>> {
    return R.ok(await this.service.loadEditor(id))
  }

  @Put(':id/design')
  async saveDesign(
    @Param('id') id: string,
    @Body() request: DesignSaveRequest,
  ): Promise<R<ProcessDraftVO>> {
    return R.ok(await this.service.saveDesign(id, request))
  }

  @Post(':id/deploy')
  async deploy(@Param('id') id: string): Promise<R<ProcessDraftVO>> {
    return R.ok(await this.service.deploy(id))
  }

  @Post(':id/copy')
  async copy(@Param('id') id: string): Promise<R<ProcessDraftVO>> {
    return R.ok(await this.service.copyProcess(id))
  }

  @Delete(':id')
  async deleteDraft(@Param('id') id: string): Promise<R<null>> {
    await this.service.deleteDraft(id)
    return R.ok()
  }
}

