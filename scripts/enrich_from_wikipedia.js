#!/usr/bin/env node
/**
 * Enriches street data with information from Spanish Wikipedia
 */

const fs = require('fs');
const path = require('path');

const WIKI_API = 'https://es.wikipedia.org/w/api.php';
const DELAY_MS = 200; // Be nice to Wikipedia

// Load street data
const dataPath = path.join(__dirname, '..', 'data', 'calles_buenos_aires_final.json');
const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

async function fetchWithRetry(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'CallesBuenosAires/1.0 (https://github.com/fmariluis/calles-de-buenos-aires)' }
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const text = await response.text();
      return JSON.parse(text);
    } catch (error) {
      if (i === retries - 1) throw error;
      await sleep(1000 * (i + 1)); // Exponential backoff
    }
  }
}

async function searchWikipedia(query) {
  const params = new URLSearchParams({
    action: 'query',
    list: 'search',
    srsearch: query,
    srlimit: 3,
    format: 'json'
  });

  try {
    const result = await fetchWithRetry(`${WIKI_API}?${params}`);
    return result.query?.search || [];
  } catch (error) {
    console.error(`Search error for "${query}": ${error.message}`);
    return [];
  }
}

async function getArticleSummary(title) {
  const params = new URLSearchParams({
    action: 'query',
    titles: title,
    prop: 'extracts|info',
    exintro: true,
    explaintext: true,
    inprop: 'url',
    format: 'json'
  });

  try {
    const result = await fetchWithRetry(`${WIKI_API}?${params}`);
    const pages = result.query?.pages || {};
    const page = Object.values(pages)[0];

    if (page && !page.missing) {
      return {
        title: page.title,
        extract: page.extract,
        url: page.fullurl
      };
    }
  } catch (error) {
    console.error(`Summary error for "${title}": ${error.message}`);
  }
  return null;
}

function normalizeStreetName(name) {
  return name
    .replace(/,.*$/, '') // Remove everything after comma
    .replace(/^(AVENIDA|AV\.?|CALLE|PASAJE|PASEO)\s+/i, '')
    .trim();
}

async function findStreetArticle(streetName) {
  const baseName = normalizeStreetName(streetName);

  // Try different search patterns - be specific about Buenos Aires
  const queries = [
    `Calle ${baseName} Buenos Aires`,
    `Avenida ${baseName} Buenos Aires`
  ];

  for (const query of queries) {
    const results = await searchWikipedia(query);

    for (const result of results) {
      const title = result.title.toLowerCase();
      const baseNameLower = baseName.toLowerCase();
      const firstWord = baseNameLower.split(' ')[0];

      // Must be a street/avenue article
      if (!title.includes('calle') && !title.includes('avenida')) {
        continue;
      }

      // Must contain the street name
      if (!title.includes(firstWord)) {
        continue;
      }

      // Must be about Buenos Aires (check title or article content)
      const isBuenosAires = title.includes('buenos aires') ||
                           title.endsWith(firstWord) || // Simple name like "Calle Echeverría"
                           title.includes('(buenos aires)');

      // Reject if clearly from another city
      const otherCities = ['barcelona', 'madrid', 'alicante', 'tucumán', 'zaragoza', 'córdoba', 'rosario', 'mendoza'];
      const isOtherCity = otherCities.some(city => title.includes(city));

      if (isOtherCity) {
        continue;
      }

      const article = await getArticleSummary(result.title);
      if (article && article.extract && article.extract.length > 100) {
        // Double check the content mentions Buenos Aires
        const extractLower = article.extract.toLowerCase();
        if (extractLower.includes('buenos aires') ||
            extractLower.includes('ciudad de buenos aires') ||
            extractLower.includes('capital federal') ||
            extractLower.includes('ciudad autónoma')) {
          return article;
        }
      }
    }
  }

  return null;
}

async function enrichStreets() {
  console.log(`Processing ${data.streets.length} streets...\n`);

  let enriched = 0;
  let processed = 0;

  for (const street of data.streets) {
    processed++;

    // Skip if already has Wikipedia data
    if (street.wikipedia) {
      continue;
    }

    const article = await findStreetArticle(street.current_name);

    if (article) {
      street.wikipedia = {
        title: article.title,
        summary: article.extract.substring(0, 500) + (article.extract.length > 500 ? '...' : ''),
        url: article.url
      };
      enriched++;
      console.log(`[${processed}/${data.streets.length}] ✓ ${street.current_name} -> ${article.title}`);
    } else {
      if (processed % 50 === 0) {
        console.log(`[${processed}/${data.streets.length}] Processing...`);
      }
    }

    // Save progress every 100 streets
    if (processed % 100 === 0) {
      saveData();
    }

    await sleep(DELAY_MS);
  }

  saveData();
  console.log(`\nDone! Enriched ${enriched} streets with Wikipedia data.`);
}

function saveData() {
  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Run
enrichStreets().catch(console.error);
