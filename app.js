// Accurate MRT geometry is loaded at runtime from Taipei City Open Data (GeoJSON/JSON).
// This keeps the repo lightweight and deployable on GitHub Pages.

const ROUTES_URL = "https://data.taipei/api/dataset/afccd2ac-75b1-4362-9099-45983e332776/resource/1139b06e-8128-4a07-8148-f27f038bd8b4/download";
const STATIONS_URL = "https://data.taipei/api/frontstage/tpeod/dataset/resource.download?rid=a63e3278-9d10-4916-9f24-e5a4d78afb31";

const statusBar = document.getElementById("statusBar");

const map = L.map("map", { zoomControl: true }).setView([25.033, 121.565], 12);

// Free tiles (OSM). Personal/light use OK. For heavy traffic, use a tile provider.
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "© OpenStreetMap contributors"
}).addTo(map);

// Layers
const routeLayer = L.layerGroup().addTo(map);
const stationLayer = L.layerGroup().addTo(map);
const spotLayer = L.layerGroup().addTo(map);

let stationFeatures = [];   // {name, lat, lng, props, layer}
let selectedStation = null;
let selectedCircle = null;

let activeCategories = new Set(); // empty => all
let searchTerm = "";

// ---------- Helpers ----------
function escapeHtml(s){
  return (s ?? "").toString().replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[c]));
}

function haversineMeters(lat1, lon1, lat2, lon2){
  const R = 6371000;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2-lat1);
  const dLon = toRad(lon2-lon1);
  const a =
    Math.sin(dLat/2)**2 +
    Math.cos(toRad(lat1))*Math.cos(toRad(lat2)) *
    Math.sin(dLon/2)**2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function googleDirectionsLink(lat, lng){
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}

function getRadius(){
  const el = document.getElementById("nearRadius");
  return parseInt(el.value, 10) || 1200;
}

function matchesSearch(name){
  if (!searchTerm) return true;
  return name.toLowerCase().includes(searchTerm.toLowerCase());
}

function categoryAllowed(cat){
  return activeCategories.size === 0 || activeCategories.has(cat);
}

function pickProp(props, keys){
  for (const k of keys){
    if (props && props[k] != null && props[k] !== "") return props[k];
  }
  return null;
}

function normalizeName(s){
  return (s ?? "").toString().trim();
}

// ---------- Tourist spots ----------
const categories = Array.from(new Set((window.TPE_SPOTS || []).map(s => s.category))).sort();
const filtersEl = document.getElementById("filters");

function renderFilters(){
  filtersEl.innerHTML = "";
  categories.forEach(cat=>{
    const pill = document.createElement("div");
    pill.className = "pill " + (activeCategories.has(cat) ? "on" : "");
    pill.textContent = cat;
    pill.onclick = () => {
      if (activeCategories.has(cat)) activeCategories.delete(cat);
      else activeCategories.add(cat);
      renderFilters();
      renderSpots();
      refreshPanelList();
    };
    filtersEl.appendChild(pill);
  });
}
renderFilters();

const spotMarkers = [];
function renderSpots(){
  spotLayer.clearLayers();
  spotMarkers.length = 0;

  (window.TPE_SPOTS || []).forEach(sp=>{
    if (!categoryAllowed(sp.category)) return;
    if (!matchesSearch(sp.name)) return;

    const mk = L.circleMarker([sp.lat, sp.lng], {
      radius: 7,
      color: "#1d2330",
      weight: 2,
      fillColor: "#3bd671",
      fillOpacity: 0.85
    }).bindPopup(
      `<b>${escapeHtml(sp.name)}</b><br><span style="color:#9aa3b2">${escapeHtml(sp.category)}</span>` +
      (sp.notes ? `<br><span style="color:#9aa3b2">${escapeHtml(sp.notes)}</span>` : "") +
      `<br><a target="_blank" rel="noopener" href="${googleDirectionsLink(sp.lat, sp.lng)}">Directions</a>`
    );

    mk.addTo(spotLayer);
    spotMarkers.push({ sp, mk });
  });
}
renderSpots();

// ---------- Side panel ----------
const sidepanel = document.getElementById("sidepanel");
const panelTitle = document.getElementById("panelTitle");
const panelSub = document.getElementById("panelSub");
const listEl = document.getElementById("list");

document.getElementById("closePanel").onclick = ()=> sidepanel.classList.remove("open");
function openPanel(){ sidepanel.classList.add("open"); }

// ---------- Load MRT data ----------
async function loadJson(url){
  const r = await fetch(url, { mode: "cors" });
  if (!r.ok) throw new Error(`Fetch failed: ${r.status} ${r.statusText}`);
  return await r.json();
}

function styleRouteFeature(feature){
  // We don't know exact schema; try to color by RouteName keywords.
  const props = feature.properties || {};
  const routeName = pickProp(props, ["RouteName","ROUTENAME","route_name","name","名稱","路线名称"]) || "";
  const n = routeName.toString().toLowerCase();

  // Taipei MRT line colors (approx). If route names differ, they still render.
  let color = "#7a869a";
  if (n.includes("板南") || n.includes("bannan") || n.includes("blue")) color = "#0070c0";
  else if (n.includes("淡水") || n.includes("信義") || n.includes("tamsui") || n.includes("xinyi") || n.includes("red")) color = "#d40000";
  else if (n.includes("松山") || n.includes("新店") || n.includes("songshan") || n.includes("xindian") || n.includes("green")) color = "#00a650";
  else if (n.includes("中和") || n.includes("新蘆") || n.includes("zhonghe") || n.includes("xinlu") || n.includes("orange")) color = "#ff7f00";
  else if (n.includes("文湖") || n.includes("wenhu") || n.includes("brown")) color = "#8a5a2b";
  else if (n.includes("環狀") || n.includes("circular") || n.includes("yellow")) color = "#ffd400";

  return { color, weight: 5, opacity: 0.85 };
}

function stationNameFromProps(props){
  // Try common keys seen in TW open data
  const name = pickProp(props, ["車站名稱","StationName","STATIONNAME","name","NAME","站名","station_name","中文站名","Station"]);
  return normalizeName(name) || "Station";
}

function toLatLng(geom){
  if (!geom) return null;
  // GeoJSON Point: [lng, lat]
  if (geom.type === "Point" && Array.isArray(geom.coordinates) && geom.coordinates.length >= 2){
    const [lng, lat] = geom.coordinates;
    if (typeof lat === "number" && typeof lng === "number") return { lat, lng };
  }
  return null;
}

async function loadMrt(){
  try{
    statusBar.textContent = "Loading MRT lines…";
    const routes = await loadJson(ROUTES_URL);

    // Expect GeoJSON FeatureCollection or array; handle both.
    const routeGeo = (routes && routes.type === "FeatureCollection") ? routes :
      (Array.isArray(routes)) ? { type:"FeatureCollection", features: routes } : routes;

    L.geoJSON(routeGeo, {
      style: styleRouteFeature,
      onEachFeature: (feature, layer)=>{
        const props = feature.properties || {};
        const rn = pickProp(props, ["RouteName","name","名稱"]) || "MRT Route";
        layer.bindPopup(`<b>${escapeHtml(rn)}</b>`);
      }
    }).addTo(routeLayer);

    statusBar.textContent = "Loading MRT stations…";
    const stations = await loadJson(STATIONS_URL);

    const stGeo = (stations && stations.type === "FeatureCollection") ? stations :
      (Array.isArray(stations)) ? { type:"FeatureCollection", features: stations } : stations;

    stationFeatures = [];
    L.geoJSON(stGeo, {
      pointToLayer: (feature, latlng)=>{
        const props = feature.properties || {};
        const name = stationNameFromProps(props);

        // Hide if doesn't match search
        const mk = L.circleMarker(latlng, {
          radius: 5,
          color: "#000",
          weight: 2,
          fillColor: "#fff",
          fillOpacity: 1
        });

        mk.on("click", ()=> selectStationByFeature({ name, lat: latlng.lat, lng: latlng.lng, props, layer: mk }));
        mk.bindPopup(`<b>${escapeHtml(name)}</b><br><span style="color:#9aa3b2">MRT Station</span>`);
        stationFeatures.push({ name, lat: latlng.lat, lng: latlng.lng, props, layer: mk });
        return mk;
      },
      // In case features are not points (rare), ignore.
      filter: (feature)=> feature && feature.geometry && feature.geometry.type === "Point"
    }).addTo(stationLayer);

    statusBar.textContent = `Loaded ${stationFeatures.length} stations + routes.`;
  } catch(err){
    console.error(err);
    statusBar.textContent = "Failed to load MRT data (CORS/network). See README for fallback options.";
  }
}

loadMrt();

// ---------- Station selection + nearby list ----------
function clearSelection(){
  selectedStation = null;
  if (selectedCircle){ map.removeLayer(selectedCircle); selectedCircle = null; }
  panelTitle.textContent = "No station selected";
  panelSub.textContent = "Tip: click a station marker.";
  listEl.innerHTML = "";
  sidepanel.classList.remove("open");
}

function selectStationByFeature(st){
  selectedStation = st;

  // Highlight selected marker
  stationFeatures.forEach(s=>{
    if (!s.layer) return;
    s.layer.setStyle({
      radius: (s === st) ? 8 : 5,
      fillColor: (s === st) ? "#ffef9a" : "#fff"
    });
  });

  map.setView([st.lat, st.lng], 15);
  drawNearbyCircle();
  refreshPanelList();
  openPanel();
}

function drawNearbyCircle(){
  if (selectedCircle) map.removeLayer(selectedCircle);
  if (!selectedStation) return;
  selectedCircle = L.circle([selectedStation.lat, selectedStation.lng], {
    radius: getRadius(),
    color: "#3bd671",
    weight: 2,
    fillOpacity: 0.08
  }).addTo(map);
}

document.getElementById("nearRadius").addEventListener("change", ()=>{
  if (!selectedStation) return;
  drawNearbyCircle();
  refreshPanelList();
});

function refreshPanelList(){
  if (!selectedStation) return;

  panelTitle.textContent = selectedStation.name;
  panelSub.textContent = `Showing spots within ${getRadius()}m (filtered).`;

  const radius = getRadius();
  const nearby = (window.TPE_SPOTS || [])
    .filter(sp => categoryAllowed(sp.category) && matchesSearch(sp.name))
    .map(sp => ({...sp, dist: haversineMeters(selectedStation.lat, selectedStation.lng, sp.lat, sp.lng)}))
    .filter(sp => sp.dist <= radius)
    .sort((a,b)=>a.dist-b.dist);

  if (nearby.length === 0){
    listEl.innerHTML = `<div class="item"><div class="name">No matches nearby.</div><div class="meta">Try a bigger radius or toggle categories.</div></div>`;
    return;
  }

  listEl.innerHTML = "";
  nearby.forEach(sp=>{
    const div = document.createElement("div");
    div.className = "item";
    div.innerHTML = `
      <div class="name">${escapeHtml(sp.name)}</div>
      <div class="meta">${escapeHtml(sp.category)} • ${(sp.dist/1000).toFixed(2)} km</div>
      <div class="actions">
        <a class="btn" href="#" data-lat="${sp.lat}" data-lng="${sp.lng}">View on map</a>
        <a class="btn" target="_blank" rel="noopener" href="${googleDirectionsLink(sp.lat, sp.lng)}">Directions</a>
      </div>
    `;
    listEl.appendChild(div);
  });

  listEl.querySelectorAll('a[data-lat]').forEach(a=>{
    a.addEventListener("click",(e)=>{
      e.preventDefault();
      const lat = parseFloat(a.getAttribute("data-lat"));
      const lng = parseFloat(a.getAttribute("data-lng"));
      map.setView([lat, lng], 16);
      // open popup if exists
      const found = spotMarkers.find(x => x.sp.lat === lat && x.sp.lng === lng);
      if (found) found.mk.openPopup();
    });
  });
}

// ---------- Search ----------
document.getElementById("search").addEventListener("input", (e)=>{
  searchTerm = (e.target.value || "").trim();

  // Update spots layer
  renderSpots();

  // Dim stations based on search
  stationFeatures.forEach(st=>{
    if (!st.layer) return;
    const show = matchesSearch(st.name);
    st.layer.setStyle({ fillOpacity: show ? 1 : 0.15, opacity: show ? 1 : 0.2 });
  });

  refreshPanelList();
});

// ---------- Reset ----------
document.getElementById("resetBtn").onclick = ()=>{
  document.getElementById("search").value = "";
  searchTerm = "";
  activeCategories.clear();
  renderFilters();
  renderSpots();

  // Restore station styles
  stationFeatures.forEach(st=>{
    if (!st.layer) return;
    st.layer.setStyle({ radius: 5, fillColor:"#fff", fillOpacity:1, opacity:1 });
  });

  if (selectedCircle){ map.removeLayer(selectedCircle); selectedCircle = null; }
  selectedStation = null;
  sidepanel.classList.remove("open");

  map.setView([25.033, 121.565], 12);
  statusBar.textContent = statusBar.textContent || "Ready.";
};
