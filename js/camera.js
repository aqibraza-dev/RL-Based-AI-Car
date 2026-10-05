// camera.js - Camera system: follow, free, overview modes

import { lerp, clamp } from './utils.js';

export class Camera {
    constructor(canvasWidth, canvasHeight) {
        this.x = 500;
        this.y = 400;
        this.zoom = 1;
        this.targetX = 500;
        this.targetY = 400;
        this.targetZoom = 1;
        this.cw = canvasWidth;
        this.ch = canvasHeight;
        this.mode = 'overview'; // 'follow', 'free', 'overview'
        this.followTarget = null;
        this.smoothing = 0.08;
        this.minZoom = 0.3;
        this.maxZoom = 4;
        // Free-mode velocity
        this.vx = 0;
        this.vy = 0;
        // 2.5D perspective tilt
        this.tiltY = 0.88;
    }

    resize(w, h) { this.cw = w; this.ch = h; }

    update(dt, keys) {
        // Free camera movement
        if (this.mode === 'free') {
            const spd = 400 / this.zoom;
            this.vx = 0; this.vy = 0;
            if (keys['ArrowLeft'] || keys['KeyA']) this.vx = -spd;
            if (keys['ArrowRight'] || keys['KeyD']) this.vx = spd;
            if (keys['ArrowUp'] || keys['KeyW']) this.vy = -spd;
            if (keys['ArrowDown'] || keys['KeyS']) this.vy = spd;
            this.targetX += this.vx * dt;
            this.targetY += this.vy * dt;
        }

        // Follow mode
        if (this.mode === 'follow' && this.followTarget && this.followTarget.alive) {
            this.targetX = this.followTarget.pos.x;
            this.targetY = this.followTarget.pos.y;
        }

        // Smooth interpolation
        this.x = lerp(this.x, this.targetX, this.smoothing);
        this.y = lerp(this.y, this.targetY, this.smoothing);
        this.zoom = lerp(this.zoom, this.targetZoom, this.smoothing);
    }

    fitToTrack(track) {
        if (!track.isValid()) return;
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const p of track.innerWall) {
            if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y;
            if (p.x > maxX) maxX = p.x; if (p.y > maxY) maxY = p.y;
        }
        for (const p of track.outerWall) {
            if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y;
            if (p.x > maxX) maxX = p.x; if (p.y > maxY) maxY = p.y;
        }
        const pad = 80;
        minX -= pad; minY -= pad; maxX += pad; maxY += pad;
        this.targetX = (minX + maxX) / 2;
        this.targetY = (minY + maxY) / 2;
        this.targetZoom = Math.min(this.cw / (maxX - minX), this.ch / (maxY - minY));
    }

    setMode(mode, target) {
        this.mode = mode;
        if (mode === 'follow') {
            this.followTarget = target;
            this.targetZoom = 1.8;
        } else if (mode === 'overview') {
            this.targetZoom = 1;
        }
    }

    adjustZoom(delta) {
        this.targetZoom = clamp(this.targetZoom * (1 + delta * 0.001), this.minZoom, this.maxZoom);
    }

    apply(ctx) {
        ctx.translate(this.cw / 2, this.ch / 2);
        ctx.scale(this.zoom, this.zoom * this.tiltY);
        ctx.translate(-this.x, -this.y);
    }

    worldToScreen(wx, wy) {
        return {
            x: (wx - this.x) * this.zoom + this.cw / 2,
            y: (wy - this.y) * this.zoom * this.tiltY + this.ch / 2
        };
    }

    screenToWorld(sx, sy) {
        return {
            x: (sx - this.cw / 2) / this.zoom + this.x,
            y: (sy - this.ch / 2) / (this.zoom * this.tiltY) + this.y
        };
    }
}
