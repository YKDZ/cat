# CAT 项目整体架构设计

## 1. 项目概述

CAT 是一个安全、高效且易于扩展的自托管计算机辅助翻译（CAT）Web 应用程序，功能类似于 Crowdin。项目采用插件化架构设计，支持多种翻译建议引擎、认证方式和文件格式处理。

### 核心特性

- 自托管部署，数据安全可控
- 插件化架构，功能易于扩展
- 多语言翻译协作支持
- 支持多种翻译建议引擎
- 支持多种文件格式处理

## 2. 技术架构

### 2.1 整体架构图

```mermaid
graph TB
    subgraph "前端层 (Frontend Layer)"
        UI[Vue 3.5 用户界面]
        Pages[页面组件]
        Components[可复用组件]
        Stores[Pinia 状态管理]
        Assets[静态资源]
    end

    subgraph "服务端层 (Server Layer)"
        Server[Node.js 服务器]
        API[Hono Web 框架]
        TRPC[tRPC API 层]
        Middleware[中间件层]
        Handlers[请求处理器]
    end

    subgraph "核心业务层 (Core Business Layer)"
        PluginCore[插件核心系统]
        Registry[插件注册中心]
        Processor[业务处理器]
        Utils[工具类库]
        Shared[共享模块]
    end

    subgraph "插件系统 (Plugin System)"
        AuthPlugins[认证插件]
        TranslationPlugins[翻译建议插件]
        FilePlugins[文件处理插件]
        VectorizerPlugins[向量化插件]
    end

    subgraph "数据层 (Data Layer)"
        Database[(PostgreSQL 数据库)]
        Redis[(Redis 缓存)]
        Storage[文件存储]
        ES[Elasticsearch 搜索]
    end

    subgraph "外部服务 (External Services)"
        GoogleCloud[Google Cloud API]
        OpenAI[OpenAI API]
        LibreTranslate[LibreTranslate]
        Ollama[Ollama]
    end

    UI --> API
    Pages --> Components
    Components --> Stores

    API --> TRPC
    TRPC --> Handlers
    Handlers --> PluginCore

    PluginCore --> Registry
    Registry --> AuthPlugins
    Registry --> TranslationPlugins
    Registry --> FilePlugins
    Registry --> VectorizerPlugins

    Processor --> Database
    Processor --> Redis
    Processor --> Storage
    Processor --> ES

    TranslationPlugins --> GoogleCloud
    TranslationPlugins --> OpenAI
    TranslationPlugins --> LibreTranslate
    VectorizerPlugins --> Ollama
```

### 2.2 分层架构设计

| 层级       | 职责                   | 技术栈                    |
| ---------- | ---------------------- | ------------------------- |
| 前端表现层 | 用户界面、交互逻辑     | Vue 3.5, Vike, UnoCSS     |
| API 接口层 | HTTP 接口、路由管理    | Hono, tRPC                |
| 业务逻辑层 | 核心业务逻辑、插件管理 | TypeScript, Plugin Core   |
| 插件扩展层 | 功能插件、服务集成     | 插件系统                  |
| 数据持久层 | 数据存储、缓存管理     | Prisma, PostgreSQL, Redis |

## 3. 核心模块架构

### 3.1 主应用模块 (apps/app)

```mermaid
graph LR
    subgraph "前端应用 (Frontend)"
        F1[页面路由]
        F2[组件库]
        F3[状态管理]
        F4[工具函数]
    end

    subgraph "服务端应用 (Backend)"
        B1[HTTP 服务器]
        B2[API 路由]
        B3[中间件]
        B4[业务处理器]
    end

    F1 --> B2
    F2 --> B2
    F3 --> B2
    B1 --> B2
    B2 --> B3
    B3 --> B4
```

### 3.2 插件系统架构

```mermaid
graph TB
    subgraph "插件注册系统"
        Registry[插件注册中心]
        Manifest[Manifest 配置]
        Loader[插件加载器]
    end

    subgraph "认证插件"
        EmailAuth[邮箱密码认证]
        OIDCAuth[OIDC 认证]
    end

    subgraph "翻译建议插件"
        LibreTranslate[LibreTranslate]
        GoogleCloud[Google Cloud]
        OpenAI[OpenAI]
    end

    subgraph "文件处理插件"
        JSONHandler[JSON 处理器]
        YAMLHandler[YAML 处理器]
        TEIHandler[TEI 处理器]
    end

    subgraph "向量化插件"
        OllamaVectorizer[Ollama 向量化]
        OpenAIVectorizer[OpenAI 向量化]
        TEIVectorizer[TEI 向量化]
    end

    Registry --> Manifest
    Manifest --> Loader
    Loader --> EmailAuth
    Loader --> OIDCAuth
    Loader --> LibreTranslate
    Loader --> GoogleCloud
    Loader --> OpenAI
    Loader --> JSONHandler
    Loader --> YAMLHandler
    Loader --> TEIHandler
    Loader --> OllamaVectorizer
    Loader --> OpenAIVectorizer
    Loader --> TEIVectorizer
```

### 3.3 数据库架构

```mermaid
erDiagram
    User ||--o{ Project : creates
    Project ||--o{ Translation : contains
    Translation ||--o{ TranslationItem : includes
    User ||--o{ Session : has
    Project ||--o{ ProjectMember : includes
    Plugin ||--o{ PluginConfig : configures

    User {
        string id PK
        string email
        string name
        datetime createdAt
    }

    Project {
        string id PK
        string name
        string description
        string ownerId FK
        datetime createdAt
    }

    Translation {
        string id PK
        string projectId FK
        string sourceLanguage
        string targetLanguage
        string status
    }

    TranslationItem {
        string id PK
        string translationId FK
        string sourceText
        string targetText
        string status
    }
```

## 4. 插件系统设计

### 4.1 插件类型分类

| 插件类型   | 标签                      | 功能描述         | 示例插件                                         |
| ---------- | ------------------------- | ---------------- | ------------------------------------------------ |
| 认证提供者 | auth-provider             | 用户身份验证     | email-password-auth-provider, oidc-auth-provider |
| 翻译建议器 | translation-advisor       | 提供翻译建议     | libretranslate-advisor, google-cloud-advisor     |
| 文件处理器 | translatable-file-handler | 处理翻译文件格式 | json-file-handler, yaml-file-handler             |
| 向量化器   | vectorizer                | 文本向量化处理   | ollama-vectorizer, openai-vectorizer             |
| 术语服务   | term-service              | 术语管理服务     | es-term-service                                  |

### 4.2 插件生命周期

```mermaid
sequenceDiagram
    participant App as 主应用
    participant Registry as 插件注册中心
    participant Plugin as 插件实例
    participant Config as 配置管理

    App->>Registry: 启动插件加载
    Registry->>Plugin: 扫描 manifest.json
    Plugin->>Registry: 返回插件元信息
    Registry->>Config: 加载插件配置
    Config->>Registry: 返回配置信息
    Registry->>Plugin: 初始化插件
    Plugin->>Registry: 注册插件服务
    Registry->>App: 插件就绪通知
```

### 4.3 插件配置管理

```json
{
  "id": "libretranslate-advisor",
  "entry": "dist/index.mjs",
  "iconURL": "https://unocss.dev/logo.svg",
  "tags": ["translation-advisor"],
  "configs": [
    {
      "key": "api",
      "overridable": true,
      "schema": {
        "type": "object",
        "properties": {
          "url": {
            "type": "string",
            "format": "url",
            "default": "http://libreTranslate:5000/"
          },
          "key": {
            "type": "string",
            "x-secret": true
          }
        }
      }
    }
  ]
}
```

## 5. 数据流架构

### 5.1 翻译工作流

```mermaid
flowchart TD
    Start([用户上传翻译文件]) --> Parse[文件解析]
    Parse --> Store[存储到数据库]
    Store --> Extract[提取翻译项]
    Extract --> Suggest[获取翻译建议]
    Suggest --> Display[显示给用户]
    Display --> Edit[用户编辑翻译]
    Edit --> Validate[验证翻译]
    Validate --> Save[保存翻译结果]
    Save --> Export[导出翻译文件]
    Export --> End([完成翻译])

    Suggest --> Cache[缓存建议结果]
    Cache --> Redis[(Redis)]

    Validate --> Vector[向量化处理]
    Vector --> Search[相似度搜索]
    Search --> Elasticsearch[(Elasticsearch)]
```

### 5.2 用户认证流程

```mermaid
sequenceDiagram
    participant User as 用户
    participant Frontend as 前端
    participant AuthAPI as 认证API
    participant AuthPlugin as 认证插件
    participant Database as 数据库
    participant Session as 会话管理

    User->>Frontend: 提交登录信息
    Frontend->>AuthAPI: 发送认证请求
    AuthAPI->>AuthPlugin: 调用认证插件
    AuthPlugin->>Database: 验证用户凭据
    Database->>AuthPlugin: 返回验证结果
    AuthPlugin->>AuthAPI: 返回认证结果
    AuthAPI->>Session: 创建用户会话
    Session->>Frontend: 返回会话令牌
    Frontend->>User: 登录成功
```

## 6. 部署架构

### 6.1 容器化部署

```mermaid
graph TB
    subgraph "Docker 容器集群"
        subgraph "Web 应用容器"
            App[CAT 主应用]
            Nginx[Nginx 反向代理]
        end

        subgraph "数据库容器"
            PostgreSQL[(PostgreSQL)]
            Redis[(Redis)]
            Elasticsearch[(Elasticsearch)]
        end

        subgraph "外部服务容器"
            LibreTranslate[LibreTranslate 服务]
            Ollama[Ollama 服务]
        end
    end

    subgraph "存储卷"
        AppData[应用数据]
        DBData[数据库数据]
        Plugins[插件文件]
    end

    Nginx --> App
    App --> PostgreSQL
    App --> Redis
    App --> Elasticsearch
    App --> LibreTranslate
    App --> Ollama

    App --> AppData
    PostgreSQL --> DBData
    App --> Plugins
```

### 6.2 环境配置

| 环境     | 用途         | 配置特点                     |
| -------- | ------------ | ---------------------------- |
| 开发环境 | 本地开发调试 | 热重载、详细日志、测试数据   |
| 测试环境 | 功能测试验证 | E2E 测试、模拟数据、性能监控 |
| 生产环境 | 正式服务部署 | 高可用、负载均衡、安全配置   |

## 7. 性能优化策略

### 7.1 缓存策略

```mermaid
graph LR
    subgraph "多级缓存架构"
        Browser[浏览器缓存]
        CDN[CDN 缓存]
        Redis[Redis 缓存]
        Database[(数据库)]
    end

    Browser --> CDN
    CDN --> Redis
    Redis --> Database
```

### 7.2 数据库优化

| 优化策略 | 实现方式          | 性能提升           |
| -------- | ----------------- | ------------------ |
| 索引优化 | 关键字段建立索引  | 查询速度提升 80%   |
| 连接池   | Prisma 连接池管理 | 并发处理能力提升   |
| 读写分离 | 主从数据库配置    | 读取性能提升 50%   |
| 查询优化 | N+1 查询优化      | 减少数据库请求次数 |

## 8. 安全架构

### 8.1 安全防护体系

```mermaid
graph TB
    subgraph "前端安全"
        CSP[内容安全策略]
        XSS[XSS 防护]
        CSRF[CSRF 防护]
    end

    subgraph "传输安全"
        HTTPS[HTTPS 加密]
        JWT[JWT 令牌]
        RateLimit[请求限流]
    end

    subgraph "后端安全"
        Auth[身份验证]
        AuthZ[权限控制]
        Validation[输入验证]
    end

    subgraph "数据安全"
        Encryption[数据加密]
        Backup[数据备份]
        Audit[审计日志]
    end

    CSP --> HTTPS
    XSS --> JWT
    CSRF --> RateLimit
    HTTPS --> Auth
    JWT --> AuthZ
    RateLimit --> Validation
    Auth --> Encryption
    AuthZ --> Backup
    Validation --> Audit
```

### 8.2 权限控制模型

| 角色       | 权限范围 | 功能权限                     |
| ---------- | -------- | ---------------------------- |
| 超级管理员 | 全系统   | 系统配置、用户管理、插件管理 |
| 项目管理员 | 单个项目 | 项目配置、成员管理、翻译审核 |
| 翻译员     | 分配任务 | 翻译编辑、查看建议、提交翻译 |
| 审核员     | 分配任务 | 翻译审核、质量控制、状态更新 |

## 9. 监控与运维

### 9.1 监控体系

```mermaid
graph TB
    subgraph "应用监控"
        APM[性能监控]
        Logs[日志收集]
        Metrics[指标统计]
    end

    subgraph "基础设施监控"
        Server[服务器监控]
        Database[数据库监控]
        Network[网络监控]
    end

    subgraph "业务监控"
        Users[用户行为]
        Translation[翻译进度]
        Quality[翻译质量]
    end

    subgraph "告警系统"
        Alert[告警规则]
        Notification[通知机制]
        Dashboard[监控面板]
    end

    APM --> Alert
    Logs --> Alert
    Metrics --> Alert
    Server --> Alert
    Database --> Alert
    Network --> Alert
    Users --> Dashboard
    Translation --> Dashboard
    Quality --> Dashboard
    Alert --> Notification
```

### 9.2 运维自动化

| 运维任务 | 自动化方式 | 执行频率     |
| -------- | ---------- | ------------ |
| 代码部署 | CI/CD 管道 | 代码提交触发 |
| 数据备份 | 定时脚本   | 每日执行     |
| 性能监控 | 监控告警   | 实时监控     |
| 日志清理 | 定时任务   | 每周执行     |
| 安全扫描 | 自动化工具 | 每月执行     |

## 10. 扩展性设计

### 10.1 水平扩展策略

```mermaid
graph TB
    subgraph "负载均衡层"
        LB[负载均衡器]
    end

    subgraph "应用服务层"
        App1[应用实例1]
        App2[应用实例2]
        App3[应用实例N]
    end

    subgraph "数据服务层"
        DB1[(主数据库)]
        DB2[(从数据库)]
        Cache[缓存集群]
    end

    LB --> App1
    LB --> App2
    LB --> App3

    App1 --> DB1
    App2 --> DB1
    App3 --> DB1

    App1 --> DB2
    App2 --> DB2
    App3 --> DB2

    App1 --> Cache
    App2 --> Cache
    App3 --> Cache
```

### 10.2 插件扩展机制

| 扩展点   | 接口类型              | 扩展能力         |
| -------- | --------------------- | ---------------- |
| 认证方式 | IAuthProvider         | 新增认证协议支持 |
| 翻译引擎 | ITranslationAdvisor   | 集成新的翻译服务 |
| 文件格式 | IFileHandler          | 支持新的文件类型 |
| 存储方式 | IStorageProvider      | 支持新的存储后端 |
| 通知方式 | INotificationProvider | 新增通知渠道     |
