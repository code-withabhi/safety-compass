import { useEffect, useRef, useCallback, useState } from 'react';

interface ShakeDetectionOptions {
  shakeThreshold?: number; // Acceleration threshold for shake (m/s²)
  dropThreshold?: number; // Acceleration threshold for drop (freefall)
  debounceMs?: number; // Debounce time between detections
  enabled?: boolean;
}

interface ShakeDetectionResult {
  isSupported: boolean;
  isEnabled: boolean;
  lastEvent: 'shake' | 'drop' | null;
  requestPermission: () => Promise<boolean>;
}

export function useShakeDetection(
  onDetect: (type: 'shake' | 'drop') => void,
  options: ShakeDetectionOptions = {}
): ShakeDetectionResult {
  const {
    shakeThreshold = 25, // High acceleration indicates shake
    dropThreshold = 3, // Low acceleration indicates freefall/drop
    debounceMs = 3000, // 3 second debounce
    enabled = true,
  } = options;

  const [isSupported, setIsSupported] = useState(false);
  const [isEnabled, setIsEnabled] = useState(false);
  const [lastEvent, setLastEvent] = useState<'shake' | 'drop' | null>(null);
  
  const lastTriggerRef = useRef<number>(0);
  const onDetectRef = useRef(onDetect);
  
  // Keep callback ref updated
  useEffect(() => {
    onDetectRef.current = onDetect;
  }, [onDetect]);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    // Check if DeviceMotionEvent is available
    if (typeof DeviceMotionEvent === 'undefined') {
      console.log('DeviceMotionEvent not supported');
      return false;
    }

    // iOS 13+ requires permission
    if (typeof (DeviceMotionEvent as any).requestPermission === 'function') {
      try {
        const permission = await (DeviceMotionEvent as any).requestPermission();
        const granted = permission === 'granted';
        setIsEnabled(granted);
        return granted;
      } catch (error) {
        console.error('Error requesting motion permission:', error);
        return false;
      }
    }
    
    // Android and older iOS don't need permission
    setIsEnabled(true);
    return true;
  }, []);

  useEffect(() => {
    // Check support on mount
    const supported = typeof DeviceMotionEvent !== 'undefined' && 
                     'accelerometer' in navigator || 
                     typeof DeviceMotionEvent !== 'undefined';
    setIsSupported(supported);
    
    if (!supported || !enabled) return;

    // Auto-enable on Android (no permission needed)
    if (typeof (DeviceMotionEvent as any).requestPermission !== 'function') {
      setIsEnabled(true);
    }
  }, [enabled]);

  useEffect(() => {
    if (!isEnabled || !enabled) return;

    const handleMotion = (event: DeviceMotionEvent) => {
      const acceleration = event.accelerationIncludingGravity;
      if (!acceleration) return;

      const { x, y, z } = acceleration;
      if (x === null || y === null || z === null) return;

      // Calculate total acceleration magnitude
      const totalAcceleration = Math.sqrt(x * x + y * y + z * z);
      
      const now = Date.now();
      
      // Debounce check
      if (now - lastTriggerRef.current < debounceMs) return;

      // Detect freefall (drop) - very low acceleration
      if (totalAcceleration < dropThreshold) {
        console.log('Drop detected! Acceleration:', totalAcceleration);
        lastTriggerRef.current = now;
        setLastEvent('drop');
        onDetectRef.current('drop');
        return;
      }

      // Detect shake - very high acceleration
      if (totalAcceleration > shakeThreshold) {
        console.log('Shake detected! Acceleration:', totalAcceleration);
        lastTriggerRef.current = now;
        setLastEvent('shake');
        onDetectRef.current('shake');
        return;
      }
    };

    window.addEventListener('devicemotion', handleMotion);
    
    return () => {
      window.removeEventListener('devicemotion', handleMotion);
    };
  }, [isEnabled, enabled, shakeThreshold, dropThreshold, debounceMs]);

  return {
    isSupported,
    isEnabled,
    lastEvent,
    requestPermission,
  };
}
