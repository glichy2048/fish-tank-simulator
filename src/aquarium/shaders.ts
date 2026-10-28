// Shared pass-through vertex shader (contact shadows). Water, light-ray,
// surface, and particle shaders now live with the reef scene in reef.ts.
export const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`
