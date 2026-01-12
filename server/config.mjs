import 'dotenv/config';

/**
 * 验证环境变量配置
 */
function validateConfig() {
  const errors = [];
  
  // 检查 AI_PROVIDER
  const provider = process.env.AI_PROVIDER?.toLowerCase();
  if (!provider) {
    errors.push('AI_PROVIDER is required. Set it to "deepseek" or "qwen"');
  } else if (!['deepseek', 'qwen'].includes(provider)) {
    errors.push(`Invalid AI_PROVIDER: ${provider}. Must be "deepseek" or "qwen"`);
  }
  
  // 根据 Provider 检查对应的 API Key
  if (provider === 'deepseek' && !process.env.DEEPSEEK_API_KEY) {
    errors.push('DEEPSEEK_API_KEY is required when AI_PROVIDER=deepseek');
  }
  
  if (provider === 'qwen' && !process.env.QWEN_API_KEY) {
    errors.push('QWEN_API_KEY is required when AI_PROVIDER=qwen');
  }
  
  // 检查端口配置
  const port = process.env.PORT;
  if (port && (isNaN(port) || port < 1 || port > 65535)) {
    errors.push(`Invalid PORT: ${port}. Must be a number between 1 and 65535`);
  }
  
  return errors;
}

/**
 * 获取配置
 */
export function getConfig() {
  const errors = validateConfig();
  
  if (errors.length > 0) {
    console.error('❌ Configuration errors:');
    errors.forEach(error => console.error(`   - ${error}`));
    console.error('\n💡 Please check your .env file and ensure all required variables are set.');
    console.error('   Example .env file:');
    console.error('   AI_PROVIDER=deepseek');
    console.error('   DEEPSEEK_API_KEY=your_api_key_here');
    console.error('   PORT=3000\n');
    process.exit(1);
  }
  
  const provider = process.env.AI_PROVIDER.toLowerCase();
  const apiKey = provider === 'deepseek' 
    ? process.env.DEEPSEEK_API_KEY 
    : process.env.QWEN_API_KEY;
  
  return {
    provider,
    apiKey,
    port: parseInt(process.env.PORT || '3000', 10),
  };
}
