import React, { useRef, useState, useEffect } from 'react';
import { SimulationParams } from '../types';
import { Sliders, Activity, RotateCcw, Volume2 } from 'lucide-react';

interface ControlPanelProps {
  params: SimulationParams;
  setParams: React.Dispatch<React.SetStateAction<SimulationParams>>;
  onReset: () => void;
}

const PRESETS = [
  { name: 'CLASSIC', n: 1, m: 2 },
  { name: 'GRID', n: 1, m: 3 },
  { name: 'X-CROSS', n: 2, m: 4 },
  { name: 'COMPLEX', n: 3, m: 7 },
  { name: 'MOSAIC', n: 5, m: 9 },
  { name: 'NOISE', n: 12, m: 15 },
];

// Reusable Scrubbable Number Component
const Scrubber: React.FC<{
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (val: number) => void;
  unit?: string;
}> = ({ label, value, min, max, step, onChange, unit = "" }) => {
  const [isDragging, setIsDragging] = useState(false);
  const startX = useRef(0);
  const startVal = useRef(0);

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    startX.current = e.clientX;
    startVal.current = value;
    document.body.style.cursor = 'ew-resize';
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const delta = e.clientX - startX.current;
      // Sensitivity: 1px = 1 step
      const change = delta * step; 
      let newVal = startVal.current + change;
      newVal = Math.max(min, Math.min(max, newVal));
      onChange(newVal);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      document.body.style.cursor = 'default';
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, step, min, max, onChange]);

  return (
    <div className="group select-none">
       <div className="flex justify-between items-end mb-2 text-xs">
          <span className="text-neutral-500 font-bold">{label}</span>
          <span 
             onMouseDown={handleMouseDown}
             className={`
               cursor-ew-resize bg-neutral-900 px-2 py-1 border border-neutral-800 text-accent font-mono
               hover:bg-neutral-800 hover:border-neutral-600 transition-colors
               ${isDragging ? 'bg-neutral-800 border-accent text-white' : ''}
             `}
          >
            {value.toFixed(2)}{unit}
          </span>
       </div>
       <input 
         type="range" 
         min={min} 
         max={max} 
         step={step} 
         value={value} 
         onChange={(e) => onChange(parseFloat(e.target.value))}
         className="w-full opacity-50 hover:opacity-100 transition-opacity"
       />
    </div>
  );
};

const ControlPanel: React.FC<ControlPanelProps> = ({ params, setParams, onReset }) => {
  
  const handleChange = (key: keyof SimulationParams, value: number) => {
    setParams(prev => ({ ...prev, [key]: value }));
  };

  const applyPreset = (n: number, m: number) => {
    setParams(prev => ({ ...prev, n, m }));
  };

  return (
    <div className="flex flex-col h-full font-mono text-xs uppercase tracking-wider bg-black border-l border-neutral-800 z-30">
      
      {/* Header Section */}
      <div className="p-6 border-b border-neutral-800 bg-neutral-900/50 backdrop-blur-sm">
        <h2 className="text-sm font-bold text-white flex items-center gap-2 mb-2">
          <Sliders className="w-4 h-4 text-accent" />
          CONTROL_UNIT_02
        </h2>
        <p className="text-neutral-500">DIGITAL TWIN INTERFACE</p>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-8 scrollbar-hide">
        
        {/* Audio Indicator */}
        <div className="bg-neutral-900/50 p-4 border border-neutral-800 flex items-center gap-4 text-neutral-400">
           <Volume2 className="w-4 h-4 animate-pulse text-accent" />
           <div className="flex-1">
             <div className="h-1 w-full bg-neutral-800 overflow-hidden">
                <div className="h-full bg-accent w-2/3 animate-[pulse_0.5s_infinite]"></div>
             </div>
             <div className="flex justify-between mt-1 text-[10px]">
                <span>AUDIO ENGINE</span>
                <span>ACTIVE</span>
             </div>
           </div>
        </div>

        {/* Sliders */}
        <section className="space-y-6">
          <label className="block text-neutral-500 mb-4 border-l-2 border-neutral-700 pl-2">
            OSCILLATORS (DRAG VALUES)
          </label>

          <Scrubber 
             label="FREQ_N" 
             value={params.n} 
             min={0.5} max={20} step={0.05} 
             onChange={(v) => handleChange('n', v)}
             unit=" Hz"
          />
          <Scrubber 
             label="FREQ_M" 
             value={params.m} 
             min={0.5} max={20} step={0.05} 
             onChange={(v) => handleChange('m', v)}
             unit=" Hz"
          />
        </section>

        {/* Physics */}
        <section className="space-y-6">
          <label className="block text-neutral-500 mb-4 border-l-2 border-neutral-700 pl-2">
            PHYSICS ENGINE
          </label>

          <Scrubber 
             label="KICK_FORCE" 
             value={params.vibrationStrength} 
             min={0} max={100} step={0.5} 
             onChange={(v) => handleChange('vibrationStrength', v)}
          />
          <Scrubber 
             label="FRICTION" 
             value={params.damping} 
             min={0.80} max={0.99} step={0.001} 
             onChange={(v) => handleChange('damping', v)}
          />
        </section>

        {/* Presets Grid */}
        <section>
          <label className="block text-neutral-500 mb-4 border-l-2 border-accent pl-2">
             PATTERN_PRESETS
          </label>
          <div className="grid grid-cols-2 gap-px bg-neutral-800 border border-neutral-800">
            {PRESETS.map((preset) => {
               // Approximate match check because floats
               const isActive = Math.abs(params.n - preset.n) < 0.1 && Math.abs(params.m - preset.m) < 0.1;
               return (
                 <button
                   key={preset.name}
                   onClick={() => applyPreset(preset.n, preset.m)}
                   className={`
                     py-3 px-2 text-center transition-all duration-300
                     ${isActive 
                        ? 'bg-accent text-black font-bold shadow-[0_0_15px_rgba(235,255,0,0.5)] z-10' 
                        : 'bg-black text-neutral-400 hover:bg-neutral-900 hover:text-white'}
                   `}
                 >
                   {preset.name}
                 </button>
               );
            })}
          </div>
        </section>
      </div>

      {/* Footer */}
      <div className="p-6 border-t border-neutral-800 bg-neutral-900/30">
        <button
          onClick={onReset}
          className="w-full py-3 border border-neutral-600 hover:border-white hover:bg-white hover:text-black text-white font-bold transition-colors uppercase flex items-center justify-center gap-2 text-xs"
        >
          <RotateCcw className="w-3 h-3" />
          Restart_Engine
        </button>
        
        <div className="mt-4 text-[10px] text-neutral-600 font-mono text-center">
           RENDER: GPGPU (WEBGL2)<br/>
           PARTICLES: {(params.particleCount / 1000).toFixed(0)}K
        </div>
      </div>
    </div>
  );
};

export default ControlPanel;