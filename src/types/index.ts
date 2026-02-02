/**
 * AI Code Assistant - 类型定义主入口
 * 
 * 职责分工：
 * - analysis.ts      → 代码分析类型（AST、符号、语法上下文）
 * - config.ts        → 配置类型（FIM、NES、Symptom）
 * - prediction.ts    → 预测类型（Prediction、ChangeType）
 * - edit.ts          → 编辑记录类型（EditRecord）
 * - api.ts           → API 类型（NESPayload、NESResponse）
 */

export * from './analysis';
export * from './config';
export * from './prediction';
export * from './edit';
export * from './api';
