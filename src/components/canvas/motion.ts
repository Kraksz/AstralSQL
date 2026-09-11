/** Convert viewport pointer coordinates into the shader's bottom-left UV space. */
export function pointerToUv(
  clientX: number,
  clientY: number,
  bounds: { left: number; top: number; width: number; height: number },
) {
  if (
    ![
      clientX,
      clientY,
      bounds.left,
      bounds.top,
      bounds.width,
      bounds.height,
    ].every(Number.isFinite) ||
    bounds.width <= 0 ||
    bounds.height <= 0
  )
    return null;
  const x = (clientX - bounds.left) / bounds.width;
  const y = 1 - (clientY - bounds.top) / bounds.height;
  return x >= 0 && x <= 1 && y >= 0 && y <= 1 ? { x, y } : null;
}
export function dampingFactor(deltaSeconds: number) {
  return 1 - Math.exp(-Math.max(0, Math.min(deltaSeconds, 0.05)) * 10);
}
