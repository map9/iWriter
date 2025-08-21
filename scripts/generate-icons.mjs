import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

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

// 生成Windows ICO图标（依赖ImageMagick）
async function generateWindowsIcons() {
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

  // 合并为ICO文件
  const icoPath = path.join(winDir, 'icon.ico');
  execSync(`magick ${tempFiles.join(' ')} ${icoPath}`);
  console.log(`Windows图标生成完成: ${icoPath}`);
}

// 生成macOS ICNS图标（依赖macOS的iconutil）
async function generateMacIcons() {
  const macDir = path.join(outputDir, 'mac');
  ensureDir(macDir);
  const sizes = [16, 32, 64, 128, 256, 512, 1024];
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

  // 生成ICNS文件
  const icnsPath = path.join(macDir, 'icon.icns');
  execSync(`iconutil -c icns ${iconsetDir} -o ${icnsPath}`);
  console.log(`macOS图标生成完成: ${icnsPath}`);
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
    if (!shouldRegenerate()) {
      console.log('SVG源文件未变更，使用缓存的图标');
      return;
    }

    // 初始化工作目录
    cleanTemp();
    ensureDir(tempDir);
    ensureDir(outputDir);

    // 分平台生成
    await generateWindowsIcons();
    await generateMacIcons();
    await generateLinuxIcons();

    // 清理临时文件
    cleanTemp();
  } catch (err) {
    console.error('图标生成失败:', err);
    cleanTemp(); // 出错时也清理临时文件
    process.exit(1);
  }
}

generateAppIcons();
