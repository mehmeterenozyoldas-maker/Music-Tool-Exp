export interface SimulationParams {
  n: number;
  m: number;
  vibrationStrength: number;
  particleCount: number;
  damping: number;
}

export const DEFAULT_PARAMS: SimulationParams = {
  n: 3,
  m: 5,
  vibrationStrength: 25,
  particleCount: 200000, // Upgraded for GPU
  damping: 0.96, // Physics friction (0-1)
};