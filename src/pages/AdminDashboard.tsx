import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { useAlertSound } from '@/hooks/useAlertSound';
import { 
  Shield, 
  MapPin, 
  Users, 
  AlertTriangle, 
  Clock, 
  LogOut,
  RefreshCw,
  CheckCircle,
  XCircle,
  Activity
} from 'lucide-react';
import { MapView } from '@/components/MapView';
import type { Tables } from '@/integrations/supabase/types';

type Accident = Tables<'accidents'>;
type Profile = Tables<'profiles'>;

type ProfileMap = Record<string, Profile>;

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { user, signOut, isAdmin, loading: authLoading } = useAuth();
  const { toast } = useToast();
  
  const [accidents, setAccidents] = useState<Accident[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [profileMap, setProfileMap] = useState<ProfileMap>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const lastInsertToastRef = useRef<{ id: string; at: number } | null>(null);
  const { playAlertSound } = useAlertSound();

  // Fetch all accidents
  const fetchAccidents = async () => {
    try {
      const { data, error } = await supabase
        .from('accidents')
        .select('*')
        .order('detected_at', { ascending: false });

      if (error) throw error;
      setAccidents(data || []);
    } catch (error) {
      console.error('Error fetching accidents:', error);
      toast({ title: 'Error', description: 'Failed to fetch accidents', variant: 'destructive' });
    }
  };

  // Fetch all profiles
  const fetchProfiles = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setProfiles(data || []);
      // Build a map for quick lookup
      const map: ProfileMap = {};
      (data || []).forEach(p => { map[p.user_id] = p; });
      setProfileMap(map);
    } catch (error) {
      console.error('Error fetching profiles:', error);
    }
  };

  // Update accident status
  const updateAccidentStatus = async (accidentId: string, status: 'pending' | 'responded' | 'resolved') => {
    try {
      const updateData: Partial<Accident> = { status };
      if (status === 'responded') {
        updateData.responded_at = new Date().toISOString();
      } else if (status === 'resolved') {
        updateData.resolved_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from('accidents')
        .update(updateData)
        .eq('id', accidentId);

      if (error) throw error;
      toast({ title: 'Success', description: `Accident marked as ${status}` });
      fetchAccidents();
    } catch (error) {
      console.error('Error updating accident:', error);
      toast({ title: 'Error', description: 'Failed to update accident', variant: 'destructive' });
    }
  };

  // Initial data fetch
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchAccidents(), fetchProfiles()]);
      setLoading(false);
    };
    loadData();
  }, []);

  // Real-time subscription for accidents
  useEffect(() => {
    const channel = supabase
      .channel('admin-accidents')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'accidents' },
        (payload) => {
          console.log('Accident change:', payload);
          fetchAccidents();

          if (payload.eventType === 'INSERT') {
            const id = (payload as any)?.new?.id as string | undefined;
            const now = Date.now();
            const prev = lastInsertToastRef.current;

            // Deduplicate possible repeated INSERT events/toasts
            if (id && prev?.id === id && now - prev.at < 5000) return;
            lastInsertToastRef.current = { id: id || 'unknown', at: now };

            // Play alert sound for new accident
            playAlertSound();

            toast({
              title: 'New Accident Detected',
              description: 'A new emergency has been reported.',
              variant: 'destructive',
            });
          }
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
      supabase.removeChannel(channel);
    };
  }, []);

  // Redirect non-admins
  useEffect(() => {
    if (!authLoading && !isAdmin) {
      navigate('/dashboard');
    }
  }, [authLoading, isAdmin, navigate]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchAccidents(), fetchProfiles()]);
    setRefreshing(false);
    toast({ title: 'Refreshed', description: 'Data has been updated' });
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  const getRiskBadge = (level: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      low: 'secondary',
      medium: 'default',
      high: 'destructive',
    };
    return <Badge variant={variants[level] || 'outline'}>{level.toUpperCase()}</Badge>;
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      pending: 'destructive',
      responded: 'default',
      resolved: 'secondary',
    };
    return <Badge variant={variants[status] || 'outline'}>{status}</Badge>;
  };

  const stats = {
    total: accidents.length,
    pending: accidents.filter(a => a.status === 'pending').length,
    responded: accidents.filter(a => a.status === 'responded').length,
    resolved: accidents.filter(a => a.status === 'resolved').length,
    highRisk: accidents.filter(a => a.risk_level === 'high').length,
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-border bg-card/95 backdrop-blur-sm">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
              <Shield className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <span className="font-semibold text-foreground">SafeGuard Admin</span>
              <span className="ml-2 text-xs text-muted-foreground">Monitoring Dashboard</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
              <RefreshCw className={`h-4 w-4 mr-1 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button variant="ghost" size="sm" onClick={handleSignOut}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="container py-6 space-y-6">
        {/* Stats Overview */}
        <div className="grid gap-4 md:grid-cols-5">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Activity className="h-8 w-8 text-primary" />
                <div>
                  <p className="text-2xl font-bold">{stats.total}</p>
                  <p className="text-xs text-muted-foreground">Total Accidents</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-destructive/50">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-8 w-8 text-destructive" />
                <div>
                  <p className="text-2xl font-bold">{stats.pending}</p>
                  <p className="text-xs text-muted-foreground">Pending</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-warning/50">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Clock className="h-8 w-8 text-warning" />
                <div>
                  <p className="text-2xl font-bold">{stats.responded}</p>
                  <p className="text-xs text-muted-foreground">Responded</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-success/50">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <CheckCircle className="h-8 w-8 text-success" />
                <div>
                  <p className="text-2xl font-bold">{stats.resolved}</p>
                  <p className="text-xs text-muted-foreground">Resolved</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-destructive/50">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <XCircle className="h-8 w-8 text-destructive" />
                <div>
                  <p className="text-2xl font-bold">{stats.highRisk}</p>
                  <p className="text-xs text-muted-foreground">High Risk</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content Tabs */}
        <Tabs defaultValue="monitoring" className="space-y-4">
          <TabsList>
            <TabsTrigger value="monitoring">
              <AlertTriangle className="h-4 w-4 mr-2" />
              Live Monitoring
            </TabsTrigger>
            <TabsTrigger value="map">
              <MapPin className="h-4 w-4 mr-2" />
              Map View
            </TabsTrigger>
            <TabsTrigger value="users">
              <Users className="h-4 w-4 mr-2" />
              User Management
            </TabsTrigger>
          </TabsList>

          {/* Live Monitoring Tab */}
          <TabsContent value="monitoring" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                  Live Accident Feed
                  <span className="ml-2 h-2 w-2 rounded-full bg-success animate-pulse" />
                </CardTitle>
              </CardHeader>
              <CardContent>
                {accidents.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No accidents reported yet</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-border text-left text-sm text-muted-foreground">
                          <th className="pb-3 font-medium">User</th>
                          <th className="pb-3 font-medium">Time</th>
                          <th className="pb-3 font-medium">Location</th>
                          <th className="pb-3 font-medium">Speed</th>
                          <th className="pb-3 font-medium">Risk</th>
                          <th className="pb-3 font-medium">Status</th>
                          <th className="pb-3 font-medium">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {accidents.map((accident) => {
                          const profile = profileMap[accident.user_id];
                          return (
                          <tr key={accident.id} className="text-sm">
                            <td className="py-3">
                              <div>
                                <p className="font-medium">{profile?.full_name || 'Unknown'}</p>
                                <p className="text-xs text-muted-foreground">{profile?.email || 'N/A'}</p>
                              </div>
                            </td>
                            <td className="py-3">
                              {new Date(accident.detected_at).toLocaleString()}
                            </td>
                            <td className="py-3">
                              <a
                                href={`https://www.google.com/maps?q=${accident.latitude},${accident.longitude}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary hover:underline flex items-center gap-1"
                              >
                                <MapPin className="h-3 w-3" />
                                View Map
                              </a>
                            </td>
                            <td className="py-3">{accident.speed?.toFixed(1) || 0} km/h</td>
                            <td className="py-3">{getRiskBadge(accident.risk_level)}</td>
                            <td className="py-3">{getStatusBadge(accident.status)}</td>
                            <td className="py-3">
                              <div className="flex gap-1">
                                {accident.status === 'pending' && (
                                  <Button 
                                    size="sm" 
                                    variant="outline"
                                    onClick={() => updateAccidentStatus(accident.id, 'responded')}
                                  >
                                    Respond
                                  </Button>
                                )}
                                {accident.status === 'responded' && (
                                  <Button 
                                    size="sm" 
                                    variant="success"
                                    onClick={() => updateAccidentStatus(accident.id, 'resolved')}
                                  >
                                    Resolve
                                  </Button>
                                )}
                                {accident.status === 'resolved' && (
                                  <span className="text-xs text-muted-foreground">Completed</span>
                                )}
                              </div>
                            </td>
                          </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Map View Tab */}
          <TabsContent value="map" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="h-5 w-5 text-primary" />
                  Accident Locations Map
                </CardTitle>
              </CardHeader>
              <CardContent>
                <MapView
                  accidents={accidents.map(a => ({
                    id: a.id,
                    lat: a.latitude,
                    lng: a.longitude,
                    riskLevel: a.risk_level as 'low' | 'medium' | 'high',
                    status: a.status,
                  }))}
                  className="h-[500px]"
                />
              </CardContent>
            </Card>
          </TabsContent>

          {/* User Management Tab */}
          <TabsContent value="users" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-primary" />
                  Registered Users ({profiles.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {profiles.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No users registered yet</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-border text-left text-sm text-muted-foreground">
                          <th className="pb-3 font-medium">Name</th>
                          <th className="pb-3 font-medium">Email</th>
                          <th className="pb-3 font-medium">Phone</th>
                          <th className="pb-3 font-medium">Joined</th>
                          <th className="pb-3 font-medium">Accidents</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {profiles.map((profile) => {
                          const userAccidents = accidents.filter(a => a.user_id === profile.user_id);
                          return (
                            <tr key={profile.id} className="text-sm">
                              <td className="py-3 font-medium">{profile.full_name || 'N/A'}</td>
                              <td className="py-3">{profile.email || 'N/A'}</td>
                              <td className="py-3">{profile.phone || 'N/A'}</td>
                              <td className="py-3">{new Date(profile.created_at).toLocaleDateString()}</td>
                              <td className="py-3">
                                <Badge variant={userAccidents.length > 0 ? 'destructive' : 'secondary'}>
                                  {userAccidents.length}
                                </Badge>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
