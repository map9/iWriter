#!/usr/bin/env node

import fs from 'fs';
import path from 'path';

// 检查图标文件并更新package.json的electron-builder配置
function updateIconConfig() {
  const packageJsonPath = path.join(process.cwd(), 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  
  if (!packageJson.build) {
    packageJson.build = {};
  }
  
  // Windows图标配置
  const winIco = 'assets/icons/win/icon.ico';
  const winPng = 'assets/icons/win/icon.png';
  
  if (fs.existsSync(winIco)) {
    packageJson.build.win = { ...packageJson.build.win, icon: winIco };
    console.log(`✅ Windows: 使用ICO格式图标 (${winIco})`);
  } else if (fs.existsSync(winPng)) {
    packageJson.build.win = { ...packageJson.build.win, icon: winPng };
    console.log(`⚠️  Windows: 使用PNG格式图标 (${winPng})`);
  } else {
    console.warn('❌ Windows图标文件未找到');
  }
  
  // macOS图标配置
  const macIcns = 'assets/icons/mac/icon.icns';
  const macPngPattern = 'assets/icons/mac/icon_512x512.png';
  
  if (fs.existsSync(macIcns)) {
    packageJson.build.mac = { ...packageJson.build.mac, icon: macIcns };
    console.log(`✅ macOS: 使用ICNS格式图标 (${macIcns})`);
  } else if (fs.existsSync(macPngPattern)) {
    packageJson.build.mac = { ...packageJson.build.mac, icon: 'assets/icons/mac' };
    console.log(`⚠️  macOS: 使用PNG格式图标目录 (assets/icons/mac/)`);
  } else {
    console.warn('❌ macOS图标文件未找到');
  }
  
  // Linux图标配置
  const linuxDir = 'assets/icons/linux';
  if (fs.existsSync(linuxDir)) {
    packageJson.build.linux = { ...packageJson.build.linux, icon: linuxDir };
    console.log(`✅ Linux: 使用图标目录 (${linuxDir})`);
  } else {
    console.warn('❌ Linux图标目录未找到');
  }
  
  // 写回package.json
  fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
  console.log('\n📦 package.json图标配置已更新');
}

// Create stub package.json files for missing @napi-rs/canvas platform packages.
// electron-builder scans all optional dependencies listed in @napi-rs/canvas/package.json,
// but only the current platform's package is installed by npm. Without stubs, the scandir
// call throws ENOENT and the build fails.
function createNapiCanvasStubs() {
  const canvasPkgPath = path.join(process.cwd(), 'node_modules', '@napi-rs', 'canvas', 'package.json');
  if (!fs.existsSync(canvasPkgPath)) return;

  const canvasPkg = JSON.parse(fs.readFileSync(canvasPkgPath, 'utf8'));
  const optionalDeps = canvasPkg.optionalDependencies || {};
  const nodeModulesPath = path.join(process.cwd(), 'node_modules');

  for (const [name, version] of Object.entries(optionalDeps)) {
    const pkgDir = path.join(nodeModulesPath, name);
    if (!fs.existsSync(pkgDir)) {
      fs.mkdirSync(pkgDir, { recursive: true });
      fs.writeFileSync(
        path.join(pkgDir, 'package.json'),
        JSON.stringify({ name, version }, null, 2) + '\n'
      );
      console.log(`  stub: ${name}`);
    }
  }
  console.log('✅ @napi-rs/canvas platform stubs ready\n');
}

console.log('🔧 准备构建配置...\n');
createNapiCanvasStubs();
updateIconConfig();