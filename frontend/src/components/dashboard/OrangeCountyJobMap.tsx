import { Box, Button, IconButton, Paper, Typography } from '@mui/material';
import { Close as CloseIcon } from '@mui/icons-material';
import { useTheme } from '@mui/material/styles';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../utils/axios';
import { chartPanelSx } from './dashboardChartPrimitives';

type MapPin = {
  id: string;
  title: string;
  stage: string;
  customerName: string;
  address: string;
  lat: number;
  lng: number;
  group?: 'active' | 'completed' | 'archived';
};

type MapView = 'all' | 'pipeline' | 'current' | 'week' | 'completed' | 'archived';

const VIEWS: { id: MapView; label: string }[] = [
  { id: 'all', label: 'All jobs' },
  { id: 'pipeline', label: 'Pipeline' },
  { id: 'current', label: 'On site now' },
  { id: 'week', label: 'This week' },
  { id: 'completed', label: 'Completed' },
  { id: 'archived', label: 'Archived' },
];

const PIN_COLORS: Record<string, string> = {
  active: '#f43f5e',
  completed: '#34d399',
  archived: '#94a3b8',
};

function pinIcon(group = 'active') {
  const color = PIN_COLORS[group] || PIN_COLORS.active;
  return L.divIcon({
    className: 'paarth-job-pin',
    html: `<span class="paarth-job-pin-dot" style="background:${color}"></span>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    popupAnchor: [0, -12],
  });
}

function escapeHtml(value: string) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function prettyStage(stage: string) {
  const label = String(stage || '').replace(/_/g, ' ').trim();
  if (!label) return 'No stage';
  return label.toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());
}

function pinLabel(pin: MapPin) {
  return pin.customerName || pin.title || 'Job';
}

function jobPath(pin: MapPin) {
  if (pin.group === 'completed' || pin.group === 'archived') {
    return `/completed-jobs?jobId=${pin.id}`;
  }
  return `/pipeline?jobId=${pin.id}`;
}

const OC_CENTER: L.LatLngExpression = [33.67, -117.78];
const OC_BOUNDS = L.latLngBounds([33.34, -118.18], [33.98, -117.4]);

function addBasemap(map: L.Map) {
  const mapbox = String(import.meta.env.VITE_MAPBOX_ACCESS_TOKEN || '').trim();
  if (mapbox) {
    L.tileLayer(
      `https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/tiles/{z}/{x}/{y}?access_token=${mapbox}`,
      {
        tileSize: 512,
        zoomOffset: -1,
        maxZoom: 18,
        attribution: '&copy; Mapbox &copy; OpenStreetMap',
      },
    ).addTo(map);
    return;
  }

  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 18,
    attribution: 'Tiles &copy; Esri',
  }).addTo(map);
  L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Reference_Overlay/MapServer/tile/{z}/{y}/{x}',
    { maxZoom: 18, pane: 'overlayPane' },
  ).addTo(map);
}

export default function OrangeCountyJobMap() {
  const theme = useTheme();
  const navigate = useNavigate();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<{ map: L.Map; markers: L.LayerGroup } | null>(null);
  const [view, setView] = useState<MapView>('all');
  const [paused, setPaused] = useState(false);
  const [selectedPin, setSelectedPin] = useState<MapPin | null>(null);
  const [pins, setPins] = useState<Record<MapView, MapPin[]>>({
    all: [],
    pipeline: [],
    current: [],
    week: [],
    completed: [],
    archived: [],
  });

  useEffect(() => {
    let cancelled = false;
    void api
      .get('/jobs/map-pins')
      .then((response) => {
        if (cancelled) return;
        setPins({
          all: response.data?.all || [],
          pipeline: response.data?.pipeline || [],
          current: response.data?.current || [],
          week: response.data?.week || [],
          completed: response.data?.completed || [],
          archived: response.data?.archived || [],
        });
      })
      .catch(() => {
        if (!cancelled) {
          setPins({ all: [], pipeline: [], current: [], week: [], completed: [], archived: [] });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || mapRef.current) return;

    const map = L.map(host, {
      center: OC_CENTER,
      zoom: 10,
      minZoom: 9,
      maxZoom: 18,
      maxBounds: OC_BOUNDS.pad(0.08),
      scrollWheelZoom: true,
      attributionControl: true,
    });
    addBasemap(map);
    const markers = L.layerGroup().addTo(map);
    mapRef.current = { map, markers };
    map.on('click', () => setSelectedPin(null));
    window.setTimeout(() => map.invalidateSize(), 80);

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const ctx = mapRef.current;
    if (!ctx) return;
    ctx.markers.clearLayers();
    const bounds = L.latLngBounds([]);
    pins[view].forEach((pin) => {
      const marker = L.marker([pin.lat, pin.lng], { icon: pinIcon(pin.group), keyboard: true });
      marker.bindTooltip(escapeHtml(pinLabel(pin)), {
        direction: 'top',
        offset: [0, -12],
        opacity: 1,
        sticky: true,
        className: 'paarth-job-tooltip',
      });
      marker.on('click', (event) => {
        L.DomEvent.stopPropagation(event);
        setPaused(true);
        setSelectedPin(pin);
      });
      marker.addTo(ctx.markers);
      bounds.extend([pin.lat, pin.lng]);
    });
    window.setTimeout(() => ctx.map.invalidateSize(), 40);
    if (bounds.isValid()) {
      ctx.map.fitBounds(bounds.pad(0.2), { maxZoom: 13, animate: true });
    } else {
      ctx.map.setView(OC_CENTER, 10);
    }
  }, [pins, view]);

  useEffect(() => {
    if (paused || selectedPin) return undefined;
    const timer = window.setInterval(() => {
      setView((current) => {
        const index = VIEWS.findIndex((item) => item.id === current);
        return VIEWS[(index + 1) % VIEWS.length].id;
      });
    }, 10000);
    return () => window.clearInterval(timer);
  }, [paused, selectedPin]);

  useEffect(() => {
    setSelectedPin(null);
  }, [view]);

  const activePins = pins[view];

  return (
    <Paper
      elevation={0}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => {
        if (!selectedPin) setPaused(false);
      }}
      sx={{
        ...chartPanelSx(theme),
        display: { xs: 'none', md: 'flex' },
        minHeight: { md: 720 },
        height: 'auto',
      }}
    >
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 1.5 }}>
        {VIEWS.map((item) => (
          <Button
            key={item.id}
            size="small"
            variant={view === item.id ? 'contained' : 'outlined'}
            onClick={() => setView(item.id)}
            sx={{ textTransform: 'none', minWidth: 0 }}
          >
            {item.label}
          </Button>
        ))}
      </Box>
      <Box sx={{ mb: 1 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
          Orange County jobs
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {activePins.length} mapped · hover a pin for the job · click for details · red pipeline · green
          completed · gray archived
        </Typography>
      </Box>
      <Box
        sx={{
          position: 'relative',
          flex: 1,
          minHeight: 620,
          borderRadius: 2,
          overflow: 'hidden',
          '& .leaflet-container': {
            height: '100%',
            width: '100%',
            background: '#0b1c24',
            fontFamily: 'inherit',
          },
          '& .paarth-job-pin': { background: 'none', border: 0, cursor: 'pointer' },
          '& .paarth-job-pin-dot': {
            display: 'block',
            width: 18,
            height: 18,
            borderRadius: '50%',
            border: '2px solid #fff',
            boxShadow: '0 0 0 1px rgba(0,0,0,0.25)',
          },
          '& .paarth-job-tooltip': {
            background: theme.palette.background.paper,
            color: theme.palette.text.primary,
            border: 'none',
            borderRadius: 8,
            boxShadow:
              theme.palette.mode === 'dark'
                ? '0 8px 24px rgba(0,0,0,0.45)'
                : '0 8px 24px rgba(15, 23, 42, 0.18)',
            fontWeight: 700,
            fontSize: 13,
            padding: '6px 10px',
          },
          '& .paarth-job-tooltip.leaflet-tooltip-top::before': {
            borderTopColor: theme.palette.background.paper,
          },
        }}
      >
        <Box ref={hostRef} sx={{ position: 'absolute', inset: 0 }} />
        {selectedPin ? (
          <Paper
            elevation={8}
            sx={{
              position: 'absolute',
              top: 12,
              left: 12,
              zIndex: 500,
              width: 300,
              maxWidth: 'calc(100% - 24px)',
              p: 1.5,
              borderRadius: 2,
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1 }}>
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
                  {selectedPin.customerName || selectedPin.title}
                </Typography>
                {selectedPin.customerName && selectedPin.title !== selectedPin.customerName ? (
                  <Typography variant="body2" color="text.secondary">
                    {selectedPin.title}
                  </Typography>
                ) : null}
              </Box>
              <IconButton
                size="small"
                aria-label="Close job details"
                onClick={() => setSelectedPin(null)}
                sx={{ mt: -0.5, mr: -0.5 }}
              >
                <CloseIcon fontSize="small" />
              </IconButton>
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
              {prettyStage(selectedPin.stage)}
            </Typography>
            {selectedPin.address ? (
              <Typography variant="body2" sx={{ mt: 0.5 }}>
                {selectedPin.address}
              </Typography>
            ) : null}
            <Button
              size="small"
              variant="contained"
              onClick={() => navigate(jobPath(selectedPin))}
              sx={{ mt: 1.5, textTransform: 'none' }}
            >
              Open job
            </Button>
          </Paper>
        ) : null}
        {!activePins.length ? (
          <Typography
            variant="body2"
            color="common.white"
            sx={{
              position: 'absolute',
              left: 16,
              bottom: 16,
              maxWidth: 360,
              zIndex: 500,
              textShadow: '0 1px 4px rgba(0,0,0,0.7)',
            }}
          >
            Jobs show up here after their street address is converted to a map point.
          </Typography>
        ) : null}
      </Box>
    </Paper>
  );
}
