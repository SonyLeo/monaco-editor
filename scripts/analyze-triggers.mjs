/**
 * 触发数据分析脚本
 * 用于分析从 Analytics 系统导出的数据
 */

import fs from 'fs';
import path from 'path';

// 检查命令行参数
const args = process.argv.slice(2);
if (args.length === 0) {
  console.log('用法: node scripts/analyze-triggers.mjs <analytics.json>');
  console.log('');
  console.log('示例:');
  console.log('  node scripts/analyze-triggers.mjs analytics-1234567890.json');
  console.log('');
  console.log('提示: 在浏览器控制台运行 window.exportAnalytics() 导出数据');
  process.exit(1);
}

const filePath = args[0];

// 读取数据文件
if (!fs.existsSync(filePath)) {
  console.error(`错误: 文件不存在: ${filePath}`);
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

console.log('='.repeat(60));
console.log('触发数据分析报告');
console.log('='.repeat(60));
console.log('');

// 基本统计
console.log('📊 数据概览');
console.log('-'.repeat(60));
console.log(`总事件数: ${data.length}`);

const fimEvents = data.filter((e) => e.engine === 'fim');
const nesEvents = data.filter((e) => e.engine === 'nes');

console.log(`FIM 事件: ${fimEvents.length}`);
console.log(`NES 事件: ${nesEvents.length}`);
console.log('');

// FIM 分析
console.log('🎯 FIM 引擎分析');
console.log('-'.repeat(60));

const fimTriggers = fimEvents.filter((e) => e.action === 'trigger');
const fimAccepts = fimEvents.filter((e) => e.action === 'accept');
const fimRejects = fimEvents.filter((e) => e.action === 'reject');
const fimSkips = fimEvents.filter((e) => e.action === 'skip');

console.log(`触发次数: ${fimTriggers.length}`);
console.log(`接受次数: ${fimAccepts.length}`);
console.log(`拒绝次数: ${fimRejects.length}`);
console.log(`跳过次数: ${fimSkips.length}`);

const fimAcceptRate = fimTriggers.length > 0 
  ? ((fimAccepts.length / fimTriggers.length) * 100).toFixed(2) 
  : '0.00';
console.log(`接受率: ${fimAcceptRate}%`);
console.log('');

// FIM 触发模式分析
console.log('📈 FIM 触发模式');
console.log('-'.repeat(60));

const fimPatterns = {
  atLineEnd: 0,
  notAtLineEnd: 0,
  inComment: 0,
  inString: 0,
  afterPunctuation: 0,
  shortLine: 0,
  longLine: 0,
};

fimTriggers.forEach((event) => {
  const ctx = event.context || {};
  if (ctx.isAtLineEnd) fimPatterns.atLineEnd++;
  else fimPatterns.notAtLineEnd++;
  
  if (ctx.isInComment) fimPatterns.inComment++;
  if (ctx.isInString) fimPatterns.inString++;
  if (ctx.afterPunctuation) fimPatterns.afterPunctuation++;
  
  if (ctx.lineLength < 10) fimPatterns.shortLine++;
  if (ctx.lineLength > 50) fimPatterns.longLine++;
});

console.log(`行尾触发: ${fimPatterns.atLineEnd} (${((fimPatterns.atLineEnd / fimTriggers.length) * 100).toFixed(1)}%)`);
console.log(`行中触发: ${fimPatterns.notAtLineEnd} (${((fimPatterns.notAtLineEnd / fimTriggers.length) * 100).toFixed(1)}%)`);
console.log(`注释中触发: ${fimPatterns.inComment} (${((fimPatterns.inComment / fimTriggers.length) * 100).toFixed(1)}%)`);
console.log(`字符串中触发: ${fimPatterns.inString} (${((fimPatterns.inString / fimTriggers.length) * 100).toFixed(1)}%)`);
console.log(`标点后触发: ${fimPatterns.afterPunctuation} (${((fimPatterns.afterPunctuation / fimTriggers.length) * 100).toFixed(1)}%)`);
console.log(`短行触发 (<10字符): ${fimPatterns.shortLine} (${((fimPatterns.shortLine / fimTriggers.length) * 100).toFixed(1)}%)`);
console.log(`长行触发 (>50字符): ${fimPatterns.longLine} (${((fimPatterns.longLine / fimTriggers.length) * 100).toFixed(1)}%)`);
console.log('');

// NES 分析
console.log('🚀 NES 引擎分析');
console.log('-'.repeat(60));

const nesTriggers = nesEvents.filter((e) => e.action === 'trigger');
const nesAccepts = nesEvents.filter((e) => e.action === 'accept');
const nesRejects = nesEvents.filter((e) => e.action === 'reject');
const nesSkips = nesEvents.filter((e) => e.action === 'skip');

console.log(`触发次数: ${nesTriggers.length}`);
console.log(`接受次数: ${nesAccepts.length}`);
console.log(`拒绝次数: ${nesRejects.length}`);
console.log(`跳过次数: ${nesSkips.length}`);

const nesAcceptRate = nesTriggers.length > 0 
  ? ((nesAccepts.length / nesTriggers.length) * 100).toFixed(2) 
  : '0.00';
console.log(`接受率: ${nesAcceptRate}%`);
console.log('');

// 置信度分析（如果有）
const nesWithConfidence = nesAccepts.filter((e) => e.context?.confidence !== undefined);
if (nesWithConfidence.length > 0) {
  const avgConfidence = nesWithConfidence.reduce((sum, e) => sum + (e.context.confidence || 0), 0) / nesWithConfidence.length;
  console.log(`平均置信度: ${(avgConfidence * 100).toFixed(1)}%`);
  console.log('');
}

// 建议
console.log('💡 优化建议');
console.log('-'.repeat(60));

const suggestions = [];

// FIM 建议
if (fimPatterns.inComment > fimTriggers.length * 0.1) {
  suggestions.push(`⚠️  FIM 在注释中触发过多 (${((fimPatterns.inComment / fimTriggers.length) * 100).toFixed(1)}%)，建议禁用注释中的触发`);
}

if (fimPatterns.inString > fimTriggers.length * 0.05) {
  suggestions.push(`⚠️  FIM 在字符串中触发过多 (${((fimPatterns.inString / fimTriggers.length) * 100).toFixed(1)}%)，建议禁用字符串中的触发`);
}

if (fimPatterns.shortLine > fimTriggers.length * 0.15) {
  suggestions.push(`⚠️  FIM 在短行触发过多 (${((fimPatterns.shortLine / fimTriggers.length) * 100).toFixed(1)}%)，建议提高最小行长度阈值`);
}

const fimAcceptRateNum = parseFloat(fimAcceptRate);
if (fimAcceptRateNum < 30) {
  suggestions.push(`⚠️  FIM 接受率过低 (${fimAcceptRate}%)，建议优化触发条件`);
} else if (fimAcceptRateNum > 60) {
  suggestions.push(`✅ FIM 接受率良好 (${fimAcceptRate}%)`);
}

const nesAcceptRateNum = parseFloat(nesAcceptRate);
if (nesAcceptRateNum < 40) {
  suggestions.push(`⚠️  NES 接受率过低 (${nesAcceptRate}%)，建议优化预测质量`);
} else if (nesAcceptRateNum > 60) {
  suggestions.push(`✅ NES 接受率良好 (${nesAcceptRate}%)`);
}

if (suggestions.length === 0) {
  console.log('✅ 暂无明显问题');
} else {
  suggestions.forEach((s) => console.log(s));
}

console.log('');
console.log('='.repeat(60));
console.log('分析完成');
console.log('='.repeat(60));
