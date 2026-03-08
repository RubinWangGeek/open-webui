#!/usr/bin/env bash
# Open WebUI 快速重建脚本
# 用法: ./scripts/rebuild.sh [--full]
#
# 默认模式：利用 Docker 层缓存，只重建变更的层（2-5 分钟）
# --full 模式：清除缓存完整重建（仅在依赖大版本升级时使用，30+ 分钟）

set -euo pipefail
cd "$(dirname "$0")/.."

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

FULL_REBUILD=false
if [[ "${1:-}" == "--full" ]]; then
    FULL_REBUILD=true
fi

echo -e "${GREEN}=== Open WebUI 重建 ===${NC}"
echo ""

# 1. 检查 package-lock.json 是否有内部 registry 引用（红线检查）
if grep -q 'bnpm.byted.org' package-lock.json 2>/dev/null; then
    echo -e "${RED}[错误] package-lock.json 包含内部 registry 引用，自动修复...${NC}"
    sed -i '' 's|https://bnpm.byted.org|https://registry.npmjs.org|g' package-lock.json
    echo -e "${GREEN}[已修复] 替换为 registry.npmjs.org${NC}"
fi

# 2. 预估构建时间
if [[ "$FULL_REBUILD" == true ]]; then
    echo -e "${YELLOW}[模式] 完整重建（--full），预计 20-30 分钟${NC}"
    BUILD_ARGS="--no-cache"
else
    # 检查 package-lock.json 是否有变更
    if git diff --name-only HEAD 2>/dev/null | grep -q 'package-lock.json'; then
        echo -e "${YELLOW}[模式] package-lock.json 有变更，npm ci 需要重跑，预计 5-10 分钟${NC}"
    else
        echo -e "${GREEN}[模式] 增量构建，预计 2-5 分钟${NC}"
    fi
    BUILD_ARGS=""
fi

# 3. 构建
echo ""
echo -e "${GREEN}[1/3] 构建镜像...${NC}"
START_TIME=$(date +%s)

docker compose build $BUILD_ARGS open-webui

BUILD_TIME=$(( $(date +%s) - START_TIME ))
echo -e "${GREEN}[构建完成] 耗时 ${BUILD_TIME} 秒${NC}"

# 4. 重启容器
echo ""
echo -e "${GREEN}[2/3] 重启容器...${NC}"
docker compose up -d open-webui

# 5. 等待健康检查
echo ""
echo -e "${GREEN}[3/3] 等待服务就绪...${NC}"
for i in $(seq 1 30); do
    if curl -sf http://localhost:3000/health > /dev/null 2>&1; then
        echo -e "${GREEN}[完成] 服务已就绪！总耗时 $(( $(date +%s) - START_TIME )) 秒${NC}"
        echo ""
        echo "  访问: http://localhost:3000"
        echo "  Admin → Knowledge → Settings 配置模型"
        echo ""
        exit 0
    fi
    sleep 2
done

echo -e "${YELLOW}[警告] 健康检查超时，请手动检查: docker logs open-webui${NC}"
