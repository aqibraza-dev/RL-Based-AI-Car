// utils.js - Math utilities, vectors, splines, raycasting

export class Vec2 {
    constructor(x = 0, y = 0) {
        this.x = x;
        this.y = y;
    }
    clone() { return new Vec2(this.x, this.y); }
    add(v) { return new Vec2(this.x + v.x, this.y + v.y); }
    sub(v) { return new Vec2(this.x - v.x, this.y - v.y); }
    scale(s) { return new Vec2(this.x * s, this.y * s); }
    length() { return Math.sqrt(this.x * this.x + this.y * this.y); }
    lengthSq() { return this.x * this.x + this.y * this.y; }
    normalize() {
        const len = this.length();
        return len === 0 ? new Vec2() : new Vec2(this.x / len, this.y / len);
    }
    dot(v) { return this.x * v.x + this.y * v.y; }
    cross(v) { return this.x * v.y - this.y * v.x; }
    rotate(a) {
        const c = Math.cos(a), s = Math.sin(a);
        return new Vec2(this.x * c - this.y * s, this.x * s + this.y * c);
    }
    perpendicular() { return new Vec2(-this.y, this.x); }
    distanceTo(v) { return this.sub(v).length(); }
    static lerp(a, b, t) { return new Vec2(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t); }
    static fromAngle(a) { return new Vec2(Math.cos(a), Math.sin(a)); }
}

export function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
export function lerp(a, b, t) { return a + (b - a) * t; }
export function normalizeAngle(a) {
    while (a > Math.PI) a -= 2 * Math.PI;
    while (a < -Math.PI) a += 2 * Math.PI;
    return a;
}

export function catmullRom(p0, p1, p2, p3, t) {
    const t2 = t * t, t3 = t2 * t;
    return new Vec2(
        0.5 * ((2*p1.x) + (-p0.x+p2.x)*t + (2*p0.x-5*p1.x+4*p2.x-p3.x)*t2 + (-p0.x+3*p1.x-3*p2.x+p3.x)*t3),
        0.5 * ((2*p1.y) + (-p0.y+p2.y)*t + (2*p0.y-5*p1.y+4*p2.y-p3.y)*t2 + (-p0.y+3*p1.y-3*p2.y+p3.y)*t3)
    );
}

export function sampleSpline(controlPoints, samplesPerSeg = 20, closed = true) {
    const pts = [], n = controlPoints.length;
    if (n < 2) return pts;
    const segs = closed ? n : n - 1;
    for (let i = 0; i < segs; i++) {
        const p0 = controlPoints[(i - 1 + n) % n];
        const p1 = controlPoints[i];
        const p2 = controlPoints[(i + 1) % n];
        const p3 = controlPoints[(i + 2) % n];
        for (let t = 0; t < samplesPerSeg; t++) {
            pts.push(catmullRom(p0, p1, p2, p3, t / samplesPerSeg));
        }
    }
    if (closed && pts.length > 0) pts.push(pts[0].clone());
    return pts;
}

export function segmentIntersection(p1, p2, p3, p4) {
    const d1 = p2.sub(p1), d2 = p4.sub(p3);
    const cross = d1.cross(d2);
    if (Math.abs(cross) < 1e-10) return null;
    const d3 = p3.sub(p1);
    const t = d3.cross(d2) / cross;
    const u = d3.cross(d1) / cross;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
        return { point: p1.add(d1.scale(t)), t, u };
    }
    return null;
}

export function raycastPolyline(origin, direction, maxDist, polyline) {
    const end = origin.add(direction.scale(maxDist));
    let closest = maxDist;
    for (let i = 0; i < polyline.length - 1; i++) {
        const r = segmentIntersection(origin, end, polyline[i], polyline[i + 1]);
        if (r && r.t * maxDist < closest) closest = r.t * maxDist;
    }
    return closest;
}

export function cumulativeDistances(points) {
    const d = [0];
    for (let i = 1; i < points.length; i++) d.push(d[i-1] + points[i].distanceTo(points[i-1]));
    return d;
}

export function pointToSegmentDist(p, a, b) {
    const ab = b.sub(a), ap = p.sub(a);
    const t = clamp(ap.dot(ab) / ab.lengthSq(), 0, 1);
    return p.distanceTo(a.add(ab.scale(t)));
}

export function randomGaussian(mean = 0, std = 1) {
    const u1 = Math.random(), u2 = Math.random();
    return mean + std * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

export function hsl(h, s, l, a = 1) { return `hsla(${h},${s}%,${l}%,${a})`; }
