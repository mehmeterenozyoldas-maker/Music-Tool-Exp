import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { SimulationParams } from '../types';

interface ChladniCanvasProps {
  params: SimulationParams;
  triggerReset: number;
}

// --- SHADERS ---

// 1. Vertex Shader for rendering particles
const renderVertexShader = `
  uniform sampler2D posTexture;
  uniform sampler2D velTexture;
  uniform float uPixelRatio;
  varying float vSpeed;

  void main() {
    // Read position from texture
    vec3 pos = texture2D(posTexture, position.xy).xyz;
    
    // Read velocity for visualization
    vec3 vel = texture2D(velTexture, position.xy).xyz;
    vSpeed = length(vel);

    // Position range is 0..1, map to -1..1
    vec4 mvPosition = modelViewMatrix * vec4((pos.x * 2.0 - 1.0), (pos.y * 2.0 - 1.0), 0.0, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    
    // Size based on speed (slower = brighter/larger pileup effect)
    gl_PointSize = (1.2 + (1.0/(vSpeed + 0.1)) * 0.1) * uPixelRatio;
  }
`;

// 2. Fragment Shader for rendering particles
const renderFragmentShader = `
  varying float vSpeed;
  uniform vec3 uColor;

  void main() {
    // Circle shape
    vec2 center = gl_PointCoord - 0.5;
    float dist = length(center);
    if (dist > 0.5) discard;

    // Brighter when slower (accumulation)
    float brightness = 0.5 + (1.0 / (vSpeed * 10.0 + 1.0));
    gl_FragColor = vec4(uColor, brightness);
  }
`;

// 3. Compute Shader: Position Update
const positionShader = `
  uniform float uTime;
  uniform float uDelta;
  uniform sampler2D texturePosition;
  uniform sampler2D textureVelocity;
  uniform vec2 resolution;

  void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec3 pos = texture2D(texturePosition, uv).xyz;
    vec3 vel = texture2D(textureVelocity, uv).xyz;

    // Euler integration
    pos += vel * uDelta;

    // Boundary wrap/bounce
    if (pos.x < 0.0) { pos.x = 0.0; }
    if (pos.x > 1.0) { pos.x = 1.0; }
    if (pos.y < 0.0) { pos.y = 0.0; }
    if (pos.y > 1.0) { pos.y = 1.0; }

    gl_FragColor = vec4(pos, 1.0);
  }
`;

// 4. Compute Shader: Velocity/Physics Update (The Chladni Logic)
const velocityShader = `
  uniform float uTime;
  uniform float uDelta;
  uniform float uN;
  uniform float uM;
  uniform float uStrength;
  uniform float uDamping;
  uniform sampler2D texturePosition;
  uniform sampler2D textureVelocity;
  uniform vec2 resolution;
  uniform float uSeed;

  // Pseudo-random
  float rand(vec2 co){
    return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453);
  }

  // Chladni Function
  float getChladni(vec2 p, float n, float m) {
    float PI = 3.14159265359;
    float x = p.x; 
    float y = p.y;
    // Classic formula for square plate
    return cos(n * PI * x) * cos(m * PI * y) - cos(m * PI * x) * cos(n * PI * y);
  }

  void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    vec3 pos = texture2D(texturePosition, uv).xyz;
    vec3 vel = texture2D(textureVelocity, uv).xyz;

    float amplitude = getChladni(pos.xy, uN, uM);
    float absAmp = abs(amplitude);

    // 1. GRAVITY / SLOPE
    // Estimate gradient to slide particles towards nodes (amplitude 0)
    // We sample slightly nearby to find "downhill" (towards 0 amplitude)
    float eps = 0.01;
    float ampX = abs(getChladni(pos.xy + vec2(eps, 0.0), uN, uM));
    float ampY = abs(getChladni(pos.xy + vec2(0.0, eps), uN, uM));
    
    // Gradient points towards higher amplitude, so we go opposite
    vec2 gradient = vec2(ampX - absAmp, ampY - absAmp);
    
    // Apply "gravity" - sliding down the slope
    vel.xy -= gradient * 20.0 * uDelta; 

    // 2. KICK (Vibration)
    // If we are in a high amplitude area, we get kicked randomly
    if (absAmp > 0.1) {
       float r1 = rand(uv + uTime) - 0.5;
       float r2 = rand(uv + uTime + 0.1) - 0.5;
       
       // Kick strength proportional to amplitude
       float kick = uStrength * absAmp * 0.1; 
       vel.x += r1 * kick * uDelta;
       vel.y += r2 * kick * uDelta;
    }

    // 3. DAMPING (Friction)
    vel *= uDamping;

    gl_FragColor = vec4(vel, 1.0);
  }
`;

// 5. Post Processing Shader (Bloom + CRT + Aberration)
const postFragShader = `
  uniform sampler2D tDiffuse;
  uniform vec2 resolution;
  uniform float uTime;
  varying vec2 vUv;

  void main() {
    vec4 color = texture2D(tDiffuse, vUv);

    // Simple Chromatic Aberration
    float aberration = 0.003;
    float r = texture2D(tDiffuse, vUv + vec2(aberration, 0.0)).r;
    float b = texture2D(tDiffuse, vUv - vec2(aberration, 0.0)).b;
    color.r = r;
    color.b = b;

    // Scanlines
    float scanline = sin(vUv.y * resolution.y * 0.5) * 0.1;
    color.rgb -= scanline;

    // Vignette
    float dist = distance(vUv, vec2(0.5));
    color.rgb *= (1.0 - dist * 0.5);

    // Boost brightness (Bloom-ish)
    color.rgb *= 1.2;

    gl_FragColor = color;
  }
`;

const postVertShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;


// --- MAIN COMPONENT ---

const ChladniCanvas: React.FC<ChladniCanvasProps> = ({ params, triggerReset }) => {
  const mountRef = useRef<HTMLDivElement>(null);
  
  // Audio Refs
  const audioCtxRef = useRef<AudioContext | null>(null);
  const oscRef = useRef<OscillatorNode[]>([]);
  const gainRef = useRef<GainNode | null>(null);
  const isAudioInit = useRef(false);

  // Params Ref for Lerping
  const targetParamsRef = useRef(params);
  const currentParamsRef = useRef(params);

  useEffect(() => {
    targetParamsRef.current = params;
  }, [params]);

  // --- AUDIO SYSTEM ---
  const initAudio = () => {
    if (isAudioInit.current) return;
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    audioCtxRef.current = new Ctx();
    
    const masterGain = audioCtxRef.current!.createGain();
    masterGain.gain.value = 0.1; // Low volume
    masterGain.connect(audioCtxRef.current!.destination);
    gainRef.current = masterGain;

    // Create 2 oscillators for Binaural beats
    const osc1 = audioCtxRef.current!.createOscillator();
    const osc2 = audioCtxRef.current!.createOscillator();
    
    osc1.type = 'sine';
    osc2.type = 'sine';
    
    osc1.connect(masterGain);
    osc2.connect(masterGain);
    
    osc1.start();
    osc2.start();
    
    oscRef.current = [osc1, osc2];
    isAudioInit.current = true;
  };

  const updateAudio = (n: number, m: number) => {
    if (!audioCtxRef.current || oscRef.current.length < 2) return;
    
    // Map N and M to frequencies (Base 220Hz)
    // Small detuning creates the "texture"
    const base = 220;
    const f1 = base + (n * 30);
    const f2 = base + (m * 30.5); // Slight offset for beating

    oscRef.current[0].frequency.setTargetAtTime(f1, audioCtxRef.current.currentTime, 0.1);
    oscRef.current[1].frequency.setTargetAtTime(f2, audioCtxRef.current.currentTime, 0.1);
  };

  // --- 3D / GPGPU SYSTEM ---
  useEffect(() => {
    if (!mountRef.current) return;

    // --- SETUP ---
    const width = mountRef.current.clientWidth;
    const height = mountRef.current.clientHeight;
    
    const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mountRef.current.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    // --- GPGPU SETUP ---
    // Texture size for particles (Square root of particle count)
    const size = Math.ceil(Math.sqrt(params.particleCount)); 
    const count = size * size;
    
    // Helper to create data texture
    const createDataTexture = () => {
        const data = new Float32Array(count * 4);
        for (let i = 0; i < count; i++) {
            const i4 = i * 4;
            data[i4] = Math.random();     // x
            data[i4 + 1] = Math.random(); // y
            data[i4 + 2] = 0;             // z
            data[i4 + 3] = 1;             // w
        }
        const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.FloatType);
        tex.needsUpdate = true;
        return tex;
    };

    // Ping-Pong Buffers
    let posTexCurrent = createDataTexture();
    let posTexNext = createDataTexture();
    let velTexCurrent = createDataTexture(); // Start with 0 velocity
    let velTexNext = createDataTexture();

    // Render Targets
    const getTarget = () => new THREE.WebGLRenderTarget(size, size, {
        type: THREE.FloatType,
        format: THREE.RGBAFormat,
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
    });

    let rTargetPos1 = getTarget();
    let rTargetPos2 = getTarget();
    let rTargetVel1 = getTarget();
    let rTargetVel2 = getTarget();

    // --- COMPUTE SCENE ---
    const computeScene = new THREE.Scene();
    const computeCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const computeMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    computeScene.add(computeMesh);

    // Compute Materials
    const simMatPos = new THREE.ShaderMaterial({
        uniforms: {
            uTime: { value: 0 },
            uDelta: { value: 0 },
            texturePosition: { value: null },
            textureVelocity: { value: null },
            resolution: { value: new THREE.Vector2(size, size) }
        },
        vertexShader: postVertShader, // Reusing full screen quad vert
        fragmentShader: positionShader
    });

    const simMatVel = new THREE.ShaderMaterial({
        uniforms: {
            uTime: { value: 0 },
            uDelta: { value: 0 },
            uN: { value: 1 },
            uM: { value: 1 },
            uStrength: { value: 10 },
            uDamping: { value: 0.9 },
            texturePosition: { value: null },
            textureVelocity: { value: null },
            resolution: { value: new THREE.Vector2(size, size) },
            uSeed: { value: Math.random() }
        },
        vertexShader: postVertShader,
        fragmentShader: velocityShader
    });

    // --- RENDER SCENE ---
    // Particles
    const particlesGeo = new THREE.BufferGeometry();
    const particlesPos = new Float32Array(count * 3);
    // UVs for texture lookup
    for (let i = 0; i < count; i++) {
        const u = (i % size) / size;
        const v = Math.floor(i / size) / size;
        particlesPos[i * 3] = u;
        particlesPos[i * 3 + 1] = v;
        particlesPos[i * 3 + 2] = 0;
    }
    particlesGeo.setAttribute('position', new THREE.BufferAttribute(particlesPos, 3));

    const particlesMat = new THREE.ShaderMaterial({
        uniforms: {
            posTexture: { value: null },
            velTexture: { value: null },
            uPixelRatio: { value: renderer.getPixelRatio() },
            uColor: { value: new THREE.Color('#ebff00') }
        },
        vertexShader: renderVertexShader,
        fragmentShader: renderFragmentShader,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending
    });
    
    const particlesMesh = new THREE.Points(particlesGeo, particlesMat);
    scene.add(particlesMesh);

    // --- POST PROCESSING SETUP ---
    const postScene = new THREE.Scene();
    const postTarget = new THREE.WebGLRenderTarget(width * renderer.getPixelRatio(), height * renderer.getPixelRatio());
    const postMat = new THREE.ShaderMaterial({
        uniforms: {
            tDiffuse: { value: null },
            resolution: { value: new THREE.Vector2(width, height) },
            uTime: { value: 0 }
        },
        vertexShader: postVertShader,
        fragmentShader: postFragShader
    });
    const postQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), postMat);
    postScene.add(postQuad);


    // --- LOOP ---
    let frameId = 0;
    const clock = new THREE.Clock();

    const animate = () => {
        const dt = Math.min(clock.getDelta(), 0.1); // Cap delta time
        const time = clock.getElapsedTime();

        // 1. LERP PARAMS
        // Smoothly transition parameters for "organic" feel
        const lerpFactor = dt * 2.0; // Speed of transition
        const curr = currentParamsRef.current;
        const target = targetParamsRef.current;
        
        curr.n += (target.n - curr.n) * lerpFactor;
        curr.m += (target.m - curr.m) * lerpFactor;
        curr.vibrationStrength += (target.vibrationStrength - curr.vibrationStrength) * lerpFactor;
        curr.damping += (target.damping - curr.damping) * lerpFactor;

        // Update Audio
        updateAudio(curr.n, curr.m);

        // 2. PHYSICS STEP (GPGPU)
        // Swap textures
        const tmpVel = rTargetVel1;
        rTargetVel1 = rTargetVel2;
        rTargetVel2 = tmpVel;

        const tmpPos = rTargetPos1;
        rTargetPos1 = rTargetPos2;
        rTargetPos2 = tmpPos;

        // A. Update Velocity
        simMatVel.uniforms.textureVelocity.value = rTargetVel2.texture;
        simMatVel.uniforms.texturePosition.value = rTargetPos2.texture;
        simMatVel.uniforms.uTime.value = time;
        simMatVel.uniforms.uDelta.value = dt;
        simMatVel.uniforms.uN.value = curr.n;
        simMatVel.uniforms.uM.value = curr.m;
        simMatVel.uniforms.uStrength.value = curr.vibrationStrength;
        simMatVel.uniforms.uDamping.value = curr.damping;
        simMatVel.uniforms.uSeed.value = Math.random();
        
        computeMesh.material = simMatVel;
        renderer.setRenderTarget(rTargetVel1);
        renderer.render(computeScene, computeCamera);

        // B. Update Position
        simMatPos.uniforms.textureVelocity.value = rTargetVel1.texture;
        simMatPos.uniforms.texturePosition.value = rTargetPos2.texture;
        simMatPos.uniforms.uDelta.value = dt;
        
        computeMesh.material = simMatPos;
        renderer.setRenderTarget(rTargetPos1);
        renderer.render(computeScene, computeCamera);

        // 3. MAIN RENDER
        // Render particles to offscreen target (for post-process)
        particlesMat.uniforms.posTexture.value = rTargetPos1.texture;
        particlesMat.uniforms.velTexture.value = rTargetVel1.texture;
        
        renderer.setRenderTarget(postTarget);
        renderer.clear(); // Clear transparency
        renderer.render(scene, camera);

        // 4. POST PROCESS RENDER
        // Render texture to screen
        postMat.uniforms.tDiffuse.value = postTarget.texture;
        postMat.uniforms.uTime.value = time;
        
        renderer.setRenderTarget(null);
        renderer.render(postScene, computeCamera);

        frameId = requestAnimationFrame(animate);
    };

    animate();

    // Reset logic: Just fill position texture with random noise
    const handleReset = () => {
         // Re-init positions (simplified: just relies on divergence over time usually, but for hard reset:)
         // In a real robust GPGPU system we would have an init shader, but simply swapping N/M rapidly works visually too.
         // Actually, let's just re-randomize params slightly to shake it up.
    };

    const handleResize = () => {
        if (!mountRef.current) return;
        const w = mountRef.current.clientWidth;
        const h = mountRef.current.clientHeight;
        renderer.setSize(w, h);
        postTarget.setSize(w * renderer.getPixelRatio(), h * renderer.getPixelRatio());
        postMat.uniforms.resolution.value.set(w, h);
    };
    window.addEventListener('resize', handleResize);

    // Initial Audio Click
    const startAudio = () => initAudio();
    window.addEventListener('click', startAudio, { once: true });

    return () => {
        window.removeEventListener('resize', handleResize);
        window.removeEventListener('click', startAudio);
        cancelAnimationFrame(frameId);
        mountRef.current?.removeChild(renderer.domElement);
        renderer.dispose();
        
        // Cleanup Audio
        if(audioCtxRef.current) audioCtxRef.current.close();
        isAudioInit.current = false;
    };
  }, [triggerReset, params.particleCount]); 

  return (
    <div ref={mountRef} className="w-full h-full cursor-crosshair" />
  );
};

export default ChladniCanvas;