#!/usr/bin/env node
/**
 * Fetches Buenos Aires streets from OpenStreetMap via Overpass API
 * and saves them as GeoJSON.
 */

const fs = require('fs');
const path = require('path');

// Buenos Aires city boundary (approximate bounding box)
const BUENOS_AIRES_BBOX = '-34.705,-58.531,-34.527,-58.335';

// Overpass API endpoints (try multiple if one fails)
const OVERPASS_URLS = [
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass-api.de/api/interpreter'
];

// Split Buenos Aires into quadrants for smaller queries
const QUADRANTS = [
  { name: 'NE', bbox: '-34.616,-58.433,-34.527,-58.335' },
  { name: 'NW', bbox: '-34.616,-58.531,-34.527,-58.433' },
  { name: 'SE', bbox: '-34.705,-58.433,-34.616,-58.335' },
  { name: 'SW', bbox: '-34.705,-58.531,-34.616,-58.433' }
];

function buildQuery(bbox) {
  return `
[out:json][timeout:120];
(
  way["highway"~"^(primary|secondary|tertiary|residential|living_street|pedestrian|unclassified)$"]["name"](${bbox});
);
out geom;
`;
}

async function fetchFromOverpass(query, serverIndex = 0) {
  const url = OVERPASS_URLS[serverIndex];
  console.log(`  Using server: ${url}`);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: `data=${encodeURIComponent(query)}`
  });

  if (!response.ok) {
    if (serverIndex < OVERPASS_URLS.length - 1) {
      console.log(`  Server returned ${response.status}, trying next...`);
      return fetchFromOverpass(query, serverIndex + 1);
    }
    throw new Error(`HTTP error: ${response.status}`);
  }

  return response.json();
}

async function fetchStreets() {
  console.log('Fetching Buenos Aires streets from OpenStreetMap...');
  console.log('Fetching in 4 quadrants to avoid timeouts...\n');

  const allElements = [];

  for (const quadrant of QUADRANTS) {
    console.log(`Fetching ${quadrant.name} quadrant...`);
    try {
      const query = buildQuery(quadrant.bbox);
      const data = await fetchFromOverpass(query);
      console.log(`  Got ${data.elements.length} segments\n`);
      allElements.push(...data.elements);

      // Wait a bit between requests to be nice to the server
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (error) {
      console.error(`  Error fetching ${quadrant.name}: ${error.message}`);
    }
  }

  console.log(`Total segments fetched: ${allElements.length}`);

  // Convert to GeoJSON
  const geojson = convertToGeoJSON(allElements);

  // Save to file
  const outputPath = path.join(__dirname, '..', 'data', 'buenos_aires_streets.geojson');
  fs.writeFileSync(outputPath, JSON.stringify(geojson, null, 2));
  console.log(`\nSaved to: ${outputPath}`);
  console.log(`Total features: ${geojson.features.length}`);

  // Print some stats
  const uniqueNames = new Set(geojson.features.map(f => f.properties.name).filter(Boolean));
  console.log(`Unique street names: ${uniqueNames.size}`);
}

function convertToGeoJSON(elements) {
  const features = elements
    .filter(el => el.type === 'way' && el.geometry && el.geometry.length > 0)
    .map(el => ({
      type: 'Feature',
      properties: {
        id: el.id,
        name: el.tags?.name || null,
        highway: el.tags?.highway || null
      },
      geometry: {
        type: 'LineString',
        coordinates: el.geometry.map(point => [point.lon, point.lat])
      }
    }));

  return {
    type: 'FeatureCollection',
    features
  };
}

fetchStreets();
