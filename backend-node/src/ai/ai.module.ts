import { Module } from '@nestjs/common'
import { EngineModule } from '../engine/engine.module'
import { AiChatController } from './controller/ai-chat.controller'
import { FcChatController } from './controller/fc-chat.controller'
import { InternalLlmController } from './controller/internal-llm.controller'
import { AiAgentService } from './service/ai-agent.service'
import { AiFormGenerationService } from './service/ai-form-generation.service'
import { AiProcessGenerationService } from './service/ai-process-generation.service'
import { FormSchemaValidator } from './service/form-schema-validator'
import { ZaiLlmService } from './service/zai-llm.service'
import { AiTool, AiToolRegistry } from './tools/ai-tool'
import { CreateFormTool } from './tools/create-form.tool'
import { CreateProcessTool } from './tools/create-process.tool'
import { GenerateFormSchemaTool } from './tools/generate-form-schema.tool'
import { ListFormsTool } from './tools/list-forms.tool'
import { ListProcessesTool } from './tools/list-processes.tool'
import { OpenPageTool } from './tools/open-page.tool'
import { UpdateFormTool } from './tools/update-form.tool'
import { UpdateProcessTool } from './tools/update-process.tool'

/**
 * AI 模块：小智助手对话 + 表单生成 + 内部 LLM 网关。
 *
 * LLM 使用平台内置模型（z-ai-web-dev-sdk / GLM），无外部 API 配置依赖。
 * 内部 LLM 网关（InternalLlmController）提供 OpenAI 兼容端点，供 Java
 * 后端 AI 模块直连复用平台内置模型（替代外部 DeepSeek 配置）。
 * create_form 工具真实落库表单草稿，依赖 EngineModule 的表单写服务。
 */
const AI_TOOLS = 'AI_TOOLS'

@Module({
  imports: [EngineModule],
  controllers: [AiChatController, FcChatController, InternalLlmController],
  providers: [
    ZaiLlmService,
    FormSchemaValidator,
    AiFormGenerationService,
    AiProcessGenerationService,
    OpenPageTool,
    GenerateFormSchemaTool,
    CreateFormTool,
    CreateProcessTool,
    UpdateFormTool,
    UpdateProcessTool,
    ListFormsTool,
    ListProcessesTool,
    {
      provide: AI_TOOLS,
      useFactory: (
        openPage: OpenPageTool,
        generateForm: GenerateFormSchemaTool,
        createForm: CreateFormTool,
        createProcess: CreateProcessTool,
        updateForm: UpdateFormTool,
        updateProcess: UpdateProcessTool,
        listForms: ListFormsTool,
        listProcesses: ListProcessesTool,
      ): AiTool[] => [
        openPage,
        generateForm,
        createForm,
        createProcess,
        updateForm,
        updateProcess,
        listForms,
        listProcesses,
      ],
      inject: [
        OpenPageTool,
        GenerateFormSchemaTool,
        CreateFormTool,
        CreateProcessTool,
        UpdateFormTool,
        UpdateProcessTool,
        ListFormsTool,
        ListProcessesTool,
      ],
    },
    {
      provide: AiToolRegistry,
      useFactory: (tools: AiTool[]) => new AiToolRegistry(tools),
      inject: [AI_TOOLS],
    },
    AiAgentService,
  ],
  exports: [AiFormGenerationService],
})
export class AiModule {}
