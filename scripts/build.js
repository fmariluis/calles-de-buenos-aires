#!/usr/bin/env node
/**
 * Build script for minifying JS and CSS for production
 */

const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, '..', 'public');
const distDir = path.join(__dirname, '..', 'dist');

async function build() {
  console.log('Building for production...\n');

  // Create dist directory
  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
  }

  // Create dist/data directory
  const distDataDir = path.join(distDir, 'data');
  if (!fs.existsSync(distDataDir)) {
    fs.mkdirSync(distDataDir, { recursive: true });
  }

  // Minify JavaScript
  console.log('Minifying JavaScript...');
  await esbuild.build({
    entryPoints: [path.join(publicDir, 'app.js')],
    outfile: path.join(distDir, 'app.min.js'),
    minify: true,
    sourcemap: true,
    target: ['es2018'],
  });

  // Minify CSS
  console.log('Minifying CSS...');
  await esbuild.build({
    entryPoints: [path.join(publicDir, 'style.css')],
    outfile: path.join(distDir, 'style.min.css'),
    minify: true,
    sourcemap: true,
  });

  // Copy and modify HTML to use minified files
  console.log('Processing HTML...');
  let html = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8');
  html = html.replace('app.js', 'app.min.js');
  html = html.replace('style.css', 'style.min.css');
  fs.writeFileSync(path.join(distDir, 'index.html'), html);

  // Copy favicon
  console.log('Copying favicon...');
  fs.copyFileSync(
    path.join(publicDir, 'favicon.svg'),
    path.join(distDir, 'favicon.svg')
  );

  // Copy robots.txt if present
  const robotsSource = path.join(publicDir, 'robots.txt');
  if (fs.existsSync(robotsSource)) {
    console.log('Copying robots.txt...');
    fs.copyFileSync(robotsSource, path.join(distDir, 'robots.txt'));
  }

  // Copy sitemap.xml if present
  const sitemapSource = path.join(publicDir, 'sitemap.xml');
  if (fs.existsSync(sitemapSource)) {
    console.log('Copying sitemap.xml...');
    fs.copyFileSync(sitemapSource, path.join(distDir, 'sitemap.xml'));
  }

  // Copy data files
  console.log('Copying data files...');
  const dataDir = path.join(publicDir, 'data');
  if (fs.existsSync(dataDir)) {
    const dataFiles = fs.readdirSync(dataDir);
    for (const file of dataFiles) {
      fs.copyFileSync(
        path.join(dataDir, file),
        path.join(distDataDir, file)
      );
    }
  }

  // Get file sizes
  const jsOriginal = fs.statSync(path.join(publicDir, 'app.js')).size;
  const jsMinified = fs.statSync(path.join(distDir, 'app.min.js')).size;
  const cssOriginal = fs.statSync(path.join(publicDir, 'style.css')).size;
  const cssMinified = fs.statSync(path.join(distDir, 'style.min.css')).size;

  console.log('\nBuild complete!\n');
  console.log('File sizes:');
  console.log(`  app.js:    ${(jsOriginal / 1024).toFixed(1)} KB → ${(jsMinified / 1024).toFixed(1)} KB (${Math.round((1 - jsMinified / jsOriginal) * 100)}% smaller)`);
  console.log(`  style.css: ${(cssOriginal / 1024).toFixed(1)} KB → ${(cssMinified / 1024).toFixed(1)} KB (${Math.round((1 - cssMinified / cssOriginal) * 100)}% smaller)`);
  console.log(`\nOutput directory: ${distDir}`);
}

build().catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});
