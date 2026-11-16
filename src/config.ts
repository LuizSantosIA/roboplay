// Coordenadas lógicas: altura fixa de 720 unidades; largura depende da tela.
export const VIEW_H = 720;
export const MIN_VIEW_W = 640;
export const WORLD_W = 3600;
export const HORIZON = 430; // linha onde começa o gramado
export const GROUND_TOP = 452; // limite de profundidade (fundo) em que se pode andar
export const GROUND_BOTTOM = 708; // limite da frente
export const GRAVITY_Z = 1500; // gravidade do eixo vertical (altura)
export const FIXED_DT = 1 / 60;

export const CAT = {
  ROBOT: 0x0001,
  OBJ: 0x0002,
  WALL: 0x0004,
  LAKE: 0x0008,
  SOLID: 0x0010,
};

/** Escala de perspectiva: objetos mais ao fundo ficam um pouco menores. */
export function depthScale(y: number): number {
  const t = (y - GROUND_TOP) / (GROUND_BOTTOM - GROUND_TOP);
  return 0.78 + 0.27 * Math.max(0, Math.min(1, t));
}
