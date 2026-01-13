// Buenos Aires street history map
let map;
let streetData = {};
let streetsLayer;
let streetLayers = {}; // Map street names to their layers for highlighting
let allStreetNames = []; // For search
let highlightedLayer = null;

// Initialize the map centered on Buenos Aires
function initMap() {
  map = L.map('map').setView([-34.6037, -58.3816], 13);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);

  // Load street data
  loadStreetData();
}

// Load the historical street data
async function loadStreetData() {
  try {
    const response = await fetch('./data/calles_buenos_aires_final.json');
    const data = await response.json();

    // Create lookup by all normalized variants of street name
    data.streets.forEach(street => {
      const variants = getNameVariants(street.current_name);
      variants.forEach(variant => {
        if (!streetData[variant]) {
          streetData[variant] = street;
        }
      });
    });

    console.log(`Loaded ${data.streets.length} streets with ${Object.keys(streetData).length} lookup keys`);

    // Load GeoJSON streets if available
    await loadStreetsGeoJSON();

    hideLoading();
  } catch (error) {
    console.error('Error loading street data:', error);
    hideLoading();
  }
}

// Normalize street name for matching
function normalizeStreetName(name) {
  if (!name) return '';
  let n = name
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove accents
    .replace(/[,.]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Remove common prefixes
  n = n.replace(/^(AVENIDA|AV\.?|CALLE|PASAJE|PASEO)\s+/i, '');

  // Remove titles
  n = n.replace(/\b(DOCTOR|DR\.?|CORONEL|GENERAL|TENIENTE|CAPITAN|ALMIRANTE|INGENIERO|ING\.?|PRESIDENTE|DIPUTADO NACIONAL|MECANICO MILITAR)\s+/gi, '');

  return n;
}

// Get all possible normalized forms of a name
function getNameVariants(name) {
  const variants = new Set();
  const base = normalizeStreetName(name);
  variants.add(base);

  // For "LASTNAME, FIRSTNAME" pattern, also try "FIRSTNAME LASTNAME"
  if (name.includes(', ')) {
    const parts = name.split(', ');
    if (parts.length === 2) {
      const reversed = `${parts[1]} ${parts[0]}`;
      variants.add(normalizeStreetName(reversed));
    }
  }

  // Try just the last part after comma
  if (name.includes(', ')) {
    variants.add(normalizeStreetName(name.split(', ')[0]));
  }

  return variants;
}

// Load Buenos Aires streets GeoJSON
async function loadStreetsGeoJSON() {
  try {
    const response = await fetch('./data/buenos_aires_streets.geojson');
    if (!response.ok) {
      console.log('Streets GeoJSON not found - click on map to see instructions');
      return;
    }

    const geojson = await response.json();

    const streetNamesSet = new Set();

    streetsLayer = L.geoJSON(geojson, {
      style: {
        color: '#3182ce',
        weight: 2,
        opacity: 0.7
      },
      onEachFeature: (feature, layer) => {
        const streetName = feature.properties.name;
        if (streetName) {
          const normalizedName = normalizeStreetName(streetName);
          const historyData = streetData[normalizedName];

          // Track layers by street name for search/highlight
          if (!streetLayers[streetName]) {
            streetLayers[streetName] = [];
          }
          streetLayers[streetName].push(layer);
          streetNamesSet.add(streetName);

          if (historyData) {
            layer.setStyle({ color: '#38a169', weight: 3 });
            layer.on('click', () => showStreetInfo(historyData));
            layer.bindTooltip(streetName, { sticky: true });
          }
        }
      }
    }).addTo(map);

    // Build searchable street list
    allStreetNames = Array.from(streetNamesSet).sort();
    console.log(`Streets layer loaded with ${allStreetNames.length} unique names`);

    // Initialize search
    initSearch();
  } catch (error) {
    console.log('Could not load streets GeoJSON:', error.message);
  }
}

// Show street information in the panel
function showStreetInfo(street) {
  const panel = document.getElementById('info-panel');
  const nameEl = document.getElementById('street-name');
  const historyEl = document.getElementById('street-history');

  nameEl.textContent = street.current_name;

  let html = '';

  // Description
  if (street.description) {
    html += `<div class="section">
      <div class="section-title">Historia</div>
      <p>${street.description}</p>
    </div>`;
  }

  // Legal basis
  if (street.legal_basis) {
    html += `<div class="section">
      <div class="section-title">Base legal</div>
      <p>${street.legal_basis}</p>
    </div>`;
  }

  // Previous names
  const previousNames = street.previous_names || street.old_names || [];
  if (previousNames.length > 0) {
    html += `<div class="section previous-names">
      <div class="section-title">Nombres anteriores</div>`;

    previousNames.forEach(name => {
      if (typeof name === 'string') {
        html += `<span class="previous-name">${name}</span>`;
      } else if (name.name) {
        html += `<span class="previous-name">${name.name}</span>`;
        if (name.description) {
          html += `<p style="margin-top: 8px; font-size: 0.9rem;">${name.description}</p>`;
        }
      }
    });

    html += '</div>';
  }

  historyEl.innerHTML = html;
  panel.classList.remove('hidden');
}

// Close the info panel
function closePanel() {
  document.getElementById('info-panel').classList.add('hidden');
}

function hideLoading() {
  document.getElementById('loading').classList.add('hidden');
}

// Search functionality
function initSearch() {
  const input = document.getElementById('search-input');
  const results = document.getElementById('search-results');

  input.addEventListener('input', (e) => {
    const query = e.target.value.trim();
    if (query.length < 2) {
      results.classList.remove('visible');
      return;
    }
    showSearchResults(query);
  });

  input.addEventListener('focus', () => {
    if (input.value.trim().length >= 2) {
      results.classList.add('visible');
    }
  });

  // Hide results when clicking outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#search-container')) {
      results.classList.remove('visible');
    }
  });
}

function showSearchResults(query) {
  const results = document.getElementById('search-results');
  const normalizedQuery = normalizeStreetName(query);

  // Filter streets matching the query
  const matches = allStreetNames.filter(name => {
    const normalized = normalizeStreetName(name);
    return normalized.includes(normalizedQuery);
  }).slice(0, 10); // Limit to 10 results

  if (matches.length === 0) {
    results.innerHTML = '<div class="search-result-item">No se encontraron calles</div>';
  } else {
    results.innerHTML = matches.map(name => {
      const normalizedName = normalizeStreetName(name);
      const hasHistory = !!streetData[normalizedName];
      return `
        <div class="search-result-item" data-street="${name}">
          <span class="street-name">${name}</span>
          ${hasHistory ? '<span class="has-history">con historia</span>' : ''}
        </div>
      `;
    }).join('');

    // Add click handlers
    results.querySelectorAll('.search-result-item[data-street]').forEach(item => {
      item.addEventListener('click', () => {
        const streetName = item.dataset.street;
        selectStreet(streetName);
        results.classList.remove('visible');
        document.getElementById('search-input').value = streetName;
      });
    });
  }

  results.classList.add('visible');
}

let previousStreetName = null;

function selectStreet(streetName) {
  // Clear previous highlight
  if (highlightedLayer && previousStreetName) {
    const prevNormalized = normalizeStreetName(previousStreetName);
    const hadHistory = !!streetData[prevNormalized];
    highlightedLayer.forEach(layer => {
      layer.setStyle({
        color: hadHistory ? '#38a169' : '#3182ce',
        weight: hadHistory ? 3 : 2
      });
    });
  }

  // Highlight selected street
  const layers = streetLayers[streetName];
  if (layers && layers.length > 0) {
    // Calculate bounds of all segments
    const bounds = L.latLngBounds();
    layers.forEach(layer => {
      layer.setStyle({ color: '#e53e3e', weight: 5 });
      bounds.extend(layer.getBounds());
    });
    highlightedLayer = layers;
    previousStreetName = streetName;

    // Zoom to street
    map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });

    // Show info if has history
    const normalizedName = normalizeStreetName(streetName);
    const historyData = streetData[normalizedName];
    if (historyData) {
      showStreetInfo(historyData);
    }
  }
}

// Event listeners
document.getElementById('close-panel').addEventListener('click', closePanel);

// Close panel with Escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closePanel();
  }
});

// Initialize
initMap();
