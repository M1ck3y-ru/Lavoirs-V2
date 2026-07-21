// Lavoirs V2 — géolocalisation temps réel + lavoirs à proximité + itinéraire
// Données : OpenStreetMap Overpass API (tag amenity=lavoir). Routing : OSRM démo publique.

const DEFAULT_CENTER = { lat: 48.8566, lng: 2.3522 }; // Paris, position de secours
const MAX_RADIUS_M = 30000;
const RELOAD_THRESHOLD_M = 300; // ne recharge les lavoirs que si la position a bougé d'au moins ça
const MANUAL_MODE_LABEL_IDLE = 'Définir une position manuellement';
const MANUAL_MODE_LABEL_ARMED = 'Cliquez sur la carte pour définir votre position…';

const COMMONS_API = 'https://commons.wikimedia.org/w/api.php';
const WIKIDATA_API = 'https://www.wikidata.org/w/api.php';
// Rayon élargi car le repli geosearch est maintenant filtré par pertinence
// (mot-clé dans le titre) plutôt que de prendre la photo la plus proche sans distinction.
const PHOTO_GEOSEARCH_RADIUS_M = 1000;
const PHOTO_GEOSEARCH_CANDIDATES = 10; // pool élargi avant filtrage par pertinence
const PHOTO_RELEVANCE_KEYWORDS = /lavoir|laundry|wash.?house/i;
const MAX_PHOTOS = 3;
let photosRequestId = 0; // ignore les réponses tardives d'une sélection déjà remplacée
const photosCache = new Map(); // lavoir.id -> photos[], évite de re-interroger Commons en resélectionnant

// Couleurs lues depuis les CSS custom properties (:root dans style.css) —
// source de vérité unique, pas de duplication JS/CSS.
let COLORS = {};

const state = {
  map: null,
  userMarker: null,
  lavoirMarkersLayer: null,
  markersById: new Map(),
  routeLine: null,
  manualModeArmed: false,
  currentPosition: null,
  lastFetchPosition: null,
  lavoirs: [],
  selectedLavoirId: null,
  watchId: null,
};

function readColors() {
  const cs = getComputedStyle(document.documentElement);
  COLORS = {
    user: cs.getPropertyValue('--color-user').trim(),
    lavoir: cs.getPropertyValue('--color-lavoir').trim(),
    selected: cs.getPropertyValue('--color-selected').trim(),
    route: cs.getPropertyValue('--color-route').trim(),
  };
}

function setStatus(message, type = 'info') {
  const banner = document.getElementById('status-banner');
  banner.textContent = message;
  banner.className = `status status-${type}`;
}

function makeDotIcon(color, size = 14) {
  return L.divIcon({
    className: '',
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 0 0 1px rgba(0,0,0,0.25);"></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function initMap() {
  state.map = L.map('map').setView([DEFAULT_CENTER.lat, DEFAULT_CENTER.lng], 13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(state.map);
  state.lavoirMarkersLayer = L.layerGroup().addTo(state.map);
}

function haversineDistance(a, b) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function formatDistance(m) {
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

function formatDuration(s) {
  const min = Math.round(s / 60);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const rem = min % 60;
  return `${h} h ${rem.toString().padStart(2, '0')}`;
}

function updateUserMarker() {
  const pos = state.currentPosition;
  if (!pos) return;
  if (state.userMarker) {
    state.userMarker.setLatLng([pos.lat, pos.lng]);
  } else {
    state.userMarker = L.marker([pos.lat, pos.lng], {
      icon: makeDotIcon(COLORS.user, 16),
      zIndexOffset: 1000,
    })
      .addTo(state.map)
      .bindPopup('Votre position');
  }
}

function getRadiusMeters() {
  const val = parseInt(document.getElementById('radius-select').value, 10);
  return Math.min(val, MAX_RADIUS_M);
}

async function loadNearbyLavoirs({ force = false } = {}) {
  const pos = state.currentPosition;
  if (!pos) return;

  if (!force && state.lastFetchPosition) {
    const moved = haversineDistance(state.lastFetchPosition, pos);
    if (moved < RELOAD_THRESHOLD_M) return;
  }
  state.lastFetchPosition = pos;

  const radius = getRadiusMeters();
  setStatus('Recherche des lavoirs à proximité…', 'loading');

  const query = `[out:json][timeout:25];
(
  node["amenity"="lavoir"](around:${radius},${pos.lat},${pos.lng});
  way["amenity"="lavoir"](around:${radius},${pos.lat},${pos.lng});
  relation["amenity"="lavoir"](around:${radius},${pos.lat},${pos.lng});
);
out center;`;

  let data;
  try {
    const res = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      body: `data=${encodeURIComponent(query)}`,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = await res.json();
  } catch (err) {
    setStatus('Impossible de contacter OpenStreetMap (Overpass). Vérifiez votre connexion et réessayez.', 'error');
    return;
  }

  const lavoirs = (data.elements || [])
    .map((el) => {
      const lat = el.type === 'node' ? el.lat : el.center?.lat;
      const lng = el.type === 'node' ? el.lon : el.center?.lon;
      if (lat == null || lng == null) return null;
      return {
        id: `${el.type}/${el.id}`,
        name: el.tags?.name || 'Lavoir sans nom',
        commune: el.tags?.['addr:city'] || el.tags?.['addr:place'] || '',
        wikimediaCommons: el.tags?.wikimedia_commons || null,
        image: el.tags?.image || null,
        wikidata: el.tags?.wikidata || null,
        lat,
        lng,
      };
    })
    .filter(Boolean)
    .map((l) => ({ ...l, distance: haversineDistance(pos, l) }))
    .filter((l) => l.distance <= radius)
    .sort((a, b) => a.distance - b.distance);

  state.lavoirs = lavoirs;

  if (lavoirs.length === 0) {
    setStatus(`Aucun lavoir trouvé dans un rayon de ${formatDistance(radius)} autour de vous.`, 'warning');
  } else {
    setStatus(`${lavoirs.length} lavoir(s) trouvé(s) à proximité.`, 'success');
  }

  renderMarkers(lavoirs);
  renderSidebarList(lavoirs);
}

function renderMarkers(lavoirs) {
  state.lavoirMarkersLayer.clearLayers();
  state.markersById.clear();
  for (const lavoir of lavoirs) {
    const isSelected = lavoir.id === state.selectedLavoirId;
    const marker = L.marker([lavoir.lat, lavoir.lng], {
      icon: makeDotIcon(isSelected ? COLORS.selected : COLORS.lavoir, isSelected ? 18 : 14),
    });
    const popupHtml = document.createElement('div');
    popupHtml.innerHTML = `<strong>${lavoir.name}</strong><br>${lavoir.commune || ''}<br>${formatDistance(lavoir.distance)}<br><button class="itineraire-btn">Itinéraire</button>`;
    popupHtml.querySelector('.itineraire-btn').addEventListener('click', () => selectLavoir(lavoir.id, { computeRoute: true }));
    marker.bindPopup(popupHtml);
    marker.on('click', () => selectLavoir(lavoir.id));
    marker.addTo(state.lavoirMarkersLayer);
    state.markersById.set(lavoir.id, marker);
  }
}

function renderSidebarList(lavoirs) {
  const list = document.getElementById('lavoir-list');
  list.innerHTML = '';
  if (lavoirs.length === 0) {
    const hint = document.createElement('li');
    hint.className = 'empty-hint';
    hint.textContent = 'Aucun lavoir à afficher pour le moment.';
    list.appendChild(hint);
    return;
  }
  for (const lavoir of lavoirs) {
    const li = document.createElement('li');
    li.dataset.id = lavoir.id;
    if (lavoir.id === state.selectedLavoirId) li.classList.add('selected');
    li.innerHTML = `<span class="lavoir-name">${lavoir.name}</span><span class="lavoir-commune">${lavoir.commune || 'Commune inconnue'}</span><span class="lavoir-distance">${formatDistance(lavoir.distance)}</span>`;
    li.addEventListener('click', () => selectLavoir(lavoir.id, { computeRoute: true }));
    list.appendChild(li);
  }
}

// Lien universel Google Maps (en voiture) : fonctionne sur desktop et mobile
// (interception par l'app native si installée), pas de détection de plateforme.
function buildMapsUrl(from, to) {
  return `https://www.google.com/maps/dir/?api=1&origin=${from.lat},${from.lng}&destination=${to.lat},${to.lng}&travelmode=driving`;
}

// Zone détail : nom/commune/distance/actions/photos, positionnée en haut du
// panneau (entre les contrôles et la liste) pour rester visible sans défilement.
function renderLavoirDetail(lavoir) {
  const el = document.getElementById('lavoir-detail');
  el.classList.remove('hidden');
  const mapsAction = state.currentPosition
    ? `<a class="maps-btn" href="${buildMapsUrl(state.currentPosition, lavoir)}" target="_blank" rel="noopener">Ouvrir dans Maps</a>`
    : `<span class="maps-btn maps-btn-disabled">Position requise pour ouvrir Maps</span>`;
  el.innerHTML = `
    <h2>${lavoir.name}</h2>
    <p class="detail-commune">${lavoir.commune || 'Commune inconnue'}</p>
    <p class="detail-distance">${formatDistance(lavoir.distance)}</p>
    <div class="detail-actions">
      <button type="button" class="itineraire-btn">Itinéraire</button>
      ${mapsAction}
    </div>
    <div id="lavoir-detail-photos"></div>
  `;
  el.querySelector('.itineraire-btn').addEventListener('click', () => selectLavoir(lavoir.id, { computeRoute: true }));
  loadLavoirPhotos(lavoir);
}

// Point d'entrée unique pour la sélection d'un lavoir, que ce soit depuis un
// marqueur, la liste latérale, ou le bouton "Itinéraire" d'une popup.
// Ne met à jour que le marqueur/l'item concernés (pas de re-render complet).
async function selectLavoir(id, { computeRoute = false } = {}) {
  const lavoir = state.lavoirs.find((l) => l.id === id);
  if (!lavoir) return;

  const previousId = state.selectedLavoirId;
  state.selectedLavoirId = id;
  if (id !== previousId) {
    updateMarkerIcon(previousId);
    updateMarkerIcon(id);
    updateListHighlight(previousId, id);
    renderLavoirDetail(lavoir);
  }
  state.markersById.get(id)?.openPopup();

  if (computeRoute && state.currentPosition) {
    await showRoute(state.currentPosition, lavoir);
  }
}

function updateMarkerIcon(id) {
  if (!id) return;
  const marker = state.markersById.get(id);
  if (!marker) return;
  const isSelected = id === state.selectedLavoirId;
  marker.setIcon(makeDotIcon(isSelected ? COLORS.selected : COLORS.lavoir, isSelected ? 18 : 14));
}

function updateListHighlight(previousId, newId) {
  const list = document.getElementById('lavoir-list');
  if (previousId) list.querySelector(`li[data-id="${previousId}"]`)?.classList.remove('selected');
  if (newId) list.querySelector(`li[data-id="${newId}"]`)?.classList.add('selected');
}

async function showRoute(from, to) {
  setStatus("Calcul de l'itinéraire…", 'loading');
  const url = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;

  let data;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = await res.json();
  } catch (err) {
    setStatus("Impossible de calculer l'itinéraire (service de routage indisponible).", 'error');
    return;
  }

  if (data.code !== 'Ok' || !data.routes?.length) {
    setStatus('Aucun itinéraire trouvé vers ce lavoir.', 'warning');
    hideRouteSummary();
    return;
  }

  const route = data.routes[0];
  if (state.routeLine) state.map.removeLayer(state.routeLine);
  state.routeLine = L.geoJSON(route.geometry, {
    style: { color: COLORS.route, weight: 4 },
  }).addTo(state.map);
  state.map.fitBounds(state.routeLine.getBounds(), { padding: [40, 40] });

  showRouteSummary(route, to);
  setStatus(`Itinéraire calculé vers ${to.name}.`, 'success');
}

function showRouteSummary(route, to) {
  const el = document.getElementById('route-summary');
  el.classList.remove('hidden');
  el.innerHTML = `Vers <strong>${to.name}</strong> — ${formatDistance(route.distance)} · ${formatDuration(route.duration)} en voiture`;
}

function hideRouteSummary() {
  document.getElementById('route-summary').classList.add('hidden');
}

// Un itinéraire est calculé depuis une position d'origine précise : dès que
// cette origine change réellement, l'itinéraire affiché n'est plus valide.
function clearRoute() {
  if (state.routeLine) {
    state.map.removeLayer(state.routeLine);
    state.routeLine = null;
  }
  hideRouteSummary();
}

// Extrait jusqu'à `limit` entrées {thumbUrl, fullUrl, title} d'une réponse
// Commons API de la forme query.pages (clé = pageid).
function commonsPagesToPhotos(pages, limit = MAX_PHOTOS) {
  if (!pages) return [];
  return Object.values(pages)
    .filter((p) => p.imageinfo?.length)
    .slice(0, limit)
    .map((p) => ({
      thumbUrl: p.imageinfo[0].thumburl || p.imageinfo[0].url,
      fullUrl: p.imageinfo[0].url,
      title: p.title,
    }));
}

// Requête Commons partagée par les sources ci-dessous : chacune ne diffère
// que par ses paramètres (generator/titles), le fetch+parse est commun.
async function fetchCommonsJson(params, limit = MAX_PHOTOS) {
  const query = new URLSearchParams({
    action: 'query',
    prop: 'imageinfo',
    iiprop: 'url',
    iiurlwidth: '400',
    format: 'json',
    origin: '*',
    ...params,
  });
  const res = await fetch(`${COMMONS_API}?${query}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return commonsPagesToPhotos(data.query?.pages, limit);
}

// Photo Wikidata (propriété P18) du lavoir, si son tag OSM `wikidata` pointe
// vers une entité qui en a une — source spécifique au lieu, plus fiable
// qu'une recherche par simple proximité géographique.
async function fetchWikidataImageTitle(wikidataId) {
  const query = new URLSearchParams({
    action: 'wbgetclaims',
    entity: wikidataId,
    property: 'P18',
    format: 'json',
    origin: '*',
  });
  const res = await fetch(`${WIKIDATA_API}?${query}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  const filename = data.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
  return filename ? `File:${filename}` : null;
}

// Ordre de priorité : tags OSM directs (wikimedia_commons, image) > photo
// Wikidata liée au lieu (tag wikidata) > repli geosearch Wikimedia Commons,
// filtré par mot-clé pertinent (évite les photos hors-sujet juste proches).
async function fetchLavoirPhotos(lavoir) {
  if (lavoir.wikimediaCommons) {
    const title = lavoir.wikimediaCommons.trim();
    if (/^category:/i.test(title)) {
      return fetchCommonsJson({ generator: 'categorymembers', gcmtitle: title, gcmtype: 'file', gcmlimit: MAX_PHOTOS });
    }
    const fileTitle = /^file:/i.test(title) ? title : `File:${title}`;
    return fetchCommonsJson({ titles: fileTitle });
  }
  if (lavoir.image && /^https?:\/\//i.test(lavoir.image)) {
    return [{ thumbUrl: lavoir.image, fullUrl: lavoir.image, title: lavoir.name }];
  }
  if (lavoir.wikidata) {
    const fileTitle = await fetchWikidataImageTitle(lavoir.wikidata).catch(() => null);
    if (fileTitle) return fetchCommonsJson({ titles: fileTitle });
  }
  const candidates = await fetchCommonsJson({
    generator: 'geosearch',
    ggscoord: `${lavoir.lat}|${lavoir.lng}`,
    ggsradius: PHOTO_GEOSEARCH_RADIUS_M,
    ggslimit: PHOTO_GEOSEARCH_CANDIDATES,
    ggsnamespace: 6,
  }, PHOTO_GEOSEARCH_CANDIDATES);
  return candidates.filter((p) => PHOTO_RELEVANCE_KEYWORDS.test(p.title)).slice(0, MAX_PHOTOS);
}

function setPhotosStatus(message, isError = false) {
  const el = document.getElementById('lavoir-detail-photos');
  el.innerHTML = `<p class="photos-status${isError ? ' photos-error' : ''}">${message}</p>`;
}

function renderPhotos(photos, lavoirName) {
  if (photos.length === 0) {
    setPhotosStatus('Aucune photo trouvée pour ce lavoir.');
    return;
  }
  const el = document.getElementById('lavoir-detail-photos');
  el.innerHTML = '';
  for (const photo of photos) {
    const link = document.createElement('a');
    link.href = photo.fullUrl;
    link.target = '_blank';
    link.rel = 'noopener';
    const img = document.createElement('img');
    img.src = photo.thumbUrl;
    img.alt = lavoirName;
    img.loading = 'lazy';
    link.appendChild(img);
    el.appendChild(link);
  }
}

async function loadLavoirPhotos(lavoir) {
  if (photosCache.has(lavoir.id)) {
    renderPhotos(photosCache.get(lavoir.id), lavoir.name);
    return;
  }
  const requestId = ++photosRequestId;
  setPhotosStatus('Recherche de photos…');
  let photos;
  try {
    photos = await fetchLavoirPhotos(lavoir);
  } catch (err) {
    if (requestId !== photosRequestId) return; // sélection déjà changée entretemps
    setPhotosStatus('Impossible de récupérer des photos (erreur réseau).', true);
    return;
  }
  if (requestId !== photosRequestId) return;
  photosCache.set(lavoir.id, photos);
  renderPhotos(photos, lavoir.name);
}

function onPositionSuccess(pos) {
  const previous = state.currentPosition;
  state.currentPosition = { lat: pos.coords.latitude, lng: pos.coords.longitude };
  updateUserMarker();
  if (!previous) {
    state.map.setView([state.currentPosition.lat, state.currentPosition.lng], 14);
  } else if (haversineDistance(previous, state.currentPosition) >= RELOAD_THRESHOLD_M) {
    clearRoute();
  }
  setStatus('Position acquise. Recherche des lavoirs…', 'info');
  loadNearbyLavoirs();
}

function onPositionError(err) {
  switch (err.code) {
    case err.PERMISSION_DENIED:
      setStatus('Géolocalisation refusée. Utilisez le mode position manuelle ci-dessous.', 'error');
      break;
    case err.TIMEOUT:
      setStatus('Délai dépassé pour obtenir votre position. Nouvelle tentative en cours…', 'warning');
      break;
    case err.POSITION_UNAVAILABLE:
      setStatus('Position indisponible pour le moment. Utilisez le mode position manuelle.', 'error');
      break;
    default:
      setStatus('Erreur de géolocalisation. Utilisez le mode position manuelle.', 'error');
  }
}

function startGeolocation() {
  if (!('geolocation' in navigator)) {
    setStatus('Votre navigateur ne supporte pas la géolocalisation. Utilisez le mode position manuelle.', 'error');
    return;
  }
  setStatus('Localisation en cours…', 'loading');
  // Précision "coarse" suffisante pour une recherche à l'échelle de quelques km,
  // évite le coût GPS haute précision en continu (watchPosition).
  state.watchId = navigator.geolocation.watchPosition(onPositionSuccess, onPositionError, {
    enableHighAccuracy: false,
    timeout: 15000,
    maximumAge: 10000,
  });
}

function setManualModeUI(armed) {
  state.manualModeArmed = armed;
  const btn = document.getElementById('btn-manual-mode');
  btn.classList.toggle('active', armed);
  btn.textContent = armed ? MANUAL_MODE_LABEL_ARMED : MANUAL_MODE_LABEL_IDLE;
}

function setupManualMode() {
  const btn = document.getElementById('btn-manual-mode');
  btn.addEventListener('click', () => setManualModeUI(!state.manualModeArmed));

  state.map.on('click', (e) => {
    if (!state.manualModeArmed) return;
    state.currentPosition = { lat: e.latlng.lat, lng: e.latlng.lng };
    updateUserMarker();
    clearRoute();
    setManualModeUI(false);
    setStatus('Position manuelle définie. Recherche des lavoirs…', 'info');
    loadNearbyLavoirs({ force: true });
  });
}

function setupRadiusControl() {
  document.getElementById('radius-select').addEventListener('change', () => {
    if (state.currentPosition) loadNearbyLavoirs({ force: true });
  });
}

function init() {
  readColors();
  initMap();
  setupManualMode();
  setupRadiusControl();
  startGeolocation();
}

init();
