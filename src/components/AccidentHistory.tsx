import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, AlertTriangle, MapPin, Clock, Activity } from 'lucide-react';
import { format } from 'date-fns';

interface Accident {
  id: string;
  latitude: number;
  longitude: number;
  speed: number | null;
  risk_level: 'low' | 'medium' | 'high';
  status: 'pending' | 'responded' | 'resolved';
  detected_at: string;
  notes: string | null;
}

export function AccidentHistory() {
  const { user } = useAuth();
  const [accidents, setAccidents] = useState<Accident[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchAccidents();
      
      // Subscribe to real-time changes
      const channel = supabase
        .channel('accidents-changes')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'accidents',
            filter: `user_id=eq.${user.id}`,
          },
          () => {
            fetchAccidents();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [user]);

  const fetchAccidents = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('accidents')
        .select('*')
        .eq('user_id', user.id)
        .order('detected_at', { ascending: false });

      if (error) throw error;
      setAccidents(data || []);
    } catch (error) {
      console.error('Error fetching accidents:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const getRiskBadgeVariant = (risk: string) => {
    switch (risk) {
      case 'low':
        return 'outline';
      case 'medium':
        return 'secondary';
      case 'high':
        return 'destructive';
      default:
        return 'outline';
    }
  };

  const getStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'pending':
        return 'secondary';
      case 'responded':
        return 'default';
      case 'resolved':
        return 'outline';
      default:
        return 'outline';
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-primary" />
          Accident History
        </CardTitle>
      </CardHeader>
      <CardContent>
        {accidents.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border py-8 text-center">
            <AlertTriangle className="mx-auto h-8 w-8 text-muted-foreground/50" />
            <p className="mt-2 text-sm text-muted-foreground">
              No accidents recorded.
            </p>
            <p className="text-xs text-muted-foreground">
              Stay safe on the road!
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {accidents.map((accident) => (
              <div
                key={accident.id}
                className="rounded-lg border border-border bg-card p-4 transition-colors hover:bg-muted/30"
              >
                <div className="flex items-start justify-between">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">
                        {format(new Date(accident.detected_at), 'PPpp')}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <MapPin className="h-3 w-3" />
                      <span>
                        {accident.latitude.toFixed(6)}, {accident.longitude.toFixed(6)}
                      </span>
                    </div>
                    {accident.speed && (
                      <div className="text-sm text-muted-foreground">
                        Speed: {accident.speed.toFixed(1)} km/h
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <Badge variant={getRiskBadgeVariant(accident.risk_level)} className={
                      accident.risk_level === 'low' ? 'border-success text-success' :
                      accident.risk_level === 'medium' ? 'border-warning text-warning bg-warning/10' :
                      ''
                    }>
                      {accident.risk_level.toUpperCase()} Risk
                    </Badge>
                    <Badge variant={getStatusBadgeVariant(accident.status)}>
                      {accident.status.charAt(0).toUpperCase() + accident.status.slice(1)}
                    </Badge>
                  </div>
                </div>
                {accident.notes && (
                  <p className="mt-2 text-sm text-muted-foreground border-t border-border pt-2">
                    {accident.notes}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
