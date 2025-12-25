import { useEffect, useRef, useState } from 'react';
import { MapPin, Navigation, AlertTriangle, Loader2 } from 'lucide-react';

interface Marker {
  id: string;
  lat: number;
  lng: number;
  type: 'user' | 'accident';
  riskLevel?: 'low' | 'medium' | 'high';
  title?: string;
}

interface AccidentMarker {
  id: string;
  lat: number;
  lng: number;
  riskLevel: 'low' | 'medium' | 'high';
  status?: string;
}

export interface MapViewProps {
  center?: { lat: number; lng: number };
  markers?: Marker[];
  accidents?: AccidentMarker[];
  zoom?: number;
  showUserLocation?: boolean;
  className?: string;
}

export function MapView({
  center,
  markers = [],
  accidents = [],
  zoom = 14,
  showUserLocation = false,
  className = '',
}: MapViewProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(true);

  const getRiskColor = (riskLevel?: 'low' | 'medium' | 'high') => {
    switch (riskLevel) {
      case 'low':
        return 'text-success';
      case 'medium':
        return 'text-warning';
      case 'high':
        return 'text-destructive';
      default:
        return 'text-primary';
    }
  };

  const getRiskBgColor = (riskLevel?: 'low' | 'medium' | 'high') => {
    switch (riskLevel) {
      case 'low':
        return 'bg-success/20';
      case 'medium':
        return 'bg-warning/20';
      case 'high':
        return 'bg-destructive/20';
      default:
        return 'bg-primary/20';
    }
  };

  useEffect(() => {
    // Simulate map loading
    const timer = setTimeout(() => setIsLoading(false), 1000);
    return () => clearTimeout(timer);
  }, []);

  // Generate Google Maps static image URL (for demo, we show a placeholder)
  const getMapUrl = () => {
    if (!center) return null;
    return `https://maps.googleapis.com/maps/api/staticmap?center=${center.lat},${center.lng}&zoom=${zoom}&size=600x400&maptype=roadmap`;
  };

  // Generate shareable Google Maps link
  const getShareableLink = () => {
    if (!center) return '';
    return `https://www.google.com/maps?q=${center.lat},${center.lng}`;
  };

  return (
    <div className={`map-container relative ${className}`} ref={mapRef}>
      {isLoading ? (
        <div className="absolute inset-0 flex items-center justify-center bg-muted">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="text-sm text-muted-foreground">Loading map...</span>
          </div>
        </div>
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-secondary/5">
          {/* Map grid pattern */}
          <div className="absolute inset-0 opacity-10" style={{
            backgroundImage: `
              linear-gradient(to right, hsl(var(--border)) 1px, transparent 1px),
              linear-gradient(to bottom, hsl(var(--border)) 1px, transparent 1px)
            `,
            backgroundSize: '40px 40px',
          }} />

          {/* Center marker */}
          {center && (
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
              {showUserLocation ? (
                <div className="relative">
                  <div className="absolute -inset-4 animate-ping rounded-full bg-primary/30" />
                  <div className="relative flex h-8 w-8 items-center justify-center rounded-full bg-primary shadow-glow">
                    <Navigation className="h-4 w-4 text-primary-foreground" />
                  </div>
                </div>
              ) : (
                <MapPin className="h-8 w-8 text-primary" />
              )}
            </div>
          )}

          {/* Legacy markers */}
          {markers.map((marker, index) => (
            <div
              key={marker.id}
              className="absolute"
              style={{
                left: `${30 + (index * 15) % 40}%`,
                top: `${25 + (index * 20) % 50}%`,
              }}
            >
              <div className={`relative flex h-10 w-10 items-center justify-center rounded-full ${getRiskBgColor(marker.riskLevel)}`}>
                {marker.type === 'accident' && marker.riskLevel === 'high' && (
                  <div className="absolute -inset-1 animate-pulse rounded-full bg-destructive/30" />
                )}
                <AlertTriangle className={`h-5 w-5 ${getRiskColor(marker.riskLevel)}`} />
              </div>
              {marker.title && (
                <div className="absolute left-1/2 top-full mt-1 -translate-x-1/2 whitespace-nowrap rounded bg-card px-2 py-1 text-xs shadow-card">
                  {marker.title}
                </div>
              )}
            </div>
          ))}

          {/* Accident markers for admin view */}
          {accidents.map((accident, index) => (
            <div
              key={accident.id}
              className="absolute cursor-pointer transition-transform hover:scale-110"
              style={{
                left: `${15 + (index * 12) % 70}%`,
                top: `${15 + (index * 18) % 60}%`,
              }}
              title={`Risk: ${accident.riskLevel.toUpperCase()}`}
            >
              <div className={`relative flex h-10 w-10 items-center justify-center rounded-full ${getRiskBgColor(accident.riskLevel)}`}>
                {accident.riskLevel === 'high' && (
                  <div className="absolute -inset-1 animate-pulse rounded-full bg-destructive/30" />
                )}
                <AlertTriangle className={`h-5 w-5 ${getRiskColor(accident.riskLevel)}`} />
              </div>
              <div className="absolute left-1/2 top-full mt-1 -translate-x-1/2 whitespace-nowrap rounded bg-card px-2 py-1 text-xs shadow-card">
                {accident.status}
              </div>
            </div>
          ))}

          {/* Coordinates display */}
          {center && (
            <div className="absolute bottom-3 left-3 rounded-lg bg-card/90 px-3 py-2 text-xs backdrop-blur-sm">
              <div className="flex items-center gap-2">
                <MapPin className="h-3 w-3 text-primary" />
                <span className="font-mono text-muted-foreground">
                  {center.lat.toFixed(6)}, {center.lng.toFixed(6)}
                </span>
              </div>
            </div>
          )}

          {/* Legend */}
          <div className="absolute right-3 top-3 rounded-lg bg-card/90 p-3 backdrop-blur-sm">
            <div className="mb-2 text-xs font-medium text-foreground">Risk Level</div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-success" />
                <span className="text-xs text-muted-foreground">Low</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-warning" />
                <span className="text-xs text-muted-foreground">Medium</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-destructive" />
                <span className="text-xs text-muted-foreground">High</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
