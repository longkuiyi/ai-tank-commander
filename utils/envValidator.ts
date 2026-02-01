/**
 * 环境变量验证工具
 * 在应用启动时检查必要的配置
 */

interface EnvValidationResult {
  isValid: boolean;
  warnings: string[];
  errors: string[];
}

export function validateEnvironment(): EnvValidationResult {
  const warnings: string[] = [];
  const errors: string[] = [];

  // 检查 Gemini API Key
  const geminiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!geminiKey || geminiKey === 'PLACEHOLDER_API_KEY') {
    warnings.push('未配置 Gemini API Key (VITE_GEMINI_API_KEY)，AI 功能将使用 Ollama 或规则引擎');
  }

  // 检查 Ollama 配置
  const ollamaBase = import.meta.env.VITE_OLLAMA_API_BASE;
  if (!ollamaBase) {
    warnings.push('未配置 Ollama API 地址，将使用默认值');
  }

  // 检查开发环境
  if (import.meta.env.DEV) {
    console.log('[EnvValidator] 开发环境检测完成');
    console.log(`- Gemini API: ${geminiKey ? '✓ 已配置' : '✗ 未配置'}`);
    console.log(`- Ollama API: ${ollamaBase || '使用默认值'}`);
  }

  return {
    isValid: errors.length === 0,
    warnings,
    errors
  };
}

/**
 * 打印验证结果
 */
export function printValidationResult(result: EnvValidationResult): void {
  if (result.errors.length > 0) {
    console.error('[EnvValidator] 环境配置错误:');
    result.errors.forEach(err => console.error(`  ✗ ${err}`));
  }

  if (result.warnings.length > 0 && import.meta.env.DEV) {
    console.warn('[EnvValidator] 环境配置警告:');
    result.warnings.forEach(warn => console.warn(`  ⚠ ${warn}`));
  }

  if (result.isValid && result.warnings.length === 0) {
    console.log('[EnvValidator] ✓ 环境配置正常');
  }
}
