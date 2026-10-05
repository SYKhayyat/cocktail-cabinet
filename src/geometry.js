// Pure geometry shared by headless models and browser views.
export function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

export function distance(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}

export function circleHitsCircle(ax, ay, ar, bx, by, br) {
  return distance(ax, ay, bx, by) < ar + br;
}

export function circleHitsRect(circle, rectangle) {
  const closestX = clamp(circle.x, rectangle.x, rectangle.x + rectangle.width);
  const closestY = clamp(circle.y, rectangle.y, rectangle.y + rectangle.height);
  return distance(circle.x, circle.y, closestX, closestY) < circle.radius;
}
