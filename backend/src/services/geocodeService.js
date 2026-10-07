const OC_BOUNDS = {
  west: -118.16,
  east: -117.4,
  south: 33.36,
  north: 33.96,
};

function formatAddressParts(parts) {
  return parts.map((part) => String(part || '').trim()).filter(Boolean).join(', ');
}

function formatJobLocation(job) {
  const jobAddress = job?.jobAddress;
  if (jobAddress && (jobAddress.street || jobAddress.city || jobAddress.state || jobAddress.zip)) {
    return formatAddressParts([jobAddress.street, jobAddress.city, jobAddress.state, jobAddress.zip]);
  }
  const customerAddress = job?.customerId?.address;
  if (
    customerAddress &&
    (customerAddress.street || customerAddress.city || customerAddress.state || customerAddress.zip)
  ) {
    return formatAddressParts([
      customerAddress.street,
      customerAddress.city,
      customerAddress.state,
      customerAddress.zip,
    ]);
  }
  const extra = Array.isArray(job?.customerId?.addresses) ? job.customerId.addresses[0] : null;
  if (extra?.fullAddress) return String(extra.fullAddress).trim();
  if (extra) {
    return formatAddressParts([extra.street, extra.city, extra.state, extra.zip]);
  }
  return '';
}

function inOrangeCounty(lat, lng) {
  return lat >= OC_BOUNDS.south && lat <= OC_BOUNDS.north && lng >= OC_BOUNDS.west && lng <= OC_BOUNDS.east;
}

function hasStreet(address) {
  return /\d/.test(String(address || ''));
}

async function geocodeCensus(address) {
  const url = new URL('https://geocoding.geo.census.gov/geocoder/locations/onelineaddress');
  url.searchParams.set('address', address);
  url.searchParams.set('benchmark', 'Public_AR_Current');
  url.searchParams.set('format', 'json');
  const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) return null;
  const data = await response.json();
  const match = data?.result?.addressMatches?.[0];
  const lng = Number(match?.coordinates?.x);
  const lat = Number(match?.coordinates?.y);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

async function geocodeNominatim(address) {
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('q', `${address}, Orange County, California`);
  url.searchParams.set('format', 'json');
  url.searchParams.set('limit', '1');
  url.searchParams.set('countrycodes', 'us');
  const response = await fetch(url, {
    signal: AbortSignal.timeout(8000),
    headers: { 'User-Agent': 'PaarthDashboard/1.0 (shop operations map)' },
  });
  if (!response.ok) return null;
  const data = await response.json();
  const hit = Array.isArray(data) ? data[0] : null;
  const lat = Number(hit?.lat);
  const lng = Number(hit?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

async function geocodeAddress(address) {
  const query = String(address || '').trim();
  if (!hasStreet(query)) return null;
  try {
    const census = await geocodeCensus(query);
    if (census) return census;
  } catch {
    /* try OSM next */
  }
  try {
    return await geocodeNominatim(query);
  } catch {
    return null;
  }
}

function shouldRetryGeo(job, address) {
  const geo = job?.geo;
  if (!geo) return true;
  if (geo.sourceAddress !== address) return true;
  if (geo.status === 'ok' && Number.isFinite(geo.lat) && Number.isFinite(geo.lng)) return false;
  const stamped = geo.geocodedAt ? new Date(geo.geocodedAt).getTime() : 0;
  return Date.now() - stamped > 7 * 24 * 60 * 60 * 1000;
}

module.exports = {
  OC_BOUNDS,
  formatJobLocation,
  inOrangeCounty,
  geocodeAddress,
  shouldRetryGeo,
};
