#!/usr/bin/env node
/**
 * Filters streets to only include those within Ciudad Autónoma de Buenos Aires
 */

const fs = require('fs');
const path = require('path');

// Use Nominatim to get CABA boundary as proper GeoJSON
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search?q=Ciudad+Autonoma+de+Buenos+Aires&format=geojson&polygon_geojson=1&limit=1';

async function fetchCABABoundary() {
  console.log('Fetching CABA boundary from Nominatim...');

  const response = await fetch(NOMINATIM_URL, {
    headers: { 'User-Agent': 'CallesDeBuenosAires/1.0' }
  });

  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const data = await response.json();

  if (!data.features || data.features.length === 0) {
    throw new Error('CABA boundary not found');
  }

  const geometry = data.features[0].geometry;

  // Handle both Polygon and MultiPolygon
  let coordinates;
  if (geometry.type === 'Polygon') {
    coordinates = geometry.coordinates[0]; // outer ring
  } else if (geometry.type === 'MultiPolygon') {
    // Use the largest polygon (main boundary)
    let largest = geometry.coordinates[0][0];
    for (const poly of geometry.coordinates) {
      if (poly[0].length > largest.length) {
        largest = poly[0];
      }
    }
    coordinates = largest;
  } else {
    throw new Error(`Unexpected geometry type: ${geometry.type}`);
  }

  console.log(`Boundary has ${coordinates.length} points`);
  return coordinates;
}

// Point in polygon test (ray casting algorithm)
function pointInPolygon(point, polygon) {
  const [x, y] = point;
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];

    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }

  return inside;
}

// Check if a line segment is at least partially inside the polygon
function lineIntersectsPolygon(lineCoords, polygon) {
  // Check if any point of the line is inside
  for (const point of lineCoords) {
    if (pointInPolygon(point, polygon)) {
      return true;
    }
  }
  return false;
}

async function filterStreets() {
  // Get CABA boundary
  const boundary = await fetchCABABoundary();

  // Save boundary for reference
  const boundaryGeoJSON = {
    type: 'Feature',
    properties: { name: 'Ciudad Autónoma de Buenos Aires' },
    geometry: { type: 'Polygon', coordinates: [boundary] }
  };

  const boundaryPath = path.join(__dirname, '..', 'data', 'caba_boundary.geojson');
  fs.writeFileSync(boundaryPath, JSON.stringify(boundaryGeoJSON, null, 2));
  console.log(`Saved boundary to ${boundaryPath}`);

  // Load streets
  const streetsPath = path.join(__dirname, '..', 'data', 'buenos_aires_streets.geojson');
  const streets = JSON.parse(fs.readFileSync(streetsPath, 'utf8'));

  console.log(`\nFiltering ${streets.features.length} street segments...`);

  // Filter to only streets inside CABA
  const filteredFeatures = streets.features.filter(feature => {
    const coords = feature.geometry.coordinates;
    return lineIntersectsPolygon(coords, boundary);
  });

  console.log(`Kept ${filteredFeatures.length} segments inside CABA`);

  // Save filtered streets
  const filtered = {
    type: 'FeatureCollection',
    features: filteredFeatures
  };

  fs.writeFileSync(streetsPath, JSON.stringify(filtered));
  console.log(`Updated ${streetsPath}`);

  // Also update public/data
  const publicPath = path.join(__dirname, '..', 'public', 'data', 'buenos_aires_streets.geojson');
  fs.writeFileSync(publicPath, JSON.stringify(filtered));
  console.log(`Updated ${publicPath}`);

  // Stats
  const uniqueNames = new Set(filteredFeatures.map(f => f.properties.name).filter(Boolean));
  console.log(`\nUnique street names: ${uniqueNames.size}`);
}

filterStreets().catch(console.error);
