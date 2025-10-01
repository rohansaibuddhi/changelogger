// Simple integration test for local development
const { runLocal } = require('./dist/index.js');

async function test() {
  console.log('🧪 Testing Changelogger locally...');

  try {
    await runLocal({
      // Note: In real usage, these would be provided as secrets
      // For testing, set them as environment variables:
      // export OPENAI_API_KEY="your-key"
      // export INKEEP_API_KEY="your-key"
      // export GITHUB_TOKEN="your-token"
      merge_strategy: 'auto',
      since: '2024-01-01' // Test date
    });

    console.log('✅ Test completed successfully!');
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.log('💡 Make sure you have set the required environment variables:');
    console.log('   - OPENAI_API_KEY');
    console.log('   - INKEEP_API_KEY');
    console.log('   - GITHUB_TOKEN');
    console.log('   - GITHUB_REPOSITORY (format: owner/repo)');
  }
}

if (require.main === module) {
  test();
}