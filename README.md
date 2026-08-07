# Land Master

A single-page React app that puts a US address on a Google Map and layers
**FEMA flood hazard zones** and **US Census tract** boundaries over it.

Everything runs in the browser. There is no server, no proxy, and no backend of
any kind — the build is static files that GitHub Pages serves directly, and all
three APIs are called from the client.

---

## How it stays backend-free

Three data sources, three different CORS situations. This is the part that
breaks a naive static build:

| Source | Transport | Why |
| --- | --- | --- |
| **Census Geocoder** — address → coordinates + tract | **JSONP** | The geocoder sends no CORS headers at all, so `fetch` can never work from a static origin. It does support `format=jsonp&callback=`, and `<script>` tags are exempt from CORS. |
| **TIGERweb** — tract polygon by GEOID | `fetch` | ArcGIS sends `Access-Control-Allow-Origin: *`. |
| **FEMA NFHL** — flood zone at a point | `fetch`, GET | Same. Issued as a GET with no custom headers, so there is no preflight. |

`src/lib/jsonp.js` holds both the JSONP helper and
`fetchJsonWithJsonpFallback()`. The ArcGIS calls use plain `fetch` first and
transparently retry over JSONP if a CORS error ever appears from your Pages
origin — with no server to patch around it, that fallback is the safety net.

The optional full-map FEMA overlay uses `google.maps.ImageMapType` against the
NFHL `export` endpoint. Map tiles are images, so they're not CORS-restricted.

---

## Quick start

```bash
npm install
cp .env.example .env      # then paste your key into .env
npm run dev               # http://localhost:5173
```

Other commands:

```bash
npm test        # unit tests (node:test, no browser needed)
npm run build   # static build into dist/
npm run preview # serve the production build locally
```

### Getting a Google Maps key

1. In the [Google Cloud console](https://console.cloud.google.com/), create a
   project and enable **Maps JavaScript API** and **Places API (New)**.
2. Create an **API key** under *APIs & Services → Credentials*.
3. Restrict it — this matters, because on a static site the key ships inside
   the JS bundle and is readable by anyone:
   - **Application restrictions → Websites (HTTP referrers)**:
     - `http://localhost:5173/*`
     - `https://<your-github-username>.github.io/land-master/*`
   - **API restrictions**: Maps JavaScript API, Places API (New)
4. Put it in `.env` as `VITE_GOOGLE_MAPS_API_KEY=...`.

`.env` is gitignored. Vite only reads env files at startup, so restart
`npm run dev` after changing it. Without a key the app renders a setup screen
explaining exactly this, instead of a blank map.

`VITE_GOOGLE_MAPS_MAP_ID` is optional — set it to a Cloud console Map ID to get
vector maps and the custom HTML marker; without it the app uses a raster map and
a classic marker.

---

## Deploying to GitHub Pages

One-time repository setup:

1. **Settings → Pages → Build and deployment → Source: GitHub Actions.**
2. **Settings → Secrets and variables → Actions → New repository secret**
   - Name: `VITE_GOOGLE_MAPS_API_KEY`
   - Value: your browser key
   - (Optionally add `VITE_GOOGLE_MAPS_MAP_ID` the same way.)
3. Add `https://<your-github-username>.github.io/land-master/*` to the key's
   HTTP-referrer restrictions.

After that, every push to `main` runs `.github/workflows/deploy.yml`, which does
`npm ci` → `npm test` → `npm run build` with the key injected from the secret →
publishes `dist/` with `actions/deploy-pages`. The workflow fails loudly if the
secret is missing, rather than silently shipping a keyless site.

Your site lands at `https://<your-github-username>.github.io/land-master/`.

### Base path

`vite.config.js` sets `base: "/land-master/"` for production builds so assets
resolve under the repo subpath, and `/` for `npm run dev`. If your repository
has a different name, change `PROD_BASE` (or set the `VITE_BASE` env var). For a
user/org root site (`<user>.github.io`), set it to `/`.

The build also writes `dist/404.html` as a copy of `index.html`. GitHub Pages
has no SPA rewrite rule, so this is what makes a hard refresh on any path work.

---

## Project structure

```
.github/workflows/deploy.yml   Build + deploy to Pages
index.html                     Vite entry, font links
vite.config.js                 base path, React plugin, 404.html fallback
src/
  main.jsx                     React root
  App.jsx                      Layout, layer state, APIProvider
  styles.css                   All styling (plain CSS + custom properties)
  hooks/useLookup.js           Orchestrates the three sources independently
  components/
    AddressSearch.jsx          Places autocomplete (3-tier fallback)
    MapView.jsx                Map, marker, Data layers, FEMA tile overlay
    ReadoutPanel.jsx           Readout card / bottom sheet
    Legend.jsx, LayerToggles.jsx
  lib/
    jsonp.js                   JSONP helper + fetch with JSONP fallback
    census.js                  Census geocoder (JSONP only)
    tigerweb.js                Tract polygon by GEOID
    fema.js                    NFHL queries + tile URL builder
    esri.js                    Esri JSON → GeoJSON (fallback path)
    floodStyle.js              Zone classification and colors
    placeParse.js              Normalizes both Google Places shapes
    fips.js                    State FIPS → name
test/                          Unit tests (node:test)
```

### Notes on a few decisions

- **Coordinate order.** FEMA/Esri geometry is `{ x: longitude, y: latitude }`.
  The conversion lives in exactly one function, `pointGeometry()` in
  `src/lib/fema.js`, and is covered by a test — swapping these is the classic
  way to get silently empty results.
- **Independent failure.** Census and FEMA start in parallel; only the tract
  polygon depends on Census (it needs the GEOID). Each source has its own
  status and its own retry button, so one outage doesn't blank the panel.
- **No flood features is not an error.** A point outside every mapped Special
  Flood Hazard Area returns zero features; the panel says so explicitly.
- **Autocomplete has three tiers.** `PlaceAutocompleteElement` (Places API New,
  the only option for Cloud projects created after March 2025) → the legacy
  `places.Autocomplete` widget → a plain input that runs the Census one-line
  geocoder. The third tier means the app still works with no Places access at
  all.

---

## Data sources

- FEMA National Flood Hazard Layer (NFHL), public MapServer, layer 28
- US Census Geocoder — `Public_AR_Current` / `Current_Current`
- US Census TIGERweb — Tracts_Blocks MapServer

Flood data is informational and is not a substitute for an official FEMA Flood
Insurance Rate Map or an elevation certificate.
