import React, { useState } from 'react';
import ChladniCanvas from './components/ChladniCanvas';
import ControlPanel from './components/ControlPanel';
import { SimulationParams, DEFAULT_PARAMS } from './types';
import { Hexagon } from 'lucide-react';

const App: React.FC = () => {
  const [params, setParams] = useState<SimulationParams>(DEFAULT_PARAMS);
  const [resetKey, setResetKey] = useState(0);

  const handleReset = () => {
    setResetKey(prev => prev + 1);
  };

  return (
    <div className="h-screen w-screen bg-black text-neutral-200 font-sans flex flex-col overflow-hidden">
      
      {/* Top Bar */}
      <header className="h-14 border-b border-neutral-800 flex items-center justify-between px-6 bg-black z-10 shrink-0">
        <div className="flex items-center gap-4">
          <Hexagon className="w-6 h-6 text-accent stroke-1" />
          <h1 className="text-sm font-bold tracking-[0.2em] font-mono text-white">
            CYMATICS<span className="text-neutral-600">_LAB</span>
          </h1>
        </div>
        
        <div className="hidden md:flex items-center gap-6 text-[10px] font-mono tracking-widest text-neutral-500 uppercase">
          <span>Simulation Environment</span>
          <span className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-accent rounded-none animate-pulse"></span>
            Online
          </span>
        </div>
      </header>

      {/* Main Content Grid */}
      <main className="flex-1 flex flex-col lg:flex-row overflow-hidden relative">
        
        {/* Background Grid Pattern */}
        <div className="absolute inset-0 pointer-events-none opacity-20"
             style={{
               backgroundImage: 'linear-gradient(#333 1px, transparent 1px), linear-gradient(90deg, #333 1px, transparent 1px)',
               backgroundSize: '40px 40px'
             }}
        ></div>

        {/* Canvas Area */}
        <div className="flex-1 relative order-2 lg:order-1 flex items-center justify-center p-8 bg-neutral-950/50">
          
          {/* Viewport Frame */}
          <div className="relative w-full max-w-[80vh] aspect-square border border-neutral-800 bg-black">
             {/* Corner Markers */}
             <div className="absolute -top-px -left-px w-4 h-4 border-t border-l border-accent z-10"></div>
             <div className="absolute -top-px -right-px w-4 h-4 border-t border-r border-accent z-10"></div>
             <div className="absolute -bottom-px -left-px w-4 h-4 border-b border-l border-accent z-10"></div>
             <div className="absolute -bottom-px -right-px w-4 h-4 border-b border-r border-accent z-10"></div>

             {/* Technical Overlay */}
             <div className="absolute top-4 left-4 font-mono text-[10px] text-neutral-500 z-10 pointer-events-none">
                VIEWPORT: MAIN<br/>
                PARTICLES: {params.particleCount}
             </div>

             <ChladniCanvas params={params} triggerReset={resetKey} />
          </div>
        </div>

        {/* Sidebar Controls */}
        <aside className="w-full lg:w-80 order-1 lg:order-2 z-20 h-full lg:h-auto overflow-hidden">
          <ControlPanel 
            params={params} 
            setParams={setParams} 
            onReset={handleReset} 
          />
        </aside>
      </main>
    </div>
  );
};

export default App;