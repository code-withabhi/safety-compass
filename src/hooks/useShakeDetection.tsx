import { useEffect, useRef, useCallback, useState } from 'react';

interface ShakeDetectionOptions {
  shakeThreshold?: number; // Acceleration threshold for shake (m/s²)
  dropThreshold?: number; // Acceleration threshold for drop (freefall)
  debounceMs?: number; // Debounce time between detections
  autoStart?: boolean; // Auto-start on Android
}

interface ShakeDetectionResult {
  isSupported: boolean;
  isEnabled: boolean;
  permissionState: 'unknown' | 'prompt' | 'granted' | 'denied';
  lastEvent: 'shake' | 'drop' | null;
  requestPermission: () => Promise<boolean>;
  enable: () => void;
  disable: () => void;
}

export function useShakeDetection(
  onDetect: (type: 'shake' | 'drop') => void,
  options: ShakeDetectionOptions = {}
): ShakeDetectionResult {
  const {
    shakeThreshold = 20, // Lower threshold for easier detection
    dropThreshold = 2, // Low acceleration indicates freefall/drop
    debounceMs = 2000, // 2 second debounce
    autoStart = true,
  } = options;

  const [isSupported, setIsSupported] = useState(false);
  const [isEnabled, setIsEnabled] = useState(false);
  const [permissionState, setPermissionState] = useState<'unknown' | 'prompt' | 'granted' | 'denied'>('unknown');
  const [lastEvent, setLastEvent] = useState<'shake' | 'drop' | null>(null);
  
  const lastTriggerRef = useRef<number>(0);
  const onDetectRef = useRef(onDetect);
  const listenerAddedRef = useRef(false);
  
  // Keep callback ref updated
  useEffect(() => {
    onDetectRef.current = onDetect;
  }, [onDetect]);

  // Check if iOS requires permission
  const needsIOSPermission = typeof DeviceMotionEvent !== 'undefined' && 
    typeof (DeviceMotionEvent as any).requestPermission === 'function';

  const requestPermission = useCallback(async (): Promise<boolean> => {
    console.log('[ShakeDetection] Requesting permission...');
    
    // Check if DeviceMotionEvent is available
    if (typeof DeviceMotionEvent === 'undefined') {
      console.log('[ShakeDetection] DeviceMotionEvent not supported');
      setPermissionState('denied');
      return false;
    }

    // iOS 13+ requires explicit permission
    if (needsIOSPermission) {
      try {
        const permission = await (DeviceMotionEvent as any).requestPermission();
        console.log('[ShakeDetection] iOS permission result:', permission);
        const granted = permission === 'granted';
        setPermissionState(granted ? 'granted' : 'denied');
        if (granted) {
          setIsEnabled(true);
        }
        return granted;
      } catch (error) {
        console.error('[ShakeDetection] Error requesting motion permission:', error);
        setPermissionState('denied');
        return false;
      }
    }
    
    // Android and older iOS don't need permission - just enable
    console.log('[ShakeDetection] No permission needed (Android/older iOS)');
    setPermissionState('granted');
    setIsEnabled(true);
    return true;
  }, [needsIOSPermission]);

  const enable = useCallback(() => {
    setIsEnabled(true);
  }, []);

  const disable = useCallback(() => {
    setIsEnabled(false);
  }, []);

  // Check support and auto-start on mount
  useEffect(() => {
    const checkSupport = () => {
      // Check multiple ways for device motion support
      const hasDeviceMotion = typeof DeviceMotionEvent !== 'undefined';
      const hasAccelerometer = 'Accelerometer' in window;
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      
      const supported = hasDeviceMotion || hasAccelerometer;
      
      console.log('[ShakeDetection] Support check:', {
        hasDeviceMotion,
        hasAccelerometer,
        isMobile,
        supported,
        needsIOSPermission
      });
      
      setIsSupported(supported && isMobile);
      
      // On Android, auto-enable if supported and autoStart is true
      if (supported && isMobile && autoStart && !needsIOSPermission) {
        console.log('[ShakeDetection] Auto-enabling for Android');
        setPermissionState('granted');
        setIsEnabled(true);
      } else if (needsIOSPermission) {
        setPermissionState('prompt');
      }
    };

    checkSupport();
  }, [autoStart, needsIOSPermission]);

  // Motion event handler
  useEffect(() => {
    if (!isEnabled) {
      console.log('[ShakeDetection] Not enabled, skipping listener setup');
      return;
    }

    if (listenerAddedRef.current) {
      console.log('[ShakeDetection] Listener already added');
      return;
    }

    const handleMotion = (event: DeviceMotionEvent) => {
      const acceleration = event.accelerationIncludingGravity || event.acceleration;
      if (!acceleration) {
        return;
      }

      const { x, y, z } = acceleration;
      if (x === null || y === null || z === null) {
        return;
      }

      // Calculate total acceleration magnitude
      // Normal gravity is ~9.8, so we subtract it for shake detection
      const totalAcceleration = Math.sqrt(x * x + y * y + z * z);
      
      const now = Date.now();
      
      // Debounce check
      if (now - lastTriggerRef.current < debounceMs) return;

      // Detect freefall (drop) - very low acceleration (phone in free fall = ~0)
      if (totalAcceleration < dropThreshold) {
        console.log('[ShakeDetection] Drop detected! Acceleration:', totalAcceleration);
        lastTriggerRef.current = now;
        setLastEvent('drop');
        onDetectRef.current('drop');
        return;
      }

      // Detect shake - acceleration significantly higher than gravity (~9.8)
      // When shaking, total acceleration spikes above normal
      if (totalAcceleration > shakeThreshold) {
        console.log('[ShakeDetection] Shake detected! Acceleration:', totalAcceleration);
        lastTriggerRef.current = now;
        setLastEvent('shake');
        onDetectRef.current('shake');
        return;
      }
    };

    console.log('[ShakeDetection] Adding devicemotion listener');
    window.addEventListener('devicemotion', handleMotion, true);
    listenerAddedRef.current = true;
    
    return () => {
      console.log('[ShakeDetection] Removing devicemotion listener');
      window.removeEventListener('devicemotion', handleMotion, true);
      listenerAddedRef.current = false;
    };
  }, [isEnabled, shakeThreshold, dropThreshold, debounceMs]);

  return {
    isSupported,
    isEnabled,
    permissionState,
    lastEvent,
    requestPermission,
    enable,
    disable,
  };
}
