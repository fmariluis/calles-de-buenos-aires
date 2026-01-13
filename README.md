# Calles de Buenos Aires - Historia

Interactive map showing the history and origin of Buenos Aires street names.

## Data Source

Street history data extracted from "Las calles de Buenos Aires. Sus nombres desde la fundación hasta nuestros días" by Alberto Gabriel Piñeiro, published by Instituto Histórico de la Ciudad de Buenos Aires (2003).

- 2,072 streets documented
- ~87% matched with OpenStreetMap geographic data

## Development

```bash
# Start local server
npm run dev

# Open http://localhost:8080
```

## Project Structure

```
├── public/           # Deployment folder
│   ├── index.html
│   ├── style.css
│   └── app.js
├── data/
│   ├── calles_buenos_aires_final.json  # Full historical data
│   ├── buenos_aires_streets.geojson    # OSM street geometry
│   └── calles_lookup.json              # Quick lookup table
└── scripts/
    ├── fetch_streets.js     # Fetch streets from OSM
    └── analyze_matching.js  # Analyze data matching
```

## Deployment (Cloudflare Pages)

1. Create a new project in Cloudflare Pages
2. Connect to your GitHub repository
3. Set build output directory to `public`
4. Copy `data/` folder contents to `public/data/` before deploying
