import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle, X, Phone, Clock, Loader2 } from 'lucide-react';

interface EmergencyConfirmationProps {
  isOpen: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  countdownDuration?: number;
  isLoading?: boolean;
}

export function EmergencyConfirmation({
  isOpen,
  onCancel,
  onConfirm,
  countdownDuration = 15,
  isLoading = false,
}: EmergencyConfirmationProps) {
  const [countdown, setCountdown] = useState(countdownDuration);
  const hasConfirmedRef = useRef(false);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setCountdown(countdownDuration);
      hasConfirmedRef.current = false;
    }
  }, [isOpen, countdownDuration]);

  // Countdown timer
  useEffect(() => {
    if (!isOpen || isLoading || hasConfirmedRef.current) return;

    if (countdown <= 0) {
      hasConfirmedRef.current = true;
      onConfirm();
      return;
    }

    const timer = setTimeout(() => {
      setCountdown((prev) => prev - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [isOpen, countdown, onConfirm, isLoading]);

  if (!isOpen) return null;

  const progress = ((countdownDuration - countdown) / countdownDuration) * 100;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/80 backdrop-blur-sm animate-fade-in">
      <div className="relative mx-4 w-full max-w-md overflow-hidden rounded-2xl bg-card shadow-2xl animate-slide-up">
        {/* Progress bar */}
        <div className="absolute left-0 right-0 top-0 h-1.5 bg-muted">
          <div
            className="h-full bg-destructive transition-all duration-1000 ease-linear"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Content */}
        <div className="p-6 pt-8">
          {/* Icon and Title */}
          <div className="mb-6 flex flex-col items-center text-center">
            <div className="relative mb-4">
              <div className="absolute inset-0 animate-pulse-ring rounded-full bg-destructive/30" />
              <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-destructive pulse-emergency">
                <AlertTriangle className="h-10 w-10 text-destructive-foreground" />
              </div>
            </div>
            <h2 className="mb-2 text-2xl font-bold text-foreground">Accident Detected!</h2>
            <p className="text-muted-foreground">Are you okay? Emergency services will be notified automatically.</p>
          </div>

          {/* Countdown */}
          <div className="mb-6 flex items-center justify-center gap-2">
            <Clock className="h-5 w-5 text-warning" />
            <span className="text-4xl font-bold tabular-nums text-warning">{countdown}</span>
            <span className="text-muted-foreground">seconds</span>
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-3">
            <Button
              variant="success"
              size="xl"
              className="w-full"
              onClick={onCancel}
              disabled={isLoading}
            >
              <X className="h-5 w-5" />
              I'm Okay - Cancel Alert
            </Button>
            <Button
              variant="emergency"
              size="xl"
              className="w-full"
              onClick={onConfirm}
              disabled={isLoading}
            >
              {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Phone className="h-5 w-5" />}
              {isLoading ? 'Sending Alert...' : 'Send Emergency Alert Now'}
            </Button>
          </div>

          {/* Info text */}
          <p className="mt-4 text-center text-sm text-muted-foreground">
            If no response is received, emergency contacts and services will be automatically notified.
          </p>
        </div>
      </div>
    </div>
  );
}
