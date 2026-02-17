const statusBar = document.getElementById("statusBar");

// Map init
const map = L.map("map", { zoomControl: true }).setView([25.05, 121.55], 11);

// Basemaps (English options)
const basemaps = {
  carto_light: L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
    maxZoom: 20,
    attribution: "© OpenStreetMap contributors © CARTO"
  }),
  carto_voyager: L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
    maxZoom: 20,
    attribution: "© OpenStreetMap contributors © CARTO"
  }),
  esri: L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}", {
    maxZoom: 19,
    attribution: "Tiles © Esri"
  }),
  osm: L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "© OpenStreetMap contributors"
  })
};

let activeBase = basemaps.carto_light.addTo(map);

// Marker clustering (keeps map usable when many spots are shown)
const cluster = L.markerClusterGroup({
  showCoverageOnHover: false,
  maxClusterRadius: 50
});
map.addLayer(cluster);

// UI state
let activeCategories = new Set(); // empty = all
let searchTerm = "";

// Helpers
function escapeHtml(s){
  return (s ?? "").toString().replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[c]));
}
function googleDirectionsLink(lat, lng){
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}
function matchesSearch(name, category, notes){
  if (!searchTerm) return true;
  const q = searchTerm.toLowerCase();
  return (name || "").toLowerCase().includes(q) ||
         (category || "").toLowerCase().includes(q) ||
         (notes || "").toLowerCase().includes(q);
}
function categoryAllowed(cat){
  return activeCategories.size === 0 || activeCategories.has(cat);
}

// Build categories
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
      renderMarkers();
      renderList();
    };
    filtersEl.appendChild(pill);
  });
}
renderFilters();

// Suggestions (datalist)
const suggestionsEl = document.getElementById("suggestions");
function renderSuggestions(){
  suggestionsEl.innerHTML = "";
  const items = (window.TPE_SPOTS || []).slice(0);
  // add categories as suggestions too
  categories.forEach(c => items.push({name:c}));
  items.slice(0, 250).forEach(x=>{
    const o = document.createElement("option");
    o.value = x.name;
    suggestionsEl.appendChild(o);
  });
}
renderSuggestions();

// Markers
let markerIndex = []; // {spot, marker}
function renderMarkers(){
  cluster.clearLayers();
  markerIndex = [];

  (window.TPE_SPOTS || []).forEach(sp=>{
    if (!categoryAllowed(sp.category)) return;
    if (!matchesSearch(sp.name, sp.category, sp.notes)) return;

    const marker = L.marker([sp.lat, sp.lng]);
    const popup =
      `<b>${escapeHtml(sp.name)}</b><br>` +
      `<span style="color:#9aa3b2">${escapeHtml(sp.category)}</span>` +
      (sp.notes ? `<br><span style="color:#9aa3b2">${escapeHtml(sp.notes)}</span>` : "") +
      `<br><a target="_blank" rel="noopener" href="${googleDirectionsLink(sp.lat, sp.lng)}">Directions</a>`;
    marker.bindPopup(popup);

    cluster.addLayer(marker);
    markerIndex.push({ sp, marker });
  });

  statusBar.textContent = `Showing ${markerIndex.length} spots` +
    (activeCategories.size ? ` • Filtered: ${Array.from(activeCategories).join(", ")}` : "") +
    (searchTerm ? ` • Search: "${searchTerm}"` : "");
}
renderMarkers();

// Side list
const sidepanel = document.getElementById("sidepanel");
const panelTitle = document.getElementById("panelTitle");
const panelSub = document.getElementById("panelSub");
const listEl = document.getElementById("list");
document.getElementById("closePanel").onclick = ()=> sidepanel.classList.remove("open");

function renderList(){
  panelTitle.textContent = "All spots";
  panelSub.textContent = "Tap an item to focus it. Use filters/search to narrow.";

  const items = markerIndex.map(x => x.sp);

  listEl.innerHTML = "";
  items.slice(0, 250).forEach(sp=>{
    const div = document.createElement("div");
    div.className = "item";
    div.innerHTML = `
      <div class="name">${escapeHtml(sp.name)}</div>
      <div class="meta">${escapeHtml(sp.category)}</div>
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
      map.setView([lat, lng], 15);

      // open popup if marker exists
      const found = markerIndex.find(x => x.sp.lat === lat && x.sp.lng === lng);
      if (found){
        found.marker.openPopup();
      }
      // show panel on mobile if needed
      sidepanel.classList.add("open");
    });
  });
}
renderList();

// Search
document.getElementById("search").addEventListener("input", (e)=>{
  searchTerm = (e.target.value || "").trim();
  renderMarkers();
  renderList();
});

// Basemap toggle
document.getElementById("basemap").addEventListener("change", (e)=>{
  const v = e.target.value;
  if (activeBase) map.removeLayer(activeBase);
  activeBase = (basemaps[v] || basemaps.carto_light).addTo(map);
});

// Reset
document.getElementById("resetBtn").onclick = ()=>{
  document.getElementById("search").value = "";
  searchTerm = "";
  activeCategories.clear();
  renderFilters();
  renderMarkers();
  renderList();
  map.setView([25.05, 121.55], 11);
};

// Auto-open list on desktop, hide on mobile by default
if (window.innerWidth > 820){
  sidepanel.classList.add("open");
}
statusBar.textContent = "Ready.";
