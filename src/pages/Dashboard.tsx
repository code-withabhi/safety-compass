import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useGeolocation } from '@/hooks/useGeolocation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmergencyConfirmation } from '@/components/EmergencyConfirmation';
import { EmergencyContactsManager } from '@/components/EmergencyContactsManager';
import { AccidentHistory } from '@/components/AccidentHistory';
import { MapView } from '@/components/MapView';
import { useToast } from '@/hooks/use-toast';
import { Shield, AlertTriangle, MapPin, LogOut, User, Navigation, Loader2 } from 'lucide-react';

export default function Dashboard() {
  const navigate = useNavigate();
  const { user, signOut, isAdmin } = useAuth();
  const { toast } = useToast();
  const { latitude, longitude, speed, loading: geoLoading, error: geoError, refresh } = useGeolocation({ watch: true });
  
  const [showEmergency, setShowEmergency] = useState(false);
  const [isReporting, setIsReporting] = useState(false);

  const handleTriggerAccident = () => {
    if (!latitude || !longitude) {
      toast({ title: 'Location Required', description: 'Please enable location services.', variant: 'destructive' });
      return;
    }
    setShowEmergency(true);
  };

  const handleCancelEmergency = () => {
    setShowEmergency(false);
    toast({ title: 'Alert Cancelled', description: 'Emergency alert has been cancelled.' });
  };

  const handleConfirmEmergency = useCallback(async () => {
    if (!user || !latitude || !longitude) return;
    setIsReporting(true);
    
    try {
      // Default risk level
      let riskLevel: 'low' | 'medium' | 'high' = 'medium';
      
      // Call AI risk classification edge function
      try {
        const classifyResponse = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/classify-risk`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              speed: speed || 0,
              latitude,
              longitude,
              timestamp: new Date().toISOString(),
            }),
          }
        );
        
        if (classifyResponse.ok) {
          const classification = await classifyResponse.json();
          console.log('AI Risk Classification:', classification);
          riskLevel = classification.risk_level || riskLevel;
          toast({
            title: 'AI Analysis Complete',
            description: `Risk classified as ${riskLevel.toUpperCase()} (${Math.round((classification.confidence || 0.8) * 100)}% confidence)`,
          });
        }
      } catch (aiError) {
        console.warn('AI classification failed, using fallback:', aiError);
        // Fallback to simple rule-based classification
        riskLevel = (speed && speed > 50) ? 'high' : (speed && speed > 20) ? 'medium' : 'low';
      }
      
      const { error } = await supabase.from('accidents').insert({
        user_id: user.id,
        latitude,
        longitude,
        speed: speed || 0,
        risk_level: riskLevel,
        status: 'pending',
      });

      if (error) throw error;
      
      toast({ title: 'Emergency Reported', description: 'Emergency contacts have been notified.' });
      setShowEmergency(false);
    } catch (error) {
      console.error('Error reporting accident:', error);
      toast({ title: 'Error', description: 'Failed to report emergency.', variant: 'destructive' });
    } finally {
      setIsReporting(false);
    }
  }, [user, latitude, longitude, speed, toast]);

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-border bg-card/95 backdrop-blur-sm">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
              <Shield className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="font-semibold text-foreground">SafeGuard</span>
          </div>
          <div className="flex items-center gap-3">
            {isAdmin && (
              <Button variant="outline" size="sm" onClick={() => navigate('/admin')}>
                Admin Panel
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={handleSignOut}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="container py-6 space-y-6">
        {/* Location & Emergency Section */}
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Navigation className="h-5 w-5 text-primary" />
                Your Location
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <MapView
                center={latitude && longitude ? { lat: latitude, lng: longitude } : undefined}
                showUserLocation
                className="h-64"
              />
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <MapPin className="h-4 w-4" />
                  {latitude && longitude ? `${latitude.toFixed(6)}, ${longitude.toFixed(6)}` : 'Getting location...'}
                </div>
                <Button variant="outline" size="sm" onClick={refresh} disabled={geoLoading}>
                  {geoLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Refresh'}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="border-destructive/20">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5" />
                Emergency Alert
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Press the button below to manually trigger an emergency alert. This will notify your emergency contacts.
              </p>
              <Button
                variant="emergency"
                size="xl"
                className="w-full"
                onClick={handleTriggerAccident}
                disabled={!latitude || !longitude || isReporting}
              >
                {isReporting ? <Loader2 className="h-5 w-5 animate-spin" /> : <AlertTriangle className="h-5 w-5" />}
                Trigger Emergency Alert
              </Button>
              <p className="text-xs text-center text-muted-foreground">
                For demonstration: simulates accident detection
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Emergency Contacts */}
        <EmergencyContactsManager />

        {/* Accident History */}
        <AccidentHistory />
      </main>

      {/* Emergency Confirmation Modal */}
      <EmergencyConfirmation
        isOpen={showEmergency}
        onCancel={handleCancelEmergency}
        onConfirm={handleConfirmEmergency}
        isLoading={isReporting}
      />
    </div>
  );
}
