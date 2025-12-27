#!/usr/bin/env node
/**
 * SVG Icon Preprocessing Script
 *
 * This script processes Hugeicons Duotone SVG files for use in the Turret frontend:
 * - Reads SVGs from the source directory (.refs/icons/hugeicons/Duotone/)
 * - Replaces hardcoded colors with CSS variables for theme compatibility
 * - Flattens category directories into a single output directory
 * - Uses consistent kebab-case naming convention
 *
 * Color replacements:
 * - fill="#D4D7E0" -> fill="var(--icon-fill, currentColor)"
 * - stroke="#141B34" -> stroke="currentColor"
 * - fill="#141B34" -> fill="currentColor"
 *
 * Usage:
 *   node scripts/process-icons.cjs [--mapping=path/to/mapping.json]
 *
 * Options:
 *   --mapping   Path to icon mapping JSON file (default: scripts/icon-mapping.json)
 *   --all       Process all icons (ignore mapping, copy everything)
 *   --dry-run   Show what would be done without making changes
 *   --verbose   Show detailed processing information
 */

const fs = require('fs');
const path = require('path');

// Configuration
// Path from apps/frontend/scripts/ to main repo's .refs/icons/hugeicons/Duotone/
// Worktree structure: Turret/.worktrees/005-replace.../apps/frontend/scripts/
const SOURCE_DIR = path.resolve(__dirname, '../../../../../.refs/icons/hugeicons/Duotone');
const DEST_DIR = path.resolve(__dirname, '../src/renderer/assets/icons');
const DEFAULT_MAPPING_FILE = path.resolve(__dirname, 'icon-mapping.json');

// Color replacement patterns (case-insensitive)
const COLOR_REPLACEMENTS = [
  // Duotone fill color (background layer)
  {
    pattern: /fill="#D4D7E0"/gi,
    replacement: 'fill="var(--icon-fill, currentColor)"',
  },
  {
    pattern: /fill="#d4d7e0"/gi,
    replacement: 'fill="var(--icon-fill, currentColor)"',
  },
  // Primary stroke color
  {
    pattern: /stroke="#141B34"/gi,
    replacement: 'stroke="currentColor"',
  },
  {
    pattern: /stroke="#141b34"/gi,
    replacement: 'stroke="currentColor"',
  },
  // Primary fill color (line details - should use currentColor)
  {
    pattern: /fill="#141B34"/gi,
    replacement: 'fill="currentColor"',
  },
  {
    pattern: /fill="#141b34"/gi,
    replacement: 'fill="currentColor"',
  },
];

/**
 * Parse command-line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    mappingFile: DEFAULT_MAPPING_FILE,
    processAll: false,
    dryRun: false,
    verbose: false,
  };

  for (const arg of args) {
    if (arg.startsWith('--mapping=')) {
      options.mappingFile = path.resolve(arg.split('=')[1]);
    } else if (arg === '--all') {
      options.processAll = true;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--verbose') {
      options.verbose = true;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
  }

  return options;
}

/**
 * Print help message
 */
function printHelp() {
  console.log(`
SVG Icon Preprocessing Script

Usage:
  node scripts/process-icons.cjs [options]

Options:
  --mapping=<path>  Path to icon mapping JSON file (default: scripts/icon-mapping.json)
  --all             Process all icons from source (ignore mapping)
  --dry-run         Show what would be done without making changes
  --verbose         Show detailed processing information
  --help, -h        Show this help message

Example:
  node scripts/process-icons.cjs --mapping=./custom-mapping.json
  node scripts/process-icons.cjs --all --dry-run
`);
}

/**
 * Load icon mapping from JSON file
 * @param {string} mappingFile - Path to mapping JSON file
 * @returns {Object} Mapping object or null if file doesn't exist
 */
function loadMapping(mappingFile) {
  try {
    const content = fs.readFileSync(mappingFile, 'utf8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * Get all SVG files from the source directory (recursive)
 * @param {string} dir - Directory to scan
 * @param {string} baseDir - Base directory for relative paths
 * @returns {Array} Array of {absolutePath, relativePath, filename, category}
 */
function getAllSvgFiles(dir, baseDir = dir) {
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      // Recurse into subdirectories
      results.push(...getAllSvgFiles(fullPath, baseDir));
    } else if (entry.isFile() && entry.name.endsWith('.svg')) {
      const relativePath = path.relative(baseDir, fullPath);
      const category = path.dirname(relativePath);

      results.push({
        absolutePath: fullPath,
        relativePath,
        filename: entry.name,
        category: category === '.' ? null : category,
      });
    }
  }

  return results;
}

/**
 * Process SVG content - replace hardcoded colors with CSS variables
 * @param {string} content - Original SVG content
 * @returns {string} Processed SVG content
 */
function processSvgContent(content) {
  let processed = content;

  for (const { pattern, replacement } of COLOR_REPLACEMENTS) {
    processed = processed.replace(pattern, replacement);
  }

  return processed;
}

/**
 * Find an SVG file by name across all categories
 * @param {Array} allSvgFiles - All SVG files from source
 * @param {string} iconName - Icon name to find (without .svg extension)
 * @returns {Object|null} Found file info or null
 */
function findSvgByName(allSvgFiles, iconName) {
  const targetName = `${iconName}.svg`;

  // First, try exact match
  let found = allSvgFiles.find((f) => f.filename === targetName);
  if (found) return found;

  // Try with -round suffix (for Arrows Round)
  found = allSvgFiles.find((f) => f.filename === `${iconName}-round.svg`);
  if (found) return found;

  // Try without -round suffix
  if (iconName.endsWith('-round')) {
    const baseName = iconName.replace(/-round$/, '');
    found = allSvgFiles.find((f) => f.filename === `${baseName}.svg`);
    if (found) return found;
  }

  return null;
}

/**
 * Ensure directory exists
 * @param {string} dir - Directory path
 * @param {boolean} dryRun - If true, don't create directory
 */
function ensureDirectory(dir, dryRun = false) {
  if (!dryRun && !fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Process icons based on mapping
 * @param {Object} options - Command-line options
 */
function processIcons(options) {
  const { mappingFile, processAll, dryRun, verbose } = options;

  // Validate source directory
  if (!fs.existsSync(SOURCE_DIR)) {
    console.error(`Error: Source directory not found: ${SOURCE_DIR}`);
    console.error('Make sure you are running from the correct location.');
    process.exit(1);
  }

  // Get all SVG files from source
  console.log(`Scanning source directory: ${SOURCE_DIR}`);
  const allSvgFiles = getAllSvgFiles(SOURCE_DIR);
  console.log(`Found ${allSvgFiles.length} SVG files in ${new Set(allSvgFiles.map((f) => f.category)).size} categories`);

  // Ensure destination directory exists
  ensureDirectory(DEST_DIR, dryRun);

  let filesToProcess = [];

  if (processAll) {
    // Process all icons
    console.log('Processing ALL icons from source...');
    filesToProcess = allSvgFiles.map((f) => ({
      source: f,
      destName: f.filename,
    }));
  } else {
    // Load mapping file
    const mapping = loadMapping(mappingFile);
    if (!mapping) {
      console.error(`Error: Mapping file not found: ${mappingFile}`);
      console.error('Create a mapping file or use --all to process all icons.');
      process.exit(1);
    }

    // Handle structured mapping format (with icons object) or flat format
    const iconEntries = mapping.icons || mapping;

    console.log(`Using mapping file: ${mappingFile}`);
    console.log(`Mapping contains ${Object.keys(iconEntries).length} icon entries`);

    // Build list of files to process based on mapping
    const notFound = [];
    for (const [lucideName, iconMapping] of Object.entries(iconEntries)) {
      // Support both structured format { hugeicon_file: "..." } and simple format "icon-name"
      const hugeIconFile = typeof iconMapping === 'string'
        ? iconMapping
        : iconMapping.hugeicon_file;

      // Remove .svg extension if present for the search
      const hugeIconName = hugeIconFile.replace(/\.svg$/, '');

      const source = findSvgByName(allSvgFiles, hugeIconName);
      if (source) {
        // Use the Lucide name for the output file in kebab-case (for backwards compatibility)
        const destName = `${lucideName.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()}.svg`;
        filesToProcess.push({
          source,
          destName,
          lucideName,
          hugeIconName,
        });
      } else {
        notFound.push({ lucideName, hugeIconName });
      }
    }

    if (notFound.length > 0) {
      console.warn(`\nWarning: ${notFound.length} icons not found in source:`);
      for (const { lucideName, hugeIconName } of notFound) {
        console.warn(`  - ${lucideName} -> ${hugeIconName}`);
      }
    }
  }

  // Process files
  console.log(`\nProcessing ${filesToProcess.length} icons...`);

  let processed = 0;
  let errors = 0;

  for (const { source, destName, lucideName, hugeIconName } of filesToProcess) {
    try {
      const destPath = path.join(DEST_DIR, destName);

      if (verbose) {
        console.log(`  ${source.filename} -> ${destName}`);
      }

      if (!dryRun) {
        // Read source file
        const content = fs.readFileSync(source.absolutePath, 'utf8');

        // Process content
        const processedContent = processSvgContent(content);

        // Write to destination
        fs.writeFileSync(destPath, processedContent, 'utf8');
      }

      processed++;
    } catch (err) {
      console.error(`Error processing ${source.filename}: ${err.message}`);
      errors++;
    }
  }

  // Summary
  console.log('\n--- Summary ---');
  console.log(`Processed: ${processed} icons`);
  if (errors > 0) {
    console.log(`Errors: ${errors}`);
  }
  if (dryRun) {
    console.log('(Dry run - no files were written)');
  } else {
    console.log(`Output directory: ${DEST_DIR}`);
  }
}

// Main execution
const options = parseArgs();
processIcons(options);
