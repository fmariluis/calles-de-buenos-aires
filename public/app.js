// Buenos Aires street history map

// Configuration constants
const CONFIG = {
  MIN_SEARCH_LENGTH: 2,
  MAX_SEARCH_RESULTS: 10,
  DEBOUNCE_MS: 200,
  MAP_CENTER: [-34.6037, -58.3816],
  MAP_DEFAULT_ZOOM: 13,
  MAP_MAX_ZOOM: 16,
  MAP_PADDING: [50, 50],
  COLORS: {
    DEFAULT: '#3182ce',
    WITH_HISTORY: '#38a169',
    HIGHLIGHT: '#e53e3e',
    LOCATION: '#e53e3e'
  },
  // Buenos Aires bounding box for geolocation validation
  BOUNDS: {
    SOUTH: -34.71,
    NORTH: -34.52,
    WEST: -58.54,
    EAST: -58.33
  }
};

let map;
let streetData = {};
let streetsLayer;
let streetLayers = {}; // Map street names to their layers for highlighting
let allStreetNames = []; // For search
let highlightedLayer = null;
let searchSelectedIndex = -1; // For keyboard navigation
let locationMarker = null; // For geolocation

// URL/Permalink utilities
function getStreetFromURL() {
  const params = new URLSearchParams(window.location.search);
  return params.get('street');
}

function updateURL(streetName) {
  const url = new URL(window.location);
  if (streetName) {
    url.searchParams.set('street', streetName);
  } else {
    url.searchParams.delete('street');
  }
  history.pushState({ street: streetName }, '', url);
}

function clearURLStreet() {
  const url = new URL(window.location);
  url.searchParams.delete('street');
  history.pushState({}, '', url);
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Validate Wikipedia URLs
function isValidWikipediaUrl(url) {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.hostname.endsWith('wikipedia.org') && parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

// Show error message to user
function showError(message) {
  const errorEl = document.getElementById('error-message');
  if (errorEl) {
    errorEl.textContent = message;
    errorEl.classList.remove('hidden');
  }
}

// Debounce function for search
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Geolocation functions
function isWithinBuenosAires(lat, lng) {
  return lat >= CONFIG.BOUNDS.SOUTH && lat <= CONFIG.BOUNDS.NORTH &&
         lng >= CONFIG.BOUNDS.WEST && lng <= CONFIG.BOUNDS.EAST;
}

function initGeolocation() {
  if (!navigator.geolocation) {
    console.log('Geolocation not supported');
    return;
  }

  // Create custom control for geolocation button
  const GeolocationControl = L.Control.extend({
    options: { position: 'topleft' },
    onAdd: function() {
      const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
      const button = L.DomUtil.create('a', 'geolocation-button', container);
      button.href = '#';
      button.title = 'Mi ubicación';
      button.setAttribute('role', 'button');
      button.setAttribute('aria-label', 'Centrar mapa en mi ubicación');
      button.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3A8.994 8.994 0 0 0 13 3.06V1h-2v2.06A8.994 8.994 0 0 0 3.06 11H1v2h2.06A8.994 8.994 0 0 0 11 20.94V23h2v-2.06A8.994 8.994 0 0 0 20.94 13H23v-2h-2.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z"/></svg>';

      L.DomEvent.on(button, 'click', function(e) {
        L.DomEvent.preventDefault(e);
        L.DomEvent.stopPropagation(e);
        locateUser();
      });

      return container;
    }
  });

  map.addControl(new GeolocationControl());
}

function locateUser() {
  const button = document.querySelector('.geolocation-button');
  if (button) button.classList.add('loading');

  navigator.geolocation.getCurrentPosition(
    (position) => {
      if (button) button.classList.remove('loading');
      const { latitude, longitude } = position.coords;

      if (!isWithinBuenosAires(latitude, longitude)) {
        showLocationMessage('Tu ubicación está fuera de Buenos Aires');
        return;
      }

      // Remove existing marker
      if (locationMarker) {
        map.removeLayer(locationMarker);
      }

      // Add marker at user's location
      locationMarker = L.circleMarker([latitude, longitude], {
        radius: 8,
        fillColor: CONFIG.COLORS.LOCATION,
        color: '#fff',
        weight: 2,
        opacity: 1,
        fillOpacity: 0.8
      }).addTo(map);

      locationMarker.bindPopup('Tu ubicación').openPopup();
      map.setView([latitude, longitude], 15);
    },
    (error) => {
      if (button) button.classList.remove('loading');
      let message;
      switch (error.code) {
        case error.PERMISSION_DENIED:
          message = 'Permiso de ubicación denegado';
          break;
        case error.POSITION_UNAVAILABLE:
          message = 'Ubicación no disponible';
          break;
        case error.TIMEOUT:
          message = 'Tiempo de espera agotado';
          break;
        default:
          message = 'Error al obtener ubicación';
      }
      showLocationMessage(message);
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
  );
}

function showLocationMessage(message) {
  // Create a temporary notification
  const notification = document.createElement('div');
  notification.className = 'location-notification';
  notification.textContent = message;
  document.body.appendChild(notification);

  setTimeout(() => {
    notification.classList.add('fade-out');
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

// Initialize the map centered on Buenos Aires
function initMap() {
  map = L.map('map').setView(CONFIG.MAP_CENTER, CONFIG.MAP_DEFAULT_ZOOM);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);

  // Add geolocation control
  initGeolocation();

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
    showError('Error al cargar los datos de las calles. Por favor, recarga la página.');
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
        color: CONFIG.COLORS.DEFAULT,
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
            layer.setStyle({ color: CONFIG.COLORS.WITH_HISTORY, weight: 3 });
            layer.on('click', () => {
              selectStreet(streetName);
            });
            layer.bindTooltip(streetName, { sticky: true });
          } else {
            // Show tooltip for streets without history
            layer.bindTooltip(`${streetName} (sin información histórica)`, { sticky: true });
            layer.on('click', () => {
              selectStreet(streetName);
            });
          }
        }
      }
    }).addTo(map);

    // Build searchable street list
    allStreetNames = Array.from(streetNamesSet).sort();
    console.log(`Streets layer loaded with ${allStreetNames.length} unique names`);

    // Initialize search
    initSearch();

    // Check for street in URL (permalink)
    const urlStreet = getStreetFromURL();
    if (urlStreet) {
      // Find the matching street name (case-insensitive)
      const matchedStreet = allStreetNames.find(name =>
        name.toLowerCase() === urlStreet.toLowerCase()
      );
      if (matchedStreet) {
        selectStreet(matchedStreet, false); // Don't update URL since we're loading from it
      }
    }
  } catch (error) {
    console.log('Could not load streets GeoJSON:', error.message);
  }
}

// Show message for streets without historical data
function showNoHistoryMessage(streetName) {
  const panel = document.getElementById('info-panel');
  const nameEl = document.getElementById('street-name');
  const historyEl = document.getElementById('street-history');

  nameEl.textContent = streetName;
  historyEl.innerHTML = `
    <div class="section">
      <p class="no-history-message">No hay información histórica disponible para esta calle en nuestra base de datos.</p>
      <p style="margin-top: 10px; font-size: 0.9rem; color: #666;">
        Las calles en <span style="color: ${CONFIG.COLORS.WITH_HISTORY}; font-weight: bold;">verde</span> tienen información histórica.
      </p>
    </div>
    ${createShareButton(streetName)}
  `;
  panel.classList.remove('hidden');
  panel.focus();
  attachShareHandler();
}

// Create share button HTML
function createShareButton(streetName) {
  return `
    <div class="share-section">
      <button class="share-button" data-street="${escapeHtml(streetName)}" aria-label="Copiar enlace para compartir">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
          <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z"/>
        </svg>
        Compartir
      </button>
    </div>
  `;
}

// Attach share button click handler
function attachShareHandler() {
  const shareBtn = document.querySelector('.share-button');
  if (shareBtn) {
    shareBtn.addEventListener('click', async () => {
      const url = window.location.href;
      try {
        if (navigator.share) {
          await navigator.share({ title: document.title, url });
        } else {
          await navigator.clipboard.writeText(url);
          shareBtn.textContent = '¡Enlace copiado!';
          setTimeout(() => {
            shareBtn.innerHTML = `
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z"/>
              </svg>
              Compartir
            `;
          }, 2000);
        }
      } catch (err) {
        console.error('Error sharing:', err);
      }
    });
  }
}

// Show street information in the panel
function showStreetInfo(street, streetName) {
  const panel = document.getElementById('info-panel');
  const nameEl = document.getElementById('street-name');
  const historyEl = document.getElementById('street-history');

  nameEl.textContent = street.current_name;

  let html = '';

  // Description
  if (street.description) {
    html += `<div class="section">
      <div class="section-title">Historia</div>
      <p>${escapeHtml(street.description)}</p>
    </div>`;
  }

  // Legal basis
  if (street.legal_basis) {
    html += `<div class="section">
      <div class="section-title">Base legal</div>
      <p>${escapeHtml(street.legal_basis)}</p>
    </div>`;
  }

  // Previous names
  const previousNames = street.previous_names || street.old_names || [];
  if (previousNames.length > 0) {
    html += `<div class="section previous-names">
      <div class="section-title">Nombres anteriores</div>`;

    previousNames.forEach(name => {
      if (typeof name === 'string') {
        html += `<span class="previous-name">${escapeHtml(name)}</span>`;
      } else if (name.name) {
        html += `<span class="previous-name">${escapeHtml(name.name)}</span>`;
        if (name.description) {
          html += `<p style="margin-top: 8px; font-size: 0.9rem;">${escapeHtml(name.description)}</p>`;
        }
      }
    });

    html += '</div>';
  }

  // Wikipedia info
  if (street.wikipedia && isValidWikipediaUrl(street.wikipedia.url)) {
    html += `<div class="section wikipedia-section">
      <div class="section-title">Wikipedia</div>
      <p>${escapeHtml(street.wikipedia.summary)}</p>
      <a href="${escapeHtml(street.wikipedia.url)}" target="_blank" rel="noopener noreferrer" class="wikipedia-link">Leer más en Wikipedia →</a>
    </div>`;
  }

  // Share button
  html += createShareButton(streetName || street.current_name);

  historyEl.innerHTML = html;
  panel.classList.remove('hidden');
  panel.focus();
  attachShareHandler();
}

// Close the info panel
function clearHighlightedStreet() {
  if (highlightedLayer && previousStreetName) {
    const prevNormalized = normalizeStreetName(previousStreetName);
    const hadHistory = !!streetData[prevNormalized];
    highlightedLayer.forEach(layer => {
      layer.setStyle({
        color: hadHistory ? CONFIG.COLORS.WITH_HISTORY : CONFIG.COLORS.DEFAULT,
        weight: hadHistory ? 3 : 2
      });
    });
    highlightedLayer = null;
    previousStreetName = null;
  }
}

function closePanel({ shouldUpdateUrl = true } = {}) {
  document.getElementById('info-panel').classList.add('hidden');
  clearHighlightedStreet();
  if (shouldUpdateUrl) {
    clearURLStreet();
  }
}

function hideLoading() {
  document.getElementById('loading').classList.add('hidden');
}

// Search functionality
function initSearch() {
  const input = document.getElementById('search-input');
  const results = document.getElementById('search-results');

  // Debounced search handler
  const debouncedSearch = debounce((query) => {
    if (query.length < CONFIG.MIN_SEARCH_LENGTH) {
      results.classList.remove('visible');
      return;
    }
    showSearchResults(query);
  }, CONFIG.DEBOUNCE_MS);

  input.addEventListener('input', (e) => {
    searchSelectedIndex = -1;
    debouncedSearch(e.target.value.trim());
  });

  input.addEventListener('focus', () => {
    if (input.value.trim().length >= CONFIG.MIN_SEARCH_LENGTH) {
      results.classList.add('visible');
    }
  });

  // Keyboard navigation for search results
  input.addEventListener('keydown', (e) => {
    const items = results.querySelectorAll('.search-result-item[data-street]');
    if (items.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      searchSelectedIndex = Math.min(searchSelectedIndex + 1, items.length - 1);
      updateSearchSelection(items);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      searchSelectedIndex = Math.max(searchSelectedIndex - 1, -1);
      updateSearchSelection(items);
    } else if (e.key === 'Enter' && searchSelectedIndex >= 0) {
      e.preventDefault();
      const streetName = items[searchSelectedIndex].dataset.street;
      selectStreet(streetName);
      results.classList.remove('visible');
      input.value = streetName;
      searchSelectedIndex = -1;
    }
  });

  // Event delegation for search results (fixes memory leak)
  results.addEventListener('click', (e) => {
    const item = e.target.closest('.search-result-item[data-street]');
    if (item) {
      const streetName = item.dataset.street;
      selectStreet(streetName);
      results.classList.remove('visible');
      input.value = streetName;
    }
  });

  // Hide results when clicking outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#search-container')) {
      results.classList.remove('visible');
      searchSelectedIndex = -1;
    }
  });
}

// Update visual selection in search results
function updateSearchSelection(items) {
  items.forEach((item, index) => {
    if (index === searchSelectedIndex) {
      item.classList.add('selected');
      item.setAttribute('aria-selected', 'true');
      item.scrollIntoView({ block: 'nearest' });
    } else {
      item.classList.remove('selected');
      item.setAttribute('aria-selected', 'false');
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
  }).slice(0, CONFIG.MAX_SEARCH_RESULTS);

  searchSelectedIndex = -1;

  if (matches.length === 0) {
    results.innerHTML = '<div class="search-result-item" role="option">No se encontraron calles</div>';
  } else {
    results.innerHTML = matches.map((name, index) => {
      const normalizedName = normalizeStreetName(name);
      const hasHistory = !!streetData[normalizedName];
      return `
        <div class="search-result-item" data-street="${escapeHtml(name)}" role="option" aria-selected="false" id="search-option-${index}">
          <span class="street-name">${escapeHtml(name)}</span>
          ${hasHistory ? '<span class="has-history">con historia</span>' : ''}
        </div>
      `;
    }).join('');
  }

  results.classList.add('visible');
}

let previousStreetName = null;

function selectStreet(streetName, shouldUpdateURL = true) {
  // Clear previous highlight
  if (highlightedLayer && previousStreetName) {
    const prevNormalized = normalizeStreetName(previousStreetName);
    const hadHistory = !!streetData[prevNormalized];
    highlightedLayer.forEach(layer => {
      layer.setStyle({
        color: hadHistory ? CONFIG.COLORS.WITH_HISTORY : CONFIG.COLORS.DEFAULT,
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
      layer.setStyle({ color: CONFIG.COLORS.HIGHLIGHT, weight: 5 });
      bounds.extend(layer.getBounds());
    });
    highlightedLayer = layers;
    previousStreetName = streetName;

    // Update URL for sharing
    if (shouldUpdateURL) {
      updateURL(streetName);
    }

    // Zoom to street
    map.fitBounds(bounds, { padding: CONFIG.MAP_PADDING, maxZoom: CONFIG.MAP_MAX_ZOOM });

    // Show info (with or without history)
    const normalizedName = normalizeStreetName(streetName);
    const historyData = streetData[normalizedName];
    if (historyData) {
      showStreetInfo(historyData, streetName);
    } else {
      showNoHistoryMessage(streetName);
    }
  }
}

// Event listeners
document.getElementById('close-panel').addEventListener('click', closePanel);

// Track element that opened modal for focus restoration
let previouslyFocusedElement = null;

// About modal
document.getElementById('about-link').addEventListener('click', (e) => {
  e.preventDefault();
  previouslyFocusedElement = document.activeElement;
  const modal = document.getElementById('about-modal');
  modal.classList.remove('hidden');
  document.getElementById('close-about').focus();
});

function closeAboutModal() {
  document.getElementById('about-modal').classList.add('hidden');
  if (previouslyFocusedElement) {
    previouslyFocusedElement.focus();
    previouslyFocusedElement = null;
  }
}

document.getElementById('close-about').addEventListener('click', closeAboutModal);

document.getElementById('about-modal').addEventListener('click', (e) => {
  if (e.target.id === 'about-modal') {
    closeAboutModal();
  }
});

// Focus trap for about modal
document.getElementById('about-content').addEventListener('keydown', (e) => {
  if (e.key === 'Tab') {
    const focusableElements = document.getElementById('about-content').querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    if (e.shiftKey && document.activeElement === firstElement) {
      e.preventDefault();
      lastElement.focus();
    } else if (!e.shiftKey && document.activeElement === lastElement) {
      e.preventDefault();
      firstElement.focus();
    }
  }
});

// Close panels with Escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closePanel();
    if (!document.getElementById('about-modal').classList.contains('hidden')) {
      closeAboutModal();
    }
  }
});

// Handle browser back/forward navigation
window.addEventListener('popstate', (event) => {
  const streetName = event.state?.street || getStreetFromURL();
  if (streetName) {
    const matchedStreet = allStreetNames.find(name =>
      name.toLowerCase() === streetName.toLowerCase()
    );
    if (matchedStreet) {
      selectStreet(matchedStreet, false);
    }
  } else {
    // No street in URL, close panel and clear highlight
    closePanel({ shouldUpdateUrl: false });
  }
});

// Initialize
initMap();
