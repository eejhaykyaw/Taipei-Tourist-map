# Taipei MRT Tourist Map (Accurate MRT Geometry) — GitHub Pages Ready

This is a **static** interactive tourist map for **Taipei**:
- Accurate MRT **lines + station points** are loaded from **Taipei City Open Data** at runtime.
- Tourist spots are a curated list you can edit in `spots.js`.
- Works on GitHub Pages (free).

## Deploy (GitHub Pages)
1. Create a GitHub repo
2. Upload all files in this folder (index.html, style.css, app.js, spots.js, README.md) to repo root
3. Repo → Settings → Pages
4. Source: Deploy from a branch
5. Branch: main, Folder: /(root)
6. Open the Pages URL

## Data sources (MRT geometry)
The app fetches MRT geometry from:
- Route network GIS map (lines): `ROUTES_URL` in `app.js`
- Station point GIS map: `STATIONS_URL` in `app.js`

If the MRT data fails to load, it’s usually one of:
- Your network blocks the domain
- CORS restrictions (rare, but possible if the provider changes headers)
- The dataset endpoint changes

### Fallback (if CORS ever breaks)
If CORS breaks in the future, the fix is simple:
1. Download the two JSON files from the URLs in `app.js`
2. Put them in the repo (e.g., `data/routes.json` and `data/stations.json`)
3. Change `ROUTES_URL` and `STATIONS_URL` to local paths (e.g., `./data/routes.json`)

## Edit / add more tourist spots
Open `spots.js` and add objects:
```js
{ name:"Spot name", category:"Park", lat:25.x, lng:121.x, notes:"optional" }
```

## License
Your code: MIT (suggested).
MRT geometry: See Taipei City Open Data licensing.
Map tiles: OpenStreetMap contributors (see attribution on map).
