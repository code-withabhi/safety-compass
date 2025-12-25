import { useCallback, useState } from 'react';
import { GoogleMap, useJsApiLoader, Marker, InfoWindow } from '@react-google-maps/api';
import { Loader2, AlertTriangle } from 'lucide-react';

const GOOGLE_MAPS_API_KEY = 'AIzaSyCdpG3xEE7Xuot7SxkEgJdq7WrqJKG9JpE';

interface MarkerData {
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
  markers?: MarkerData[];
  accidents?: AccidentMarker[];
  zoom?: number;
  showUserLocation?: boolean;
  className?: string;
}

const containerStyle = {
  width: '100%',
  height: '100%',
};

const defaultCenter = { lat: 28.6139, lng: 77.2090 }; // Delhi, India

const mapStyles = [
  {
    featureType: 'all',
    elementType: 'geometry',
    stylers: [{ color: '#242f3e' }],
  },
  {
    featureType: 'all',
    elementType: 'labels.text.stroke',
    stylers: [{ color: '#242f3e' }],
  },
  {
    featureType: 'all',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#746855' }],
  },
  {
    featureType: 'road',
    elementType: 'geometry',
    stylers: [{ color: '#38414e' }],
  },
  {
    featureType: 'road',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#212a37' }],
  },
  {
    featureType: 'road.highway',
    elementType: 'geometry',
    stylers: [{ color: '#746855' }],
  },
  {
    featureType: 'water',
    elementType: 'geometry',
    stylers: [{ color: '#17263c' }],
  },
];

export function MapView({
  center,
  markers = [],
  accidents = [],
  zoom = 14,
  showUserLocation = false,
  className = '',
}: MapViewProps) {
  const [selectedAccident, setSelectedAccident] = useState<AccidentMarker | null>(null);
  const [map, setMap] = useState<google.maps.Map | null>(null);

  const { isLoaded, loadError } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: GOOGLE_MAPS_API_KEY,
  });

  const onLoad = useCallback((map: google.maps.Map) => {
    setMap(map);
  }, []);

  const onUnmount = useCallback(() => {
    setMap(null);
  }, []);

  const getMarkerIcon = (riskLevel: 'low' | 'medium' | 'high') => {
    const colors = {
      low: '#22c55e',
      medium: '#f59e0b',
      high: '#ef4444',
    };
    
    return {
      path: google.maps.SymbolPath.CIRCLE,
      fillColor: colors[riskLevel],
      fillOpacity: 1,
      strokeWeight: 3,
      strokeColor: '#ffffff',
      scale: 12,
    };
  };

  const getUserLocationIcon = () => ({
    path: google.maps.SymbolPath.CIRCLE,
    fillColor: '#3b82f6',
    fillOpacity: 1,
    strokeWeight: 4,
    strokeColor: '#ffffff',
    scale: 10,
  });

  if (loadError) {
    return (
      <div className={`flex items-center justify-center bg-muted ${className}`}>
        <div className="text-center text-muted-foreground">
          <AlertTriangle className="mx-auto h-8 w-8 mb-2" />
          <p>Error loading maps</p>
        </div>
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className={`flex items-center justify-center bg-muted ${className}`}>
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="text-sm text-muted-foreground">Loading map...</span>
        </div>
      </div>
    );
  }

  const mapCenter = center || defaultCenter;

  return (
    <div className={`relative ${className}`}>
      <GoogleMap
        mapContainerStyle={containerStyle}
        center={mapCenter}
        zoom={zoom}
        onLoad={onLoad}
        onUnmount={onUnmount}
        options={{
          styles: mapStyles,
          disableDefaultUI: false,
          zoomControl: true,
          streetViewControl: false,
          mapTypeControl: false,
          fullscreenControl: true,
        }}
      >
        {/* User location marker */}
        {showUserLocation && center && (
          <Marker
            position={center}
            icon={getUserLocationIcon()}
            title="Your Location"
          />
        )}

        {/* Legacy markers */}
        {markers.map((marker) => (
          <Marker
            key={marker.id}
            position={{ lat: marker.lat, lng: marker.lng }}
            icon={marker.riskLevel ? getMarkerIcon(marker.riskLevel) : undefined}
            title={marker.title}
          />
        ))}

        {/* Accident markers */}
        {accidents.map((accident) => (
          <Marker
            key={accident.id}
            position={{ lat: accident.lat, lng: accident.lng }}
            icon={getMarkerIcon(accident.riskLevel)}
            onClick={() => setSelectedAccident(accident)}
          />
        ))}

        {/* Info window for selected accident */}
        {selectedAccident && (
          <InfoWindow
            position={{ lat: selectedAccident.lat, lng: selectedAccident.lng }}
            onCloseClick={() => setSelectedAccident(null)}
          >
            <div className="p-2 text-black">
              <h3 className="font-semibold mb-1">Accident Report</h3>
              <p className="text-sm">
                <span className="font-medium">Risk Level:</span>{' '}
                <span className={`capitalize ${
                  selectedAccident.riskLevel === 'high' ? 'text-red-600' :
                  selectedAccident.riskLevel === 'medium' ? 'text-amber-600' : 'text-green-600'
                }`}>
                  {selectedAccident.riskLevel}
                </span>
              </p>
              {selectedAccident.status && (
                <p className="text-sm">
                  <span className="font-medium">Status:</span>{' '}
                  <span className="capitalize">{selectedAccident.status}</span>
                </p>
              )}
              <p className="text-xs text-gray-500 mt-1">
                {selectedAccident.lat.toFixed(6)}, {selectedAccident.lng.toFixed(6)}
              </p>
            </div>
          </InfoWindow>
        )}
      </GoogleMap>

      {/* Legend overlay */}
      <div className="absolute right-3 top-3 rounded-lg bg-card/90 p-3 backdrop-blur-sm shadow-lg">
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

      {/* Coordinates display */}
      {center && (
        <div className="absolute bottom-3 left-3 rounded-lg bg-card/90 px-3 py-2 text-xs backdrop-blur-sm shadow-lg">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
            <span className="font-mono text-muted-foreground">
              {center.lat.toFixed(6)}, {center.lng.toFixed(6)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
