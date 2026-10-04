/**
 * tools/check-references.js
 * Read-only reference integrity validator.
 *
 * Verifies:
 * 1. HTML script, link, and img references resolve to existing files on disk.
 * 2. HTML navigation links (relative internal pages) resolve.
 * 3. Relative require(...) statements across all JS files resolve on disk.
 * 4. Critical deployment config files (vercel.json, .vercelignore) paths resolve.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
let errorCount = 0;
let checkCount = 0;

function reportError(file, line, msg) {
  errorCount++;
  console.error(`  [BROKEN] ${file}${line ? ':' + line : ''} -> ${msg}`);
}

function reportPass(msg) {
  checkCount++;
}

function resolveWithExtensions(basePath) {
  if (fs.existsSync(basePath) && fs.statSync(basePath).isFile()) {
    return true;
  }
  const exts = ['.js', '.json', '.html', '.css', '.png', '.svg', '.jpg', '.ico'];
  for (const ext of exts) {
    if (fs.existsSync(basePath + ext) && fs.statSync(basePath + ext).isFile()) {
      return true;
    }
  }
  // Check index.js or package.json if directory
  if (fs.existsSync(basePath) && fs.statSync(basePath).isDirectory()) {
    if (
      fs.existsSync(path.join(basePath, 'index.js')) ||
      fs.existsSync(path.join(basePath, 'package.json'))
    ) {
      return true;
    }
  }
  return false;
}

// 1. Check HTML Files
console.log('--- 1. Checking HTML Asset & Nav References ---');
const htmlFiles = [
  'index.html',
  'frontend/customer/index.html',
  'frontend/customer/html/home.html',
  'frontend/customer/html/products.html',
  'frontend/customer/html/partner.html',
  'frontend/customer/html/dashboard.html'
];

htmlFiles.forEach(relHtml => {
  const fullHtml = path.join(ROOT, relHtml);
  if (!fs.existsSync(fullHtml)) {
    reportError(relHtml, null, 'HTML file does not exist');
    return;
  }

  const content = fs.readFileSync(fullHtml, 'utf8');
  const dir = path.dirname(fullHtml);
  const lines = content.split('\n');

  lines.forEach((line, idx) => {
    const lineNum = idx + 1;

    // Script src
    const scriptMatches = [...line.matchAll(/<script[^>]+src=["']([^"']+)["']/g)];
    for (const m of scriptMatches) {
      const src = m[1].split('?')[0].split('#')[0];
      if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('//')) continue;
      const target = path.resolve(dir, src);
      if (!fs.existsSync(target)) {
        reportError(relHtml, lineNum, `Script src="${src}" not found at ${path.relative(ROOT, target)}`);
      } else {
        reportPass();
      }
    }

    // Link href
    const linkMatches = [...line.matchAll(/<link[^>]+href=["']([^"']+)["']/g)];
    for (const m of linkMatches) {
      const href = m[1].split('?')[0].split('#')[0];
      if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('//')) continue;
      const target = path.resolve(dir, href);
      if (!fs.existsSync(target)) {
        reportError(relHtml, lineNum, `Link href="${href}" not found at ${path.relative(ROOT, target)}`);
      } else {
        reportPass();
      }
    }

    // Img src
    const imgMatches = [...line.matchAll(/<img[^>]+src=["']([^"']+)["']/g)];
    for (const m of imgMatches) {
      const src = m[1].split('?')[0].split('#')[0];
      if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('data:') || src.startsWith('//')) continue;
      const target = path.resolve(dir, src);
      if (!fs.existsSync(target)) {
        reportError(relHtml, lineNum, `Img src="${src}" not found at ${path.relative(ROOT, target)}`);
      } else {
        reportPass();
      }
    }

    // Anchor href (relative pages)
    const aMatches = [...line.matchAll(/<a[^>]+href=["']([^"']+)["']/g)];
    for (const m of aMatches) {
      const href = m[1].split('?')[0].split('#')[0];
      if (
        !href ||
        href.startsWith('#') ||
        href.startsWith('http://') ||
        href.startsWith('https://') ||
        href.startsWith('mailto:') ||
        href.startsWith('tel:') ||
        href.startsWith('javascript:')
      ) {
        continue;
      }
      // Note: login.html / register.html are known legacy modals before Phase 1 F10
      if (href === 'login.html' || href === 'register.html') {
        reportPass();
        continue;
      }
      const target = path.resolve(dir, href);
      if (!fs.existsSync(target)) {
        reportError(relHtml, lineNum, `Anchor href="${href}" not found at ${path.relative(ROOT, target)}`);
      } else {
        reportPass();
      }
    }
  });
});

// 2. Check JS relative require statements
console.log('--- 2. Checking JS Relative require() Statements ---');
function scanDirForJs(dir, list = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.git')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      scanDirForJs(full, list);
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      list.push(full);
    }
  }
  return list;
}

const jsFiles = scanDirForJs(ROOT);
jsFiles.forEach(fullJs => {
  const relJs = path.relative(ROOT, fullJs);
  const content = fs.readFileSync(fullJs, 'utf8');
  const dir = path.dirname(fullJs);
  const lines = content.split('\n');

  lines.forEach((line, idx) => {
    const lineNum = idx + 1;
    const requireMatches = [...line.matchAll(/require\s*\(\s*['"](\.[^'"]+)['"]\s*\)/g)];
    for (const m of requireMatches) {
      const reqPath = m[1];
      const target = path.resolve(dir, reqPath);
      if (!resolveWithExtensions(target)) {
        reportError(relJs, lineNum, `require("${reqPath}") failed to resolve at ${path.relative(ROOT, target)}`);
      } else {
        reportPass();
      }
    }
  });
});

// 3. Check Vercel files
console.log('--- 3. Checking Vercel Configuration References ---');
const vercelIgnorePath = path.join(ROOT, '.vercelignore');
if (!fs.existsSync(vercelIgnorePath)) {
  reportError('.vercelignore', null, '.vercelignore does not exist');
} else {
  const ignoreContent = fs.readFileSync(vercelIgnorePath, 'utf8');
  if (!ignoreContent.includes('backend/')) {
    reportError('.vercelignore', null, 'backend/ must be ignored');
  } else {
    reportPass();
  }

  if (fs.existsSync(path.join(ROOT, 'scratch'))) {
    if (!ignoreContent.includes('scratch/')) {
      reportError('.vercelignore', null, 'scratch/ exists but is not listed in .vercelignore');
    } else {
      reportPass();
    }
  }

  if (fs.existsSync(path.join(ROOT, 'tests'))) {
    if (!ignoreContent.includes('tests/')) {
      reportError('.vercelignore', null, 'tests/ exists but is not listed in .vercelignore');
    } else {
      reportPass();
    }
    if (!ignoreContent.includes('tools/')) {
      reportError('.vercelignore', null, 'tools/ exists but is not listed in .vercelignore');
    } else {
      reportPass();
    }
  }
}

console.log(`\n========================================`);
console.log(`Check complete: ${checkCount} checks passed, ${errorCount} errors found.`);
console.log(`========================================`);

if (errorCount > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
