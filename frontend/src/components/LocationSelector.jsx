import React, { useState, useEffect, useRef } from 'react';
import { MapPin, ChevronDown, Loader2, Clock, Sun, Moon, Check } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || "";

export default function LocationSelector({ selectedLocation, onLocationChange }) {
  const [locations, setLocations] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [timeSlots, setTimeSlots] = useState(null);
  const [prevLocation, setPrevLocation] = useState(selectedLocation);
  const [transitioning, setTransitioning] = useState(false);
  const dropdownRef = useRef(null);

  // Fetch locations on mount
  useEffect(() => {
    const fetchLocations = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/locations`, { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          setLocations(data.locations || []);
        }
      } catch (err) {
        console.error("Failed to fetch locations:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchLocations();
  }, []);

  // Fetch time slots when location changes with loading state and transition
  useEffect(() => {
    if (!selectedLocation) return;
    
    // Trigger transition animation when location changes
    if (prevLocation !== selectedLocation) {
      setTransitioning(true);
      setSlotsLoading(true);
    }
    
    setPrevLocation(selectedLocation);
    
    const fetchSlots = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/locations/${selectedLocation}/slots`, { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          // Small delay to allow fade-out transition to play
          setTimeout(() => {
            setTimeSlots(data);
            setSlotsLoading(false);
            setTransitioning(false);
          }, 150);
        }
      } catch (err) {
        console.error("Failed to fetch time slots:", err);
        setSlotsLoading(false);
        setTransitioning(false);
      }
    };
    fetchSlots();
  }, [selectedLocation]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedLoc = locations.find(loc => loc.id === selectedLocation);

  // Get today's day name to highlight current day
  const todayName = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][new Date().getDay()];

  // Render time slot grid for a given day
  const renderTimeSlotsForDay = (day) => {
    if (!timeSlots || !timeSlots.timeSlots || !timeSlots.timeSlots[day]) return null;
    const slots = timeSlots.timeSlots[day];
    if (slots.length === 0) return null;

    return (
      <div key={day} className="mb-2 last:mb-0">
        <div className={`text-xs font-semibold mb-1 px-1 ${day === todayName ? 'text-blue-600' : 'text-slate-500'}`}>
          {day.slice(0, 3)}
          {day === todayName && <span className="text-[10px] text-blue-400 ml-1">· Today</span>}
        </div>
        <div className="flex flex-wrap gap-1">
          {slots.map((slot) => (
            <span
              key={slot}
              className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] bg-slate-50 text-slate-600 rounded-md border border-slate-200/60"
            >
              <Clock className="w-2.5 h-2.5 text-slate-400" />
              {slot}
            </span>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <label className="block text-sm font-medium text-slate-600 mb-1.5">
        <MapPin className="w-3.5 h-3.5 inline mr-1" />
        Location
      </label>
      
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg hover:border-blue-400 hover:shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 text-slate-700 active:scale-[0.99]"
      >
        {loading ? (
          <span className="flex items-center gap-2 text-slate-400">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Loading...
          </span>
        ) : (
          <span className="flex items-center gap-2">
            <MapPin className="w-3.5 h-3.5 text-slate-400" />
            {selectedLoc ? selectedLoc.label : 'Select a location'}
          </span>
        )}
        <ChevronDown className={`w-4 h-4 text-slate-400 transition-all duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute z-20 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-60 overflow-y-auto animate-fade-in">
          {locations.length === 0 && !loading ? (
            <div className="px-3 py-2 text-sm text-slate-400">No locations available</div>
          ) : (
            locations.map((loc) => (
              <button
                key={loc.id}
                onClick={() => {
                  onLocationChange(loc.id);
                  setIsOpen(false);
                }}
                className={`w-full text-left px-3 py-2.5 text-sm flex items-center gap-2 transition-all duration-150 hover:bg-blue-50 hover:pl-4 ${
                  selectedLocation === loc.id ? 'bg-blue-50 text-blue-700 font-medium' : 'text-slate-700'
                }`}
              >
                <MapPin className={`w-3.5 h-3.5 shrink-0 transition-colors duration-150 ${
                  selectedLocation === loc.id ? 'text-blue-500' : 'text-slate-400'
                }`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate">{loc.label}</span>
                    {selectedLocation === loc.id && (
                      <Check className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                    )}
                  </div>
                  <div className="text-xs text-slate-400 truncate">
                    {loc.timezone} · {loc.defaultDayStart} - {loc.defaultDayEnd}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      )}

      {/* Time slots section - with fade/slide transition */}
      {selectedLoc && (
        <div className={`mt-3 transition-all duration-300 ease-in-out overflow-hidden ${
          transitioning || slotsLoading ? 'opacity-0 translate-y-1 max-h-0' : 'opacity-100 translate-y-0 max-h-[500px]'
        }`}>
          {/* Available days summary */}
          <div className="mb-2">
            <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-1.5">
              <Sun className="w-3 h-3 text-amber-400" />
              <span className="font-medium">Available days:</span>
            </div>
            <div className="flex flex-wrap gap-1">
              {selectedLoc.availableDays.map((day) => {
                const isToday = day === todayName;
                return (
                  <span
                    key={day}
                    className={`inline-block text-[11px] px-2 py-0.5 rounded-md border transition-all duration-150 ${
                      isToday
                        ? 'bg-blue-100 text-blue-700 border-blue-200 font-medium'
                        : 'bg-slate-50 text-slate-500 border-slate-200/60'
                    }`}
                  >
                    {day.slice(0, 3)}
                    {isToday && <span className="ml-0.5">·</span>}
                  </span>
                );
              })}
            </div>
          </div>

          {/* Day start/end info */}
          <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-2">
            <Clock className="w-3 h-3" />
            <span>
              {selectedLoc.defaultDayStart} - {selectedLoc.defaultDayEnd}
              <span className="ml-1">· {selectedLoc.timezone}</span>
            </span>
          </div>

          {/* Time slots per day */}
          {timeSlots && timeSlots.timeSlots && (
            <div className="bg-slate-50/50 rounded-lg border border-slate-100 p-2.5">
              <div className="text-xs font-medium text-slate-500 mb-2 flex items-center gap-1.5">
                <Clock className="w-3 h-3" />
                Available time slots
              </div>
              {selectedLoc.availableDays.map(day => renderTimeSlotsForDay(day))}
            </div>
          )}
        </div>
      )}

      {/* Loading skeleton for time slots */}
      {slotsLoading && (
        <div className="mt-3 animate-pulse">
          <div className="flex gap-1 mb-2">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="h-5 w-10 bg-slate-100 rounded-md"></div>
            ))}
          </div>
          <div className="h-4 w-32 bg-slate-100 rounded mb-2"></div>
          <div className="bg-slate-50 rounded-lg border border-slate-100 p-2.5">
            <div className="h-3 w-24 bg-slate-100 rounded mb-2"></div>
            <div className="flex flex-wrap gap-1">
              {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
                <div key={i} className="h-5 w-14 bg-slate-100 rounded-md"></div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}