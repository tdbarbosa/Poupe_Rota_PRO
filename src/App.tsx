/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import * as XLSX from 'xlsx';
import * as tf from '@tensorflow/tfjs';
import { 
  Compass, 
  Settings, 
  Sun, 
  Moon, 
  Target, 
  Upload, 
  Navigation, 
  CheckCircle2, 
  RotateCcw,
  MapPin,
  ChevronUp,
  ChevronDown,
  GripHorizontal,
  Layers,
  X,
  Home,
  Building2,
  Store,
  Edit,
  Package,
  AlertTriangle,
  CheckCircle,
  Info,
  Search
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import { routingService, KalmanFilter } from './services/routingService';

// Types
interface Delivery {
  id: number;
  lat: number;
  lon: number;
  originalLat?: number;
  originalLon?: number;
  addr: string;
  name?: string;
  bairro: string;
  done: boolean;
  order?: number;
  count?: number;
  type?: 'casa' | 'condominio' | 'comercio';
  condoName?: string;
  quality?: 'perfect' | 'incomplete' | 'warning';
  verificationNotes?: string[];
}

interface Location {
  lat: number;
  lon: number;
}

export default function App() {
  // State
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [myLocation, setMyLocation] = useState<Location | null>(null);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [isDrawerExpanded, setIsDrawerExpanded] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isPro, setIsPro] = useState(false);
  const [mergingId, setMergingId] = useState<number | null>(null);
  const [isClassifierReady, setIsClassifierReady] = useState(false);
  const [navTarget, setNavTarget] = useState<Delivery | null>(null);
  const [editingDelivery, setEditingDelivery] = useState<Delivery | null>(null);
  const [orsKey, setOrsKey] = useState<string>('');

  // Kalman Filters for GPS Smoothing
  const kalmanLat = useRef<KalmanFilter | null>(null);
  const kalmanLon = useRef<KalmanFilter | null>(null);

  // Refs
  const mapRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const routePolylineRef = useRef<L.Polyline | null>(null);
  const markerMapRef = useRef<Record<number, L.Marker>>({});
  const myLocationMarkerRef = useRef<L.Marker | null>(null);

  // TensorFlow.js Classifier Logic
  const classifierRef = useRef<{
    model: tf.LayersModel | null;
    keywords: string[];
  }>({ model: null, keywords: [] });

  useEffect(() => {
    async function initClassifier() {
      // Simple keywords for feature extraction
      const keywords = [
        'cond', 'edificio', 'ed.', 'residencial', 'bloco', 'apto', 'apartamento', 'village', 'torre', // Condominio (9)
        'loja', 'sala', 'comercial', 'shopping', 'galeria', 'centro', 'mercado', 'farmacia', 'padaria', 'restaurante', 'oficina', 'academia', 'empresa', 'industria', 'supermercado', 'carnes', 'tintas', 'hospital', 'banco', // Comercio (19)
        'casa', 'lote', 'quadra', 'nº', 'residencia' // Casa (5)
      ];
      classifierRef.current.keywords = keywords;

      // Create a simple model: Input (keywords present) -> Dense Layer -> Output (3 classes)
      const model = tf.sequential();
      model.add(tf.layers.dense({ units: 12, activation: 'relu', inputShape: [keywords.length] }));
      model.add(tf.layers.dense({ units: 3, activation: 'softmax' }));
      model.compile({ optimizer: 'adam', loss: 'categoricalCrossentropy' });

      // "Train" with more patterns (33 keywords total)
      const xs = tf.tensor2d([
        [1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], // Condominio
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0], // Comercio
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1], // Casa
        [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], // Mixed Cond
        [0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], // Mixed Comercio
      ]);
      const ys = tf.tensor2d([
        [0, 1, 0], // Condominio
        [0, 0, 1], // Comercio
        [1, 0, 0], // Casa
        [0, 1, 0], // Condominio
        [0, 0, 1], // Comercio
      ]);

      await model.fit(xs, ys, { epochs: 50 });
      classifierRef.current.model = model;
      setIsClassifierReady(true);
    }
    initClassifier();
  }, []);

  const classifyAddress = async (address: string): Promise<'casa' | 'condominio' | 'comercio'> => {
    const addrLower = address.toLowerCase();
    
    // Heuristic override for high-confidence keywords
    if (addrLower.includes('apt') || addrLower.includes('apartamento') || addrLower.includes('bloco')) {
      return 'condominio';
    }

    if (!classifierRef.current.model) return 'casa';

    const features = classifierRef.current.keywords.map(kw => addrLower.includes(kw) ? 1 : 0);
    
    const input = tf.tensor2d([features]);
    const prediction = classifierRef.current.model.predict(input) as tf.Tensor;
    const classIdx = (await prediction.argMax(1).data())[0];
    
    input.dispose();
    prediction.dispose();

    const classes: ('casa' | 'condominio' | 'comercio')[] = ['casa', 'condominio', 'comercio'];
    return classes[classIdx];
  };

  const extractCondoName = (address: string): string | undefined => {
    const addrLower = address.toLowerCase();
    const condoKeywords = ['condominio', 'cond.', 'edificio', 'ed.', 'residencial', 'village', 'torre', 'res.'];
    
    for (const kw of condoKeywords) {
      const index = addrLower.indexOf(kw);
      if (index !== -1) {
        // Capture text after keyword until a separator
        const afterKw = address.substring(index + kw.length).trim();
        const nameMatch = afterKw.split(/[,#-]/)[0].trim();
        if (nameMatch.length > 2) return nameMatch;
      }
    }
    return undefined;
  };

  const normalizeAddress = (addr: string): string => {
    return addr
      .toUpperCase()
      .replace(/\s+/g, ' ')
      .replace(/AVENIDA/g, 'AV')
      .replace(/TRAVESSA/g, 'TV')
      .replace(/ALAMEDA/g, 'AL')
      .replace(/APARTAMENTO/g, 'APT')
      .replace(/CONDOMINIO/g, 'COND')
      .replace(/RESIDENCIAL/g, 'RES')
      .replace(/EDIFICIO/g, 'ED')
      .trim();
  };

  const handleExternalNav = (app: 'google' | 'waze' | 'apple') => {
    if (!navTarget) return;
    const { lat, lon } = navTarget;
    let url = '';
    if (app === 'google') {
      url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`;
    } else if (app === 'waze') {
      url = `https://waze.com/ul?ll=${lat},${lon}&navigate=yes`;
    } else if (app === 'apple') {
      url = `maps://maps.apple.com/?daddr=${lat},${lon}`;
    }
    window.open(url);
    setNavTarget(null);
  };

  useEffect(() => {
    routingService.setApiKey(orsKey);
  }, [orsKey]);

  // Initialize Map
  useEffect(() => {
    if (!mapRef.current) {
      const map = L.map('map', { zoomControl: false }).setView([-16.68, -49.25], 13);
      mapRef.current = map;
      markersLayerRef.current = L.layerGroup().addTo(map);
    }

    const urlDark = 'https://{s}.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}{r}.png';
    const urlLight = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
    
    const tiles = L.tileLayer(theme === 'dark' ? urlDark : urlLight).addTo(mapRef.current);

    return () => {
      tiles.remove();
    };
  }, [theme]);

  // Handle Mobile Detection
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // GPS Tracking
  useEffect(() => {
    const watchId = navigator.geolocation.watchPosition(
      (p) => {
        // Initialize Kalman filters on first position
        if (!kalmanLat.current) kalmanLat.current = new KalmanFilter(p.coords.latitude);
        if (!kalmanLon.current) kalmanLon.current = new KalmanFilter(p.coords.longitude);

        // Smooth the coordinates
        const smoothedLat = kalmanLat.current.update(p.coords.latitude);
        const smoothedLon = kalmanLon.current.update(p.coords.longitude);

        const loc = { lat: smoothedLat, lon: smoothedLon };
        setMyLocation(loc);
        
        if (mapRef.current) {
          if (!myLocationMarkerRef.current) {
            const icon = L.divIcon({
              className: 'custom-div-icon',
              html: `<div class="w-4 h-4 bg-blue-500 rounded-full border-2 border-white shadow-lg animate-pulse"></div>`,
              iconSize: [16, 16],
              iconAnchor: [8, 8]
            });
            myLocationMarkerRef.current = L.marker([loc.lat, loc.lon], { icon }).addTo(mapRef.current);
          } else {
            myLocationMarkerRef.current.setLatLng([loc.lat, loc.lon]);
          }
        }
      },
      (err) => console.error('GPS Error:', err),
      { enableHighAccuracy: true }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // Update markers when deliveries, activeId or location changes
  useEffect(() => {
    updateMarkers(deliveries, activeId);
  }, [deliveries, activeId, myLocation]);

  // File Import Logic
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      const bstr = evt.target?.result;
      const wb = XLSX.read(bstr, { type: 'binary' });
      const wsname = wb.SheetNames[0];
      const ws = wb.Sheets[wsname];
      const data = XLSX.utils.sheet_to_json<any>(ws);

      let parsed: Delivery[] = await Promise.all(data.map(async (r, i) => {
        // Helper to find value by case-insensitive keys
        const getVal = (keys: string[]) => {
          const k = Object.keys(r).find(key => keys.includes(key.toLowerCase()));
          return k ? r[k] : null;
        };

        const rawLat = getVal(['latitude', 'lat', 'y']) || r.lat || r.Latitude || r.LATITUDE;
        const rawLon = getVal(['longitude', 'lon', 'lng', 'x']) || r.lon || r.Longitude || r.LONGITUDE;
        
        // Handle Brazilian decimal separator (comma)
        const parseCoord = (val: any) => {
          if (typeof val === 'string') {
            return parseFloat(val.replace(',', '.'));
          }
          return parseFloat(val);
        };

        const lat = parseCoord(rawLat);
        const lon = parseCoord(rawLon);
        
        // Prioritize actual address fields over "local" or "nome"
        const addrFields = ['endereco', 'endereço', 'address', 'destination address', 'logradouro', 'rua'];
        const nameFields = ['local', 'destino', 'ponto', 'nome', 'cliente', 'nome do cliente'];
        
        const rawAddr = getVal(addrFields) || getVal(nameFields) || r.Endereco || r.address || r.ENDERECO || "Endereço não informado";
        const rawName = getVal(nameFields) || r.Nome || r.Cliente || r.CLIENTE;
        const addr = normalizeAddress(String(rawAddr));
        const bairro = getVal(['bairro', 'neighborhood', 'regiao', 'região', 'setor', 'distrito', 'zona']) || r.Bairro || r.BAIRRO || "Destino";

        const type = await classifyAddress(String(addr));
        const condoName = type === 'condominio' ? extractCondoName(String(addr)) : undefined;
        const verification = verifyAddress(String(addr), String(bairro));

        return {
          id: i,
          lat,
          lon,
          addr: String(addr),
          name: rawName ? String(rawName) : undefined,
          bairro: String(bairro),
          done: false,
          type,
          condoName,
          quality: verification.quality,
          verificationNotes: verification.notes
        };
      }));
      
      parsed = parsed.filter(p => !isNaN(p.lat) && !isNaN(p.lon));

      // Group by address
      const groupedMap = new Map<string, Delivery>();
      parsed.forEach(p => {
        const key = p.addr.toLowerCase().trim();
        if (groupedMap.has(key)) {
          const existing = groupedMap.get(key)!;
          existing.count = (existing.count || 1) + 1;
        } else {
          groupedMap.set(key, { ...p, count: 1 });
        }
      });
      parsed = Array.from(groupedMap.values());

      if (!isPro && parsed.length > 10) {
        alert("Versão Gratuita limitada a 10 endereços. Faça upgrade para o PRO para rotas ilimitadas!");
        parsed = parsed.slice(0, 10);
      }

      setDeliveries(parsed);
      reoptimizeRoute(parsed, true);
    };
    reader.readAsBinaryString(file);
  };

  // Route Optimization (Nearest Neighbor + 2-Opt)
  const reoptimizeRoute = (data: Delivery[], useGps: boolean) => {
    const pends = data.filter(d => !d.done);
    const dones = data.filter(d => d.done);
    
    if (pends.length === 0) {
      setDeliveries(data);
      return;
    }

    let startPos: Location = (useGps && myLocation) 
      ? myLocation 
      : { lat: pends[0].lat, lon: pends[0].lon };

    // 1. Cluster nearby points (e.g. same building or very close)
    const clusterIndices = routingService.clusterPoints(pends.map(d => ({ lat: d.lat, lon: d.lon })), 30);
    const clusters = clusterIndices.map(indices => indices.map(idx => pends[idx]));
    
    // 2. Optimize order of clusters using their centroids
    const clusterCentroids = clusters.map(c => {
      const lat = c.reduce((sum, d) => sum + d.lat, 0) / c.length;
      const lon = c.reduce((sum, d) => sum + d.lon, 0) / c.length;
      return { lat, lon };
    });

    const optimizedClusterOrder = routingService.optimizeLocal(startPos, clusterCentroids);

    // 3. Flatten optimized clusters back to deliveries
    const sortedPends: Delivery[] = [];
    optimizedClusterOrder.forEach(clusterIdx => {
      sortedPends.push(...clusters[clusterIdx]);
    });

    const newOrder = [...sortedPends, ...dones].map((d, i) => ({ ...d, order: i + 1 }));
    
    setDeliveries(newOrder);
  };

  // Update Map Markers and Route Polyline
  const updateMarkers = (data: Delivery[], currentActiveId: number | null) => {
    if (!markersLayerRef.current || !mapRef.current) return;
    
    markersLayerRef.current.clearLayers();
    markerMapRef.current = {};

    // Remove existing polyline
    if (routePolylineRef.current) {
      routePolylineRef.current.remove();
      routePolylineRef.current = null;
    }

    const routeCoords: L.LatLngExpression[] = [];
    
    // Add current location to route if available and there are pending deliveries
    if (myLocation && data.some(d => !d.done)) {
      routeCoords.push([myLocation.lat, myLocation.lon]);
    }

    data.forEach((p, i) => {
      // Create custom icon based on state
      const isActive = p.id === currentActiveId;
      const isDone = p.done;
      
      const icon = L.divIcon({
        className: 'custom-marker',
        html: `
          <div class="relative flex items-center justify-center">
            <div class="marker-pin ${isActive ? 'bg-orange-500 scale-125 z-50' : isDone ? 'bg-slate-500' : 'bg-emerald-500'} w-8 h-8 rounded-full border-2 border-white shadow-lg flex items-center justify-center text-[10px] font-black text-white transition-all duration-300">
              ${isDone ? '✓' : p.order || i + 1}
            </div>
            ${isActive ? '<div class="absolute -inset-2 bg-orange-500/30 rounded-full animate-ping"></div>' : ''}
          </div>
        `,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
        popupAnchor: [0, -16]
      });

      const marker = L.marker([p.lat, p.lon], { 
        icon,
        draggable: true 
      }).addTo(markersLayerRef.current!);
      
      markerMapRef.current[p.id] = marker;

      marker.on('dragend', (e) => {
        const newPos = e.target.getLatLng();
        handleUpdateDelivery(p.id, { lat: newPos.lat, lon: newPos.lng });
      });
      
      const popupContent = `
        <div class="p-1 min-w-[140px]">
          <div class="flex items-center justify-between mb-1">
            <div class="text-orange-500 font-black text-[10px] uppercase">${p.bairro}</div>
            <div class="text-[9px] font-bold text-slate-400 uppercase">${p.type || 'casa'}</div>
          </div>
          ${p.condoName ? `<div class="text-[10px] font-black text-emerald-600 uppercase mb-1">🏢 ${p.condoName}</div>` : ''}
          ${p.name ? `<div class="text-[10px] font-black text-slate-500 uppercase mb-1">👤 ${p.name}</div>` : ''}
          <div class="text-slate-900 font-bold text-sm leading-tight mb-2">${p.addr}</div>
          ${p.count && p.count > 1 ? `<div class="mb-2 flex items-center gap-1 text-[10px] font-black text-orange-500 bg-orange-500/10 px-1.5 py-0.5 rounded w-fit uppercase">📦 ${p.count} Pacotes</div>` : ''}
          
          <button class="edit-popup-btn w-full py-2 bg-emerald-500 text-white rounded-xl text-[10px] font-black uppercase tracking-wider hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 active:scale-95">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
            EDITAR ENTREGA
          </button>
        </div>
      `;

      marker.bindPopup(popupContent, { closeButton: false });

      marker.on('popupopen', (e) => {
        const container = e.popup.getElement();
        const editBtn = container?.querySelector('.edit-popup-btn');
        if (editBtn) {
          L.DomEvent.on(editBtn as HTMLElement, 'click', (ev) => {
            L.DomEvent.stopPropagation(ev);
            setEditingDelivery(p);
          });
        }
      });

      if (isActive) {
        marker.setZIndexOffset(1000);
        marker.openPopup();
      }

      // Only add non-completed deliveries to the active route line
      if (!p.done) {
        routeCoords.push([p.lat, p.lon]);
      }

      marker.on('click', () => {
        focusDelivery(p.id);
      });
    });

    // Draw new polyline for the pending route
    if (routeCoords.length > 1) {
      routePolylineRef.current = L.polyline(routeCoords, {
        color: '#00d1b2',
        weight: 4,
        opacity: 0.6,
        dashArray: '10, 10',
        lineJoin: 'round'
      }).addTo(mapRef.current);
    }

    // Adjust bounds if it's the first load or re-optimization
    if (data.length > 0 && !currentActiveId) {
      const bounds = L.latLngBounds(data.map(d => [d.lat, d.lon]));
      if (myLocation) bounds.extend([myLocation.lat, myLocation.lon]);
      mapRef.current.fitBounds(bounds, { padding: [50, 50] });
    }
  };

  const focusDelivery = (id: number) => {
    const p = deliveries.find(x => x.id === id);
    if (!p || !mapRef.current) return;

    setActiveId(id);
    mapRef.current.flyTo([p.lat, p.lon], 16);
    
    // Refresh markers to show active state
    updateMarkers(deliveries, id);

    if (isMobile) setIsDrawerExpanded(false);
  };

  const toggleStatus = (id: number) => {
    const updated = deliveries.map(d => 
      d.id === id ? { ...d, done: !d.done } : d
    );
    setDeliveries(updated);
  };

  const toggleType = (id: number) => {
    const types: ('casa' | 'condominio' | 'comercio')[] = ['casa', 'condominio', 'comercio'];
    const updated = deliveries.map(d => {
      if (d.id === id) {
        const currentIdx = types.indexOf(d.type || 'casa');
        const nextIdx = (currentIdx + 1) % types.length;
        return { ...d, type: types[nextIdx] };
      }
      return d;
    });
    setDeliveries(updated);
  };

  const handleUpdateDelivery = (id: number, updates: Partial<Delivery>) => {
    const updated = deliveries.map(d => {
      if (d.id === id) {
        const newDelivery = { ...d, ...updates };
        // Re-verify if address or bairro changed
        if (updates.addr || updates.bairro) {
          const verification = verifyAddress(newDelivery.addr, newDelivery.bairro);
          newDelivery.quality = verification.quality;
          newDelivery.verificationNotes = verification.notes;
        }
        return newDelivery;
      }
      return d;
    });
    setDeliveries(updated);
    setEditingDelivery(null);
  };

  const clearRoute = () => {
    if (window.confirm('Tem certeza que deseja limpar todos os dados da rota?')) {
      setDeliveries([]);
      setActiveId(null);
      setMergingId(null);
      setNavTarget(null);
      setEditingDelivery(null);
      setIsSettingsOpen(false);
      
      // Force clear map layers
      if (markersLayerRef.current) markersLayerRef.current.clearLayers();
      if (routePolylineRef.current) {
        routePolylineRef.current.remove();
        routePolylineRef.current = null;
      }

      // Reset map view
      if (mapRef.current) {
        mapRef.current.setView([-16.68, -49.25], 13);
      }
    }
  };

  const handleMerge = (sourceId: number, targetId: number) => {
    const source = deliveries.find(d => d.id === sourceId);
    const target = deliveries.find(d => d.id === targetId);
    
    if (!source || !target) return;

    const updated = deliveries.map(d => {
      if (d.id === targetId) {
        return { ...d, count: (d.count || 1) + (source.count || 1) };
      }
      return d;
    }).filter(d => d.id !== sourceId);

    setDeliveries(updated);
    setMergingId(null);
  };

  const centralizeView = () => {
    if (markersLayerRef.current && markersLayerRef.current.getLayers().length > 0) {
      const bounds = L.latLngBounds(deliveries.map(d => [d.lat, d.lon]));
      mapRef.current?.fitBounds(bounds, { padding: [50, 50] });
    } else if (myLocation) {
      mapRef.current?.flyTo([myLocation.lat, myLocation.lon], 15);
    }
  };

  return (
    <div className={cn(
      "h-screen w-screen overflow-hidden flex flex-col",
      theme === 'dark' ? "bg-slate-900 text-slate-100" : "bg-slate-50 text-slate-900"
    )}>
      {/* Top Bar */}
      <header className={cn(
        "h-16 px-4 flex items-center justify-between z-[2000] border-b",
        theme === 'dark' ? "bg-slate-800/80 border-slate-700 backdrop-blur-md" : "bg-white/80 border-slate-200 backdrop-blur-md"
      )}>
        <div className="flex items-center gap-3">
          <div className="p-2 bg-emerald-500/10 rounded-lg">
            <Compass className="w-6 h-6 text-emerald-400" />
          </div>
          <h1 className="text-lg font-bold tracking-tight">
            PoupeRota <span className={isPro ? "text-orange-500" : "text-slate-400"}>{isPro ? "PRO" : "FREE"}</span>
          </h1>
        </div>
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
            className="p-2 hover:bg-slate-700/50 rounded-full transition-colors"
          >
            {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
          <button 
            onClick={() => setIsSettingsOpen(true)}
            className="p-2 hover:bg-slate-700/50 rounded-full transition-colors"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 relative flex flex-col md:flex-row overflow-hidden">
        {/* Map Container */}
        <div id="map" className="absolute inset-0 z-10" />

        {/* Map Controls */}
        <div className="absolute right-4 top-4 z-20 flex flex-col gap-2">
          <button 
            onClick={centralizeView}
            className={cn(
              "w-12 h-12 rounded-xl shadow-lg flex items-center justify-center transition-all active:scale-95",
              theme === 'dark' ? "bg-slate-800 border border-slate-700 text-slate-100" : "bg-white border border-slate-200 text-slate-900"
            )}
          >
            <Target className="w-6 h-6" />
          </button>
        </div>

        {/* Drawer / Sidebar */}
        <AnimatePresence>
          <motion.div
            initial={false}
            animate={{ 
              height: isMobile ? (isDrawerExpanded ? '85vh' : '40vh') : '100%',
              width: isMobile ? '100%' : '400px'
            }}
            className={cn(
              "z-[1500] flex flex-col shadow-2xl transition-colors min-h-0",
              isMobile ? "fixed bottom-0 left-0 right-0 rounded-t-3xl border-t" : "relative border-l",
              theme === 'dark' ? "bg-slate-800 border-slate-700" : "bg-white border-slate-200"
            )}
          >
            {/* Handle for Mobile */}
            {isMobile && (
              <div 
                className="h-10 flex items-center justify-center cursor-pointer"
                onClick={() => setIsDrawerExpanded(!isDrawerExpanded)}
              >
                <div className="w-12 h-1.5 bg-slate-600 rounded-full" />
              </div>
            )}

            {/* List Content */}
            <div className="flex-1 overflow-y-auto min-h-0 px-4 py-2">
              {!isPro && deliveries.length > 0 && (
                <div className="mb-4 p-3 bg-orange-500/10 border border-orange-500/20 rounded-xl text-center">
                  <p className="text-[10px] font-bold text-orange-500 uppercase tracking-widest mb-1">Anúncio</p>
                  <p className="text-xs text-slate-400">Remova anúncios e tenha rotas ilimitadas com o PoupeRota PRO!</p>
                  <button 
                    onClick={() => setIsSettingsOpen(true)}
                    className="mt-2 text-[10px] font-black text-orange-500 underline uppercase"
                  >
                    Upgrade Agora
                  </button>
                </div>
              )}
              {deliveries.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-8">
                  <div className="w-16 h-16 bg-emerald-500/10 rounded-2xl flex items-center justify-center mb-4">
                    <Upload className="w-8 h-8 text-emerald-400" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">Nenhuma rota ativa</h3>
                  <p className="text-sm text-slate-400 mb-6">Importe uma planilha Excel (.xlsx) para começar a otimizar suas entregas.</p>
                  <label className="w-full py-4 px-6 border-2 border-dashed border-emerald-500/50 rounded-2xl text-emerald-400 font-bold cursor-pointer hover:bg-emerald-500/5 transition-colors text-center">
                    📂 IMPORTAR PLANILHA
                    <input type="file" className="hidden" accept=".xlsx,.xls,.csv" onChange={handleFileUpload} />
                  </label>
                </div>
              ) : (
                <div className="space-y-6 pb-24">
                  {/* Summary Section */}
                  <div className="grid grid-cols-2 gap-3 mb-2">
                    <div className={cn(
                      "p-3 rounded-2xl border flex flex-col",
                      theme === 'dark' ? "bg-slate-900/50 border-slate-700" : "bg-slate-50 border-slate-100"
                    )}>
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Total de Paradas</span>
                      <span className="text-xl font-black text-emerald-500">{deliveries.length}</span>
                    </div>
                    <div className={cn(
                      "p-3 rounded-2xl border flex flex-col",
                      theme === 'dark' ? "bg-slate-900/50 border-slate-700" : "bg-slate-50 border-slate-100"
                    )}>
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">Total de Entregas</span>
                      <span className="text-xl font-black text-orange-500">
                        {deliveries.reduce((acc, d) => acc + (d.count || 1), 0)}
                      </span>
                    </div>
                  </div>

                  {/* Pending Section */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between mb-4 px-1">
                      <span className="text-xs font-bold uppercase tracking-widest text-slate-500">
                        Pendentes ({deliveries.filter(d => !d.done).length})
                      </span>
                      <button 
                        onClick={() => reoptimizeRoute(deliveries, true)}
                        className="text-xs font-bold text-emerald-400 hover:underline flex items-center gap-1"
                      >
                        <RotateCcw className="w-3 h-3" /> Recalcular
                      </button>
                    </div>
                    
                    {deliveries.filter(d => !d.done).map((p, i) => (
                      <motion.div
                        layout
                        key={p.id}
                        onClick={() => {
                          if (mergingId && mergingId !== p.id) {
                            handleMerge(mergingId, p.id);
                          } else {
                            focusDelivery(p.id);
                          }
                        }}
                        className={cn(
                          "p-4 rounded-2xl border-2 transition-all cursor-pointer group relative",
                          mergingId === p.id ? "border-orange-500 bg-orange-500/10" :
                          mergingId && mergingId !== p.id ? "border-emerald-500/50 bg-emerald-500/5 animate-pulse" :
                          activeId === p.id 
                            ? "border-emerald-500 bg-emerald-500/5" 
                            : theme === 'dark' ? "border-slate-700 bg-slate-900/50 hover:border-slate-600" : "border-slate-100 bg-slate-50 hover:border-slate-200"
                        )}
                      >
                        {mergingId === p.id && (
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              setMergingId(null);
                            }}
                            className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center shadow-lg z-10"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        )}

                        <div className="flex justify-between items-start mb-2">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-black uppercase tracking-tighter text-orange-500 bg-orange-500/10 px-2 py-0.5 rounded">
                              {p.bairro}
                            </span>
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleType(p.id);
                              }}
                              title="Alterar tipo de endereço"
                              className="p-1 hover:bg-slate-700/50 rounded transition-colors"
                            >
                              {p.type === 'condominio' && <Building2 className="w-3 h-3 text-slate-400" />}
                              {p.type === 'comercio' && <Store className="w-3 h-3 text-slate-400" />}
                              {p.type === 'casa' && <Home className="w-3 h-3 text-slate-400" />}
                            </button>
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingDelivery(p);
                              }}
                              title="Editar endereço"
                              className="p-1 hover:bg-slate-700/50 rounded transition-colors"
                            >
                              <Edit className="w-3 h-3 text-slate-400" />
                            </button>
                          </div>
                          <div className="flex flex-col items-end">
                            <span className="text-xs font-black text-emerald-400">
                              #{p.order}
                            </span>
                            {p.count && p.count > 1 && (
                              <div className="flex items-center gap-1 text-[10px] font-black text-orange-500 bg-orange-500/10 px-1.5 py-0.5 rounded mt-1">
                                <Package className="w-2.5 h-2.5" /> {p.count}
                              </div>
                            )}
                          </div>
                        </div>
                        
                        {p.condoName && (
                          <div className="text-xs font-black text-emerald-400 uppercase mb-1 flex items-center gap-1">
                            <span className="bg-emerald-500/10 px-1.5 py-0.5 rounded">🏢 {p.condoName}</span>
                          </div>
                        )}
                        {p.name && (
                          <div className="text-[10px] font-black text-slate-400 uppercase mb-1">
                            👤 {p.name}
                          </div>
                        )}
                        <h4 className="text-sm font-semibold leading-tight mb-3">{p.addr}</h4>
                        
                        <div className="flex gap-2">
                          {mergingId ? (
                            mergingId !== p.id && (
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleMerge(mergingId, p.id);
                                }}
                                className="w-full py-2.5 bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-colors shadow-lg"
                              >
                                <Layers className="w-3.5 h-3.5" /> AGRUPAR AQUI
                              </button>
                            )
                          ) : (
                            <>
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setNavTarget(p);
                                }}
                                className="flex-1 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-colors shadow-lg shadow-emerald-500/20"
                              >
                                <Navigation className="w-3.5 h-3.5" /> NAVEGAR
                              </button>
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setMergingId(p.id);
                                }}
                                title="Agrupar com outro endereço"
                                className="p-2.5 border border-slate-600 text-slate-400 hover:bg-slate-700 rounded-xl transition-colors"
                              >
                                <Layers className="w-4 h-4" />
                              </button>
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleStatus(p.id);
                                }}
                                className="flex-1 py-2.5 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-colors"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" /> CONCLUIR
                              </button>
                            </>
                          )}
                        </div>
                      </motion.div>
                    ))}
                  </div>

                  {/* Completed Section */}
                  {deliveries.some(d => d.done) && (
                    <div className="space-y-3 pt-4 border-t border-slate-700/50">
                      <div className="px-1">
                        <span className="text-xs font-bold uppercase tracking-widest text-slate-500">
                          Concluídos ({deliveries.filter(d => d.done).length})
                        </span>
                      </div>
                      
                      {deliveries.filter(d => d.done).map((p) => (
                        <motion.div
                          layout
                          key={p.id}
                          onClick={() => focusDelivery(p.id)}
                          className={cn(
                            "p-4 rounded-2xl border-2 transition-all cursor-pointer group opacity-60 grayscale-[0.5]",
                            activeId === p.id 
                              ? "border-emerald-500 bg-emerald-500/5" 
                              : theme === 'dark' ? "border-slate-700 bg-slate-900/50 hover:border-slate-600" : "border-slate-100 bg-slate-50 hover:border-slate-200"
                          )}
                        >
                          <div className="flex justify-between items-start mb-2">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-black uppercase tracking-tighter text-slate-500 bg-slate-500/10 px-2 py-0.5 rounded">
                                {p.bairro}
                              </span>
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleType(p.id);
                                }}
                                title="Alterar tipo de endereço"
                                className="p-1 hover:bg-slate-700/50 rounded transition-colors"
                              >
                                {p.type === 'condominio' && <Building2 className="w-3 h-3 text-slate-500" />}
                                {p.type === 'comercio' && <Store className="w-3 h-3 text-slate-500" />}
                                {p.type === 'casa' && <Home className="w-3 h-3 text-slate-500" />}
                              </button>
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingDelivery(p);
                                }}
                                title="Editar endereço"
                                className="p-1 hover:bg-slate-700/50 rounded transition-colors"
                              >
                                <Edit className="w-3 h-3 text-slate-500" />
                              </button>
                            </div>
                            <div className="flex flex-col items-end">
                              <span className="text-xs font-black text-emerald-500">
                                #{p.order} - CONCLUÍDO
                              </span>
                              {p.count && p.count > 1 && (
                                <div className="flex items-center gap-1 text-[10px] font-black text-slate-500 bg-slate-500/10 px-1.5 py-0.5 rounded mt-1">
                                  <Package className="w-2.5 h-2.5" /> {p.count}
                                </div>
                              )}
                            </div>
                          </div>
                          
                          {p.condoName && (
                            <div className="text-xs font-black text-slate-500 uppercase mb-1 flex items-center gap-1">
                              <span className="bg-slate-500/10 px-1.5 py-0.5 rounded opacity-50">🏢 {p.condoName}</span>
                            </div>
                          )}
                          {p.name && (
                            <div className="text-[10px] font-black text-slate-500 uppercase mb-1 opacity-50">
                              👤 {p.name}
                            </div>
                          )}
                          <h4 className="text-sm font-semibold leading-tight mb-1 line-through text-slate-500">{p.addr}</h4>
                          
                          <div className="flex gap-2">
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleStatus(p.id);
                              }}
                              className="w-full py-2.5 border border-slate-600 text-slate-400 hover:bg-slate-700 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-colors"
                            >
                              <RotateCcw className="w-3.5 h-3.5" /> REABRIR
                            </button>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer Actions */}
            {deliveries.length > 0 && (
              <div className={cn(
                "p-4 border-t",
                theme === 'dark' ? "bg-slate-800 border-slate-700" : "bg-white border-slate-200"
              )}>
                <button 
                  onClick={() => reoptimizeRoute(deliveries, true)}
                  className="w-full py-4 bg-emerald-500 hover:bg-emerald-600 text-white rounded-2xl font-black text-sm tracking-tight transition-all shadow-xl shadow-emerald-500/20 active:scale-[0.98] flex items-center justify-center gap-2"
                >
                  <RotateCcw className="w-4 h-4" /> RECALCULAR PELA MINHA POSIÇÃO
                </button>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Settings Modal */}
      <AnimatePresence>
        {isSettingsOpen && (
          <div className="fixed inset-0 z-[3000] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSettingsOpen(false)}
              className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className={cn(
                "relative w-full max-w-md rounded-3xl shadow-2xl overflow-hidden border",
                theme === 'dark' ? "bg-slate-800 border-slate-700" : "bg-white border-slate-200"
              )}
            >
              <div className="p-6 border-b border-slate-700/50 flex items-center justify-between">
                <h2 className="text-xl font-bold">Configurações</h2>
                <button 
                  onClick={() => setIsSettingsOpen(false)}
                  className="p-2 hover:bg-slate-700/50 rounded-full"
                >
                  <ChevronDown className="w-6 h-6" />
                </button>
              </div>
              
              <div className="p-6 space-y-6">
                <div className="space-y-4">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500">Assinatura</h3>
                  
                  <button 
                    onClick={() => {
                      setIsPro(!isPro);
                      setIsSettingsOpen(false);
                    }}
                    className={cn(
                      "w-full flex items-center justify-between p-4 rounded-2xl transition-colors border",
                      isPro 
                        ? "bg-orange-500/10 border-orange-500/30 text-orange-500" 
                        : "bg-slate-900/30 border-slate-700/30 hover:bg-slate-900/50"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <Compass className={cn("w-5 h-5", isPro ? "text-orange-500" : "text-slate-400")} />
                      <span className="font-semibold">{isPro ? "Você é PRO" : "Mudar para PRO"}</span>
                    </div>
                    {!isPro && <span className="text-[10px] font-black bg-orange-500 text-white px-2 py-1 rounded">UPGRADE</span>}
                  </button>
                </div>

                <div className="space-y-4">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500">Geral</h3>
                  
                  <button 
                    onClick={() => {
                      setTheme(t => t === 'dark' ? 'light' : 'dark');
                    }}
                    className="w-full flex items-center justify-between p-4 rounded-2xl bg-slate-900/30 hover:bg-slate-900/50 transition-colors border border-slate-700/30"
                  >
                    <div className="flex items-center gap-3">
                      {theme === 'dark' ? <Moon className="w-5 h-5 text-indigo-400" /> : <Sun className="w-5 h-5 text-orange-400" />}
                      <span className="font-semibold">Tema {theme === 'dark' ? 'Escuro' : 'Claro'}</span>
                    </div>
                    <div className={cn(
                      "w-12 h-6 rounded-full relative transition-colors",
                      theme === 'dark' ? "bg-emerald-500" : "bg-slate-600"
                    )}>
                      <div className={cn(
                        "absolute top-1 w-4 h-4 bg-white rounded-full transition-all",
                        theme === 'dark' ? "left-7" : "left-1"
                      )} />
                    </div>
                  </button>
                </div>

                <div className="space-y-4">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500">Otimização Avançada</h3>
                  
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">Chave OpenRouteService (Opcional)</label>
                    <input 
                      type="password"
                      placeholder="Insira sua chave API"
                      className={cn(
                        "w-full p-3 rounded-xl border focus:ring-2 focus:ring-emerald-500 outline-none transition-all text-xs",
                        theme === 'dark' ? "bg-slate-900 border-slate-700 text-white" : "bg-slate-50 border-slate-200 text-slate-900"
                      )}
                      value={orsKey}
                      onChange={(e) => setOrsKey(e.target.value)}
                    />
                    <p className="text-[9px] text-slate-500">Necessário para Map Matching e Matriz de Distância real.</p>
                  </div>

                  <button 
                    onClick={async () => {
                      if (!orsKey) {
                        alert("Por favor, insira uma chave API do OpenRouteService primeiro.");
                        return;
                      }
                      
                      try {
                        const points = deliveries.map(d => ({ lat: d.lat, lon: d.lon }));
                        const snapped = await routingService.snapToRoads(points);
                        
                        let totalCorrection = 0;
                        const updated = deliveries.map((d, i) => {
                          const dist = routingService.getDistance({ lat: d.lat, lon: d.lon }, snapped[i]);
                          totalCorrection += dist;
                          
                          return {
                            ...d,
                            originalLat: d.originalLat || d.lat,
                            originalLon: d.originalLon || d.lon,
                            lat: snapped[i].lat,
                            lon: snapped[i].lon
                          };
                        });
                        
                        setDeliveries(updated);
                        alert(`Sucesso! ${updated.length} pontos corrigidos.\nDistância média de correção: ${(totalCorrection / updated.length).toFixed(1)}m`);
                      } catch (err) {
                        alert("Erro ao processar Map Matching. Verifique sua chave API.");
                      }
                    }}
                    className="w-full flex items-center gap-3 p-4 rounded-2xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 transition-colors border border-emerald-500/20"
                  >
                    <Target className="w-5 h-5" />
                    <span className="font-semibold">Corrigir Pontos (Map Matching)</span>
                  </button>
                </div>

                <div className="space-y-4">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500">Dados</h3>
                  
                  <button 
                    onClick={clearRoute}
                    className="w-full flex items-center gap-3 p-4 rounded-2xl bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-colors border border-red-500/20"
                  >
                    <RotateCcw className="w-5 h-5" />
                    <span className="font-semibold">Limpar Rota Atual</span>
                  </button>
                </div>

                <div className="pt-4 text-center">
                  <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">
                    PoupeRota Pro v1.2.0
                  </p>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Navigation Modal */}
      <AnimatePresence>
        {navTarget && (
          <div className="fixed inset-0 z-[3000] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setNavTarget(null)}
              className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className={cn(
                "relative w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden border",
                theme === 'dark' ? "bg-slate-800 border-slate-700" : "bg-white border-slate-200"
              )}
            >
              <div className="p-6 border-b border-slate-700/50 flex items-center justify-between">
                <h2 className="text-xl font-bold">Navegar para</h2>
                <button onClick={() => setNavTarget(null)} className="p-2 hover:bg-slate-700/50 rounded-full">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-6">
                <div className="mb-6">
                  <p className="text-sm font-semibold mb-1">{navTarget.addr}</p>
                  <p className="text-xs text-slate-500">{navTarget.bairro}</p>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  <button 
                    onClick={() => handleExternalNav('google')}
                    className="w-full py-4 bg-slate-900/30 hover:bg-slate-900/50 border border-slate-700/30 rounded-2xl font-bold text-sm flex items-center justify-center gap-3 transition-colors"
                  >
                    <img src="https://upload.wikimedia.org/wikipedia/commons/a/a9/Google_Maps_icon_%282020%29.svg" className="w-6 h-6" alt="Google Maps" />
                    Google Maps
                  </button>
                  <button 
                    onClick={() => handleExternalNav('waze')}
                    className="w-full py-4 bg-slate-900/30 hover:bg-slate-900/50 border border-slate-700/30 rounded-2xl font-bold text-sm flex items-center justify-center gap-3 transition-colors"
                  >
                    <img src="https://upload.wikimedia.org/wikipedia/commons/6/66/Waze_icon.svg" className="w-6 h-6" alt="Waze" />
                    Waze
                  </button>
                  <button 
                    onClick={() => handleExternalNav('apple')}
                    className="w-full py-4 bg-slate-900/30 hover:bg-slate-900/50 border border-slate-700/30 rounded-2xl font-bold text-sm flex items-center justify-center gap-3 transition-colors"
                  >
                    <img src="https://upload.wikimedia.org/wikipedia/commons/1/17/Apple_Maps_logo.svg" className="w-6 h-6" alt="Apple Maps" />
                    Apple Maps
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit Delivery Modal */}
      <AnimatePresence>
          {editingDelivery && (
            <div className="fixed inset-0 z-[3000] flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setEditingDelivery(null)}
                className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
              />
              <motion.div
                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.9, opacity: 0, y: 20 }}
                className={cn(
                  "relative w-full max-w-md rounded-3xl shadow-2xl overflow-hidden border",
                  theme === 'dark' ? "bg-slate-800 border-slate-700" : "bg-white border-slate-200"
                )}
              >
                <div className="p-6 border-b border-slate-700/50 flex items-center justify-between">
                  <h2 className="text-xl font-bold">Editar Endereço</h2>
                  <button onClick={() => setEditingDelivery(null)} className="p-2 hover:bg-slate-700/50 rounded-full">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="p-6 space-y-4">
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1 block">Nome / Local</label>
                    <input 
                      type="text"
                      className={cn(
                        "w-full p-3 rounded-xl border focus:ring-2 focus:ring-emerald-500 outline-none transition-all mb-4",
                        theme === 'dark' ? "bg-slate-900 border-slate-700 text-white" : "bg-slate-50 border-slate-200 text-slate-900"
                      )}
                      value={editingDelivery.name || ''}
                      onChange={(e) => setEditingDelivery({ ...editingDelivery, name: e.target.value })}
                    />
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">Endereço Completo</label>
                      {orsKey && (
                        <button 
                          onClick={async () => {
                            const snapped = await routingService.snapPoint({ lat: editingDelivery.lat, lon: editingDelivery.lon });
                            handleUpdateDelivery(editingDelivery.id, { lat: snapped.lat, lon: snapped.lon });
                            alert("Ponto alinhado à via mais próxima!");
                          }}
                          className="text-[9px] font-black text-emerald-500 uppercase hover:underline"
                        >
                          Alinhar à Via
                        </button>
                      )}
                    </div>
                    <textarea 
                      className={cn(
                        "w-full p-3 rounded-xl border focus:ring-2 focus:ring-emerald-500 outline-none transition-all resize-none h-24",
                        theme === 'dark' ? "bg-slate-900 border-slate-700 text-white" : "bg-slate-50 border-slate-200 text-slate-900"
                      )}
                      value={editingDelivery.addr}
                      onChange={(e) => setEditingDelivery({ ...editingDelivery, addr: e.target.value })}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1 block">Bairro</label>
                      <input 
                        type="text"
                        className={cn(
                          "w-full p-3 rounded-xl border focus:ring-2 focus:ring-emerald-500 outline-none transition-all",
                          theme === 'dark' ? "bg-slate-900 border-slate-700 text-white" : "bg-slate-50 border-slate-200 text-slate-900"
                        )}
                        value={editingDelivery.bairro}
                        onChange={(e) => setEditingDelivery({ ...editingDelivery, bairro: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1 block">Qtd. Pacotes</label>
                      <input 
                        type="number"
                        className={cn(
                          "w-full p-3 rounded-xl border focus:ring-2 focus:ring-emerald-500 outline-none transition-all",
                          theme === 'dark' ? "bg-slate-900 border-slate-700 text-white" : "bg-slate-50 border-slate-200 text-slate-900"
                        )}
                        value={editingDelivery.count || 1}
                        onChange={(e) => setEditingDelivery({ ...editingDelivery, count: parseInt(e.target.value) || 1 })}
                      />
                    </div>
                  </div>
                  <div className="space-y-3">
                    <button 
                      onClick={() => handleUpdateDelivery(editingDelivery.id, { 
                        addr: editingDelivery.addr, 
                        name: editingDelivery.name,
                        bairro: editingDelivery.bairro,
                        count: editingDelivery.count
                      })}
                      className="w-full py-4 bg-emerald-500 hover:bg-emerald-600 text-white rounded-2xl font-black text-sm transition-all shadow-xl shadow-emerald-500/20 active:scale-[0.98]"
                    >
                      SALVAR ALTERAÇÕES
                    </button>
                    
                    <button 
                      onClick={() => {
                        if (window.confirm('Excluir esta entrega da rota?')) {
                          setDeliveries(deliveries.filter(d => d.id !== editingDelivery.id));
                          setEditingDelivery(null);
                        }
                      }}
                      className="w-full py-4 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-2xl font-black text-sm transition-all border border-red-500/20 active:scale-[0.98]"
                    >
                      EXCLUIR ENTREGA
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    );
  }
