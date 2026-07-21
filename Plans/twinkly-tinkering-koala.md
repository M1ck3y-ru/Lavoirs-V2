# Lavoirs V2 — Prototype géolocalisation + itinéraire

## Context

Inspiré de lavoirs.org (base communautaire de ~23 000 lavoirs français), l'objectif est un prototype qui : géolocalise l'utilisateur en temps réel, affiche les lavoirs à proximité sur une carte, et propose un itinéraire vers le lavoir choisi. Projet greenfield (dossier `LAVOIRV2` vide). Pas d'accès à la base propriétaire de lavoirs.org — utilisation d'OpenStreetMap (tag confirmé `amenity=lavoir`, licence ODbL, données ouvertes) à la place.

Décisions déjà validées (par défaut, faute de réponse utilisateur, réversibles) :
- Stack : HTML/CSS/JS statique, aucun framework/build step, Leaflet.js + tuiles OSM
- Données : Overpass API (OpenStreetMap), tag `amenity=lavoir`
- Routing : serveur de démo public OSRM (router.project-osrm.org), profil `foot`

## Approche

Application 1 page, 3 fichiers, servie par un serveur HTTP local (pas de `file://`, pour éviter les blocages CORS/fetch).

**Fichiers à créer :**
- `index.html` — structure : carte plein écran + panneau latéral (liste des lavoirs triés par distance) + bandeau d'état (chargement / erreur / permission refusée)
- `style.css` — mise en page carte + panneau + états
- `app.js` — toute la logique
- `README.md` — comment lancer (`python3 -m http.server 8000` puis ouvrir `localhost:8000`)

**Logique dans `app.js` (fonctions clés) :**
- `initMap()` : init Leaflet, centre de secours par défaut (Paris) tant que la géoloc n'est pas résolue
- `startGeolocation()` : `navigator.geolocation.watchPosition` (temps réel, pas `getCurrentPosition` one-shot) ; gère refus, timeout, et erreur réseau avec messages explicites dans le bandeau d'état (aucun échec silencieux) ; inclut un mode "position manuelle" (clic sur la carte ou champ lat/lng) pour tester sans GPS réel
- `fetchNearbyLavoirs(lat, lng, radiusMeters)` : requête Overpass `amenity=lavoir` autour du point, avec `out center` pour gérer les géométries `way`/`relation` en plus des `node` ; rayon plafonné (ex. 20 km) ; gère les erreurs réseau explicitement
- `haversineDistance(a, b)` : calcul de distance pour tri et affichage
- `renderMarkers(list)` + `renderSidebar(list)` : marqueurs sur la carte + liste triée par distance croissante avec distance affichée (km/m), popup par marqueur avec bouton "Itinéraire"
- `showRoute(from, to)` : appel OSRM (`/route/v1/foot/...`), trace la polyligne sur la carte, affiche distance totale + durée estimée ; message de repli si pas de route trouvée

**États UI explicites (aucun cas silencieux) :** chargement position, position acquise, permission refusée, timeout géoloc, aucun lavoir trouvé à proximité, erreur réseau Overpass/OSRM, itinéraire introuvable.

## Vérification

1. Lancer `python3 -m http.server 8000` dans le dossier, ouvrir `http://localhost:8000`
2. Dans Chrome DevTools → Sensors, simuler une position avec des lavoirs connus en France rurale, vérifier l'apparition des marqueurs et de la liste triée
3. Cliquer un marqueur → bouton Itinéraire → vérifier tracé polyligne + distance/durée affichées
4. Bloquer la permission de géolocalisation dans le navigateur → vérifier message explicite (pas d'échec silencieux)
5. Couper le réseau (DevTools offline) après chargement → vérifier message d'erreur explicite sur l'appel Overpass/OSRM
6. Tester le mode position manuelle en zone sans lavoir OSM proche → vérifier message "aucun lavoir trouvé"

Chaque critère ISC du PRD (`MEMORY/WORK/20260709-095407_lavoirs-v2-geolocation-itinerary/PRD.md`) sera coché au fur et à mesure en EXECUTE, avec preuve en VERIFY.
