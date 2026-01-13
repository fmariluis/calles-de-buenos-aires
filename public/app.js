// Buenos Aires street history map
let map;
let streetData = {};
let streetsLayer;

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

          if (historyData) {
            layer.setStyle({ color: '#38a169', weight: 3 });
            layer.on('click', () => showStreetInfo(historyData));
            layer.bindTooltip(streetName, { sticky: true });
          }
        }
      }
    }).addTo(map);

    console.log('Streets layer loaded');
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
