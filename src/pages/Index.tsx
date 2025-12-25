import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Shield, AlertTriangle, MapPin, Users, Activity, ArrowRight } from 'lucide-react';

export default function Index() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      {/* Hero Section */}
      <div className="container py-20">
        <div className="text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center justify-center h-20 w-20 rounded-2xl bg-gradient-to-br from-primary to-primary/80 shadow-glow mb-6">
            <Shield className="h-10 w-10 text-primary-foreground" />
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-4">
            Smart Accident Detection & Emergency Monitoring
          </h1>
          <p className="text-xl text-muted-foreground mb-8">
            Real-time accident detection with automatic emergency alerts. Keep your loved ones safe on the road.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button asChild size="xl">
              <Link to="/auth">
                Get Started <ArrowRight className="h-5 w-5" />
              </Link>
            </Button>
          </div>
        </div>

        {/* Features */}
        <div className="grid md:grid-cols-3 gap-6 mt-20">
          {[
            { icon: AlertTriangle, title: 'Accident Detection', desc: 'Automatic detection with emergency confirmation countdown' },
            { icon: MapPin, title: 'Live Location', desc: 'Real-time GPS tracking with shareable map links' },
            { icon: Users, title: 'Emergency Contacts', desc: 'Instant notification to your trusted contacts' },
          ].map((feature, i) => (
            <div key={i} className="p-6 rounded-xl bg-card border border-border shadow-card text-center">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 mb-4">
                <feature.icon className="h-6 w-6 text-primary" />
              </div>
              <h3 className="font-semibold text-foreground mb-2">{feature.title}</h3>
              <p className="text-sm text-muted-foreground">{feature.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
