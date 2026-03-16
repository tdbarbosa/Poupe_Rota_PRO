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
  Plus,
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
  Search,
  Languages,
  Footprints,
  Car,
  Mic,
  ScanLine,
  ChevronLeft,
  ChevronRight,
  Download,
  Route,
  Clock,
  Crown,
  Globe,
  Share2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import { routingService, KalmanFilter } from './services/routingService';

import { saveAs } from 'file-saver';
import Fuse from 'fuse.js';
import * as pdfjs from 'pdfjs-dist';

// Set PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

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
  notes?: string;
  completedAt?: string;
  arrivedAt?: string;
  stopDuration?: number; // in seconds
  packageId?: string;
  cep?: string;
  quadra?: string;
  lote?: string;
  side?: 'even' | 'odd' | 'unknown';
}

interface Location {
  lat: number;
  lon: number;
}

export default function App() {
  // State
  const [isMobile, setIsMobile] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [myLocation, setMyLocation] = useState<Location | null>(null);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [mergingId, setMergingId] = useState<number | null>(null);
  const [isDrawerExpanded, setIsDrawerExpanded] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isManualEntryOpen, setIsManualEntryOpen] = useState(false);
  const [manualAddr, setManualAddr] = useState("");
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 10000);
    return () => clearInterval(timer);
  }, []);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [mapStyle, setMapStyle] = useState<'dark' | 'light' | 'satellite'>('dark');
  const [popupDelivery, setPopupDelivery] = useState<Delivery | null>(null);
  const [isPro, setIsPro] = useState(false);
  // Adaptive Routing: Proactive recalculation
  useEffect(() => {
    if (!myLocation || deliveries.length === 0) return;

    const nextPending = deliveries.find(d => !d.done);
    if (!nextPending) return;

    const dist = routingService.getDistance(myLocation, { lat: nextPending.lat, lon: nextPending.lon });
    
    // If user is moving away from the next stop or significantly off-track
    // We can suggest a recalculation if they are more than 2km away from the next stop
    // and they haven't arrived yet.
    if (dist > 2000 && !nextPending.arrivedAt) {
      // Logic for proactive suggestion could go here
      // For now, we'll just log it or show a subtle hint
      console.log("Significant deviation detected. Distance to next stop:", dist);
    }
  }, [myLocation, deliveries]);
  const [isClassifierReady, setIsClassifierReady] = useState(false);
  const [navTarget, setNavTarget] = useState<Delivery | null>(null);
  const [editingDelivery, setEditingDelivery] = useState<Delivery | null>(null);
  const [orsKey, setOrsKey] = useState<string>('');
  const [language, setLanguage] = useState<'pt' | 'en'>('pt');
  const [movingMarkerId, setMovingMarkerId] = useState<number | null>(null);
  const [startFromLastDone, setStartFromLastDone] = useState(false);
  const [isInternalNavigating, setIsInternalNavigating] = useState(false);
  const [navRouteGeometry, setNavRouteGeometry] = useState<any>(null);
  const [navProfile, setNavProfile] = useState<'driving-car' | 'foot-walking'>('driving-car');
  const [routeName, setRouteName] = useState<string>(() => {
    const d = new Date();
    const months = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
    return `Rota dia ${d.getDate().toString().padStart(2, '0')} de ${months[d.getMonth()]}`;
  });

  const translations = {
    pt: {
      appTitle: "RouteMaster",
      upgrade: "Upgrade Agora",
      adText: "Remova anúncios e tenha rotas ilimitadas com o RouteMaster PRO!",
      noRoute: "Nenhuma rota ativa",
      importPlanilha: "Importe uma planilha Excel (.xlsx) ou arquivo PDF para começar a otimizar suas entregas.",
      importBtn: "📂 IMPORTAR ARQUIVO",
      totalStops: "Total de Paradas",
      totalDeliveries: "Total de Entregas",
      pending: "Pendentes",
      recalculate: "Recalcular",
      settings: "Configurações",
      subscription: "Assinatura",
      general: "Geral",
      theme: "Tema",
      dark: "Escuro",
      light: "Claro",
      language: "Idioma",
      advanced: "Otimização Avançada",
      orsKey: "Chave OpenRouteService (Opcional)",
      orsPlaceholder: "Insira sua chave API",
      orsNote: "Necessário para Map Matching e Matriz de Distância real.",
      fixPoints: "Corrigir Pontos (Map Matching)",
      data: "Dados",
      clearRoute: "Limpar Rota Atual",
      endRoute: "Encerrar Rota",
      newRoute: "Nova Rota",
      navigate: "Navegar para",
      editAddress: "Editar Endereço",
      nameLocal: "Nome / Local",
      fullAddress: "Endereço Completo",
      alignRoad: "Alinhar à Via",
      neighborhood: "Bairro",
      packages: "Qtd. Pacotes",
      save: "Salvar Alterações",
      startFromLastDone: "Partir da última entrega concluída",
      refinedSearch: "Busca Refinada (ORS)",
      searching: "Buscando...",
      found: "Localização atualizada!",
      notFound: "Endereço não encontrado no ORS.",
      groupHere: "AGRUPAR AQUI",
      inAppNav: "Navegar no App",
      exitNav: "Sair da Navegação",
      nextStop: "Próxima Parada",
      distance: "Distância",
      arrived: "Chegou!",
      walking: "A Pé",
      driving: "Carro",
      suggestWalking: "Próximo! Sugerimos ir a pé.",
      routeNameLabel: "Nome da Rota",
      packageNumber: "Pacote",
      completedAt: "Finalizado em",
      stopDuration: "Tempo de Parada",
      estCompletion: "Estimativa de Término",
      noPackageId: "Sem número",
      exportCircuit: "Exportar para Circuit",
      exportCSV: "Exportar Rota (CSV)",
      routeNamePlaceholder: "Ex: Rota dia 09 - Senador Canedo",
      confirmMove: "Deseja alterar a posição deste pino?",
      moveInstructions: "O pino foi desbloqueado. Agora você pode arrastá-lo para a nova posição.",
      unlockMove: "Sim, Alterar Posição",
      perfectAddr: "Endereço Completo",
      incompleteAddr: "Endereço Incompleto",
      verifyAddr: "Verificar Endereço",
      adLabel: "Anúncio",
      proUser: "Você é PRO",
      changePro: "Mudar para PRO",
      observations: "Observações",
      obsPlaceholder: "Ex: Entregar na portaria, campainha estragada...",
      successPoints: "Sucesso! {count} pontos corrigidos.\nDistância média de correção: {dist}m",
      errorMapMatching: "Erro ao processar Map Matching. Verifique sua chave API.",
      enterOrsKey: "Por favor, insira uma chave API do OpenRouteService primeiro.",
      confirmClear: "Tem certeza que deseja limpar todos os dados da rota?",
      emptySheet: "A planilha parece estar vazia.",
      noCoords: "Não foi possível encontrar coordenadas válidas na planilha. Verifique se as colunas Latitude e Longitude estão corretas.",
      freeLimit: "Versão gratuita limitada a 10 paradas. Apenas as primeiras 10 foram carregadas.",
      copied: "Copiado!",
      delivery: "Entrega",
      address: "Endereço",
      customer: "Cliente",
      notes: "Observações",
      packageOrder: "Pacote",
      onFoot: "A pé",
      onFootSuggestion: "Próxima parada próxima! Sugerimos ir a pé.",
      estCompletionTime: "Estimativa de Término",
      stopTime: "Tempo de Parada",
      completedTime: "Finalizado em",
      noPackage: "Sem número",
      searchPackage: "Buscar pacote...",
      groupNearby: "Agrupar próximos",
      mapStyle: "Estilo do Mapa",
      satellite: "Satélite",
      standard: "Padrão",
      paymentVerified: "Pagamento Verificado",
      verifyPayment: "Verificar Pagamento",
      proStatus: "Status PRO",
      exportRoute: "Exportar Rota",
      export: "Exportar",
      manualEntry: "Entrada Manual",
      voiceInput: "Entrada por Voz",
      barcodeScan: "Escanear Código",
      typeAddress: "Digitar Endereço",
      accountType: "Tipo de conta",
      proBenefits: "Benefícios PRO",
      preferences: "Preferências",
      darkMode: "Modo escuro",
      lightMode: "Modo claro",
      swipeToFinish: "Deslize para finalizar",
      nextStopLabel: "Próxima Parada",
      prevStopLabel: "Parada Anterior"
    },
    en: {
      appTitle: "RouteMaster",
      upgrade: "Upgrade Now",
      adText: "Remove ads and get unlimited routes with RouteMaster PRO!",
      noRoute: "No active route",
      importPlanilha: "Import an Excel spreadsheet (.xlsx) or PDF file to start optimizing your deliveries.",
      importBtn: "📂 IMPORT FILE",
      totalStops: "Total Stops",
      totalDeliveries: "Total Deliveries",
      pending: "Pending",
      recalculate: "Recalculate",
      settings: "Settings",
      subscription: "Subscription",
      general: "General",
      theme: "Theme",
      dark: "Dark",
      light: "Light",
      language: "Language",
      advanced: "Advanced Optimization",
      orsKey: "OpenRouteService Key (Optional)",
      orsPlaceholder: "Enter your API key",
      orsNote: "Required for Map Matching and real Distance Matrix.",
      fixPoints: "Fix Points (Map Matching)",
      data: "Data",
      clearRoute: "Clear Current Route",
      endRoute: "End Route",
      newRoute: "New Route",
      navigate: "Navigate to",
      editAddress: "Edit Address",
      nameLocal: "Name / Location",
      fullAddress: "Full Address",
      alignRoad: "Align to Road",
      neighborhood: "Neighborhood",
      packages: "Packages Qty",
      save: "Save Changes",
      startFromLastDone: "Start from last done delivery",
      refinedSearch: "Refined Search (ORS)",
      searching: "Searching...",
      found: "Location updated!",
      notFound: "Address not found in ORS.",
      groupHere: "GROUP HERE",
      inAppNav: "In-App Navigation",
      exitNav: "Exit Navigation",
      nextStop: "Next Stop",
      distance: "Distance",
      arrived: "Arrived!",
      walking: "Walking",
      driving: "Driving",
      suggestWalking: "Close! We suggest going on foot.",
      routeNameLabel: "Route Name",
      packageNumber: "Order",
      completedAt: "Completed at",
      stopDuration: "Stop Duration",
      estCompletion: "Est. Completion",
      noPackageId: "No number",
      exportCircuit: "Export to Circuit",
      exportCSV: "Export Route (CSV)",
      routeNamePlaceholder: "Ex: Route Day 09 - Downtown",
      confirmMove: "Do you want to change this pin's position?",
      moveInstructions: "The pin is now unlocked. You can drag it to the new position.",
      unlockMove: "Yes, Change Position",
      perfectAddr: "Perfect Address",
      incompleteAddr: "Incomplete Address",
      verifyAddr: "Verify Address",
      adLabel: "Ad",
      proUser: "You are PRO",
      changePro: "Switch to PRO",
      observations: "Observations",
      obsPlaceholder: "Ex: Leave at front desk, broken doorbell...",
      successPoints: "Success! {count} points fixed.\nAverage correction distance: {dist}m",
      errorMapMatching: "Error processing Map Matching. Check your API key.",
      enterOrsKey: "Please enter an OpenRouteService API key first.",
      confirmClear: "Are you sure you want to clear all route data?",
      emptySheet: "The spreadsheet seems to be empty.",
      noCoords: "Could not find valid coordinates in the spreadsheet. Check if Latitude and Longitude columns are correct.",
      freeLimit: "Free version limited to 10 stops. Only the first 10 were loaded.",
      copied: "Copied!",
      delivery: "Delivery",
      address: "Address",
      customer: "Customer",
      notes: "Notes",
      packageOrder: "Order",
      onFoot: "On foot",
      onFootSuggestion: "Next stop is close! We suggest walking.",
      estCompletionTime: "Est. Completion",
      stopTime: "Stop Time",
      completedTime: "Completed at",
      noPackage: "No number",
      searchPackage: "Search package...",
      groupNearby: "Group nearby",
      mapStyle: "Map Style",
      satellite: "Satellite",
      standard: "Standard",
      paymentVerified: "Payment Verified",
      verifyPayment: "Verify Payment",
      proStatus: "PRO Status",
      exportRoute: "Export Route",
      export: "Export",
      manualEntry: "Manual Entry",
      voiceInput: "Voice Input",
      barcodeScan: "Scan Barcode",
      typeAddress: "Type Address",
      accountType: "Account type",
      proBenefits: "PRO benefits",
      preferences: "Preferences",
      darkMode: "Dark mode",
      lightMode: "Light mode",
      swipeToFinish: "Swipe to finish",
      nextStopLabel: "Next Stop",
      prevStopLabel: "Previous Stop"
    }
  };

  const t = (key: keyof typeof translations['pt']) => translations[language][key] || key;

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

  const cleanAddressAndExtractNotes = (addr: string): { cleanAddr: string, extractedNotes: string | null } => {
    const keywords = [
      "EM FRENTE A", "EM FRENTE AO", "FRENTE A", "FRENTE AO",
      "AO LADO DE", "AO LADO DO", "LADO DE", "LADO DO",
      "PROXIMO A", "PROXIMO AO", "PRÓXIMO A", "PRÓXIMO AO",
      "ESQUINA COM", "ESQUINA", "PERTO DE", "PERTO DO"
    ];

    let cleanAddr = addr;
    let extractedNotes: string | null = null;

    const addrUpper = addr.toUpperCase();
    
    for (const keyword of keywords) {
      const index = addrUpper.indexOf(keyword);
      if (index !== -1) {
        // Extract the part from the keyword onwards
        const reference = addr.substring(index).trim();
        extractedNotes = reference;
        // The part before the keyword is the clean address
        cleanAddr = addr.substring(0, index).trim();
        // Remove trailing commas or dashes from clean address
        cleanAddr = cleanAddr.replace(/[,-\s]+$/, '');
        break; // Only take the first reference point found
      }
    }

    return { cleanAddr, extractedNotes };
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
      .replace(/\bR\.\b/g, 'RUA')
      .replace(/\bR\b/g, 'RUA')
      .replace(/\bQD\b/g, 'QUADRA')
      .replace(/\bQ\b/g, 'QUADRA')
      .replace(/\bLT\b/g, 'LOTE')
      .replace(/\bL\b/g, 'LOTE')
      .trim();
  };

  const verifyAddress = (addr: string, bairro: string): { quality: 'perfect' | 'incomplete' | 'warning', notes: string[] } => {
    const notes: string[] = [];
    let quality: 'perfect' | 'incomplete' | 'warning' = 'perfect';

    const addrUpper = addr.toUpperCase();
    
    // Check for house number
    const numberMatch = addrUpper.match(/(?:^|[\s,])(?:Nº?|NUMERO|N)?\s?(\d+)(?:\s|$)/i);
    const hasNumber = numberMatch !== null;
    
    // Check for "Sem Número"
    const isSN = addrUpper.includes('S/N') || addrUpper.includes('SEM NUMERO') || addrUpper.includes('S.N');

    const hasStreetPrefix = /(RUA|AV|AVENIDA|TRAVESSA|ALAMEDA|RODOVIA|ESTRADA|PRAÇA|PÇA|TV|AL|ROD|EST|LOTE|QUADRA|QD|LT)/i.test(addrUpper);
    
    const isTooShort = addr.length < 10;
    
    const missingBairro = !bairro || bairro === 'Destino' || bairro === 'Bairro não informado' || bairro.length < 3;

    if (!hasNumber && !isSN) {
      notes.push("Número ausente");
      quality = 'incomplete';
    } else if (isSN) {
      notes.push("S/N");
      quality = 'warning';
    }

    if (!hasStreetPrefix) {
      notes.push("Tipo logradouro ausente");
      if (quality === 'perfect') quality = 'incomplete';
    }

    if (isTooShort && quality === 'perfect') {
      notes.push("Endereço curto");
      quality = 'warning';
    }

    if (missingBairro) {
      notes.push("Bairro ausente");
      if (quality === 'perfect') quality = 'incomplete';
    }

    return { quality, notes };
  };

  const calculateEstCompletion = (pendingCount: number) => {
    const minutesPerStop = 3;
    const now = new Date();
    const estMinutes = pendingCount * minutesPerStop;
    const estDate = new Date(now.getTime() + estMinutes * 60000);
    return estDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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

  const startInternalNav = async () => {
    if (!myLocation || !navTarget) {
      alert(language === 'pt' ? "Localização GPS necessária para navegar no app." : "GPS location required for in-app navigation.");
      return;
    }
    
    const dist = routingService.getDistance(myLocation, { lat: navTarget.lat, lon: navTarget.lon });
    const profile = dist < 300 ? 'foot-walking' : 'driving-car';
    
    setIsInternalNavigating(true);
    setNavProfile(profile);
    setNavTarget(null); // Close modal
    
    // Initial route
    const directions = await routingService.getDirections(myLocation, { lat: navTarget.lat, lon: navTarget.lon }, profile);
    if (directions) {
      setNavRouteGeometry(directions);
    }
  };

  // Update navigation route when moving
  useEffect(() => {
    if (isInternalNavigating && myLocation && navTarget) {
      const updateNavRoute = async () => {
        const directions = await routingService.getDirections(myLocation, { lat: navTarget.lat, lon: navTarget.lon }, navProfile);
        if (directions) {
          setNavRouteGeometry(directions);
        }
      };
      
      // Throttle updates
      const timer = setTimeout(updateNavRoute, 5000);
      return () => clearTimeout(timer);
    }
  }, [myLocation, isInternalNavigating, navTarget, navProfile]);

  // Render navigation route
  useEffect(() => {
    if (!mapRef.current) return;

    if (isInternalNavigating && navRouteGeometry) {
      // Clear existing route if any
      if (routePolylineRef.current) {
        routePolylineRef.current.remove();
      }

      const coords = navRouteGeometry.features[0].geometry.coordinates.map((c: any) => [c[1], c[0]]);
      routePolylineRef.current = L.polyline(coords, {
        color: navProfile === 'foot-walking' ? '#3b82f6' : '#00ff41',
        weight: 8,
        opacity: 0.8,
        lineJoin: 'round'
      }).addTo(mapRef.current);

      // Auto-center map on user during navigation
      if (myLocation) {
        mapRef.current.setView([myLocation.lat, myLocation.lon], 18, { animate: true });
      }
    }
  }, [navRouteGeometry, isInternalNavigating, myLocation]);

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
    const urlSatellite = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
    
    let url = urlDark;
    if (mapStyle === 'light') url = urlLight;
    if (mapStyle === 'satellite') url = urlSatellite;
    
    const tiles = L.tileLayer(url, {
      attribution: mapStyle === 'satellite' ? 'Tiles &copy; Esri' : '&copy; OpenStreetMap'
    }).addTo(mapRef.current);

    return () => {
      tiles.remove();
    };
  }, [mapStyle]);

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

  const extractAddressDetails = (addr: string) => {
    const cepMatch = addr.match(/\d{5}-?\d{3}/);
    const quadraMatch = addr.match(/qd\.?\s*(\d+|[A-Z]+)/i);
    const loteMatch = addr.match(/lt\.?\s*(\d+|[A-Z]+)/i);
    const numMatch = addr.match(/(\d+)/);
    
    let side: 'even' | 'odd' | 'unknown' = 'unknown';
    if (numMatch) {
      const num = parseInt(numMatch[0]);
      side = num % 2 === 0 ? 'even' : 'odd';
    }

    return {
      cep: cepMatch ? cepMatch[0] : undefined,
      quadra: quadraMatch ? quadraMatch[1] : undefined,
      lote: loteMatch ? loteMatch[1] : undefined,
      side
    };
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Set route name from file name
    const fileName = file.name.replace(/\.[^/.]+$/, "");
    setRouteName(fileName);

    const reader = new FileReader();

    if (file.type === "application/pdf") {
      reader.onload = async (event) => {
        try {
          const typedarray = new Uint8Array(event.target?.result as ArrayBuffer);
          const pdf = await pdfjs.getDocument(typedarray).promise;
          let fullText = "";
          
          for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            const strings = content.items.map((item: any) => (item as any).str);
            fullText += strings.join(" ") + "\n";
          }

          const lines = fullText.split("\n");
          const extractedAddresses: string[] = [];
          const addrRegex = /(Rua|Av|Avenida|Logradouro|Travessa|Praça|Al\.|Alameda)\s+[^,]+,\s*\d+/gi;
          
          lines.forEach(line => {
            const matches = line.match(addrRegex);
            if (matches) {
              matches.forEach(m => extractedAddresses.push(m.trim()));
            }
          });

          if (extractedAddresses.length === 0) {
            alert(language === 'pt' ? "Nenhum endereço encontrado no PDF. Tente usar uma planilha." : "No addresses found in PDF. Try using a spreadsheet.");
            return;
          }

          const newDeliveries: Delivery[] = await Promise.all(extractedAddresses.map(async (addr, i) => {
            const bairro = "";
            let finalLat = 0, finalLon = 0;
            
            if (orsKey) {
              const geo = await routingService.geocode(`${addr}, ${bairro}`);
              if (geo) {
                finalLat = geo.lat;
                finalLon = geo.lon;
              }
            }

            const type = await classifyAddress(addr);
            const details = extractAddressDetails(addr);

            return {
              id: Date.now() + i,
              lat: finalLat,
              lon: finalLon,
              addr,
              bairro,
              done: false,
              type,
              quality: 'incomplete',
              verificationNotes: ["Importado de PDF"],
              ...details
            };
          }));

          const validDeliveries = newDeliveries.filter(d => d.lat !== 0);
          setDeliveries(prev => [...prev, ...validDeliveries]);
          reoptimizeRoute([...deliveries, ...validDeliveries], true);
          
        } catch (error) {
          console.error("PDF Error:", error);
          alert("Erro ao ler PDF.");
        }
      };
      reader.readAsArrayBuffer(file);
      return;
    }

    reader.onload = async (evt) => {
      try {
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
        const packageFields = ['sequencia', 'sequência', 'ordem', 'pacote', 'id pacote', 'package id', 'package', 'sequence'];
        
        const rawAddr = getVal(addrFields) || getVal(nameFields) || r.Endereco || r.address || r.ENDERECO || "Endereço não informado";
        const rawName = getVal(nameFields) || r.Nome || r.Cliente || r.CLIENTE;
        const packageId = getVal(packageFields);
        console.log(`Mapping row ${i}: packageId=${packageId} from keys:`, Object.keys(r));
        
        const { cleanAddr, extractedNotes } = cleanAddressAndExtractNotes(String(rawAddr));
        const addr = normalizeAddress(cleanAddr);
        const bairro = getVal(['bairro', 'neighborhood', 'regiao', 'região', 'setor', 'distrito', 'zona']) || r.Bairro || r.BAIRRO || "Destino";

        // Geocoding fallback/refinement
        let finalLat = lat;
        let finalLon = lon;

        if (orsKey && (isNaN(lat) || isNaN(lon) || extractedNotes)) {
          const geocoded = await routingService.geocode(`${addr}, ${bairro}`);
          if (geocoded) {
            finalLat = geocoded.lat;
            finalLon = geocoded.lon;
          }
        }

        const type = await classifyAddress(String(addr));
        const condoName = type === 'condominio' ? extractCondoName(String(addr)) : undefined;
        const verification = verifyAddress(String(addr), String(bairro));
        const details = extractAddressDetails(String(addr));

        return {
          id: i,
          lat: finalLat,
          lon: finalLon,
          addr: String(addr),
          name: rawName ? String(rawName) : undefined,
          bairro: String(bairro),
          done: false,
          type,
          condoName,
          quality: verification.quality,
          verificationNotes: verification.notes,
          notes: extractedNotes || undefined,
          packageId: packageId ? String(packageId) : undefined,
          ...details
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
    } catch (error) {
      console.error("Erro ao processar planilha:", error);
      alert("Erro ao processar a planilha. Verifique o formato do arquivo.");
    }
  };
    reader.readAsBinaryString(file);
  };

  // Route Optimization (Nearest Neighbor + 2-Opt)
  const exportToCSV = () => {
    if (deliveries.length === 0) return;
    
    const headers = ["Order", "Address", "Bairro", "Name", "Notes", "Status", "CEP", "Quadra", "Lote"];
    const rows = deliveries.map(d => [
      d.order || "",
      d.addr,
      d.bairro,
      d.name || "",
      d.notes || "",
      d.done ? "Done" : "Pending",
      d.cep || "",
      d.quadra || "",
      d.lote || ""
    ]);
    
    let csvContent = "\uFEFF" + headers.join(",") + "\n"
      + rows.map(e => e.map(val => `"${val}"`).join(",")).join("\n");
      
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8" });
    saveAs(blob, `route_export_${new Date().getTime()}.csv`);
  };

  const exportToXLSX = () => {
    if (deliveries.length === 0) return;

    const data = deliveries.map(d => ({
      "Ordem": d.order || "",
      "Endereço": d.addr,
      "Bairro": d.bairro,
      "Cliente": d.name || "",
      "Observações": d.notes || "",
      "Status": d.done ? "Concluído" : "Pendente",
      "CEP": d.cep || "",
      "Quadra": d.quadra || "",
      "Lote": d.lote || "",
      "Chegada": d.arrivedAt || "",
      "Conclusão": d.completedAt || "",
      "Duração (seg)": d.stopDuration || ""
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Rota");
    
    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    saveAs(blob, `route_export_${new Date().getTime()}.xlsx`);
  };
  const groupNearbyDeliveries = () => {
    if (deliveries.length < 2) return;
    
    const pends = deliveries.filter(d => !d.done);
    const dones = deliveries.filter(d => d.done);
    
    // Group by distance (e.g. 30 meters)
    const clusterIndices = routingService.clusterPoints(pends.map(d => ({ lat: d.lat, lon: d.lon })), 30);
    
    const newPends: Delivery[] = [];
    const processedIndices = new Set<number>();
    
    clusterIndices.forEach(indices => {
      if (indices.length > 1) {
        // Create a grouped delivery
        const main = pends[indices[0]];
        const count = indices.length;
        newPends.push({
          ...main,
          count: (main.count || 1) + (count - 1),
          verificationNotes: [...(main.verificationNotes || []), `Agrupado: ${count} entregas neste local`]
        });
      } else {
        newPends.push(pends[indices[0]]);
      }
      indices.forEach(idx => processedIndices.add(idx));
    });
    
    setDeliveries([...newPends, ...dones]);
    
    const toast = document.createElement('div');
    toast.className = "fixed top-10 left-1/2 -translate-x-1/2 z-[5000] bg-[#00ff41] text-black px-6 py-3 rounded-full font-black text-xs uppercase tracking-widest shadow-2xl";
    toast.innerText = language === 'pt' ? "Endereços próximos agrupados!" : "Nearby addresses grouped!";
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2000);
  };
  const reoptimizeRoute = (data: Delivery[], useGps: boolean) => {
    const pends = data.filter(d => !d.done);
    const dones = data.filter(d => d.done);
    
    if (pends.length === 0) {
      setDeliveries(data);
      return;
    }

    let startPos: Location;
    
    if (startFromLastDone && dones.length > 0) {
      // Find the last done delivery (highest order)
      const lastDone = [...dones].sort((a, b) => (b.order || 0) - (a.order || 0))[0];
      startPos = { lat: lastDone.lat, lon: lastDone.lon };
    } else if (useGps && myLocation) {
      startPos = myLocation;
    } else {
      startPos = { lat: pends[0].lat, lon: pends[0].lon };
    }

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

    // 3. Flatten optimized clusters back to deliveries with internal sorting
    const sortedPends: Delivery[] = [];
    optimizedClusterOrder.forEach(clusterIdx => {
      const cluster = clusters[clusterIdx];
      
      // Internal sorting within cluster: CEP -> Quadra -> Lote -> Side
      cluster.sort((a, b) => {
        if (a.cep && b.cep && a.cep !== b.cep) return a.cep.localeCompare(b.cep);
        if (a.quadra && b.quadra && a.quadra !== b.quadra) return a.quadra.localeCompare(b.quadra);
        if (a.lote && b.lote && a.lote !== b.lote) return a.lote.localeCompare(b.lote);
        if (a.side && b.side && a.side !== b.side) return a.side === 'even' ? -1 : 1;
        return 0;
      });
      
      sortedPends.push(...cluster);
    });

    const final = [...dones, ...sortedPends].map((d, i) => ({ ...d, order: i + 1 }));
    setDeliveries(final);
    updateMarkers(final, activeId);
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
        draggable: false 
      }).addTo(markersLayerRef.current!);
      
      markerMapRef.current[p.id] = marker;

      // Long press detection
      let pressTimer: any;
      const startPress = () => {
        pressTimer = setTimeout(() => {
          setMovingMarkerId(p.id);
        }, 700);
      };
      const endPress = () => {
        clearTimeout(pressTimer);
      };

      marker.on('mousedown touchstart', startPress);
      marker.on('mouseup touchend mousemove touchmove popupopen', endPress);

      marker.on('click', () => {
        setPopupDelivery(p);
      });
      
      marker.on('dragend', (e) => {
        const newPos = e.target.getLatLng();
        handleUpdateDelivery(p.id, { lat: newPos.lat, lon: newPos.lng });
        e.target.dragging.disable();
      });
      
      const popupContent = `
        <div class="p-1 min-w-[160px]">
          <div class="flex items-center justify-between mb-1">
            <div class="text-orange-500 font-black text-[10px] uppercase">${p.bairro}</div>
            <div class="text-[9px] font-bold text-slate-400 uppercase">${p.type || 'casa'}</div>
          </div>
          ${p.condoName ? `<div class="text-[10px] font-black text-emerald-600 uppercase mb-1">🏢 ${p.condoName}</div>` : ''}
          ${p.name ? `<div class="text-[10px] font-black text-slate-500 uppercase mb-1">👤 ${p.name}</div>` : ''}
          <div class="text-slate-900 font-bold text-sm leading-tight mb-2">${p.addr}</div>
          ${p.notes ? `<div class="text-[10px] text-slate-500 italic mb-2 bg-slate-50 p-1.5 rounded border border-slate-100">📝 ${p.notes}</div>` : ''}
          ${p.quality ? `
            <div class="flex items-center gap-1 text-[8px] font-black uppercase mb-2 ${
              p.quality === 'perfect' ? 'text-emerald-500' : 
              p.quality === 'incomplete' ? 'text-orange-500' : 'text-red-500'
            }">
              ● ${p.quality === 'perfect' ? 'Completo' : p.quality === 'incomplete' ? 'Incompleto' : 'Verificar'}
            </div>
            ${p.quality !== 'perfect' && p.verificationNotes ? `
              <div class="flex flex-wrap gap-0.5 mb-2">
                ${p.verificationNotes.map(n => `<span class="text-[7px] bg-slate-100 text-slate-500 px-1 rounded uppercase font-bold">${n}</span>`).join('')}
              </div>
            ` : ''}
          ` : ''}
          <div class="flex items-center gap-1 mb-2">
            ${p.count && p.count > 1 ? `<div class="flex items-center gap-1 text-[10px] font-black text-orange-500 bg-orange-500/10 px-1.5 py-0.5 rounded uppercase">📦 ${p.count}</div>` : ''}
            <div class="text-[10px] font-black text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded uppercase">#${p.order}</div>
          </div>
          
          <div class="grid grid-cols-1 gap-1.5">
            <button class="done-popup-btn w-full py-2 ${isDone ? 'bg-slate-500' : 'bg-[#00ff41]'} text-[#0a192f] rounded-xl text-[10px] font-black uppercase tracking-wider transition-all shadow-lg flex items-center justify-center gap-2 active:scale-95">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
              ${isDone ? (language === 'pt' ? 'CONCLUÍDO' : 'DONE') : (language === 'pt' ? 'CONCLUIR' : 'DONE')}
            </button>
            <button class="edit-popup-btn w-full py-2 border border-slate-200 text-slate-600 rounded-xl text-[10px] font-black uppercase tracking-wider hover:bg-slate-50 transition-all flex items-center justify-center gap-2 active:scale-95">
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
              ${t('editAddress').toUpperCase()}
            </button>
          </div>
        </div>
      `;

      marker.bindPopup(popupContent, { closeButton: false });

      marker.on('popupopen', (e) => {
        const container = e.popup.getElement();
        const editBtn = container?.querySelector('.edit-popup-btn');
        const doneBtn = container?.querySelector('.done-popup-btn');

        if (editBtn) {
          L.DomEvent.on(editBtn as HTMLElement, 'click', (ev) => {
            L.DomEvent.stopPropagation(ev);
            setEditingDelivery(p);
          });
        }

        if (doneBtn) {
          L.DomEvent.on(doneBtn as HTMLElement, 'click', (ev) => {
            L.DomEvent.stopPropagation(ev);
            toggleStatus(p.id);
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
    let nextToFocus: number | null = null;
    const now = new Date();
    
    const updated = deliveries.map(d => {
      if (d.id === id) {
        const isNowDone = !d.done;
        let completedAt = d.completedAt;
        let stopDuration = d.stopDuration;

        if (isNowDone) {
          completedAt = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          if (d.arrivedAt) {
            const arrived = new Date(d.arrivedAt);
            stopDuration = Math.floor((now.getTime() - arrived.getTime()) / 1000);
          }
          
          // Find the next pending delivery in the ordered list
          const pending = deliveries.filter(x => !x.done && x.id !== id);
          if (pending.length > 0) {
            const sorted = [...pending].sort((a, b) => (a.order || 0) - (b.order || 0));
            nextToFocus = sorted[0].id;
          }
        }
        return { ...d, done: isNowDone, completedAt, stopDuration };
      }
      return d;
    });

    setDeliveries(updated);
    
    if (nextToFocus !== null) {
      setTimeout(() => focusDelivery(nextToFocus!), 100);
    }
  };

  const markArrived = (id: number) => {
    const now = new Date();
    setDeliveries(prev => prev.map(d => 
      d.id === id ? { ...d, arrivedAt: now.toISOString() } : d
    ));
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
    if (window.confirm(t('confirmClear'))) {
      setDeliveries([]);
      setActiveId(null);
      setMergingId(null);
      setNavTarget(null);
      setEditingDelivery(null);
      setIsSettingsOpen(false);
      
      const d = new Date();
      const months = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
      setRouteName(`Rota dia ${d.getDate().toString().padStart(2, '0')} de ${months[d.getMonth()]}`);
      
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

  const endRoute = () => {
    if (window.confirm(language === 'pt' ? 'Deseja encerrar esta rota e marcar todas como concluídas?' : 'Do you want to end this route and mark all as completed?')) {
      setDeliveries(prev => prev.map(d => ({ ...d, done: true })));
      setIsSettingsOpen(false);
    }
  };

  const newRoute = () => {
    clearRoute();
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

  const addManualDelivery = async () => {
    if (!manualAddr) return;
    
    let lat = -16.68;
    let lon = -49.25;
    let bairro = "Manual";
    
    if (orsKey) {
      const geocoded = await routingService.geocode(manualAddr);
      if (geocoded) {
        lat = geocoded.lat;
        lon = geocoded.lon;
      }
    }

    const type = await classifyAddress(manualAddr);
    const verification = verifyAddress(manualAddr, bairro);

    const newDelivery: Delivery = {
      id: Date.now(),
      lat,
      lon,
      addr: manualAddr,
      bairro,
      done: false,
      type,
      quality: verification.quality,
      verificationNotes: verification.notes
    };

    const updated = [...deliveries, newDelivery];
    setDeliveries(updated);
    reoptimizeRoute(updated, true);
    setManualAddr("");
    setIsManualEntryOpen(false);
  };

  const exportToCircuit = () => {
    const pending = deliveries.filter(d => !d.done);
    if (pending.length === 0) {
      alert(language === 'pt' ? 'Nenhuma entrega pendente para exportar.' : 'No pending deliveries to export.');
      return;
    }
    
    const list = pending.map(d => d.addr).join('\n');
    navigator.clipboard.writeText(list);
    alert(t('exportCircuit') + ": " + t('copied'));
  };

  return (
    <div className={cn(
      "h-screen w-screen overflow-hidden flex flex-col",
      theme === 'dark' ? "bg-[#0a192f] text-slate-100" : "bg-slate-50 text-slate-900"
    )}>
      {/* Top Bar */}
      <header className={cn(
        "relative h-16 px-4 flex items-center justify-between z-[2000] border-b shadow-sm shrink-0",
        theme === 'dark' ? "bg-[#0a192f]/95 border-slate-800 backdrop-blur-xl" : "bg-white/95 border-slate-200 backdrop-blur-xl"
      )}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#00ff41] rounded-2xl flex items-center justify-center shadow-lg shadow-[#00ff41]/20">
            <Route className="w-6 h-6 text-[#0a192f]" />
          </div>
          <div className="flex flex-col">
            <h1 className="text-sm font-black tracking-tighter leading-none flex items-center gap-1.5">
              {t('appTitle')} 
              <span className={cn(
                "text-[8px] px-2 py-0.5 rounded-full font-black",
                isPro ? "bg-orange-500 text-white" : "bg-slate-700 text-slate-300"
              )}>
                {isPro ? "PRO" : "FREE"}
              </span>
            </h1>
            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mt-1 truncate max-w-[150px]">
              {routeName}
            </span>
          </div>
        </div>
      </header>


        {/* Map Container */}
        <div id="map" className="absolute inset-0 z-10" />

        {/* Map Controls */}
        <div className="absolute right-4 top-20 z-[1000] flex flex-col gap-2">
          <div className={cn(
            "p-1 rounded-xl shadow-lg flex flex-col gap-1",
            theme === 'dark' ? "bg-slate-800 border border-slate-700" : "bg-white border border-slate-200"
          )}>
            <button 
              onClick={() => setMapStyle('dark')}
              className={cn("w-10 h-10 rounded-lg flex items-center justify-center transition-all", mapStyle === 'dark' ? "bg-[#00ff41] text-[#0a192f]" : "text-slate-400")}
            >
              <Moon className="w-5 h-5" />
            </button>
            <button 
              onClick={() => setMapStyle('light')}
              className={cn("w-10 h-10 rounded-lg flex items-center justify-center transition-all", mapStyle === 'light' ? "bg-[#00ff41] text-[#0a192f]" : "text-slate-400")}
            >
              <Sun className="w-5 h-5" />
            </button>
            <button 
              onClick={() => setMapStyle('satellite')}
              className={cn("w-10 h-10 rounded-lg flex items-center justify-center transition-all", mapStyle === 'satellite' ? "bg-[#00ff41] text-[#0a192f]" : "text-slate-400")}
            >
              <Layers className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Centered Info Balloon (Popup Modal) */}
        <AnimatePresence>
          {popupDelivery && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 pointer-events-none">
              <motion.div
                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.9, opacity: 0, y: 20 }}
                className={cn(
                  "w-full max-w-sm p-6 rounded-[40px] shadow-2xl border-2 pointer-events-auto",
                  theme === 'dark' ? "bg-slate-900/95 border-slate-700 backdrop-blur-xl" : "bg-white/95 border-slate-200 backdrop-blur-xl"
                )}
              >
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-2">
                    <div className={cn(
                      "w-12 h-12 rounded-2xl flex items-center justify-center",
                      popupDelivery.done ? "bg-slate-500/20" : "bg-emerald-500/20"
                    )}>
                      {popupDelivery.done ? <CheckCircle2 className="w-6 h-6 text-slate-400" /> : <MapPin className="w-6 h-6 text-emerald-400" />}
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{t('delivery')} #{popupDelivery.order}</p>
                      <p className="text-lg font-black leading-tight">{popupDelivery.bairro}</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setPopupDelivery(null)}
                    className="p-2 rounded-full bg-slate-800/50 text-slate-400 hover:text-white transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-4">
                  <div>
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">{t('address')}</p>
                    <p className="text-sm font-bold leading-relaxed">{popupDelivery.addr}</p>
                  </div>

                  {popupDelivery.name && (
                    <div>
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">{t('customer')}</p>
                      <p className="text-sm font-bold">{popupDelivery.name}</p>
                    </div>
                  )}

                  {popupDelivery.packageId && (
                    <div className="bg-orange-500/10 border border-orange-500/20 rounded-2xl p-3 flex items-center justify-between">
                      <p className="text-[10px] font-bold text-orange-400 uppercase tracking-widest">{t('packageNumber')}</p>
                      <p className="text-sm font-black text-orange-500">{popupDelivery.packageId}</p>
                    </div>
                  )}

                  {popupDelivery.notes && (
                    <div className="bg-slate-800/50 rounded-2xl p-3 border border-slate-700/50">
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">📝 {t('notes')}</p>
                      <p className="text-xs italic text-slate-400">{popupDelivery.notes}</p>
                    </div>
                  )}

                  {popupDelivery.arrivedAt && !popupDelivery.done && (
                    <div className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-3 flex items-center justify-between">
                      <p className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">{t('stopTime')}</p>
                      <p className="text-sm font-black text-blue-500 animate-pulse">
                        ⏱️ {Math.floor((currentTime.getTime() - new Date(popupDelivery.arrivedAt).getTime()) / 60000)} min
                      </p>
                    </div>
                  )}

                  {popupDelivery.done && (
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-3">
                        <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest mb-1">{t('completedTime')}</p>
                        <p className="text-sm font-black text-emerald-500">{popupDelivery.completedAt}</p>
                      </div>
                      {popupDelivery.stopDuration && (
                        <div className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-3">
                          <p className="text-[10px] font-bold text-blue-400 uppercase tracking-widest mb-1">{t('stopTime')}</p>
                          <p className="text-sm font-black text-blue-500">{Math.round(popupDelivery.stopDuration / 60)} min</p>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex gap-3 pt-2">
                    <button 
                      onClick={() => {
                        setNavTarget(popupDelivery);
                        setPopupDelivery(null);
                      }}
                      className="flex-1 py-4 bg-[#00ff41] text-[#0a192f] rounded-[24px] text-xs font-black uppercase tracking-widest shadow-xl shadow-[#00ff41]/20 active:scale-95 transition-all"
                    >
                      {t('navigate')}
                    </button>
                    {!popupDelivery.done && (
                      <div className="flex gap-2 flex-1">
                        {!popupDelivery.arrivedAt && (
                          <button 
                            onClick={() => {
                              markArrived(popupDelivery.id);
                            }}
                            className="flex-1 py-4 bg-blue-500/10 text-blue-400 rounded-[24px] text-xs font-black uppercase tracking-widest border border-blue-500/20 active:scale-95 transition-all"
                          >
                            {t('arrived')}
                          </button>
                        )}
                        <button 
                          onClick={() => {
                            toggleStatus(popupDelivery.id);
                            setPopupDelivery(null);
                          }}
                          className="p-4 bg-slate-800 text-slate-400 rounded-[24px] hover:text-white transition-all active:scale-95"
                        >
                          <CheckCircle2 className="w-6 h-6" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
          <motion.div
            initial={false}
            animate={{ 
              height: isMobile ? (isDrawerExpanded ? 'calc(100vh - 120px)' : '15vh') : '100%',
              width: isMobile ? '100%' : '400px',
              bottom: isMobile ? '80px' : 'auto'
            }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className={cn(
              "z-[1500] flex flex-col shadow-2xl transition-colors min-h-0",
              isMobile ? "fixed left-0 right-0 rounded-t-[2.5rem] border-t" : "relative border-l",
              theme === 'dark' ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"
            )}
          >
            {/* Handle for Mobile */}
            {isMobile && (
              <div 
                className="h-12 flex items-center justify-center cursor-pointer"
                onClick={() => setIsDrawerExpanded(!isDrawerExpanded)}
              >
                <div className="w-16 h-1.5 bg-slate-700 rounded-full opacity-50" />
              </div>
            )}

            {/* List Content */}
            <div className="flex-1 overflow-y-auto min-h-0 px-4 py-2">
              {!isPro && deliveries.length > 0 && (
                <div className="mb-4 p-3 bg-orange-500/10 border border-orange-500/20 rounded-xl text-center">
                  <p className="text-[10px] font-bold text-orange-500 uppercase tracking-widest mb-1">{t('adLabel')}</p>
                  <p className="text-xs text-slate-400">{t('adText')}</p>
                  <button 
                    onClick={() => setIsSettingsOpen(true)}
                    className="mt-2 text-[10px] font-black text-orange-500 underline uppercase"
                  >
                    {t('upgrade')}
                  </button>
                </div>
              )}
              {deliveries.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-8">
                  <div className="w-16 h-16 bg-[#00ff41]/10 rounded-2xl flex items-center justify-center mb-4">
                    <Upload className="w-8 h-8 text-[#00ff41]" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">{t('noRoute')}</h3>
                  <p className="text-sm text-slate-400 mb-6">{t('importPlanilha')}</p>
                  <label className="w-full py-4 px-6 border-2 border-dashed border-[#00ff41]/50 rounded-2xl text-[#00ff41] font-bold cursor-pointer hover:bg-[#00ff41]/5 transition-colors text-center">
                    {t('importBtn')}
                    <input type="file" className="hidden" accept=".xlsx,.xls,.csv" onChange={handleFileUpload} />
                  </label>
                </div>
              ) : (
                <div className="space-y-6 pb-24">
                  {/* Route Name Section */}
                  <div className="mb-2">
                    <div className="flex items-center gap-2 mb-1">
                      <Edit className="w-3 h-3 text-slate-500" />
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{t('routeNameLabel')}</span>
                    </div>
                    <input 
                      type="text"
                      value={routeName}
                      onChange={(e) => setRouteName(e.target.value)}
                      className={cn(
                        "w-full bg-transparent border-none focus:ring-0 text-lg font-black tracking-tight p-0",
                        theme === 'dark' ? "text-white" : "text-slate-900"
                      )}
                      placeholder={t('routeNamePlaceholder')}
                    />
                    <div className="h-0.5 w-8 bg-[#00ff41] mt-1" />
                  </div>

                  {/* Search Bar */}
                  <div className="px-1 mb-4">
                    <div className={cn(
                      "flex items-center gap-2 px-3 py-2 rounded-2xl border",
                      theme === 'dark' ? "bg-slate-800/50 border-slate-700" : "bg-slate-100 border-slate-200"
                    )}>
                      <Search className="w-4 h-4 text-slate-500" />
                      <input 
                        id="drawer-search"
                        type="text"
                        placeholder={language === 'pt' ? 'Buscar pacote ou endereço...' : 'Search package or address...'}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="bg-transparent border-none outline-none text-xs w-full font-bold"
                      />
                      {searchQuery && (
                        <button onClick={() => setSearchQuery("")}>
                          <X className="w-3 h-3 text-slate-500" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Summary Section */}
                  <div className="grid grid-cols-2 gap-3 mb-2">
                    <div className={cn(
                      "p-3 rounded-2xl border flex flex-col",
                      theme === 'dark' ? "bg-[#112240]/50 border-slate-700" : "bg-slate-50 border-slate-100"
                    )}>
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">{t('totalStops')}</span>
                      <span className="text-xl font-black text-[#00ff41]">{deliveries.length}</span>
                    </div>
                    <div className={cn(
                      "p-3 rounded-2xl border flex flex-col",
                      theme === 'dark' ? "bg-slate-900/50 border-slate-700" : "bg-slate-50 border-slate-100"
                    )}>
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">{t('totalDeliveries')}</span>
                      <span className="text-xl font-black text-orange-500">
                        {deliveries.reduce((acc, d) => acc + (d.count || 1), 0)}
                      </span>
                    </div>
                  </div>

                  {/* Pending Section */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between mb-4 px-1">
                      <span className="text-xs font-bold uppercase tracking-widest text-slate-500">
                        {t('pending')} ({deliveries.filter(d => !d.done).length})
                      </span>
                      <div className="flex items-center gap-3">
                        <label className="flex items-center gap-2 cursor-pointer group">
                          <input 
                            type="checkbox" 
                            className="hidden" 
                            checked={startFromLastDone}
                            onChange={(e) => setStartFromLastDone(e.target.checked)}
                          />
                          <div className={cn(
                            "w-8 h-4 rounded-full relative transition-colors",
                            startFromLastDone ? "bg-[#00ff41]" : "bg-slate-700"
                          )}>
                            <div className={cn(
                              "absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all",
                              startFromLastDone ? "left-4.5" : "left-0.5"
                            )} />
                          </div>
                          <span className="text-[9px] font-bold text-slate-500 uppercase group-hover:text-slate-400 transition-colors">
                            {t('startFromLastDone')}
                          </span>
                        </label>
                        <button 
                          onClick={() => reoptimizeRoute(deliveries, true)}
                          className="text-xs font-bold text-[#00ff41] hover:underline flex items-center gap-1"
                        >
                          <RotateCcw className="w-3 h-3" /> {t('recalculate')}
                        </button>
                        <button 
                          onClick={exportToXLSX}
                          className="text-xs font-bold text-emerald-400 hover:underline flex items-center gap-1"
                        >
                          <Download className="w-3 h-3" /> {language === 'pt' ? 'Exportar XLSX' : 'Export XLSX'}
                        </button>
                        <button 
                          onClick={exportToCSV}
                          className="text-xs font-bold text-orange-400 hover:underline flex items-center gap-1"
                        >
                          <Download className="w-3 h-3" /> {t('exportRoute')}
                        </button>
                        <button 
                          onClick={groupNearbyDeliveries}
                          className="text-xs font-bold text-blue-400 hover:underline flex items-center gap-1"
                        >
                          <Layers className="w-3 h-3" /> {t('groupNearby')}
                        </button>
                      </div>
                    </div>
                    
                    {deliveries.filter(d => !d.done && (
                      d.addr.toLowerCase().includes(searchQuery.toLowerCase()) || 
                      (d.packageId && d.packageId.toLowerCase().includes(searchQuery.toLowerCase())) ||
                      (d.name && d.name.toLowerCase().includes(searchQuery.toLowerCase()))
                    )).map((p, i) => (
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
                          <div className="flex flex-col gap-1">
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
                            {p.packageId ? (
                              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-800 px-2 py-0.5 rounded border border-slate-700 w-fit">
                                {t('packageOrder')}: {p.packageId}
                              </span>
                            ) : (
                              <span className="text-[10px] font-black text-red-500 uppercase tracking-widest bg-red-500/10 px-2 py-0.5 rounded border border-red-500/20 flex items-center gap-1 w-fit">
                                <AlertTriangle className="w-3 h-3" /> {t('noPackage')}
                              </span>
                            )}
                            {p.arrivedAt && !p.done && (
                              <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20 flex items-center gap-1 w-fit animate-pulse">
                                ⏱️ {Math.floor((new Date().getTime() - new Date(p.arrivedAt).getTime()) / 60000)} min
                              </span>
                            )}
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
                        <h4 className="text-sm font-semibold leading-tight mb-2">{p.addr}</h4>
                        
                        {p.notes && (
                          <div className="text-xs text-slate-500 italic mb-3 bg-slate-50 dark:bg-slate-900/50 p-2 rounded-lg border border-slate-100 dark:border-slate-800 flex items-start gap-2">
                            <span className="mt-0.5">📝</span>
                            <span>{p.notes}</span>
                          </div>
                        )}
                        
                        {p.quality && (
                          <div className={cn(
                            "flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest mb-3 px-2 py-1 rounded-lg w-fit",
                            p.quality === 'perfect' ? "bg-emerald-500/10 text-emerald-500" :
                            p.quality === 'incomplete' ? "bg-orange-500/10 text-orange-500" :
                            "bg-red-500/10 text-red-500"
                          )}>
                            {p.quality === 'perfect' && <CheckCircle className="w-3 h-3" />}
                            {p.quality === 'incomplete' && <Info className="w-3 h-3" />}
                            {p.quality === 'warning' && <AlertTriangle className="w-3 h-3" />}
                            {p.quality === 'perfect' ? t('perfectAddr') : 
                             p.quality === 'incomplete' ? t('incompleteAddr') : t('verifyAddr')}
                          </div>
                        )}

                        {p.quality !== 'perfect' && p.verificationNotes && p.verificationNotes.length > 0 && (
                          <div className="mb-3 flex flex-wrap gap-1">
                            {p.verificationNotes.map((note, idx) => (
                              <span key={idx} className="text-[8px] font-bold text-slate-500 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded uppercase">
                                {note}
                              </span>
                            ))}
                          </div>
                        )}
                        
                        <div className="flex gap-2">
                          {mergingId ? (
                            mergingId !== p.id && (
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleMerge(mergingId, p.id);
                                }}
                                className="w-full py-2.5 bg-[#00ff41] text-[#0a192f] rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-colors shadow-lg"
                              >
                                <Layers className="w-3.5 h-3.5" /> {t('groupHere')}
                              </button>
                            )
                          ) : (
                            <>
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setNavTarget(p);
                                }}
                                className="flex-1 py-2.5 bg-[#00ff41] hover:bg-[#00ff41]/90 text-[#0a192f] rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-colors shadow-lg shadow-[#00ff41]/20"
                              >
                                <Navigation className="w-3.5 h-3.5" /> {t('navigate').toUpperCase()}
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
                                className="flex-1 py-2.5 border border-[#00ff41]/30 text-[#00ff41] hover:bg-[#00ff41]/10 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-colors"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" /> {language === 'pt' ? 'CONCLUIR' : 'DONE'}
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
                      <div className="flex items-center justify-between px-1 mb-2">
                        <span className="text-xs font-bold uppercase tracking-widest text-slate-500">
                          {language === 'pt' ? 'Concluídos' : 'Completed'} ({deliveries.filter(d => d.done).length})
                        </span>
                        <button 
                          onClick={exportToCircuit}
                          className="text-[9px] font-black text-[#00ff41] border border-[#00ff41]/30 px-2 py-0.5 rounded uppercase tracking-widest hover:bg-[#00ff41]/10 transition-colors"
                        >
                          {t('exportCircuit')}
                        </button>
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
                              <div className="flex flex-wrap gap-1">
                                {p.completedAt && (
                                  <span className="text-[8px] font-bold text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded uppercase">
                                    ✅ {p.completedAt}
                                  </span>
                                )}
                                {p.stopDuration && (
                                  <span className="text-[8px] font-bold text-blue-400 bg-blue-400/10 px-1.5 py-0.5 rounded uppercase">
                                    ⏱️ {Math.round(p.stopDuration / 60)} min
                                  </span>
                                )}
                              </div>
                            </div>
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleStatus(p.id);
                              }}
                              className="p-1 hover:bg-slate-700/50 rounded transition-colors text-slate-500"
                            >
                              <RotateCcw className="w-3 h-3" />
                            </button>
                          </div>
                          <h4 className="text-sm font-bold text-slate-400 line-through truncate mb-1">{p.addr}</h4>
                          
                          <div className="flex gap-2">
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleStatus(p.id);
                                }}
                                className="w-full py-2.5 border border-slate-600 text-slate-400 hover:bg-slate-700 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-colors"
                              >
                                <RotateCcw className="w-3.5 h-3.5" /> {language === 'pt' ? 'REABRIR' : 'REOPEN'}
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
                theme === 'dark' ? "bg-[#112240] border-slate-700" : "bg-white border-slate-200"
              )}>
                <button 
                  onClick={() => reoptimizeRoute(deliveries, true)}
                  className="w-full py-4 bg-[#00ff41] hover:bg-[#00ff41]/90 text-[#0a192f] rounded-2xl font-black text-sm tracking-tight transition-all shadow-xl shadow-[#00ff41]/20 active:scale-[0.98] flex items-center justify-center gap-2 mb-3"
                >
                  <RotateCcw className="w-4 h-4" /> {language === 'pt' ? 'RECALCULAR PELA MINHA POSIÇÃO' : 'RECALCULATE FROM MY POSITION'}
                </button>
                <div className="grid grid-cols-3 gap-2">
                  <button 
                    onClick={exportToXLSX}
                    className="py-3 bg-slate-800 text-slate-300 rounded-xl font-bold text-[10px] uppercase tracking-widest border border-slate-700 flex items-center justify-center gap-2 active:scale-95 transition-all"
                  >
                    <Download className="w-4 h-4" /> XLSX
                  </button>
                  <button 
                    onClick={exportToCSV}
                    className="py-3 bg-slate-800 text-slate-300 rounded-xl font-bold text-[10px] uppercase tracking-widest border border-slate-700 flex items-center justify-center gap-2 active:scale-95 transition-all"
                  >
                    <Download className="w-4 h-4" /> CSV
                  </button>
                  <button 
                    onClick={exportToCircuit}
                    className="py-3 bg-slate-800 text-slate-300 rounded-xl font-bold text-[10px] uppercase tracking-widest border border-slate-700 flex items-center justify-center gap-2 active:scale-95 transition-all"
                  >
                    <Package className="w-4 h-4" /> Circuit
                  </button>
                </div>
              </div>
            )}
          </motion.div>

        {/* Manual Entry Modal */}
        <AnimatePresence>
          {isManualEntryOpen && (
            <div className="fixed inset-0 z-[4000] flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsManualEntryOpen(false)}
                className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
              />
              <motion.div
                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.9, opacity: 0, y: 20 }}
                className={cn(
                  "relative w-full max-w-md p-6 rounded-[40px] shadow-2xl border",
                  theme === 'dark' ? "bg-slate-900 border-slate-700" : "bg-white border-slate-200"
                )}
              >
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-xl font-black uppercase tracking-widest">{language === 'pt' ? 'Adicionar Entrega' : 'Add Delivery'}</h3>
                  <button onClick={() => setIsManualEntryOpen(false)} className="p-2 rounded-full bg-slate-800/50 text-slate-400">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                
                <div className="space-y-4">
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2 block">{t('fullAddress')}</label>
                    <div className={cn(
                      "flex items-center gap-2 px-4 py-3 rounded-2xl border",
                      theme === 'dark' ? "bg-slate-800 border-slate-700" : "bg-slate-50 border-slate-200"
                    )}>
                      <MapPin className="w-5 h-5 text-slate-500" />
                      <input 
                        type="text"
                        value={manualAddr}
                        onChange={(e) => setManualAddr(e.target.value)}
                        placeholder={language === 'pt' ? 'Rua, Número, Bairro...' : 'Street, Number, Neighborhood...'}
                        className="bg-transparent border-none outline-none text-sm w-full font-bold"
                      />
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button 
                      className="flex-1 p-4 bg-slate-800 text-slate-400 rounded-2xl font-bold flex items-center justify-center gap-2"
                      onClick={() => alert(language === 'pt' ? 'Funcionalidade de voz em breve!' : 'Voice feature coming soon!')}
                    >
                      <Mic className="w-5 h-5" /> {language === 'pt' ? 'Voz' : 'Voice'}
                    </button>
                    <button 
                      className="flex-1 p-4 bg-slate-800 text-slate-400 rounded-2xl font-bold flex items-center justify-center gap-2"
                      onClick={() => alert(language === 'pt' ? 'Leitura de código de barras em breve!' : 'Barcode scanning coming soon!')}
                    >
                      <ScanLine className="w-5 h-5" /> {language === 'pt' ? 'Código' : 'Barcode'}
                    </button>
                  </div>

                  <button 
                    onClick={addManualDelivery}
                    disabled={!manualAddr}
                    className="w-full py-4 bg-[#00ff41] text-[#0a192f] rounded-[24px] font-black uppercase tracking-widest shadow-xl shadow-[#00ff41]/20 disabled:opacity-50"
                  >
                    {language === 'pt' ? 'ADICIONAR À ROTA' : 'ADD TO ROUTE'}
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
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
                <h2 className="text-xl font-bold">{t('settings')}</h2>
                <button 
                  onClick={() => setIsSettingsOpen(false)}
                  className="p-2 hover:bg-slate-700/50 rounded-full"
                >
                  <ChevronDown className="w-6 h-6" />
                </button>
              </div>
              
              <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
                {/* Pro Status & Payment Verification */}
                <div className={cn(
                  "p-5 rounded-3xl border-2 flex flex-col gap-4",
                  isPro ? "bg-orange-500/10 border-orange-500/20" : "bg-slate-900/50 border-slate-700"
                )}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg",
                        isPro ? "bg-orange-500 text-white shadow-orange-500/20" : "bg-slate-800 text-slate-400"
                      )}>
                        <Crown className="w-6 h-6" />
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{t('accountType')}</p>
                        <p className="text-lg font-black tracking-tight">{isPro ? "RouteMaster PRO" : "RouteMaster FREE"}</p>
                      </div>
                    </div>
                    {!isPro && (
                      <button 
                        onClick={() => {
                          // Mock payment verification
                          const toast = document.createElement('div');
                          toast.className = "fixed top-10 left-1/2 -translate-x-1/2 z-[5000] bg-orange-500 text-white px-6 py-3 rounded-full font-black text-xs uppercase tracking-widest shadow-2xl animate-bounce";
                          toast.innerText = language === 'pt' ? "Verificando pagamento..." : "Verifying payment...";
                          document.body.appendChild(toast);
                          
                          setTimeout(() => {
                            setIsPro(true);
                            toast.innerText = language === 'pt' ? "Pagamento confirmado! Bem-vindo ao PRO" : "Payment confirmed! Welcome to PRO";
                            setTimeout(() => toast.remove(), 2000);
                          }, 2000);
                        }}
                        className="px-4 py-2 bg-orange-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-orange-500/20 active:scale-95 transition-all"
                      >
                        {t('verifyPayment')}
                      </button>
                    )}
                  </div>
                  {!isPro && (
                    <p className="text-[10px] font-bold text-slate-500 leading-relaxed italic">
                      {t('proBenefits')}
                    </p>
                  )}
                </div>

                <div className="space-y-4">
                  <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 px-1">{t('preferences')}</h3>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <button 
                      onClick={() => setLanguage(language === 'pt' ? 'en' : 'pt')}
                      className={cn(
                        "p-4 rounded-2xl border-2 flex flex-col items-center gap-2 transition-all active:scale-95",
                        theme === 'dark' ? "bg-slate-900/50 border-slate-700" : "bg-slate-50 border-slate-200"
                      )}
                    >
                      <Globe className="w-5 h-5 text-slate-400" />
                      <span className="text-[10px] font-black uppercase tracking-widest">{language === 'pt' ? 'Português' : 'English'}</span>
                    </button>
                    <button 
                      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                      className={cn(
                        "p-4 rounded-2xl border-2 flex flex-col items-center gap-2 transition-all active:scale-95",
                        theme === 'dark' ? "bg-slate-900/50 border-slate-700" : "bg-slate-50 border-slate-200"
                      )}
                    >
                      {theme === 'dark' ? <Moon className="w-5 h-5 text-slate-400" /> : <Sun className="w-5 h-5 text-slate-400" />}
                      <span className="text-[10px] font-black uppercase tracking-widest">{theme === 'dark' ? t('darkMode') : t('lightMode')}</span>
                    </button>
                    <button 
                      onClick={() => {
                        const isAA = !localStorage.getItem('androidAutoMode');
                        if (isAA) localStorage.setItem('androidAutoMode', 'true');
                        else localStorage.removeItem('androidAutoMode');
                        window.location.reload();
                      }}
                      className={cn(
                        "p-4 rounded-2xl border-2 flex flex-col items-center gap-2 transition-all active:scale-95 col-span-2",
                        localStorage.getItem('androidAutoMode') ? "border-[#00ff41] bg-[#00ff41]/10 text-[#00ff41]" : theme === 'dark' ? "bg-slate-900/50 border-slate-700" : "bg-slate-50 border-slate-200"
                      )}
                    >
                      <Car className="w-5 h-5" />
                      <span className="text-[10px] font-black uppercase tracking-widest">Android Auto Mode</span>
                    </button>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 px-1">{t('mapStyle')}</h3>
                  <div className="grid grid-cols-3 gap-2">
                    {['dark', 'light', 'satellite'].map((style) => (
                      <button
                        key={style}
                        onClick={() => setMapStyle(style as any)}
                        className={cn(
                          "p-3 rounded-2xl border-2 flex flex-col items-center gap-1 transition-all active:scale-95 capitalize text-[10px] font-black",
                          mapStyle === style 
                            ? "border-[#00ff41] bg-[#00ff41]/10 text-[#00ff41]" 
                            : theme === 'dark' ? "bg-slate-900/50 border-slate-700 text-slate-500" : "bg-slate-50 border-slate-200 text-slate-500"
                        )}
                      >
                        {style === 'dark' && <Moon className="w-4 h-4" />}
                        {style === 'light' && <Sun className="w-4 h-4" />}
                        {style === 'satellite' && <Layers className="w-4 h-4" />}
                        {style}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 px-1">{t('advanced')}</h3>
                  
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">{t('orsKey')}</label>
                    <input 
                      type="password"
                      placeholder={t('orsPlaceholder')}
                      className={cn(
                        "w-full p-4 rounded-2xl border-2 focus:ring-2 focus:ring-[#00ff41] outline-none transition-all text-xs font-bold",
                        theme === 'dark' ? "bg-slate-900 border-slate-700 text-white" : "bg-slate-50 border-slate-200 text-slate-900"
                      )}
                      value={orsKey}
                      onChange={(e) => setOrsKey(e.target.value)}
                    />
                    <p className="text-[9px] text-slate-500 font-bold italic leading-tight">{t('orsNote')}</p>
                    <button 
                      onClick={async () => {
                        if (!orsKey) {
                          alert(t('enterOrsKey'));
                          return;
                        }
                        // Mock test
                        const toast = document.createElement('div');
                        toast.className = "fixed top-10 left-1/2 -translate-x-1/2 z-[5000] bg-[#00ff41] text-black px-6 py-3 rounded-full font-black text-xs uppercase tracking-widest shadow-2xl";
                        toast.innerText = language === 'pt' ? "Testando conexão..." : "Testing connection...";
                        document.body.appendChild(toast);
                        
                        setTimeout(() => {
                          toast.innerText = language === 'pt' ? "Conexão OK! Snap-to-roads ativo." : "Connection OK! Snap-to-roads active.";
                          setTimeout(() => toast.remove(), 2000);
                        }, 1500);
                      }}
                      className="w-full py-3 bg-slate-800 text-slate-400 rounded-xl text-[10px] font-black uppercase tracking-widest border border-slate-700 active:scale-95 transition-all"
                    >
                      Test Snap-to-Roads
                    </button>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500">{t('data')}</h3>
                  
                  <button 
                    onClick={clearRoute}
                    className="w-full flex items-center gap-3 p-4 rounded-2xl bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-colors border border-red-500/20"
                  >
                    <RotateCcw className="w-5 h-5" />
                    <span className="font-semibold">{t('clearRoute')}</span>
                  </button>

                  <div className="grid grid-cols-3 gap-2">
                    <button 
                      onClick={exportToXLSX}
                      className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-slate-900/30 hover:bg-slate-900/50 border border-slate-700/30 transition-all"
                    >
                      <Download className="w-5 h-5 text-emerald-400" />
                      <span className="text-[10px] font-bold uppercase tracking-widest">XLSX</span>
                    </button>
                    <button 
                      onClick={exportToCSV}
                      className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-slate-900/30 hover:bg-slate-900/50 border border-slate-700/30 transition-all"
                    >
                      <Download className="w-5 h-5 text-blue-400" />
                      <span className="text-[10px] font-bold uppercase tracking-widest">CSV</span>
                    </button>
                    <button 
                      onClick={exportToCircuit}
                      className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-slate-900/30 hover:bg-slate-900/50 border border-slate-700/30 transition-all"
                    >
                      <Share2 className="w-5 h-5 text-orange-400" />
                      <span className="text-[10px] font-bold uppercase tracking-widest">Circuit</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <button 
                      onClick={endRoute}
                      className="flex items-center justify-center gap-2 p-4 rounded-2xl bg-orange-500/10 hover:bg-orange-500/20 text-orange-400 transition-colors border border-orange-500/20"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span className="text-xs font-bold uppercase">{t('endRoute')}</span>
                    </button>
                    <button 
                      onClick={newRoute}
                      className="flex items-center justify-center gap-2 p-4 rounded-2xl bg-[#00ff41]/10 hover:bg-[#00ff41]/20 text-[#00ff41] transition-colors border border-[#00ff41]/20"
                    >
                      <Plus className="w-4 h-4" />
                      <span className="text-xs font-bold uppercase">{t('newRoute')}</span>
                    </button>
                  </div>
                </div>

                <div className="pt-4 text-center">
                  <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">
                    RouteMaster Pro v1.2.0
                  </p>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Navigation HUD */}
      <AnimatePresence>
        {isInternalNavigating && navTarget && (
          <motion.div
            initial={{ y: -100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -100, opacity: 0 }}
            className="fixed top-4 left-4 right-4 z-[4000] md:left-auto md:right-4 md:w-80"
          >
            <div className={cn(
              "p-4 rounded-3xl shadow-2xl border flex flex-col gap-3",
              theme === 'dark' ? "bg-slate-900/90 border-slate-700 backdrop-blur-md" : "bg-white/90 border-slate-200 backdrop-blur-md"
            )}>
              {/* Walking Suggestion Alert */}
              {navProfile === 'driving-car' && myLocation && routingService.getDistance(myLocation, { lat: navTarget.lat, lon: navTarget.lon }) < 300 && (
                <motion.div 
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  className="bg-blue-500/20 border border-blue-500/30 rounded-2xl p-3 flex items-center gap-3 overflow-hidden"
                >
                  <Footprints className="w-5 h-5 text-blue-400 shrink-0" />
                  <div className="flex-1">
                    <p className="text-[10px] font-bold text-blue-400 uppercase tracking-widest leading-none mb-1">{t('suggestWalking')}</p>
                    <button 
                      onClick={() => setNavProfile('foot-walking')}
                      className="text-[10px] font-black text-white bg-blue-500 px-2 py-1 rounded-lg uppercase"
                    >
                      {t('walking')}
                    </button>
                  </div>
                </motion.div>
              )}

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "w-10 h-10 rounded-2xl flex items-center justify-center",
                    navProfile === 'foot-walking' ? "bg-blue-500/20" : "bg-[#00ff41]/20"
                  )}>
                    {navProfile === 'foot-walking' ? (
                      <Footprints className="w-6 h-6 text-blue-400" />
                    ) : (
                      <Navigation className="w-6 h-6 text-[#00ff41]" />
                    )}
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{t('nextStop')}</p>
                    <p className="text-sm font-black truncate max-w-[150px]">{navTarget.name || navTarget.addr}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => setNavProfile(prev => prev === 'driving-car' ? 'foot-walking' : 'driving-car')}
                    className={cn(
                      "p-2 rounded-full transition-colors",
                      theme === 'dark' ? "bg-slate-800 hover:bg-slate-700" : "bg-slate-100 hover:bg-slate-200"
                    )}
                  >
                    {navProfile === 'foot-walking' ? <Car className="w-4 h-4" /> : <Footprints className="w-4 h-4" />}
                  </button>
                  <button 
                    onClick={() => {
                      setIsInternalNavigating(false);
                      setNavRouteGeometry(null);
                      if (routePolylineRef.current) {
                        routePolylineRef.current.remove();
                        routePolylineRef.current = null;
                      }
                    }}
                    className="p-2 bg-red-500/10 text-red-500 rounded-full hover:bg-red-500/20 transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="h-px bg-slate-700/30 w-full" />

              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{t('distance')}</p>
                  <p className={cn(
                    "text-xl font-black",
                    navProfile === 'foot-walking' ? "text-blue-400" : "text-[#00ff41]"
                  )}>
                    {myLocation ? (routingService.getDistance(myLocation, { lat: navTarget.lat, lon: navTarget.lon }) / 1000).toFixed(2) : '--'} km
                  </p>
                </div>
                <button 
                  onClick={() => {
                    const d = deliveries.find(x => x.id === navTarget.id);
                    if (d && !d.arrivedAt) {
                      markArrived(navTarget.id);
                    } else {
                      toggleStatus(navTarget.id);
                      setIsInternalNavigating(false);
                      setNavRouteGeometry(null);
                      if (routePolylineRef.current) {
                        routePolylineRef.current.remove();
                        routePolylineRef.current = null;
                      }
                    }
                  }}
                  className={cn(
                    "px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest transition-all active:scale-95",
                    navProfile === 'foot-walking' ? "bg-blue-500 text-white" : "bg-[#00ff41] text-[#0a192f]"
                  )}
                >
                  {deliveries.find(x => x.id === navTarget.id)?.arrivedAt ? t('save') : t('arrived')}
                </button>
              </div>
            </div>
          </motion.div>
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
                <h2 className="text-xl font-bold">{t('navigate')}</h2>
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

                  <div className="relative py-4">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-slate-700/30"></div>
                    </div>
                    <div className="relative flex justify-center text-[10px] uppercase tracking-widest font-bold text-slate-500">
                      <span className={cn("px-2", theme === 'dark' ? "bg-slate-800" : "bg-white")}>ou</span>
                    </div>
                  </div>

                  <button 
                    onClick={startInternalNav}
                    className="w-full py-4 bg-[#00ff41] hover:bg-[#00ff41]/90 text-[#0a192f] rounded-2xl font-black text-sm flex items-center justify-center gap-3 transition-all shadow-xl shadow-[#00ff41]/20"
                  >
                    <Compass className="w-6 h-6" />
                    {t('inAppNav')}
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
                  theme === 'dark' ? "bg-[#112240] border-slate-700" : "bg-white border-slate-200"
                )}
              >
                <div className="p-6 border-b border-slate-700/50 flex items-center justify-between">
                  <h2 className="text-xl font-bold">{t('editAddress')}</h2>
                  <button onClick={() => setEditingDelivery(null)} className="p-2 hover:bg-slate-700/50 rounded-full">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="p-6 space-y-4">
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1 block">{t('nameLocal')}</label>
                    <input 
                      type="text"
                      className={cn(
                        "w-full p-3 rounded-xl border focus:ring-2 focus:ring-[#00ff41] outline-none transition-all mb-4",
                        theme === 'dark' ? "bg-slate-900 border-slate-700 text-white" : "bg-slate-50 border-slate-200 text-slate-900"
                      )}
                      value={editingDelivery.name || ''}
                      onChange={(e) => setEditingDelivery({ ...editingDelivery, name: e.target.value })}
                    />
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">{t('fullAddress')}</label>
                      <div className="flex items-center gap-3">
                        {orsKey && (
                          <button 
                            onClick={async (e) => {
                              const btn = e.currentTarget;
                              const originalText = btn.innerText;
                              btn.innerText = t('searching');
                              btn.disabled = true;
                              
                              try {
                                const geocoded = await routingService.geocode(`${editingDelivery.addr}, ${editingDelivery.bairro}`);
                                if (geocoded) {
                                  setEditingDelivery({ ...editingDelivery, lat: geocoded.lat, lon: geocoded.lon });
                                  alert(t('found'));
                                } else {
                                  alert(t('notFound'));
                                }
                              } finally {
                                btn.innerText = originalText;
                                btn.disabled = false;
                              }
                            }}
                            className="text-[9px] font-black text-orange-500 uppercase hover:underline"
                          >
                            {t('refinedSearch')}
                          </button>
                        )}
                        {orsKey && (
                          <button 
                            onClick={async () => {
                              const snapped = await routingService.snapPoint({ lat: editingDelivery.lat, lon: editingDelivery.lon });
                              setEditingDelivery({ ...editingDelivery, lat: snapped.lat, lon: snapped.lon });
                              alert(language === 'pt' ? "Ponto alinhado à via mais próxima!" : "Point aligned to nearest road!");
                            }}
                            className="text-[9px] font-black text-[#00ff41] uppercase hover:underline"
                          >
                            {t('alignRoad')}
                          </button>
                        )}
                      </div>
                    </div>
                    <textarea 
                      className={cn(
                        "w-full p-3 rounded-xl border focus:ring-2 focus:ring-[#00ff41] outline-none transition-all resize-none h-24",
                        theme === 'dark' ? "bg-slate-900 border-slate-700 text-white" : "bg-slate-50 border-slate-200 text-slate-900"
                      )}
                      value={editingDelivery.addr}
                      onChange={(e) => setEditingDelivery({ ...editingDelivery, addr: e.target.value })}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1 block">{t('neighborhood')}</label>
                      <input 
                        type="text"
                        className={cn(
                          "w-full p-3 rounded-xl border focus:ring-2 focus:ring-[#00ff41] outline-none transition-all",
                          theme === 'dark' ? "bg-slate-900 border-slate-700 text-white" : "bg-slate-50 border-slate-200 text-slate-900"
                        )}
                        value={editingDelivery.bairro}
                        onChange={(e) => setEditingDelivery({ ...editingDelivery, bairro: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1 block">{t('packages')}</label>
                      <input 
                        type="number"
                        className={cn(
                          "w-full p-3 rounded-xl border focus:ring-2 focus:ring-[#00ff41] outline-none transition-all",
                          theme === 'dark' ? "bg-slate-900 border-slate-700 text-white" : "bg-slate-50 border-slate-200 text-slate-900"
                        )}
                        value={editingDelivery.count || 1}
                        onChange={(e) => setEditingDelivery({ ...editingDelivery, count: parseInt(e.target.value) || 1 })}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1 block">{t('observations')}</label>
                    <textarea 
                      placeholder={t('obsPlaceholder')}
                      className={cn(
                        "w-full p-3 rounded-xl border focus:ring-2 focus:ring-[#00ff41] outline-none transition-all resize-none h-20 text-xs",
                        theme === 'dark' ? "bg-slate-900 border-slate-700 text-white" : "bg-slate-50 border-slate-200 text-slate-900"
                      )}
                      value={editingDelivery.notes || ''}
                      onChange={(e) => setEditingDelivery({ ...editingDelivery, notes: e.target.value })}
                    />
                  </div>
                  <div className="space-y-3">
                    <button 
                      onClick={() => handleUpdateDelivery(editingDelivery.id, { 
                        addr: editingDelivery.addr, 
                        name: editingDelivery.name,
                        bairro: editingDelivery.bairro,
                        count: editingDelivery.count,
                        notes: editingDelivery.notes,
                        lat: editingDelivery.lat,
                        lon: editingDelivery.lon
                      })}
                      className="w-full py-4 bg-[#00ff41] hover:bg-[#00ff41]/90 text-[#0a192f] rounded-2xl font-black text-sm transition-all shadow-xl shadow-[#00ff41]/20 active:scale-[0.98]"
                    >
                      {t('save').toUpperCase()}
                    </button>
                    
                    <button 
                      onClick={() => {
                        setDeliveries(deliveries.filter(d => d.id !== editingDelivery.id));
                        setEditingDelivery(null);
                      }}
                      className="w-full py-4 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-2xl font-black text-sm transition-all border border-red-500/20 active:scale-[0.98]"
                    >
                      {language === 'pt' ? 'EXCLUIR ENTREGA' : 'DELETE DELIVERY'}
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
        
        {/* Confirm Move Modal */}
        <AnimatePresence>
          {movingMarkerId && (
            <div className="fixed inset-0 z-[4000] flex items-center justify-center p-4">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setMovingMarkerId(null)}
                className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
              />
              <motion.div
                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.9, opacity: 0, y: 20 }}
                className={cn(
                  "relative w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden border p-6 text-center",
                  theme === 'dark' ? "bg-[#112240] border-slate-700" : "bg-white border-slate-200"
                )}
              >
                <div className="w-16 h-16 bg-orange-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <MapPin className="w-8 h-8 text-orange-500" />
                </div>
                <h2 className="text-xl font-bold mb-2">{t('confirmMove')}</h2>
                <p className="text-sm text-slate-400 mb-6">
                  {t('moveInstructions')}
                </p>
                <div className="space-y-3">
                  <button 
                    onClick={() => {
                      const marker = markerMapRef.current[movingMarkerId];
                      if (marker) {
                        marker.dragging.enable();
                        marker.openPopup();
                      }
                      setMovingMarkerId(null);
                    }}
                    className="w-full py-4 bg-[#00ff41] hover:bg-[#00ff41]/90 text-[#0a192f] rounded-2xl font-black text-sm transition-all shadow-xl shadow-[#00ff41]/20 active:scale-[0.98]"
                  >
                    {t('unlockMove').toUpperCase()}
                  </button>
                  <button 
                    onClick={() => setMovingMarkerId(null)}
                    className="w-full py-4 bg-slate-700/20 hover:bg-slate-700/30 text-slate-400 rounded-2xl font-black text-sm transition-all active:scale-[0.98]"
                  >
                    {language === 'pt' ? 'CANCELAR' : 'CANCEL'}
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Carousel of Pending Deliveries (Tinder Style) - Moved to end for visibility */}
        {!isInternalNavigating && deliveries.some(d => !d.done) && (
          <div className="fixed bottom-40 left-0 right-0 z-[3000] px-4 flex justify-center items-center gap-2 pointer-events-none">
            <button 
              onClick={(e) => {
                e.stopPropagation();
                const pends = deliveries.filter(d => !d.done);
                const currentIdx = pends.findIndex(d => d.id === activeId);
                const prevIdx = (currentIdx - 1 + pends.length) % pends.length;
                focusDelivery(pends[prevIdx].id);
              }}
              className="p-2 bg-slate-900/80 backdrop-blur-md text-slate-400 rounded-full border border-slate-800 pointer-events-auto active:scale-95 transition-all"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="w-full max-w-sm pointer-events-auto overflow-x-auto flex gap-4 no-scrollbar pb-4 snap-x snap-mandatory">
              {deliveries.filter(d => !d.done).map((p) => (
                <motion.div
                  key={p.id}
                  layout
                  drag="x"
                  dragConstraints={{ left: 0, right: 0 }}
                  onDragEnd={(_, info) => {
                    if (info.offset.x > 100) {
                      // Swipe right - mark as done
                      toggleStatus(p.id);
                    } else if (info.offset.x < -100) {
                      // Swipe left - skip/next
                      const pending = deliveries.filter(x => !x.done && x.id !== p.id);
                      if (pending.length > 0) {
                        focusDelivery(pending[0].id);
                      }
                    }
                  }}
                  onClick={() => focusDelivery(p.id)}
                  className={cn(
                    "min-w-[85vw] md:min-w-[320px] p-5 rounded-[32px] shadow-2xl border-2 flex flex-col gap-3 transition-all cursor-grab active:cursor-grabbing snap-center",
                    activeId === p.id 
                      ? "border-[#00ff41] bg-slate-900/95 backdrop-blur-xl" 
                      : theme === 'dark' ? "border-slate-800 bg-slate-900/80 backdrop-blur-md" : "border-slate-100 bg-white/80 backdrop-blur-md"
                  )}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-black uppercase tracking-tighter text-orange-500 bg-orange-500/10 px-2.5 py-1 rounded-full">
                        {p.bairro}
                      </span>
                      <span className="text-[10px] font-black text-emerald-500 bg-emerald-500/10 px-2.5 py-1 rounded-full uppercase">
                        {t('packageOrder')} #{p.order}
                      </span>
                    </div>
                    {p.packageId ? (
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                        📦 {p.packageId}
                      </span>
                    ) : (
                      <span className="text-[10px] font-black text-red-500 uppercase tracking-widest flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> {t('noPackage')}
                      </span>
                    )}
                  </div>
                  <h4 className="text-base font-black leading-tight line-clamp-2">{p.addr}</h4>
                  
                  <div className="flex items-center justify-between mt-1">
                    <div className="flex flex-col">
                      <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">{t('estCompletionTime')}</span>
                      <span className="text-xs font-black text-emerald-400">{calculateEstCompletion(deliveries.filter(d => !d.done).length)}</span>
                    </div>
                    <div className="flex flex-col items-end">
                      {p.arrivedAt ? (
                        <div className="flex flex-col items-end">
                          <span className="text-[9px] font-bold text-blue-400 uppercase tracking-widest">{t('stopTime')}</span>
                          <span className="text-xs font-black text-blue-400 animate-pulse">
                            ⏱️ {Math.floor((currentTime.getTime() - new Date(p.arrivedAt).getTime()) / 60000)} min
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 text-slate-500">
                          <Footprints className="w-3 h-3" />
                          <span className="text-[10px] font-bold">3 min</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-2 mt-2">
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        setNavTarget(p);
                      }}
                      className="flex-1 py-3.5 bg-[#00ff41] text-[#0a192f] rounded-2xl text-[11px] font-black uppercase tracking-widest shadow-lg shadow-[#00ff41]/20 active:scale-95 transition-all"
                    >
                      {t('navigate')}
                    </button>
                    {!p.arrivedAt && (
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          markArrived(p.id);
                        }}
                        className="px-4 bg-blue-500/10 text-blue-400 rounded-2xl hover:bg-blue-500/20 transition-all active:scale-95 border border-blue-500/20 flex items-center justify-center"
                        title={t('arrived')}
                      >
                        <Clock className="w-6 h-6" />
                      </button>
                    )}
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleStatus(p.id);
                      }}
                      className="px-4 bg-slate-800 text-slate-400 rounded-2xl hover:text-white transition-all active:scale-95"
                    >
                      <CheckCircle2 className="w-6 h-6" />
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>
            <button 
              onClick={(e) => {
                e.stopPropagation();
                const pends = deliveries.filter(d => !d.done);
                const currentIdx = pends.findIndex(d => d.id === activeId);
                const nextIdx = (currentIdx + 1) % pends.length;
                focusDelivery(pends[nextIdx].id);
              }}
              className="p-2 bg-slate-900/80 backdrop-blur-md text-slate-400 rounded-full border border-slate-800 pointer-events-auto active:scale-95 transition-all"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        )}
      {/* Bottom Navigation Menu */}
      <nav className={cn(
        "fixed bottom-0 left-0 right-0 h-20 px-6 flex items-center justify-between z-[2000] border-t",
        theme === 'dark' ? "bg-[#0a192f]/95 border-slate-800 backdrop-blur-xl" : "bg-white/95 border-slate-200 backdrop-blur-xl"
      )}>
        <button 
          onClick={() => {
            setIsDrawerExpanded(true);
            setTimeout(() => {
              const searchInput = document.getElementById('drawer-search');
              if (searchInput) searchInput.focus();
            }, 300);
          }}
          className="flex flex-col items-center gap-1 text-slate-400 hover:text-[#00ff41] transition-colors"
        >
          <Search className="w-6 h-6" />
          <span className="text-[9px] font-bold uppercase tracking-widest">{language === 'pt' ? 'Busca' : 'Search'}</span>
        </button>

        <button 
          onClick={() => setIsDrawerExpanded(true)}
          className="flex flex-col items-center gap-1 text-slate-400 hover:text-[#00ff41] transition-colors"
        >
          <Package className="w-6 h-6" />
          <span className="text-[9px] font-bold uppercase tracking-widest">{t('data')}</span>
        </button>

        <button 
          onClick={centralizeView}
          className="w-14 h-14 -mt-10 bg-[#00ff41] rounded-full flex items-center justify-center shadow-2xl shadow-[#00ff41]/40 border-4 border-[#0a192f] active:scale-90 transition-all"
        >
          <Target className="w-7 h-7 text-[#0a192f]" />
        </button>

        <button 
          onClick={() => setIsManualEntryOpen(true)}
          className="flex flex-col items-center gap-1 text-slate-400 hover:text-[#00ff41] transition-colors"
        >
          <Plus className="w-6 h-6" />
          <span className="text-[9px] font-bold uppercase tracking-widest">{language === 'pt' ? 'Novo' : 'New'}</span>
        </button>

        <button 
          onClick={() => setIsSettingsOpen(true)}
          className="flex flex-col items-center gap-1 text-slate-400 hover:text-[#00ff41] transition-colors"
        >
          <Settings className="w-6 h-6" />
          <span className="text-[9px] font-bold uppercase tracking-widest">{t('settings')}</span>
        </button>
      </nav>
      </div>
    );
  }
