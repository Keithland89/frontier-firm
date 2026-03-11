#!/usr/bin/env node
/**
 * Brand Extraction Tool
 *
 * Scrapes a customer website to extract brand colors, logo URL, and fonts.
 * Outputs a brand.json file that the report generator uses to theme the report.
 *
 * Usage:
 *   node extract-brand.js --url https://example.com --output data/brand.json
 *   node extract-brand.js --url https://example.com --output data/brand.json --verbose
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');
const fs = require('fs');
const path = require('path');

// Parse CLI args
const args = process.argv.slice(2);
const urlArg = args.find((a, i) => args[i - 1] === '--url');
const outputArg = args.find((a, i) => args[i - 1] === '--output') || 'data/brand.json';
const verbose = args.includes('--verbose');

if (!urlArg) {
  console.error('Usage: node extract-brand.js --url https://customer.com [--output brand.json]');
  process.exit(1);
}

function fetchPage(url, redirects) {
  if (redirects === undefined) redirects = 5;
  return new Promise(function(resolve, reject) {
    if (redirects <= 0) return reject(new Error('Too many redirects'));
    var protocol = url.startsWith('https') ? https : http;
    protocol.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 FrontierFirmBrandExtractor/1.0' } }, function(res) {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        var newUrl = res.headers.location;
        if (newUrl.startsWith('/')) newUrl = new URL(url).origin + newUrl;
        return resolve(fetchPage(newUrl, redirects - 1));
      }
      var data = '';
      res.on('data', function(chunk) { data += chunk; });
      res.on('end', function() { resolve(data); });
    }).on('error', reject);
  });
}

function extractColors(html) {
  var colors = new Set();

  // Extract from inline styles and CSS
  var hexMatches = html.match(/#[0-9A-Fa-f]{6}\b/g) || [];
  var rgbMatches = html.match(/rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)/g) || [];

  hexMatches.forEach(function(c) { colors.add(c.toUpperCase()); });
  rgbMatches.forEach(function(c) {
    var parts = c.match(/\d+/g);
    if (parts && parts.length === 3) {
      var hex = '#' + parts.map(function(p) { return parseInt(p).toString(16).padStart(2, '0'); }).join('').toUpperCase();
      colors.add(hex);
    }
  });

  // Extract CSS custom properties that look like brand colors
  var cssVarMatches = html.match(/--[a-z-]*(?:primary|brand|accent|main)[a-z-]*\s*:\s*([^;]+)/gi) || [];
  cssVarMatches.forEach(function(m) {
    var val = m.split(':')[1].trim();
    if (val.match(/^#[0-9A-Fa-f]{6}$/)) colors.add(val.toUpperCase());
  });

  return Array.from(colors);
}

function extractLogo(html, baseUrl) {
  // Look for logo in common patterns
  var logoPatterns = [
    /src="([^"]*logo[^"]*\.(png|svg|jpg|webp)[^"]*)"/gi,
    /src="([^"]*brand[^"]*\.(png|svg|jpg|webp)[^"]*)"/gi,
    /href="([^"]*logo[^"]*\.svg[^"]*)"/gi,
    /<link[^>]*rel="icon"[^>]*href="([^"]+)"/gi,
    /<meta[^>]*property="og:image"[^>]*content="([^"]+)"/gi,
  ];

  var logos = [];
  logoPatterns.forEach(function(pattern) {
    var match;
    while ((match = pattern.exec(html)) !== null) {
      var url = match[1];
      if (url.startsWith('//')) url = 'https:' + url;
      else if (url.startsWith('/')) url = baseUrl + url;
      else if (!url.startsWith('http')) url = baseUrl + '/' + url;
      logos.push(url);
    }
  });

  return logos;
}

function extractFonts(html) {
  var fonts = new Set();

  // Google Fonts
  var googleFontMatches = html.match(/fonts\.googleapis\.com\/css2?\?family=([^"&]+)/g) || [];
  googleFontMatches.forEach(function(m) {
    var family = m.split('family=')[1];
    if (family) {
      family.split('&')[0].split('|').forEach(function(f) {
        fonts.add(decodeURIComponent(f.split(':')[0].replace(/\+/g, ' ')));
      });
    }
  });

  // font-family declarations
  var fontFamilyMatches = html.match(/font-family\s*:\s*['"]?([^;'"}\n]+)/gi) || [];
  fontFamilyMatches.forEach(function(m) {
    var family = m.split(':')[1].trim().replace(/['"]/g, '').split(',')[0].trim();
    if (family && family.length < 40 && !family.includes('(') && !family.match(/^(inherit|initial|unset|sans-serif|serif|monospace|system-ui)$/i)) {
      fonts.add(family);
    }
  });

  return Array.from(fonts);
}

function scoreColor(hex) {
  // Convert hex to RGB
  var r = parseInt(hex.substring(1, 3), 16);
  var g = parseInt(hex.substring(3, 5), 16);
  var b = parseInt(hex.substring(5, 7), 16);

  // Skip near-white, near-black, and grays
  var max = Math.max(r, g, b);
  var min = Math.min(r, g, b);
  var saturation = max === 0 ? 0 : (max - min) / max;
  var brightness = max / 255;

  if (saturation < 0.15) return 0; // too gray
  if (brightness < 0.15) return 0; // too dark
  if (brightness > 0.92 && saturation < 0.2) return 0; // too light

  // Prefer saturated, medium-brightness colors
  return saturation * 0.6 + (1 - Math.abs(brightness - 0.5)) * 0.4;
}

function pickBrandColors(allColors) {
  // Score and sort
  var scored = allColors.map(function(c) { return { color: c, score: scoreColor(c) }; });
  scored.sort(function(a, b) { return b.score - a.score; });

  // Take top candidates
  var candidates = scored.filter(function(c) { return c.score > 0.2; }).slice(0, 10);

  // Pick primary (highest score) and accent (most different from primary)
  if (candidates.length === 0) return { primary: '#2264E5', accent: '#7B2FF2' };

  var primary = candidates[0].color;
  var accent = primary;

  if (candidates.length > 1) {
    // Find most visually different color from primary
    var pR = parseInt(primary.substring(1, 3), 16);
    var pG = parseInt(primary.substring(3, 5), 16);
    var pB = parseInt(primary.substring(5, 7), 16);

    var maxDist = 0;
    candidates.slice(1).forEach(function(c) {
      var r = parseInt(c.color.substring(1, 3), 16);
      var g = parseInt(c.color.substring(3, 5), 16);
      var b = parseInt(c.color.substring(5, 7), 16);
      var dist = Math.sqrt(Math.pow(r - pR, 2) + Math.pow(g - pG, 2) + Math.pow(b - pB, 2));
      if (dist > maxDist) { maxDist = dist; accent = c.color; }
    });
  }

  return { primary: primary, accent: accent, allCandidates: candidates.map(function(c) { return c.color; }) };
}

async function main() {
  console.log('Extracting brand from:', urlArg);

  var parsedUrl = new URL(urlArg);
  var baseUrl = parsedUrl.origin;

  try {
    var html = await fetchPage(urlArg);
    console.log('Fetched', html.length, 'bytes');

    // Also fetch linked CSS files for color extraction
    var cssLinks = html.match(/href="([^"]*\.css[^"]*)"/gi) || [];
    var cssContent = '';
    for (var ci = 0; ci < Math.min(cssLinks.length, 3); ci++) {
      var cssUrl = cssLinks[ci].match(/href="([^"]+)"/i);
      if (cssUrl) {
        var url = cssUrl[1];
        if (url.startsWith('//')) url = 'https:' + url;
        else if (url.startsWith('/')) url = baseUrl + url;
        else if (!url.startsWith('http')) url = baseUrl + '/' + url;
        try {
          var css = await fetchPage(url);
          cssContent += css;
          if (verbose) console.log('Fetched CSS:', url.substring(0, 80), '(' + css.length + ' bytes)');
        } catch(e) { /* skip */ }
      }
    }
    var fullContent = html + cssContent;

    // Extract signals
    var allColors = extractColors(fullContent);
    var logos = extractLogo(html, baseUrl);
    var fonts = extractFonts(fullContent);
    var brandColors = pickBrandColors(allColors);

    // Extract page title for customer name hint
    var titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    var pageTitle = titleMatch ? titleMatch[1].trim() : '';

    // Extract meta description
    var descMatch = html.match(/<meta[^>]*name="description"[^>]*content="([^"]+)"/i);
    var description = descMatch ? descMatch[1].trim() : '';

    var brand = {
      url: urlArg,
      extracted_at: new Date().toISOString(),
      customer_name_hint: pageTitle.split(/[|\-–—]/)[0].trim(),
      colors: {
        primary: brandColors.primary,
        accent: brandColors.accent,
        candidates: brandColors.allCandidates || []
      },
      logo_candidates: logos.slice(0, 5),
      fonts: fonts.slice(0, 5),
      meta: {
        title: pageTitle,
        description: description
      }
    };

    if (verbose) {
      console.log('\n=== BRAND EXTRACTION ===');
      console.log('Primary color:', brand.colors.primary);
      console.log('Accent color:', brand.colors.accent);
      console.log('All candidates:', brand.colors.candidates.join(', '));
      console.log('Logos found:', brand.logo_candidates.length);
      brand.logo_candidates.forEach(function(l) { console.log('  ', l); });
      console.log('Fonts:', brand.fonts.join(', '));
      console.log('Customer hint:', brand.customer_name_hint);
    }

    // Write output
    var outPath = path.resolve(outputArg);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(brand, null, 2));
    console.log('\nBrand saved to:', outPath);
    console.log('Primary:', brand.colors.primary, '| Accent:', brand.colors.accent);
    console.log('Use: node generate-report.js --data data/customer.json --brand', outPath, '--v3');

  } catch (e) {
    console.error('Failed:', e.message);
    process.exit(1);
  }
}

main();
