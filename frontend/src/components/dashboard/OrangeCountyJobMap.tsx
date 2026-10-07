import { Box, Button, Paper, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { useEffect, useMemo, useState } from 'react';
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
};

type MapView = 'pipeline' | 'current' | 'week';

const VIEWS: { id: MapView; label: string }[] = [
  { id: 'pipeline', label: 'Pipeline' },
  { id: 'current', label: 'On site now' },
  { id: 'week', label: 'This week' },
];

const WEST = -118.16;
const EAST = -117.4;
const SOUTH = 33.36;
const NORTH = 33.96;
const WIDTH = 720;
const HEIGHT = 420;
const PAD = 18;

const COUNTY: [number, number][] = [
  [-118.127, 33.947],
  [-117.98, 33.947],
  [-117.76, 33.91],
  [-117.572, 33.873],
  [-117.48, 33.72],
  [-117.42, 33.5],
  [-117.58, 33.387],
  [-117.65, 33.387],
  [-117.8, 33.46],
  [-117.96, 33.58],
  [-118.08, 33.65],
  [-118.13, 33.74],
];

const CITIES: { name: string; lat: number; lng: number }[] = [
  { name: 'Anaheim', lat: 33.836, lng: -117.914 },
  { name: 'Irvine', lat: 33.684, lng: -117.827 },
  { name: 'Santa Ana', lat: 33.746, lng: -117.868 },
  { name: 'Huntington Beach', lat: 33.66, lng: -117.999 },
  { name: 'Mission Viejo', lat: 33.6, lng: -117.672 },
  { name: 'San Clemente', lat: 33.427, lng: -117.612 },
  { name: 'Newport Beach', lat: 33.619, lng: -117.929 },
];

function project(lat: number, lng: number) {
  const x = PAD + ((lng - WEST) / (EAST - WEST)) * (WIDTH - PAD * 2);
  const y = PAD + ((NORTH - lat) / (NORTH - SOUTH)) * (HEIGHT - PAD * 2);
  return { x, y };
}

export default function OrangeCountyJobMap() {
  const theme = useTheme();
  const navigate = useNavigate();
  const [view, setView] = useState<MapView>('pipeline');
  const [paused, setPaused] = useState(false);
  const [hover, setHover] = useState<string | null>(null);
  const [pins, setPins] = useState<Record<MapView, MapPin[]>>({
    pipeline: [],
    current: [],
    week: [],
  });

  useEffect(() => {
    let cancelled = false;
    void api
      .get('/jobs/map-pins')
      .then((response) => {
        if (cancelled) return;
        setPins({
          pipeline: response.data?.pipeline || [],
          current: response.data?.current || [],
          week: response.data?.week || [],
        });
      })
      .catch(() => {
        if (!cancelled) setPins({ pipeline: [], current: [], week: [] });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (paused) return undefined;
    const timer = window.setInterval(() => {
      setView((current) => {
        const index = VIEWS.findIndex((item) => item.id === current);
        return VIEWS[(index + 1) % VIEWS.length].id;
      });
    }, 10000);
    return () => window.clearInterval(timer);
  }, [paused]);

  const activePins = pins[view];
  const countyPath = useMemo(
    () =>
      COUNTY.map((point, index) => {
        const { x, y } = project(point[1], point[0]);
        return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
      }).join(' ') + ' Z',
    [],
  );
  const hovered = activePins.find((pin) => pin.id === hover) || null;

  return (
    <Paper
      elevation={0}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      sx={{ ...chartPanelSx(theme), display: { xs: 'none', md: 'flex' }, minHeight: { md: 480 } }}
    >
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1, mb: 1 }}>
        <Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
            Orange County jobs
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {activePins.length} mapped · cycles pipeline, on-site, and this week
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 0.5 }}>
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
      </Box>
      <Box sx={{ position: 'relative', flex: 1, minHeight: 380 }}>
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} width="100%" height="100%" role="img">
          <rect width={WIDTH} height={HEIGHT} fill={theme.palette.mode === 'dark' ? '#0f172a' : '#eef6fb'} rx="16" />
          <path
            d={countyPath}
            fill={theme.palette.mode === 'dark' ? '#1e3a4c' : '#cdebdc'}
            stroke={theme.palette.mode === 'dark' ? '#67e8f9' : '#0f766e'}
            strokeWidth="2"
          />
          {CITIES.map((city) => {
            const { x, y } = project(city.lat, city.lng);
            return (
              <text
                key={city.name}
                x={x}
                y={y}
                textAnchor="middle"
                fill={theme.palette.text.secondary}
                fontSize="11"
                opacity="0.8"
              >
                {city.name}
              </text>
            );
          })}
          {activePins.map((pin) => {
            const { x, y } = project(pin.lat, pin.lng);
            const selected = hover === pin.id;
            return (
              <g
                key={pin.id}
                style={{ cursor: 'pointer' }}
                onMouseEnter={() => setHover(pin.id)}
                onMouseLeave={() => setHover(null)}
                onClick={() => navigate(view === 'week' ? '/calendar' : '/pipeline')}
              >
                <circle cx={x} cy={y} r={selected ? 8 : 6} fill="#f43f5e" stroke={theme.palette.background.paper} strokeWidth="2" />
              </g>
            );
          })}
        </svg>
        {hovered ? (
          <Box
            sx={{
              position: 'absolute',
              left: 16,
              bottom: 16,
              maxWidth: 320,
              p: 1.25,
              borderRadius: 2,
              bgcolor: 'background.paper',
              border: '1px solid',
              borderColor: 'divider',
              boxShadow: 1,
            }}
          >
            <Typography variant="body2" sx={{ fontWeight: 700 }}>
              {hovered.customerName || hovered.title}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
              {hovered.title}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {hovered.address}
            </Typography>
          </Box>
        ) : null}
        {!activePins.length ? (
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ position: 'absolute', left: 24, bottom: 24, maxWidth: 360 }}
          >
            Jobs show up here after their street address is converted to a map point. That happens automatically
            from the job or customer address.
          </Typography>
        ) : null}
      </Box>
    </Paper>
  );
}
