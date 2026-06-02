#!/usr/bin/env bash
# update-tiptap.sh
# 自动将 package.json 中所有 @tiptap/* 依赖更新到最新版本
# 用法: bash scripts/update-tiptap.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$ROOT_DIR"

if [[ -x "$ROOT_DIR/node_modules/.bin/ncu" ]]; then
  NCU=("$ROOT_DIR/node_modules/.bin/ncu")
else
  NCU=(npx --yes npm-check-updates)
fi

TMP_DIR="$(mktemp -d)"
cp package.json "$TMP_DIR/package.json"
cp package-lock.json "$TMP_DIR/package-lock.json"

restore_manifests() {
  echo ""
  echo "更新失败，正在恢复 package.json 和 package-lock.json..."
  cp "$TMP_DIR/package.json" package.json
  cp "$TMP_DIR/package-lock.json" package-lock.json
}

cleanup() {
  rm -rf "$TMP_DIR"
}

trap 'restore_manifests; cleanup' ERR
trap cleanup EXIT

echo ""
echo "=== TipTap 依赖更新工具 ==="
echo ""

echo "正在检查 @tiptap/* 包的最新版本..."
echo ""

# 使用项目内置的 npm-check-updates，仅针对 @tiptap/* 包
"${NCU[@]}" --filter '/@tiptap\//' --upgrade

echo ""
echo "=== LangChain 依赖更新工具 ==="
echo ""

echo "正在检查 @langchain/* 包的最新版本..."
echo ""

# 使用项目内置的 npm-check-updates，仅针对 @langchain/* 包
"${NCU[@]}" --filter '/@langchain\//' --upgrade
"${NCU[@]}" --filter '/deepagents/' --upgrade

echo ""
echo "正在运行 npm install..."
echo ""

echo "正在清理旧的 lockfile 和 node_modules，避免 npm 使用旧 peer dependency 树..."
rm -rf package-lock.json node_modules

npm install

trap - ERR

echo ""
echo "=== 更新完成 ==="
echo ""
