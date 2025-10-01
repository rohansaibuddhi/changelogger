// Test our changelogger against the actual test repository we created
const { runLocal } = require('./dist/index.js');

async function testRealRepo() {
  console.log('🧪 Testing Changelogger on REAL test repository...');
  console.log('📍 Repository: changelogger-test-repo');

  // Set up environment to point to our test repo
  process.env.GITHUB_REPOSITORY = 'rohansaibuddhi/changelogger-test-repo';

  try {
    await runLocal({
      // Note: These will use fallback mode since we don't have real API keys
      // But we'll see our real commits analyzed!
      merge_strategy: 'auto',
      since: '2024-01-01' // Get all commits
    });

    console.log('✅ Test completed! Check the output above for the generated changelog.');
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

if (require.main === module) {
  testRealRepo();
}