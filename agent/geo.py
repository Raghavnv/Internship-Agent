"""Offline geocoding of listing locations ("Austin, TX", "Bengaluru, Karnataka, India", "SF") to lat/lng,
so the Copilot app can plot listings on its map. Uses the geonamescache gazetteer (no network)."""
from __future__ import annotations

import re
from functools import lru_cache

US_STATES = {
    "AL": "alabama", "AK": "alaska", "AZ": "arizona", "AR": "arkansas", "CA": "california", "CO": "colorado",
    "CT": "connecticut", "DE": "delaware", "FL": "florida", "GA": "georgia", "HI": "hawaii", "ID": "idaho",
    "IL": "illinois", "IN": "indiana", "IA": "iowa", "KS": "kansas", "KY": "kentucky", "LA": "louisiana",
    "ME": "maine", "MD": "maryland", "MA": "massachusetts", "MI": "michigan", "MN": "minnesota",
    "MS": "mississippi", "MO": "missouri", "MT": "montana", "NE": "nebraska", "NV": "nevada",
    "NH": "new hampshire", "NJ": "new jersey", "NM": "new mexico", "NY": "new york", "NC": "north carolina",
    "ND": "north dakota", "OH": "ohio", "OK": "oklahoma", "OR": "oregon", "PA": "pennsylvania",
    "RI": "rhode island", "SC": "south carolina", "SD": "south dakota", "TN": "tennessee", "TX": "texas",
    "UT": "utah", "VT": "vermont", "VA": "virginia", "WA": "washington", "WV": "west virginia",
    "WI": "wisconsin", "WY": "wyoming", "DC": "district of columbia",
}
STATE_NAMES = {v: k for k, v in US_STATES.items()}
ALIASES = {
    "sf": "San Francisco, CA", "south sf": "South San Francisco, CA", "nyc": "New York City, NY",
    "new york": "New York City, NY", "la": "Los Angeles, CA", "dc": "Washington, DC",
    "bangalore": "Bengaluru, India", "gurgaon": "Gurugram, India", "bombay": "Mumbai, India",
}
COUNTRY_WORDS = {
    "usa": "US", "united states": "US", "us": "US", "uk": "GB", "united kingdom": "GB", "england": "GB",
    "scotland": "GB", "canada": "CA", "india": "IN", "germany": "DE", "france": "FR", "ireland": "IE",
    "switzerland": "CH", "netherlands": "NL", "belgium": "BE", "singapore": "SG", "japan": "JP",
    "china": "CN", "australia": "AU", "spain": "ES", "italy": "IT", "poland": "PL", "israel": "IL",
    "mexico": "MX", "brazil": "BR", "sweden": "SE", "denmark": "DK", "austria": "AT", "portugal": "PT",
}
CA_PROVINCES = {"ON", "BC", "AB", "QC", "MB", "SK", "NS", "NB", "NL", "PE"}
REMOTE = re.compile(r"\b(remote|work from home|wfh|anywhere|hybrid)\b", re.I)


@lru_cache(maxsize=1)
def _index():
    import geonamescache
    cities = geonamescache.GeonamesCache(min_city_population=5000).get_cities()
    by_name: dict[str, list] = {}
    for c in cities.values():
        rec = (c["latitude"], c["longitude"], c["countrycode"], c["admin1code"], c["population"], c["name"])
        names = {c["name"].lower()}
        names.update(a.lower() for a in c.get("alternatenames", []) if a.isascii() and len(a) > 2)
        for n in names:
            by_name.setdefault(n, []).append(rec)
    return by_name


def _clean(s):
    s = re.sub(r"\(.*?\)", "", s)
    return re.sub(r"\s+", " ", s).strip(" .").lower()


@lru_cache(maxsize=4096)
def geocode(loc: str):
    """Returns (lat, lng, label) or None."""
    if not loc or REMOTE.search(loc):
        return None
    raw = ALIASES.get(_clean(loc), loc)
    parts = [p.strip() for p in raw.split(",") if p.strip()]
    if not parts:
        return None
    country, state = None, None
    for p in parts[1:]:
        pl, pu = _clean(p), p.strip().upper()
        if pu in US_STATES:
            country, state = "US", pu
        elif pl in STATE_NAMES:
            country, state = "US", STATE_NAMES[pl]
        elif pu in CA_PROVINCES:
            country = "CA"
        elif pl in COUNTRY_WORDS:
            country = COUNTRY_WORDS[pl]
    idx = _index()
    # try each leading part as the city ("Arlington County, Arlington, VA" -> "Arlington")
    for name in parts[: max(1, len(parts) - 1)] if len(parts) > 1 else parts:
        cands = idx.get(_clean(name))
        if not cands:
            continue
        pool = [c for c in cands if (not country or c[2] == country)]
        if state:
            # US admin1codes in geonames are the postal codes
            pool = [c for c in pool if c[3] == state] or pool
        if not pool:
            continue
        lat, lng, cc, _a, _p, nm = max(pool, key=lambda c: c[4])
        return (round(lat, 3), round(lng, 3), nm)
    return None
