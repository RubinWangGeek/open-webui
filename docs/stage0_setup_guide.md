# 阶段 0: 环境准备与 Open WebUI 部署指南

> **目标**: 在本地 Mac 上部署 Open WebUI 并跑通基本对话功能
> **预计时间**: 1-2 小时（如果网络顺畅）
> **前置条件**: macOS 系统，有管理员权限

---

## 任务清单

- [ ] 安装 Docker Desktop
- [ ] 启动 Docker Desktop
- [ ] 安装 Ollama
- [ ] 下载测试模型
- [ ] 部署 Open WebUI
- [ ] 连接 Ollama
- [ ] 测试对话功能
- [ ] 熟悉界面和配置

---

## 步骤 1: 安装 Docker Desktop

### 方式 A: 使用 Homebrew（推荐）

```bash
# 安装 Homebrew Cask 版本的 Docker
brew install --cask docker

# 安装完成后，启动 Docker Desktop
open /Applications/Docker.app
```

### 方式 B: 手动下载安装

1. 访问 Docker 官网：https://www.docker.com/products/docker-desktop/
2. 下载 macOS 版本（根据你的芯片选择 Intel 或 Apple Silicon）
3. 双击 `.dmg` 文件安装
4. 将 Docker 拖到 Applications 文件夹
5. 打开 Docker Desktop

### 验证安装

等待 Docker Desktop 启动完成（状态栏会显示 Docker 图标），然后运行：

```bash
docker --version
# 应该输出类似: Docker version 24.0.x

docker ps
# 应该输出空列表（或已有的容器）
```

### 配置 Docker（可选但推荐）

打开 Docker Desktop 设置：

1. **Resources（资源）**:
   - Memory: 至少 4GB（推荐 8GB）
   - CPUs: 至少 2 核（推荐 4 核）
   - Disk: 至少 20GB

2. **Docker Engine**（保持默认即可）

---

## 步骤 2: 安装 Ollama

### 使用 Homebrew 安装

```bash
brew install ollama
```

### 或手动下载安装

1. 访问 Ollama 官网：https://ollama.ai/download
2. 下载 macOS 版本
3. 安装

### 启动 Ollama 服务

```bash
ollama serve
```

**注意**:
- 这个命令会持续运行，保持终端窗口打开
- 或者你可以让它在后台运行：`nohup ollama serve > /dev/null 2>&1 &`
- Ollama 默认监听 `http://localhost:11434`

### 验证 Ollama 运行

打开**新的终端窗口**，运行：

```bash
# 检查 Ollama 是否在运行
curl http://localhost:11434
# 应该返回: Ollama is running

# 查看已安装的模型
ollama list
# 初次安装应该是空的
```

---

## 步骤 3: 下载测试模型

选择一个轻量级的中文模型：

### 推荐选项 1: Qwen2.5:7B（推荐，平衡性能与质量）

```bash
ollama pull qwen2.5:7b
```

- 模型大小：约 4.7GB
- 下载时间：取决于网速（5-30 分钟）
- 内存需求：约 8GB

### 推荐选项 2: Qwen2.5:3B（更轻量，适合内存较小的机器）

```bash
ollama pull qwen2.5:3b
```

- 模型大小：约 2GB
- 下载时间：更快
- 内存需求：约 4GB

### 验证模型下载

```bash
ollama list
# 应该看到刚下载的模型

# 测试模型
ollama run qwen2.5:7b "你好，请介绍一下你自己"
# 应该得到中文回复
```

**提示**: 如果测试成功，按 `Ctrl+D` 或输入 `/bye` 退出对话

---

## 步骤 4: 部署 Open WebUI

### 方式 A: 使用 Docker 运行（连接本地 Ollama）

```bash
docker run -d \
  -p 3000:8080 \
  --add-host=host.docker.internal:host-gateway \
  -v open-webui:/app/backend/data \
  --name open-webui \
  --restart always \
  ghcr.io/open-webui/open-webui:main
```

**参数说明**:
- `-d`: 后台运行
- `-p 3000:8080`: 映射端口（访问 http://localhost:3000）
- `--add-host=host.docker.internal:host-gateway`: 让容器能访问宿主机的 Ollama
- `-v open-webui:/app/backend/data`: 持久化数据（用户、聊天记录等）
- `--name open-webui`: 容器名称
- `--restart always`: 开机自启

### 等待启动

```bash
# 查看启动日志
docker logs -f open-webui

# 看到类似输出表示启动成功：
# INFO:     Uvicorn running on http://0.0.0.0:8080 (Press CTRL+C to quit)
```

按 `Ctrl+C` 停止查看日志（容器仍在后台运行）

### 验证部署

```bash
# 检查容器状态
docker ps | grep open-webui
# 应该看到 STATUS 为 Up

# 访问健康检查
curl http://localhost:3000/health
# 或直接在浏览器打开 http://localhost:3000
```

---

## 步骤 5: 初次使用 Open WebUI

### 5.1 打开浏览器

访问：http://localhost:3000

### 5.2 注册账号

首次访问会要求注册：
- **邮箱**: 填写任意邮箱（本地部署不验证）
- **用户名**: 你的名字
- **密码**: 设置密码

**注意**: 第一个注册的用户会自动成为管理员

### 5.3 连接 Ollama

注册后自动跳转到聊天界面：

1. 点击左上角的模型选择器（默认显示 "No models available"）
2. 如果看不到模型，点击右上角的 **设置图标**
3. 进入 **Settings → Connections**
4. 找到 **Ollama API**，确认 URL 为：
   ```
   http://host.docker.internal:11434
   ```
5. 点击 **Test Connection**（或刷新模型列表）
6. 应该能看到刚才下载的模型（如 `qwen2.5:7b`）

### 5.4 测试对话

1. 在模型选择器中选择 `qwen2.5:7b`
2. 在聊天框输入："你好，请用第一性原理解释一下如何学习新技能"
3. 等待回复（首次响应可能较慢，模型需要加载到内存）

**如果成功得到回复，恭喜！阶段 0 完成 ✅**

---

## 步骤 6: 熟悉 Open WebUI 界面

### 主要功能区

1. **左侧边栏**:
   - 聊天历史
   - 新建对话
   - 工作区（Workspace）

2. **顶部栏**:
   - 模型选择器
   - 设置按钮

3. **中间主区域**:
   - 聊天界面
   - 消息列表

4. **底部输入框**:
   - 文本输入
   - 文件上传（可上传文档）
   - 发送按钮

### 重要设置项

进入 **Settings**（设置）：

1. **General（通用）**:
   - 语言设置（中文/英文）
   - 主题（亮色/暗色）

2. **Models（模型）**:
   - 查看可用模型
   - 设置默认模型

3. **Connections（连接）**:
   - Ollama API URL
   - OpenAI API（如果使用远程模型）

4. **Documents（文档）**:
   - 文档上传与管理（后续会用到）

5. **Admin Settings（管理员设置）**:
   - 用户管理
   - 模型管理
   - 系统配置

---

## 步骤 7: 测试文档上传（可选）

Open WebUI 自带基础的 RAG 功能，可以测试一下：

1. 点击输入框左边的 **📎（回形针）** 图标
2. 上传一个 PDF 或 TXT 文件
3. 文件上传后，输入问题："总结一下这个文档的主要内容"
4. 模型会基于文档回答

**注意**: 这是 Open WebUI 自带的简单 RAG，我们后续会开发更强大的知识库系统

---

## 常见问题排查

### 问题 1: Docker Desktop 启动失败

**症状**: Docker 图标一直转圈，或提示错误

**解决**:
```bash
# 重启 Docker Desktop
killall Docker && open /Applications/Docker.app

# 或者重置 Docker
# Docker Desktop → Troubleshoot → Reset to factory defaults
```

### 问题 2: Open WebUI 无法连接 Ollama

**症状**: 模型列表为空，或提示 "Connection failed"

**检查清单**:
```bash
# 1. 确认 Ollama 在运行
curl http://localhost:11434
# 应该返回: Ollama is running

# 2. 确认模型已下载
ollama list

# 3. 检查 Open WebUI 容器网络
docker exec open-webui curl http://host.docker.internal:11434
# 应该返回: Ollama is running

# 4. 重启 Open WebUI 容器
docker restart open-webui
```

### 问题 3: 模型下载速度慢

**症状**: `ollama pull` 下载很慢或卡住

**解决**:
- 使用国内镜像（如果有）
- 或者等待，首次下载确实需要时间
- 可以先下载更小的模型（qwen2.5:3b）

### 问题 4: 模型回复很慢

**症状**: 发送消息后等待很久

**原因**:
- 首次加载模型需要时间（30秒-2分钟）
- 机器性能不足（内存 < 8GB）
- 模型太大（70B 模型在 Mac 上会很慢）

**解决**:
- 等待首次加载完成
- 使用更小的模型（3B/7B）
- 后续考虑用远程 API（OpenAI/Claude）

### 问题 5: Open WebUI 端口被占用

**症状**: `docker run` 报错 "port is already allocated"

**解决**:
```bash
# 更换端口（如改为 3001）
docker run -d \
  -p 3001:8080 \
  --add-host=host.docker.internal:host-gateway \
  -v open-webui:/app/backend/data \
  --name open-webui \
  --restart always \
  ghcr.io/open-webui/open-webui:main

# 然后访问 http://localhost:3001
```

---

## 验收标准（完成阶段 0）

当你能做到以下所有事情时，阶段 0 就完成了：

- ✅ Docker Desktop 正常运行
- ✅ Ollama 服务正常运行
- ✅ 至少下载了一个模型（qwen2.5:7b 或 qwen2.5:3b）
- ✅ Open WebUI 容器正常运行（`docker ps` 能看到）
- ✅ 能访问 http://localhost:3000 并注册账号
- ✅ 能在 Open WebUI 中选择模型
- ✅ 能发送消息并得到回复
- ✅ 熟悉基本界面和设置

---

## 下一步

完成阶段 0 后，你应该：

1. **保持服务运行**:
   - Ollama 服务保持运行（或设置为开机自启）
   - Open WebUI 容器会自动重启（`--restart always`）

2. **测试更多功能**:
   - 尝试不同的提示词
   - 测试文档上传
   - 探索设置选项

3. **准备进入阶段 1**:
   - 开始开发 `agent-core` 项目
   - 实现 Content Processing Pipeline

---

## 管理命令速查

### Docker 容器管理

```bash
# 查看运行中的容器
docker ps

# 查看 Open WebUI 日志
docker logs -f open-webui

# 停止 Open WebUI
docker stop open-webui

# 启动 Open WebUI
docker start open-webui

# 重启 Open WebUI
docker restart open-webui

# 删除容器（数据不会丢失，存在 volume 中）
docker rm -f open-webui

# 重新部署（会保留数据）
docker run -d -p 3000:8080 \
  --add-host=host.docker.internal:host-gateway \
  -v open-webui:/app/backend/data \
  --name open-webui \
  --restart always \
  ghcr.io/open-webui/open-webui:main
```

### Ollama 管理

```bash
# 启动服务
ollama serve

# 后台运行（macOS/Linux）
nohup ollama serve > /dev/null 2>&1 &

# 查看已安装模型
ollama list

# 下载新模型
ollama pull <model-name>

# 删除模型
ollama rm <model-name>

# 测试模型
ollama run <model-name> "测试问题"
```

### 数据备份（重要！）

```bash
# 备份 Open WebUI 数据
docker run --rm -v open-webui:/data -v $(pwd):/backup \
  alpine tar czf /backup/open-webui-backup.tar.gz -C /data .

# 恢复数据
docker run --rm -v open-webui:/data -v $(pwd):/backup \
  alpine tar xzf /backup/open-webui-backup.tar.gz -C /data
```

---

## 参考资源

- **Open WebUI 官方文档**: https://docs.openwebui.com/
- **Ollama 官网**: https://ollama.ai/
- **Docker 文档**: https://docs.docker.com/
- **Qwen 模型**: https://github.com/QwenLM/Qwen

---

> **完成时间记录**: _________
> **遇到的问题**: _________
> **笔记**: _________
