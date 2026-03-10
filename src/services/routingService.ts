
/**
 * Routing Service for RouteMaster
 * Handles Map Matching, Matrix calculation and TSP Optimization
 */

export interface LatLon {
  lat: number;
  lon: number;
}

export interface RouteResult {
  order: number[];
  geometry?: any;
  distance: number;
  duration: number;
}

class RoutingService {
  private orsApiKey: string | null = null;

  setApiKey(key: string) {
    this.orsApiKey = key;
  }

  /**
   * Simple Haversine distance for local calculations
   */
  getDistance(p1: LatLon, p2: LatLon): number {
    const R = 6371e3; // meters
    const phi1 = p1.lat * Math.PI / 180;
    const phi2 = p2.lat * Math.PI / 180;
    const deltaPhi = (p2.lat - p1.lat) * Math.PI / 180;
    const deltaLambda = (p2.lon - p1.lon) * Math.PI / 180;

    const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
              Math.cos(phi1) * Math.cos(phi2) *
              Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }

  /**
   * Local TSP Solver using Nearest Neighbor + 2-Opt refinement
   * Good for up to 200-300 points in-browser
   */
  optimizeLocal(start: LatLon, points: LatLon[]): number[] {
    if (points.length === 0) return [];
    
    // 1. Initial Solution: Nearest Neighbor
    const order: number[] = [];
    const remaining = points.map((p, i) => ({ p, i }));
    let current = start;

    while (remaining.length > 0) {
      let bestIdx = 0;
      let minDist = Infinity;

      for (let i = 0; i < remaining.length; i++) {
        const d = this.getDistance(current, remaining[i].p);
        if (d < minDist) {
          minDist = d;
          bestIdx = i;
        }
      }

      const next = remaining.splice(bestIdx, 1)[0];
      order.push(next.i);
      current = next.p;
    }

    // 2. Refinement: 2-Opt (Swapping edges to remove crossings)
    let improved = true;
    let iterations = 0;
    const maxIterations = 500; // Safety cap

    while (improved && iterations < maxIterations) {
      improved = false;
      iterations++;

      for (let i = 0; i < order.length - 1; i++) {
        for (let j = i + 1; j < order.length; j++) {
          const d1 = this.getSegmentDistance(start, points, order, i, j);
          const d2 = this.getSegmentDistance(start, points, order, i, j, true);

          if (d2 < d1) {
            // Reverse segment between i and j
            this.reverseSegment(order, i, j);
            improved = true;
          }
        }
      }
    }

    return order;
  }

  private getSegmentDistance(start: LatLon, points: LatLon[], order: number[], i: number, j: number, reversed = false): number {
    // This is a simplified 2-opt distance check
    // We only care about the edges that change: (i-1, i) and (j, j+1)
    const pPrev = i === 0 ? start : points[order[i - 1]];
    const pI = points[order[i]];
    const pJ = points[order[j]];
    const pNext = j === order.length - 1 ? null : points[order[j + 1]];

    if (!reversed) {
      let dist = this.getDistance(pPrev, pI);
      if (pNext) dist += this.getDistance(pJ, pNext);
      return dist;
    } else {
      let dist = this.getDistance(pPrev, pJ);
      if (pNext) dist += this.getDistance(pI, pNext);
      return dist;
    }
  }

  private reverseSegment(order: number[], i: number, j: number) {
    while (i < j) {
      const temp = order[i];
      order[i] = order[j];
      order[j] = temp;
      i++;
      j--;
    }
  }

  /**
   * Clusters points that are very close to each other
   */
  clusterPoints(points: LatLon[], thresholdMeters = 20): number[][] {
    const clusters: number[][] = [];
    const visited = new Set<number>();

    for (let i = 0; i < points.length; i++) {
      if (visited.has(i)) continue;

      const currentCluster = [i];
      visited.add(i);

      for (let j = i + 1; j < points.length; j++) {
        if (visited.has(j)) continue;

        if (this.getDistance(points[i], points[j]) < thresholdMeters) {
          currentCluster.push(j);
          visited.add(j);
        }
      }
      clusters.push(currentCluster);
    }

    return clusters;
  }

  /**
   * Matrix API placeholder for OpenRouteService
   */
  async getMatrix(points: LatLon[]): Promise<number[][] | null> {
    if (!this.orsApiKey) return null;

    try {
      const response = await fetch('https://api.openrouteservice.org/v2/matrix/driving-car', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': this.orsApiKey
        },
        body: JSON.stringify({
          locations: points.map(p => [p.lon, p.lat]),
          metrics: ['distance', 'duration']
        })
      });

      const data = await response.json();
      return data.distances;
    } catch (e) {
      console.error("Matrix API error", e);
      return null;
    }
  }

  /**
   * Map Matching / Snapping using OpenRouteService
   */
  async snapToRoads(points: LatLon[]): Promise<LatLon[]> {
    if (!this.orsApiKey || points.length === 0) return points;

    try {
      const response = await fetch('https://api.openrouteservice.org/v2/snap/driving-car', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': this.orsApiKey
        },
        body: JSON.stringify({
          locations: points.map(p => [p.lon, p.lat]),
          radius: 350 // Search radius in meters
        })
      });

      if (!response.ok) throw new Error(`ORS Snap Error: ${response.statusText}`);
      
      const data = await response.json();
      
      if (data.locations && data.locations.length > 0) {
        return data.locations.map((loc: any) => ({
          lat: loc.location[1],
          lon: loc.location[0]
        }));
      }
      
      return points;
    } catch (e) {
      console.error("Snap error", e);
      return points;
    }
  }

  async snapPoint(point: LatLon): Promise<LatLon> {
    const snapped = await this.snapToRoads([point]);
    return snapped[0];
  }

  /**
   * Geocoding using OpenRouteService
   */
  async geocode(text: string): Promise<LatLon | null> {
    if (!this.orsApiKey) return null;

    try {
      const response = await fetch(`https://api.openrouteservice.org/geocode/search?api_key=${this.orsApiKey}&text=${encodeURIComponent(text)}&size=1`);
      
      if (!response.ok) throw new Error(`ORS Geocode Error: ${response.statusText}`);
      
      const data = await response.json();
      
      if (data.features && data.features.length > 0) {
        const [lon, lat] = data.features[0].geometry.coordinates;
        return { lat, lon };
      }
      
      return null;
    } catch (e) {
      console.error("Geocode error", e);
      return null;
    }
  }

  /**
   * Get directions between two points using OpenRouteService
   */
  async getDirections(start: LatLon, end: LatLon, profile: 'driving-car' | 'foot-walking' = 'driving-car'): Promise<any | null> {
    if (!this.orsApiKey) return null;

    try {
      const response = await fetch(`https://api.openrouteservice.org/v2/directions/${profile}/geojson`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': this.orsApiKey
        },
        body: JSON.stringify({
          coordinates: [[start.lon, start.lat], [end.lon, end.lat]]
        })
      });

      if (!response.ok) throw new Error(`ORS Directions Error: ${response.statusText}`);
      
      const data = await response.json();
      return data;
    } catch (e) {
      console.error("Directions error", e);
      return null;
    }
  }
}

export const routingService = new RoutingService();

/**
 * Simple Kalman Filter for GPS Smoothing
 */
export class KalmanFilter {
  private Q = 0.00001; // Process noise
  private R = 0.0001;  // Measurement noise
  private P = 1;       // Estimation error
  private X = 0;       // Value
  private K = 0;       // Kalman gain

  constructor(initialValue: number) {
    this.X = initialValue;
  }

  update(measurement: number): number {
    this.P = this.P + this.Q;
    this.K = this.P / (this.P + this.R);
    this.X = this.X + this.K * (measurement - this.X);
    this.P = (1 - this.K) * this.P;
    return this.X;
  }
}
