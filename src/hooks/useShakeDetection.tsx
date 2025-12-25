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
    shakeThreshold = 7, // Delta from normal gravity (m/s²) to consider it a shake
    dropThreshold = 2.5, // Near-freefall total acceleration (m/s²)
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
      // Prefer includingGravity (most widely supported + enables drop detection)
      const including = event.accelerationIncludingGravity;
      const linear = event.acceleration;

      const canUseIncluding =
        !!including && including.x != null && including.y != null && including.z != null;

      const source = canUseIncluding ? including : linear;
      if (!source || source.x == null || source.y == null || source.z == null) return;

      const x = source.x;
      const y = source.y;
      const z = source.z;

      const totalAcceleration = Math.sqrt(x * x + y * y + z * z);
      const now = Date.now();

      // Debounce check
      if (now - lastTriggerRef.current < debounceMs) return;

      // Drop detection is only reliable when including gravity is available
      if (canUseIncluding && totalAcceleration < dropThreshold) {
        console.log('[ShakeDetection] Drop detected! total:', totalAcceleration);
        lastTriggerRef.current = now;
        setLastEvent('drop');
        onDetectRef.current('drop');
        return;
      }

      // Shake detection
      // - With gravity: use delta from ~9.81 m/s²
      // - Without gravity: use raw linear acceleration magnitude
      const gravity = 9.81;
      const shakeValue = canUseIncluding ? Math.abs(totalAcceleration - gravity) : totalAcceleration;

      if (shakeValue > shakeThreshold) {
        console.log('[ShakeDetection] Shake detected! value:', shakeValue, 'total:', totalAcceleration);
        lastTriggerRef.current = now;
        setLastEvent('shake');
        onDetectRef.current('shake');
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
