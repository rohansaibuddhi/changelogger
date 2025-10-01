import * as core from '@actions/core';
import * as github from '@actions/github';
import { GitHubClient } from './github';
import { OpenAIChangelogGenerator } from './openai';
import { ActionConfig } from './types';

async function run(): Promise<void> {
  try {
    // Get inputs from GitHub Action
    const config: ActionConfig = {
      openai_api_key: core.getInput('openai_api_key', { required: true }),
      merge_strategy: core.getInput('merge_strategy') as any || 'auto',
      since: core.getInput('since') || undefined,
      github_token: core.getInput('github_token') || process.env.GITHUB_TOKEN || ''
    };

    // Validate required inputs
    if (!config.openai_api_key) {
      throw new Error('OpenAI API key is required');
    }
    if (!config.github_token) {
      throw new Error('GitHub token is required');
    }

    // Get repository information
    const context = github.context;
    const [owner, repo] = context.repo.owner && context.repo.repo
      ? [context.repo.owner, context.repo.repo]
      : process.env.GITHUB_REPOSITORY?.split('/') || ['', ''];

    if (!owner || !repo) {
      throw new Error('Could not determine repository owner and name');
    }

    core.info(`Generating changelog for ${owner}/${repo}`);

    // Initialize clients
    const githubClient = new GitHubClient(config.github_token, owner, repo);
    const openaiGenerator = new OpenAIChangelogGenerator(config.openai_api_key);

    // Step 1: Determine the "since" date
    const sinceDate = config.since || await githubClient.getLastReleaseDate();
    core.info(`Collecting PRs since: ${sinceDate}`);

    // Step 2: Collect PRs
    const prs = await githubClient.collectPRs(sinceDate);
    core.info(`Found ${prs.length} merged PRs`);

    if (prs.length === 0) {
      core.info('No PRs found for changelog generation');
      core.setOutput('changelog', '# Changelog\n\nNo changes found for this release.');
      core.setOutput('drift_warnings', '');
      return;
    }

    // Log PR details
    core.info('PRs to include in changelog:');
    prs.forEach(pr => {
      core.info(`  #${pr.number}: ${pr.title} (${pr.merge_strategy}) by @${pr.author}`);
    });

    // Step 3: Generate comprehensive changelog with OpenAI (includes drift detection)
    core.info('Generating changelog and analyzing drift with OpenAI...');
    const result = await openaiGenerator.generateChangelogWithAnalysis(prs);

    // Step 4: Process results
    let finalChangelog = result.changelog;

    if (result.driftWarnings.length > 0) {
      core.warning(`Documentation drift detected! ${result.driftWarnings.length} warnings found.`);

      // Add drift warnings to changelog
      finalChangelog += '\n\n## ⚠️ Documentation Drift Detected\n\n';
      result.driftWarnings.forEach(warning => {
        finalChangelog += `- ${warning}\n`;
      });

      if (result.suggestions.length > 0) {
        finalChangelog += '\n### 💡 Suggestions:\n\n';
        result.suggestions.forEach(suggestion => {
          finalChangelog += `- ${suggestion}\n`;
        });
      }
    } else {
      core.info('✅ No documentation drift detected');
    }

    if (result.hasBreakingChanges) {
      core.warning('⚠️ Breaking changes detected - ensure migration documentation is updated!');
    }

    // Step 5: Output results
    core.setOutput('changelog', finalChangelog);
    core.setOutput('drift_warnings', result.driftWarnings.join('\n'));

    // Step 6: Write to file (optional - could be controlled by input)
    try {
      await githubClient.createOrUpdateChangelog(finalChangelog);
      core.info('✅ CHANGELOG.md updated successfully');
    } catch (error) {
      core.warning(`Could not update CHANGELOG.md: ${error}`);
      core.info('Changelog content is available in action outputs');
    }

    // Step 7: Summary
    core.summary
      .addHeading('📝 Changelog Generated')
      .addRaw(finalChangelog)
      .addSeparator();

    if (result.driftWarnings.length > 0) {
      core.summary
        .addHeading('⚠️ Documentation Drift Warnings')
        .addList(result.driftWarnings);

      if (result.suggestions.length > 0) {
        core.summary
          .addHeading('💡 Suggestions')
          .addList(result.suggestions);
      }
    }

    await core.summary.write();

    core.info('🎉 Changelogger completed successfully!');

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    core.setFailed(`Changelogger failed: ${errorMessage}`);

    // Provide helpful debugging info
    core.debug('Error details:');
    core.debug(JSON.stringify(error, null, 2));

    // Still try to provide partial output if possible
    if (error instanceof Error && error.message.includes('OpenAI')) {
      core.warning('OpenAI generation failed, but GitHub data collection may have succeeded');
    }
  }
}

// Helper function for local testing
export async function runLocal(config: Partial<ActionConfig> = {}) {
  // Set environment variables for local testing
  if (config.openai_api_key) process.env.INPUT_OPENAI_API_KEY = config.openai_api_key;
  if (config.github_token) process.env.INPUT_GITHUB_TOKEN = config.github_token;
  if (config.merge_strategy) process.env.INPUT_MERGE_STRATEGY = config.merge_strategy;
  if (config.since) process.env.INPUT_SINCE = config.since;

  // GitHub Actions uses INPUT_ prefix for action inputs
  if (!process.env.INPUT_OPENAI_API_KEY) process.env.INPUT_OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
  if (!process.env.INPUT_GITHUB_TOKEN) process.env.INPUT_GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';

  await run();
}

// Run if this is the main module
if (require.main === module) {
  run();
}