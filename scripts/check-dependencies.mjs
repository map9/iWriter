#!/usr/bin/env node

import { execSync } from 'child_process';
import { platform } from 'os';

// 检查命令是否可用
function checkCommand(command, testArg = '--version') {
  try {
    if (command === 'iconutil') {
      // iconutil 没有 --version，使用 --help 或者直接检查 which
      execSync(`which ${command}`, { stdio: 'ignore' });
      return true;
    } else {
      execSync(`${command} ${testArg}`, { stdio: 'ignore' });
      return true;
    }
  } catch {
    return false;
  }
}

console.log('🔍 检查图标生成依赖...\n');

const dependencies = [
  {
    name: 'ImageMagick',
    commands: ['magick', 'convert'],
    required: false,
    purpose: '生成Windows ICO图标',
    install: {
      darwin: 'brew install imagemagick',
      linux: 'sudo apt install imagemagick',
      win32: '从 https://imagemagick.org/script/download.php 下载安装'
    }
  },
  {
    name: 'iconutil',
    commands: ['iconutil'],
    required: false, // 在所有平台都设为可选
    purpose: '生成macOS ICNS图标',
    install: {
      darwin: '系统自带，如未找到请检查Xcode Command Line Tools',
      linux: '不适用（仅macOS需要）',
      win32: '不适用（仅macOS需要）'
    }
  },
  {
    name: 'Sharp',
    commands: [],
    required: true,
    purpose: 'SVG转PNG图像处理',
    install: {
      all: 'npm install sharp'
    }
  }
];

let allGood = true;

for (const dep of dependencies) {
  const name = dep.name.padEnd(12);
  let available = false;
  
  if (dep.commands.length > 0) {
    available = dep.commands.some(cmd => checkCommand(cmd));
  } else if (dep.name === 'Sharp') {
    try {
      await import('sharp');
      available = true;
    } catch {
      available = false;
    }
  }
  
  if (available) {
    console.log(`✅ ${name} - ${dep.purpose}`);
  } else {
    const status = dep.required ? '❌' : '⚠️ ';
    console.log(`${status} ${name} - ${dep.purpose}`);
    
    if (dep.required) {
      allGood = false;
    }
    
    // 显示安装指令
    const currentPlatform = platform();
    const installCmd = dep.install[currentPlatform] || dep.install.all;
    if (installCmd) {
      console.log(`   安装: ${installCmd}`);
    }
  }
}

console.log('\n📋 依赖检查完成');

if (!allGood) {
  console.log('❌ 部分必需依赖缺失，请先安装');
  process.exit(1);
} else {
  console.log('✅ 所有必需依赖都已满足');
  
  const hasOptional = dependencies.some(dep => 
    !dep.required && 
    dep.commands.length > 0 && 
    !dep.commands.some(cmd => checkCommand(cmd))
  );
  
  if (hasOptional) {
    console.log('💡 可选依赖缺失，将使用降级方案生成图标');
  }
}