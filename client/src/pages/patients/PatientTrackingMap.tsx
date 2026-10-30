import { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, Polyline, Marker, Popup, useMap, Circle } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { 
  useGetLocationsQuery, 
  useGetPatientQuery, 
  useRecordLocationMutation,
  useTestGeofenceAlertMutation 
} from "@/services/patientApi";
import { MapPin, Navigation, ShieldCheck, Volume2, VolumeX, Home, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { audioAlert } from "@/utils/audioAlert";
import type { TrackingLocation } from "@/types";

// Fix default Leaflet icon paths in React
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

function getDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371e3; // Earth radius in metres
  const phi1 = lat1 * Math.PI/180;
  const phi2 = lat2 * Math.PI/180;
  const deltaPhi = (lat2-lat1) * Math.PI/180;
  const deltaLambda = (lon2-lon1) * Math.PI/180;

  const a = Math.sin(deltaPhi/2) * Math.sin(deltaPhi/2) +
            Math.cos(phi1) * Math.cos(phi2) *
            Math.sin(deltaLambda/2) * Math.sin(deltaLambda/2);
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
}

function MapBoundsFit({ locations }: { locations: TrackingLocation[] }) {
  const map = useMap();
  useEffect(() => {
    if (locations.length > 0) {
      const bounds = L.latLngBounds(locations.map((loc) => [loc.latitude, loc.longitude]));
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [locations, map]);
  return null;
}

export function PatientTrackingMap({ patientId }: { patientId: number }) {
  const { data: locations = [], isLoading } = useGetLocationsQuery(patientId, {
    pollingInterval: 5000, 
  });
  
  const { data: patientResp } = useGetPatientQuery(patientId);
  const [recordLocation] = useRecordLocationMutation();
  const [testGeofenceAlert, { isLoading: isSendingAlert }] = useTestGeofenceAlertMutation();
  const patient = patientResp?.data;

  const [isBuzzerActive, setIsBuzzerActive] = useState<boolean>(() => audioAlert.isBuzzerActive());
  const [alertFeedback, setAlertFeedback] = useState<string | null>(null);

  useEffect(() => {
    return audioAlert.onBuzzerChange((active) => {
      setIsBuzzerActive(active);
    });
  }, []);

  const handleToggleBuzzer = async () => {
    if (isBuzzerActive) {
      audioAlert.stopContinuousBuzzer();
      setAlertFeedback("Buzzer alarm silenced.");
      setTimeout(() => setAlertFeedback(null), 4000);
    } else {
      audioAlert.resume();
      audioAlert.startContinuousBuzzer();
      setAlertFeedback("Buzzer sounding! Dispatching alert emails to caregiver and family...");

      try {
        const res = await testGeofenceAlert(patientId).unwrap();
        const count = res.recipients?.length || 0;
        if (res.success && count > 0) {
          setAlertFeedback(`Buzzer active! Alert email sent to ${count} recipient(s) (caregiver & family).`);
        } else {
          setAlertFeedback("Buzzer active! (No caregiver or family emails found for this patient).");
        }
      } catch (err) {
        console.error("Test alert error:", err);
        setAlertFeedback("Buzzer active! (Could not deliver alert emails: check SMTP configuration)");
      }
    }
  };

  const homeLat = patient?.home_latitude ? parseFloat(patient.home_latitude) : null;
  const homeLng = patient?.home_longitude ? parseFloat(patient.home_longitude) : null;
  const safeRadius = patient?.safe_radius_meters ?? 100;

  // Calculate distances and identify if patient has breached the safe radius
  const { isExceedingRadius, speed, endLocation, startLocation, currentDistFromHome } = useMemo(() => {
    if (locations.length === 0) return { isExceedingRadius: false, speed: 0, endLocation: null, startLocation: null, currentDistFromHome: 0 };
    
    // We treat the very first ping as "Start" if home is not set
    const startLoc = {
      latitude: homeLat ?? locations[0].latitude,
      longitude: homeLng ?? locations[0].longitude,
    };
    
    const latestLoc = locations[locations.length - 1];

    const currentDist = getDistanceMeters(startLoc.latitude, startLoc.longitude, latestLoc.latitude, latestLoc.longitude);

    // Attempt to calculate speed from last two points
    let currentSpeed = 0;
    if (locations.length >= 2) {
      const prev = locations[locations.length - 2];
      const dist = getDistanceMeters(prev.latitude, prev.longitude, latestLoc.latitude, latestLoc.longitude);
      const timeDiffSeconds = (new Date(latestLoc.timestamp).getTime() - new Date(prev.timestamp).getTime()) / 1000;
      if (timeDiffSeconds > 0) {
        currentSpeed = dist / timeDiffSeconds;
      }
    }

    return { 
      isExceedingRadius: currentDist > safeRadius, 
      speed: currentSpeed,
      endLocation: latestLoc,
      startLocation: startLoc,
      currentDistFromHome: currentDist,
    };
  }, [locations, homeLat, homeLng, safeRadius]);

  if (isLoading) {
    return <div className="animate-pulse h-[400px] w-full bg-muted rounded-xl mt-6"></div>;
  }

  if (locations.length === 0 || !startLocation || !endLocation) {
    return (
      <div className="flex flex-col items-center justify-center p-10 mt-6 rounded-xl border border-dashed border-border bg-card">
        <MapPin className="size-10 text-muted-foreground opacity-50 mb-4" />
        <p className="font-medium">No tracking history</p>
        <p className="text-sm text-muted-foreground mt-1">
          Tracking data has not been sent for this patient yet.
        </p>
        <button
          type="button"
          onClick={handleToggleBuzzer}
          className={
            isBuzzerActive
              ? "mt-4 text-xs px-3 py-1.5 rounded-md bg-rose-600 hover:bg-rose-700 text-white font-semibold flex items-center gap-1.5 shadow-md shadow-rose-500/30 animate-pulse border border-rose-500 cursor-pointer"
              : "mt-4 text-xs px-3 py-1.5 rounded-md bg-muted hover:bg-muted/80 text-foreground font-medium flex items-center gap-1.5 border border-border cursor-pointer transition-colors"
          }
          title={isBuzzerActive ? "Stop the buzzer alarm" : "Test perimeter breach buzzer & dispatch alert emails"}
        >
          {isBuzzerActive ? (
            <VolumeX className="size-3.5" />
          ) : isSendingAlert ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Volume2 className="size-3.5 text-primary" />
          )}
          <span>{isBuzzerActive ? "Stop Buzzer" : "Test Buzzer"}</span>
        </button>
      </div>
    );
  }

  const coordinates = locations.map((loc) => [loc.latitude, loc.longitude] as [number, number]);

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Navigation className="size-4 text-blue-500" /> Live Tracking Map
        </h2>
        {homeLat !== null && homeLng !== null && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={async () => {
                await recordLocation({
                  patient_id: patientId,
                  latitude: homeLat,
                  longitude: homeLng,
                });
                if (audioAlert.isBuzzerActive()) {
                  audioAlert.stopContinuousBuzzer();
                  setAlertFeedback("Patient returned safe at home. Buzzer silenced.");
                  setTimeout(() => setAlertFeedback(null), 3000);
                }
              }}
              className="text-xs px-2.5 py-1 rounded-md bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 font-medium flex items-center gap-1 border border-emerald-500/20 cursor-pointer transition-colors"
              title="Reset coordinates directly to home location"
            >
              <Home className="size-3 text-emerald-600" /> Set at Home
            </button>
            <button
              type="button"
              onClick={async () => {
                await recordLocation({
                  patient_id: patientId,
                  latitude: homeLat + 0.018,
                  longitude: homeLng + 0.018,
                });
                audioAlert.resume();
                audioAlert.startContinuousBuzzer();
                setAlertFeedback("Perimeter breach simulated! Continuous buzzer sounding and alert emails sent.");
              }}
              className="text-xs px-2.5 py-1 rounded-md bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-400 font-medium flex items-center gap-1 border border-amber-500/20 cursor-pointer transition-colors"
              title="Simulate patient moving outside the safe boundary"
            >
              <AlertTriangle className="size-3 text-amber-600" /> Simulate Breach
            </button>
          </div>
        )}
      </div>
      
      {/* HUD Info */}
      <div className="mb-4 flex flex-wrap gap-3">
        <div className="rounded-lg border border-border bg-card px-4 py-3">
          <p className="text-xl font-semibold">{speed.toFixed(1)}</p>
          <p className="text-xs text-muted-foreground mt-0.5">Current Speed (m/s)</p>
        </div>
        <div className="rounded-lg border border-border bg-card px-4 py-3">
          <p className="text-xl font-semibold">
            {currentDistFromHome < 1000 ? `${Math.round(currentDistFromHome)}m` : `${(currentDistFromHome / 1000).toFixed(2)}km`}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">Distance from Home</p>
        </div>
        {isExceedingRadius ? (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 flex items-center justify-between gap-4">
            <div>
              <p className="text-xl font-semibold text-amber-600">Travelling</p>
              <p className="text-xs text-muted-foreground mt-0.5 flex items-center">
                <span className="size-2 rounded-full mr-2 bg-amber-500 animate-pulse"></span>
                Beyond {safeRadius}m safe zone
              </p>
            </div>
            {isBuzzerActive ? (
              <button
                type="button"
                onClick={handleToggleBuzzer}
                className="text-xs px-3 py-1.5 rounded-md bg-rose-600 hover:bg-rose-700 text-white font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-md shadow-rose-500/30 animate-pulse border border-rose-500"
                title="Stop the continuous buzzer alarm"
              >
                <VolumeX className="size-3.5" />
                <span>Stop Buzzer</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleToggleBuzzer}
                disabled={isSendingAlert}
                className="text-xs px-2.5 py-1.5 rounded-md bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 font-medium flex items-center gap-1.5 transition-colors cursor-pointer border border-amber-500/30"
                title="Test the perimeter breach buzzer sound & dispatch alert emails to caregiver and family"
              >
                {isSendingAlert ? <Loader2 className="size-3.5 animate-spin" /> : <Volume2 className="size-3.5" />}
                <span>Test Buzzer</span>
              </button>
            )}
          </div>
        ) : (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 flex items-center justify-between gap-4">
            <div>
              <p className="text-xl font-semibold text-emerald-700">Safe at Home</p>
              <p className="text-xs text-emerald-600/80 mt-0.5 flex items-center">
                <ShieldCheck className="size-3.5 mr-1.5 text-emerald-600" />
                Within {safeRadius}m radius
              </p>
            </div>
            {isBuzzerActive ? (
              <button
                type="button"
                onClick={handleToggleBuzzer}
                className="text-xs px-3 py-1.5 rounded-md bg-rose-600 hover:bg-rose-700 text-white font-semibold flex items-center gap-1.5 transition-all cursor-pointer shadow-md shadow-rose-500/30 animate-pulse border border-rose-500"
                title="Stop the continuous buzzer alarm"
              >
                <VolumeX className="size-3.5" />
                <span>Stop Buzzer</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleToggleBuzzer}
                disabled={isSendingAlert}
                className="text-xs px-2.5 py-1.5 rounded-md bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-700 dark:text-emerald-300 font-medium flex items-center gap-1.5 transition-colors cursor-pointer border border-emerald-500/30"
                title="Test the perimeter breach buzzer sound & dispatch alert emails to caregiver and family"
              >
                {isSendingAlert ? <Loader2 className="size-3.5 animate-spin text-emerald-600" /> : <Volume2 className="size-3.5 text-emerald-600" />}
                <span>Test Buzzer</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Alert Feedback Banner */}
      {alertFeedback && (
        <div className="mb-4 px-3.5 py-2.5 rounded-lg bg-card border border-border shadow-xs text-xs text-foreground flex items-center justify-between gap-3 animate-in fade-in duration-200">
          <div className="flex items-center gap-2">
            {isBuzzerActive ? (
              <span className="size-2 rounded-full bg-rose-500 animate-ping" />
            ) : (
              <CheckCircle2 className="size-3.5 text-emerald-600" />
            )}
            <span className="font-medium">{alertFeedback}</span>
          </div>
          {isBuzzerActive && (
            <button
              type="button"
              onClick={() => audioAlert.stopContinuousBuzzer()}
              className="text-[11px] font-bold text-rose-600 hover:text-rose-700 underline cursor-pointer"
            >
              Stop Buzzer
            </button>
          )}
        </div>
      )}

      {/* Map Container */}
      <div className="h-[400px] w-full rounded-xl overflow-hidden border border-border shadow-sm relative z-0">
        <MapContainer center={[startLocation.latitude, startLocation.longitude]} zoom={15} style={{ height: "100%", width: "100%" }}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <Circle 
            center={[startLocation.latitude, startLocation.longitude]}
            radius={safeRadius}
            pathOptions={{ color: '#10b981', fillColor: '#10b981', fillOpacity: 0.1, weight: 2, dashArray: "4, 6" }}
          />
          <Polyline positions={coordinates} pathOptions={{ color: "#2563eb", weight: 4 }} />
          <Marker position={[startLocation.latitude, startLocation.longitude]}>
            <Popup>Home Location (Safe Zone: {safeRadius}m)</Popup>
          </Marker>
          <Marker position={[endLocation.latitude, endLocation.longitude]}>
            <Popup>
              <b>Current Location</b><br/>
              {new Date(endLocation.timestamp).toLocaleString()}<br/>
              Speed: {speed.toFixed(1)} m/s
            </Popup>
          </Marker>
          <MapBoundsFit locations={locations} />
        </MapContainer>
      </div>
    </div>
  );
}
