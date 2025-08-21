import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { platform } from 'os';

// 源文件与输出路径配置
const sourceSvg = path.join(process.cwd(), 'public/iwriter.svg');
const outputDir = path.join(process.cwd(), 'assets/icons');
const tempDir = path.join(process.cwd(), 'assets/temp');

// 确保目录存在
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// 清理临时文件
function cleanTemp() {
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

// 检查命令是否可用
function checkCommand(command) {
  try {
    if (command === 'iconutil') {
      // iconutil 没有 --version，使用 which 检查
      execSync(`which ${command}`, { stdio: 'ignore' });
      return true;
    } else {
      execSync(`${command} --version`, { stdio: 'ignore' });
      return true;
    }
  } catch {
    return false;
  }
}

// 检查依赖
function checkDependencies() {
  const results = {
    imagemagick: checkCommand('magick') || checkCommand('convert'),
    iconutil: platform() === 'darwin' && checkCommand('iconutil')
  };
  
  console.log('依赖检查结果:');
  console.log(`  ImageMagick: ${results.imagemagick ? '✅ 已安装' : '❌ 未安装'}`);
  if (platform() === 'darwin') {
    console.log(`  iconutil: ${results.iconutil ? '✅ 已安装' : '❌ 未安装'}`);
  }
  
  return results;
}

// 检查是否需要重新生成
function shouldRegenerate() {
  try {
    const sourceStats = fs.statSync(sourceSvg);
    const outputStats = fs.statSync(outputDir);
    return sourceStats.mtime > outputStats.mtime;
  } catch {
    return true;
  }
}

// 从SVG生成指定尺寸的PNG
async function generatePngFromSvg(size, outputPath) {
  // 明确指定尺寸为正整数，避免NaN
  const intSize = Math.floor(Number(size));
  if (isNaN(intSize) || intSize <= 0) {
    throw new Error(`无效的尺寸: ${size}，必须是正整数`);
  }

  await sharp(sourceSvg, { density: 300 })
    .resize(intSize, intSize, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .png({ force: true })
    .toFile(outputPath);
  
  return outputPath;
}

// 生成Windows ICO图标
async function generateWindowsIcons(hasImageMagick) {
  const winDir = path.join(outputDir, 'win');
  ensureDir(winDir);
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const tempFiles = [];

  // 生成所有尺寸的PNG
  for (const size of sizes) {
    const tempFile = path.join(tempDir, `win-${size}.png`);
    await generatePngFromSvg(size, tempFile);
    tempFiles.push(tempFile);
  }

  const icoPath = path.join(winDir, 'icon.ico');
  
  if (hasImageMagick) {
    // 使用ImageMagick合并为ICO文件
    const magickCommand = checkCommand('magick') ? 'magick' : 'convert';
    try {
      execSync(`${magickCommand} ${tempFiles.join(' ')} ${icoPath}`);
      console.log(`✅ Windows ICO图标生成完成: ${icoPath}`);
    } catch (error) {
      console.warn(`⚠️  ImageMagick生成ICO失败，尝试降级方案`);
      await generateWindowsIconsFallback(winDir, tempFiles);
    }
  } else {
    console.warn(`⚠️  ImageMagick未安装，使用降级方案生成Windows图标`);
    await generateWindowsIconsFallback(winDir, tempFiles);
  }
}

// Windows图标降级方案：复制最大的PNG作为图标
async function generateWindowsIconsFallback(winDir, tempFiles) {
  const largestFile = tempFiles[tempFiles.length - 1]; // 256x256
  const iconPath = path.join(winDir, 'icon.png');
  fs.copyFileSync(largestFile, iconPath);
  
  console.log(`📁 Windows PNG图标生成完成: ${iconPath}`);
  console.log(`💡 提示: 安装ImageMagick可生成更好的ICO格式`);
}

// 生成macOS ICNS图标
async function generateMacIcons(hasIconutil) {
  const macDir = path.join(outputDir, 'mac');
  ensureDir(macDir);
  const sizes = [16, 32, 64, 128, 256, 512, 1024];
  
  if (hasIconutil) {
    const iconsetDir = path.join(tempDir, 'icon.iconset');
    ensureDir(iconsetDir);

    // 生成标准尺寸和@2x尺寸
    for (const size of sizes) {
      // 标准尺寸
      const stdPath = path.join(iconsetDir, `icon_${size}x${size}.png`);
      await generatePngFromSvg(size, stdPath);
      
      // @2x高清尺寸（仅对小尺寸生成）
      if (size <= 256) {
        const retinaPath = path.join(iconsetDir, `icon_${size}x${size}@2x.png`);
        await generatePngFromSvg(size * 2, retinaPath);
      }
    }

    try {
      // 生成ICNS文件
      const icnsPath = path.join(macDir, 'icon.icns');
      execSync(`iconutil -c icns ${iconsetDir} -o ${icnsPath}`);
      console.log(`✅ macOS ICNS图标生成完成: ${icnsPath}`);
    } catch (error) {
      console.warn(`⚠️  iconutil生成ICNS失败，尝试降级方案`);
      await generateMacIconsFallback(macDir, sizes);
    }
  } else {
    console.warn(`⚠️  iconutil不可用，使用降级方案生成macOS图标`);
    await generateMacIconsFallback(macDir, sizes);
  }
}

// macOS图标降级方案：生成PNG文件
async function generateMacIconsFallback(macDir, sizes) {
  for (const size of sizes) {
    const iconPath = path.join(macDir, `icon_${size}x${size}.png`);
    await generatePngFromSvg(size, iconPath);
  }
  
  console.log(`📁 macOS PNG图标生成完成: ${macDir}/icon_*x*.png`);
  if (platform() === 'darwin') {
    console.log(`💡 提示: 检查iconutil是否正确安装`);
  } else {
    console.log(`💡 提示: 在macOS上运行可生成ICNS格式`);
  }
}

// 生成Linux图标
async function generateLinuxIcons() {
  const linuxDir = path.join(outputDir, 'linux');
  ensureDir(linuxDir);
  const sizes = [16, 24, 32, 48, 64, 128, 256, 512];

  for (const size of sizes) {
    const sizeDir = path.join(linuxDir, `${size}x${size}`);
    ensureDir(sizeDir);
    const iconPath = path.join(sizeDir, 'icon.png');
    await generatePngFromSvg(size, iconPath);
  }
  console.log(`Linux图标生成完成: ${linuxDir}`);
}

async function generateAppIcons() {
  try {
    console.log('🎨 开始生成应用图标...\n');
    
    // 检查依赖
    const dependencies = checkDependencies();
    console.log('');
    
    if (!shouldRegenerate()) {
      console.log('✅ SVG源文件未变更，使用缓存的图标');
      return;
    }

    // 初始化工作目录
    cleanTemp();
    ensureDir(tempDir);
    ensureDir(outputDir);

    console.log('📦 开始分平台生成图标...\n');
    
    // 分平台生成
    await generateWindowsIcons(dependencies.imagemagick);
    console.log('');
    
    await generateMacIcons(dependencies.iconutil);
    console.log('');
    
    await generateLinuxIcons();
    console.log('');

    // 清理临时文件
    cleanTemp();
    
    console.log('🎉 所有图标生成完成！');
    
    // 显示安装建议
    if (!dependencies.imagemagick) {
      console.log('\n💡 安装建议:');
      console.log('  macOS: brew install imagemagick');
      console.log('  Ubuntu/Debian: sudo apt install imagemagick');
      console.log('  Windows: 从 https://imagemagick.org/script/download.php 下载安装');
    }
    
  } catch (err) {
    console.error('❌ 图标生成失败:', err.message);
    cleanTemp(); // 出错时也清理临时文件
    process.exit(1);
  }
}

generateAppIcons();
