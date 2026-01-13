#!/usr/bin/env node
/**
 * Analyzes how well the historical street data matches the OSM street data
 */

const fs = require('fs');
const path = require('path');

// Normalize street name for matching
function normalizeStreetName(name) {
  if (!name) return '';
  return name
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove accents
    .replace(/,/g, '')
    .replace(/\./g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Additional normalization for better matching
function fuzzyNormalize(name) {
  let n = normalizeStreetName(name);

  // Handle common patterns
  // "AVENIDA X" -> "AV X" or just "X"
  n = n.replace(/^AVENIDA\s+/, '');
  n = n.replace(/^AV\s+/, '');
  n = n.replace(/^AV\.\s+/, '');

  // "CALLE X" -> "X"
  n = n.replace(/^CALLE\s+/, '');

  // "X, Y" -> "Y X" (for names like "ACEVEDO, EDUARDO" -> "EDUARDO ACEVEDO")
  if (n.includes(' ')) {
    const parts = n.split(' ');
    // Try reversing for "LASTNAME, FIRSTNAME" pattern
  }

  return n;
}

async function analyze() {
  // Load historical data
  const historicalPath = path.join(__dirname, '..', 'data', 'calles_buenos_aires_final.json');
  const historical = JSON.parse(fs.readFileSync(historicalPath, 'utf8'));

  // Load OSM data
  const osmPath = path.join(__dirname, '..', 'data', 'buenos_aires_streets.geojson');
  const osm = JSON.parse(fs.readFileSync(osmPath, 'utf8'));

  // Build lookup from OSM
  const osmNames = new Set();
  const osmNormalized = new Map(); // normalized -> original

  osm.features.forEach(f => {
    const name = f.properties.name;
    if (name) {
      osmNames.add(name);
      const norm = normalizeStreetName(name);
      if (!osmNormalized.has(norm)) {
        osmNormalized.set(norm, name);
      }
    }
  });

  console.log('=== Street Matching Analysis ===\n');
  console.log(`Historical streets: ${historical.streets.length}`);
  console.log(`OSM unique street names: ${osmNames.size}\n`);

  // Try to match
  let exactMatches = 0;
  let normalizedMatches = 0;
  let noMatch = [];

  historical.streets.forEach(street => {
    const name = street.current_name;

    // Exact match
    if (osmNames.has(name)) {
      exactMatches++;
      return;
    }

    // Normalized match
    const norm = normalizeStreetName(name);
    if (osmNormalized.has(norm)) {
      normalizedMatches++;
      return;
    }

    // Try some variations for "LASTNAME, FIRSTNAME" pattern
    if (name.includes(', ')) {
      const [last, first] = name.split(', ');
      const reversed = `${first} ${last}`;
      const reversedNorm = normalizeStreetName(reversed);
      if (osmNormalized.has(reversedNorm)) {
        normalizedMatches++;
        return;
      }
    }

    noMatch.push(name);
  });

  console.log(`Exact matches: ${exactMatches}`);
  console.log(`Normalized matches: ${normalizedMatches}`);
  console.log(`Total matched: ${exactMatches + normalizedMatches} (${((exactMatches + normalizedMatches) / historical.streets.length * 100).toFixed(1)}%)`);
  console.log(`No match: ${noMatch.length}\n`);

  // Show some unmatched examples
  console.log('Sample unmatched streets:');
  noMatch.slice(0, 20).forEach(name => {
    console.log(`  - ${name}`);
  });

  // Show sample OSM names for debugging
  console.log('\nSample OSM street names:');
  Array.from(osmNames).slice(0, 20).forEach(name => {
    console.log(`  - ${name}`);
  });
}

analyze();
