#!/usr/bin/env bash
# update-tiptap.sh
# 自动将 package.json 中所有 @tiptap/* 依赖更新到最新版本
# 用法: bash scripts/update-tiptap.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$ROOT_DIR"

echo ""
echo "=== TipTap 依赖更新工具 ==="
echo ""

echo "正在检查 @tiptap/* 包的最新版本..."
echo ""

# 使用项目内置的 npm-check-updates，仅针对 @tiptap/* 包
"$ROOT_DIR/node_modules/.bin/ncu" --filter '/@tiptap\//' --upgrade

echo ""
echo "=== LangChain 依赖更新工具 ==="
echo ""

echo "正在检查 @langchain/* 包的最新版本..."
echo ""

# 使用项目内置的 npm-check-updates，仅针对 @langchain/* 包
"$ROOT_DIR/node_modules/.bin/ncu" --filter '/@langchain\//' --upgrade
"$ROOT_DIR/node_modules/.bin/ncu" --filter '/deepagents/' --upgrade

echo ""
echo "正在运行 npm install..."
echo ""

npm install

echo ""
echo "=== 更新完成 ==="
echo ""