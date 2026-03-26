import axios from 'axios';

function normalizeBase(apiUrl) {
  return String(apiUrl || '').replace(/\/+$/, '');
}

/** Build candidate roots: /pipeline-layouts and /api/pipeline-layouts (if base is not already .../api). */
function layoutPathCandidates(apiUrl, suffix = '') {
  const base = normalizeBase(apiUrl);
  const withSlash = suffix ? `/${suffix.replace(/^\//, '')}` : '';
  const primary = `${base}/pipeline-layouts${withSlash}`;
  const list = [primary];
  if (!/\/api$/i.test(base)) {
    list.push(`${base}/api/pipeline-layouts${withSlash}`);
  }
  return list;
}

async function requestWith404Fallback(config) {
  const urls = Array.isArray(config.urls) ? config.urls : [];
  let lastErr;
  for (let i = 0; i < urls.length; i += 1) {
    try {
      return await axios({
        method: config.method || 'GET',
        url: urls[i],
        data: config.data,
        headers: config.headers,
      });
    } catch (err) {
      lastErr = err;
      if (err.response?.status !== 404 || i === urls.length - 1) {
        throw err;
      }
    }
  }
  throw lastErr;
}

export async function fetchPipelineLayoutsList(apiUrl) {
  const res = await requestWith404Fallback({
    method: 'GET',
    urls: layoutPathCandidates(apiUrl),
  });
  return res.data?.layouts || [];
}

export async function createPipelineLayout(apiUrl, body) {
  return requestWith404Fallback({
    method: 'POST',
    urls: layoutPathCandidates(apiUrl),
    data: body,
  });
}

export async function updatePipelineLayout(apiUrl, id, body) {
  const sid = String(id || '').replace(/^\//, '');
  return requestWith404Fallback({
    method: 'PATCH',
    urls: layoutPathCandidates(apiUrl, sid),
    data: body,
  });
}

export async function deletePipelineLayout(apiUrl, id) {
  const sid = String(id || '').replace(/^\//, '');
  return requestWith404Fallback({
    method: 'DELETE',
    urls: layoutPathCandidates(apiUrl, sid),
  });
}
