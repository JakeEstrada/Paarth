const geoCache = new Map();
const reverseCache = new Map();
const GEO_TTL_MS = 24 * 60 * 60 * 1000;
const GEO_FAIL_TTL_MS = 5 * 60 * 1000;

function isPrivateIp(ip) {
  const value = String(ip || '').trim().toLowerCase();
  if (!value) return true;
  if (value === '127.0.0.1' || value === '::1' || value === '0.0.0.0' || value === 'localhost') return true;
  if (value.startsWith('10.')) return true;
  if (value.startsWith('192.168.')) return true;
  if (value.startsWith('169.254.')) return true;
  if (value.startsWith('fc') || value.startsWith('fd') || value.startsWith('fe80:')) return true;
  const m = value.match(/^172\.(\d+)\./);
  if (m) {
    const octet = Number(m[1]);
    if (octet >= 16 && octet <= 31) return true;
  }
  return false;
}

function extractClientIp(req) {
  const headers = req?.headers || {};
  const candidates = [
    headers['cf-connecting-ip'],
    headers['true-client-ip'],
    headers['x-real-ip'],
    headers['x-forwarded-for'],
    req?.ip,
    req?.socket?.remoteAddress,
    req?.connection?.remoteAddress,
  ];

  for (const candidate of candidates) {
    const raw = Array.isArray(candidate) ? candidate[0] : candidate;
    if (!raw) continue;
    let ip = String(raw).split(',')[0].trim();
    if (ip.startsWith('::ffff:')) ip = ip.slice(7);
    if (ip === '::1') ip = '127.0.0.1';
    ip = ip.replace(/^\[|\]$/g, '');
    if (ip) return ip.slice(0, 64);
  }
  return '';
}

function emptyLocation(label = '', isp = '') {
  return { city: '', region: '', country: '', label, isp, source: 'ip' };
}

function formatLocationLabel(city, region, country) {
  return [city, region, country].map((part) => String(part || '').trim()).filter(Boolean).join(', ');
}

function parseCoords(latitude, longitude) {
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) < 0.01 && Math.abs(lng) < 0.01) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { latitude: lat, longitude: lng };
}

async function reverseGeocodeNominatim(latitude, longitude) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(String(latitude))}&lon=${encodeURIComponent(String(longitude))}&zoom=14&addressdetails=1`;
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Paarth-OMS/1.0 (user-activity-location)' },
    signal: AbortSignal.timeout(2500),
  });
  const data = await response.json();
  const address = data?.address || {};
  const city = String(
    address.city || address.town || address.village || address.municipality || address.hamlet || '',
  ).trim();
  const region = String(address.state || '').trim();
  const country = String(address.country || '').trim();
  const location = {
    city,
    region,
    country,
    label: formatLocationLabel(city, region, country),
    isp: '',
    source: 'gps',
  };
  if (!location.label) throw new Error('empty reverse geocode');
  return location;
}

async function reverseGeocodeBigData(latitude, longitude) {
  const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${encodeURIComponent(String(latitude))}&longitude=${encodeURIComponent(String(longitude))}&localityLanguage=en`;
  const response = await fetch(url, { signal: AbortSignal.timeout(2500) });
  const data = await response.json();
  const city = String(data.city || data.locality || '').trim();
  const region = String(data.principalSubdivision || '').trim();
  const country = String(data.countryName || '').trim();
  const location = {
    city,
    region,
    country,
    label: formatLocationLabel(city, region, country),
    isp: '',
    source: 'gps',
  };
  if (!location.label) throw new Error('empty reverse geocode');
  return location;
}

async function reverseGeocode(latitude, longitude) {
  const key = `${latitude.toFixed(3)},${longitude.toFixed(3)}`;
  const cached = reverseCache.get(key);
  if (cached && Date.now() - cached.at < cached.ttl) return cached.location;

  try {
    let location;
    try {
      location = await reverseGeocodeNominatim(latitude, longitude);
    } catch {
      location = await reverseGeocodeBigData(latitude, longitude);
    }
    reverseCache.set(key, { at: Date.now(), ttl: GEO_TTL_MS, location });
    return location;
  } catch (error) {
    console.warn('Reverse geocode failed:', error?.message || error);
    const location = emptyLocation('', '');
    reverseCache.set(key, { at: Date.now(), ttl: GEO_FAIL_TTL_MS, location });
    return location;
  }
}

async function lookupIpLocation(ip) {
  if (!ip || isPrivateIp(ip)) {
    return emptyLocation(ip ? 'Local / private network' : '');
  }

  const cached = geoCache.get(ip);
  if (cached && Date.now() - cached.at < cached.ttl) {
    return cached.location;
  }

  try {
    const response = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}`, {
      signal: AbortSignal.timeout(2500),
    });
    const data = await response.json();
    if (!data || data.success === false) {
      throw new Error(data?.message || 'lookup failed');
    }
    const city = String(data.city || '').trim();
    const region = String(data.region || '').trim();
    const country = String(data.country || '').trim();
    const isp = String(data.connection?.isp || data.connection?.org || '').trim();
    const location = {
      city,
      region,
      country,
      label: formatLocationLabel(city, region, country),
      isp,
      source: 'ip',
    };
    geoCache.set(ip, { at: Date.now(), ttl: GEO_TTL_MS, location });
    return location;
  } catch (error) {
    console.warn('IP location lookup failed:', error?.message || error);
    const location = emptyLocation('');
    geoCache.set(ip, { at: Date.now(), ttl: GEO_FAIL_TTL_MS, location });
    return location;
  }
}

async function resolveClientNetwork(req, coords) {
  const ip = extractClientIp(req);
  const gps = parseCoords(coords?.latitude, coords?.longitude);
  if (gps) {
    const geo = await reverseGeocode(gps.latitude, gps.longitude);
    return {
      ip,
      locationCity: geo.city,
      locationRegion: geo.region,
      locationCountry: geo.country,
      locationLabel: geo.label || 'Device location',
      locationIsp: '',
      locationSource: 'gps',
    };
  }

  const location = await lookupIpLocation(ip);
  return {
    ip,
    locationCity: location.city,
    locationRegion: location.region,
    locationCountry: location.country,
    locationLabel: location.label,
    locationIsp: location.isp || '',
    locationSource: 'ip',
  };
}

module.exports = {
  extractClientIp,
  lookupIpLocation,
  parseCoords,
  resolveClientNetwork,
};
