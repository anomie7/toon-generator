import * as fs from 'node:fs';
import * as path from 'node:path';

interface Args {
  repoRoot: string;
  outputRoot: string;
  pluginName: string;
  force: boolean;
}

interface SourceSkill {
  name: string;
  description: string;
  sourcePath: string;
  agents: string[];
  chainedSkills: string[];
  sourceDir: string;
  scripts: string[];
  templates: string[];
  references: string[];
}

interface SourceAgent {
  name: string;
  sourcePath: string;
}

interface MarketplaceFile {
  name: string;
  interface?: {
    displayName?: string;
  };
  plugins: Array<{
    name: string;
    source: {
      source: string;
      path: string;
    };
    policy: {
      installation: string;
      authentication: string;
    };
    category: string;
  }>;
}

function parseArgs(): Args {
  const rawArgs = process.argv.slice(2);
  const parsed: Record<string, string> = {};
  const flags = new Set<string>();

  for (let i = 0; i < rawArgs.length; i += 1) {
    const arg = rawArgs[i];
    if (arg === '--force') {
      flags.add('force');
      continue;
    }

    if (!arg.startsWith('--') || i + 1 >= rawArgs.length) {
      continue;
    }

    parsed[arg.slice(2)] = rawArgs[i + 1];
    i += 1;
  }

  const repoRoot = path.resolve(parsed['repo-root'] || process.cwd());
  const outputRoot = parsed['output-root']
    ? path.resolve(parsed['output-root'])
    : '';

  if (!outputRoot) {
    console.error(
      'Usage: convert-codex.ts --output-root <path> [--repo-root <path>] [--plugin-name <name>] [--force]',
    );
    console.error('');
    console.error('Examples:');
    console.error('  node --import tsx scripts/convert-codex.ts --output-root /tmp/codex-home');
    console.error('  node --import tsx scripts/convert-codex.ts --output-root $HOME --force');
    process.exit(1);
  }

  const sourcePlugin = readJson(path.join(repoRoot, '.claude-plugin', 'plugin.json'));
  const pluginName = normalizePluginName(parsed['plugin-name'] || sourcePlugin.name || 'toon-generator');

  return {
    repoRoot,
    outputRoot,
    pluginName,
    force: flags.has('force'),
  };
}

function normalizePluginName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function readJson(filePath: string): Record<string, any> {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeJson(filePath: string, data: unknown): void {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf-8');
}

function writeText(filePath: string, contents: string): void {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, contents, 'utf-8');
}

function copyFile(sourcePath: string, targetPath: string): void {
  ensureDir(path.dirname(targetPath));
  fs.copyFileSync(sourcePath, targetPath);
}

function copyDir(sourcePath: string, targetPath: string): void {
  ensureDir(path.dirname(targetPath));
  fs.cpSync(sourcePath, targetPath, { recursive: true, force: true });
}

function parseFrontmatter(markdown: string): Record<string, string> {
  const match = markdown.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};

  const result: Record<string, string> = {};
  const lines = match[1].split('\n');
  let currentKey = '';
  let blockMode: 'folded' | 'literal' | null = null;
  let blockLines: string[] = [];

  const flushBlock = () => {
    if (!currentKey || !blockMode) return;
    const normalized = blockMode === 'folded'
      ? blockLines.map((line) => line.trim()).join(' ').replace(/\s+/g, ' ').trim()
      : blockLines.join('\n').trim();
    result[currentKey] = normalized;
    currentKey = '';
    blockMode = null;
    blockLines = [];
  };

  for (const line of lines) {
    const keyMatch = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (keyMatch) {
      flushBlock();
      const [, key, rawValue] = keyMatch;
      if (rawValue === '>' || rawValue === '|') {
        currentKey = key;
        blockMode = rawValue === '>' ? 'folded' : 'literal';
        blockLines = [];
      } else {
        result[key] = rawValue.replace(/^['"]|['"]$/g, '').trim();
      }
      continue;
    }

    if (blockMode && (/^\s+/.test(line) || line === '')) {
      blockLines.push(line);
    }
  }

  flushBlock();
  return result;
}

function findTokens(markdown: string, tokenType: 'Agent' | 'Skill'): string[] {
  const pattern = new RegExp(`${tokenType}\\(([^)]+)\\)`, 'g');
  const names = new Set<string>();
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(markdown)) !== null) {
    names.add(match[1]);
  }

  return [...names].sort();
}

function listFilesIfExists(dirPath: string): string[] {
  if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) {
    return [];
  }

  return fs.readdirSync(dirPath)
    .sort()
    .map((entry) => path.join(dirPath, entry));
}

function discoverSourceSkills(repoRoot: string): SourceSkill[] {
  const skillsRoot = path.join(repoRoot, 'skills');
  const skillDirs = fs.readdirSync(skillsRoot)
    .map((entry) => path.join(skillsRoot, entry))
    .filter((entry) => fs.statSync(entry).isDirectory())
    .sort();

  return skillDirs.map((sourceDir) => {
    const sourcePath = path.join(sourceDir, 'SKILL.md');
    const markdown = fs.readFileSync(sourcePath, 'utf-8');
    const frontmatter = parseFrontmatter(markdown);
    return {
      name: frontmatter.name || path.basename(sourceDir),
      description: frontmatter.description || '',
      sourcePath,
      agents: findTokens(markdown, 'Agent'),
      chainedSkills: findTokens(markdown, 'Skill'),
      sourceDir,
      scripts: listFilesIfExists(path.join(sourceDir, 'scripts')),
      templates: listFilesIfExists(path.join(sourceDir, 'templates')),
      references: listFilesIfExists(path.join(sourceDir, 'references')),
    };
  });
}

function discoverSourceAgents(repoRoot: string): SourceAgent[] {
  const agentsRoot = path.join(repoRoot, 'agents');
  if (!fs.existsSync(agentsRoot)) return [];

  return fs.readdirSync(agentsRoot)
    .filter((entry) => entry.endsWith('.md'))
    .sort()
    .map((entry) => ({
      name: path.basename(entry, '.md'),
      sourcePath: path.join(agentsRoot, entry),
    }));
}

function toPosixPath(filePath: string): string {
  return filePath.split(path.sep).join(path.posix.sep);
}

function toRuntimePath(...segments: string[]): string {
  return toPosixPath(path.posix.join('../../runtime', ...segments));
}

function toRepoRelativePath(repoRoot: string, filePath: string): string {
  return toPosixPath(path.relative(repoRoot, filePath));
}

function buildSkillWrapper(skill: SourceSkill, agentMap: Map<string, SourceAgent>): string {
  const skillDirName = path.basename(skill.sourceDir);
  const sourceSkillRef = toRuntimePath('skills', skillDirName, 'SKILL.md');
  const agentRefs = skill.agents
    .map((agentName) => agentMap.get(agentName))
    .filter((agent): agent is SourceAgent => Boolean(agent))
    .map((agent) => `- Source agent: [${agent.name}](${toRuntimePath('agents', `${agent.name}.md`)})`);

  const chainedSkillRefs = skill.chainedSkills
    .map((skillName) => `- Related generated skill: ../${skillName}/SKILL.md`);

  const scriptLines = skill.scripts.length > 0
    ? skill.scripts.map((scriptPath) => `- \`${toRuntimePath('skills', skillDirName, 'scripts', path.basename(scriptPath))}\``)
    : ['- None'];

  const templateLines = skill.templates.length > 0
    ? skill.templates.map((templatePath) => `- \`${toRuntimePath('skills', skillDirName, 'templates', path.basename(templatePath))}\``)
    : ['- None'];

  const referenceLines = skill.references.length > 0
    ? skill.references.map((referencePath) => `- \`${toRuntimePath('skills', skillDirName, 'references', path.basename(referencePath))}\``)
    : ['- None'];

  const relatedSection = [
    ...agentRefs,
    ...chainedSkillRefs,
  ];

  return `---
name: ${skill.name}
description: ${skill.description}
---

# ${skill.name}

Generated from the Claude source skill. Regenerate this wrapper with \`node --import tsx scripts/convert-codex.ts\`; do not hand-edit it as the primary definition.

## Source Of Truth

- Source skill: [${skill.name}](${sourceSkillRef})
${relatedSection.length > 0 ? relatedSection.join('\n') : '- Related agent/skill docs: none'}
- Bundled runtime root: \`${toRuntimePath()}\`

## Codex Mapping

- Treat \`Agent(name)\` in the source docs as a role reference. Execute locally by default.
- Use \`spawn_agent\` only when the user explicitly asks for sub-agents, delegation, or parallel agent work.
- Treat \`AskUserQuestion\` as a normal user question in the main thread.
- Resolve \`\${CLAUDE_SKILL_DIR}\` to \`${toRuntimePath('skills', skillDirName)}\` relative to this wrapper.
- If shell cwd is not the generated plugin root, convert runtime paths to absolute paths before running commands.
- Before running scripts, ensure runtime dependencies are installed in \`${toRuntimePath()}\` with \`npm install\`.
- Run the bundled runtime scripts from \`${toRuntimePath()}\` instead of relying on the original source checkout.

## Runtime Assets

Scripts:
${scriptLines.join('\n')}

Templates:
${templateLines.join('\n')}

References:
${referenceLines.join('\n')}

## Recommended Workflow

1. Read the copied source skill doc first.
2. Load only the related agent docs, templates, or references needed for the current task.
3. Keep generated \`content/\` and \`output/\` outside the source repo when the user wants the repo untouched.
4. When a source workflow depends on multiple agents, either emulate the roles locally or delegate only if the user explicitly requested it.
`;
}

function buildPluginManifest(
  sourcePlugin: Record<string, any>,
  pluginName: string,
): Record<string, any> {
  const authorName = typeof sourcePlugin.author === 'object'
    ? sourcePlugin.author?.name || 'Unknown'
    : sourcePlugin.author || 'Unknown';
  const repository = typeof sourcePlugin.repository === 'object'
    ? sourcePlugin.repository?.url || ''
    : sourcePlugin.repository || '';
  const homepage = sourcePlugin.homepage || repository || '';

  return {
    name: pluginName,
    version: sourcePlugin.version || '1.0.0',
    description: sourcePlugin.description || 'Generated Codex wrapper for the Claude toon-generator plugin.',
    author: {
      name: authorName,
    },
    homepage,
    repository,
    license: sourcePlugin.license || 'MIT',
    keywords: Array.from(new Set([...(sourcePlugin.keywords || []), 'codex', 'generated'])),
    skills: './skills/',
    interface: {
      displayName: 'Toon Generator',
      shortDescription: 'Self-contained Codex wrapper for the Claude toon pipeline',
      longDescription: 'Generated from the Claude toon-generator source plugin with bundled runtime scripts.',
      developerName: authorName,
      category: 'Productivity',
      capabilities: ['Interactive', 'Write'],
      defaultPrompt: [
        'Run toon-prep with an external content dir.',
        'Generate EP1 slides from existing docs.',
        'Convert an episode image folder into reels.',
      ],
    },
  };
}

function upsertMarketplace(
  marketplacePath: string,
  pluginName: string,
  displayName: string,
): void {
  const nextEntry = {
    name: pluginName,
    source: {
      source: 'local',
      path: `./plugins/${pluginName}`,
    },
    policy: {
      installation: 'AVAILABLE',
      authentication: 'ON_INSTALL',
    },
    category: 'Productivity',
  };

  let marketplace: MarketplaceFile;
  if (fs.existsSync(marketplacePath)) {
    marketplace = JSON.parse(fs.readFileSync(marketplacePath, 'utf-8'));
  } else {
    marketplace = {
      name: 'local-generated',
      interface: {
        displayName,
      },
      plugins: [],
    };
  }

  marketplace.interface = {
    ...(marketplace.interface || {}),
    displayName: marketplace.interface?.displayName || displayName,
  };

  const existingIndex = marketplace.plugins.findIndex((plugin) => plugin.name === pluginName);
  if (existingIndex >= 0) {
    marketplace.plugins[existingIndex] = nextEntry;
  } else {
    marketplace.plugins.push(nextEntry);
  }

  writeJson(marketplacePath, marketplace);
}

function copyRuntime(repoRoot: string, pluginRoot: string): void {
  const runtimeRoot = path.join(pluginRoot, 'runtime');
  const runtimeDirs = ['agents', 'skills'];
  const runtimeFiles = ['package-lock.json', 'tsconfig.json'];

  ensureDir(runtimeRoot);

  for (const dirName of runtimeDirs) {
    const sourceDir = path.join(repoRoot, dirName);
    if (fs.existsSync(sourceDir)) {
      copyDir(sourceDir, path.join(runtimeRoot, dirName));
    }
  }

  for (const fileName of runtimeFiles) {
    const sourceFile = path.join(repoRoot, fileName);
    if (fs.existsSync(sourceFile)) {
      copyFile(sourceFile, path.join(runtimeRoot, fileName));
    }
  }

  const runtimePackage = readJson(path.join(repoRoot, 'package.json'));
  runtimePackage.scripts = {
    generate: 'node --import tsx skills/toon-slide/scripts/generate.ts',
    inspect: 'node --import tsx skills/toon-slide/scripts/inspect.ts',
    'generate-refs': 'node --import tsx skills/toon-prep/scripts/generate-refs.ts',
  };
  writeJson(path.join(runtimeRoot, 'package.json'), runtimePackage);
}

function main(): void {
  const args = parseArgs();
  const sourcePluginPath = path.join(args.repoRoot, '.claude-plugin', 'plugin.json');
  const sourcePlugin = readJson(sourcePluginPath);

  const pluginRoot = path.join(args.outputRoot, 'plugins', args.pluginName);
  const marketplacePath = path.join(args.outputRoot, '.agents', 'plugins', 'marketplace.json');
  const sourceSkills = discoverSourceSkills(args.repoRoot);
  const sourceAgents = discoverSourceAgents(args.repoRoot);
  const agentMap = new Map(sourceAgents.map((agent) => [agent.name, agent]));

  if (fs.existsSync(pluginRoot)) {
    if (!args.force) {
      console.error(`Plugin output already exists: ${pluginRoot}`);
      console.error('Re-run with --force to replace it.');
      process.exit(1);
    }
    fs.rmSync(pluginRoot, { recursive: true, force: true });
  }

  ensureDir(pluginRoot);
  copyRuntime(args.repoRoot, pluginRoot);

  for (const skill of sourceSkills) {
    copyFile(
      skill.sourcePath,
      path.join(pluginRoot, 'references', 'source-skills', `${skill.name}.md`),
    );
    writeText(
      path.join(pluginRoot, 'skills', skill.name, 'SKILL.md'),
      buildSkillWrapper(skill, agentMap),
    );
  }

  for (const agent of sourceAgents) {
    copyFile(
      agent.sourcePath,
      path.join(pluginRoot, 'references', 'source-agents', `${agent.name}.md`),
    );
  }

  writeJson(
    path.join(pluginRoot, '.codex-plugin', 'plugin.json'),
    buildPluginManifest(sourcePlugin, args.pluginName),
  );

  writeJson(path.join(pluginRoot, 'generated-from.json'), {
    generatedAt: new Date().toISOString(),
    sourcePlugin: toRepoRelativePath(args.repoRoot, sourcePluginPath),
    runtimeRoot: 'runtime',
    skills: sourceSkills.map((skill) => ({
      name: skill.name,
      sourcePath: toRepoRelativePath(args.repoRoot, skill.sourcePath),
      agents: skill.agents,
      chainedSkills: skill.chainedSkills,
    })),
    agents: sourceAgents.map((agent) => ({
      name: agent.name,
      sourcePath: toRepoRelativePath(args.repoRoot, agent.sourcePath),
    })),
  });

  upsertMarketplace(marketplacePath, args.pluginName, 'Local Plugins');

  console.log(`Generated Codex plugin: ${pluginRoot}`);
  console.log(`Updated marketplace: ${marketplacePath}`);
  console.log(`Copied ${sourceSkills.length} skills and ${sourceAgents.length} agents.`);
}

main();
