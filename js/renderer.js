// renderer.js - 2.5D Canvas rendering engine

import { Vec2, hsl } from './utils.js';

export class Renderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.showSensors = false;
        this.showMinimap = true;
        this.showNames = false;
        this.gridSize = 100;
    }

    resize(w, h) {
        this.canvas.width = w;
        this.canvas.height = h;
    }

    clear(track) {
        const theme = track && track.theme ? track.theme : 'city';
        if (theme === 'hotwheels') {
            this.ctx.fillStyle = '#1e88e5'; // Blue carpet/floor
        } else {
            this.ctx.fillStyle = '#1a2a1a'; // Dark green grass
        }
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }

    render(camera, track, cars, mode, editorState) {
        const ctx = this.ctx;
        this.clear(track);

        ctx.save();
        camera.apply(ctx);

        this.drawGround(camera, track);
        if (track.isValid()) {
            this.draw3DWalls(track);
            this.drawTrackSurface(track);
            this.drawKerbs(track);
            this.drawLanes(track);
            this.drawCheckpoints(track, cars);
            this.drawStartFinish(track);
        }

        // Editor control points
        if (mode === 'editor') {
            this.drawControlPoints(track, editorState);
        }

        // Cars
        if (cars && cars.length > 0) {
            // Sort by y for depth
            const sorted = [...cars].sort((a, b) => a.pos.y - b.pos.y);
            for (const car of sorted) {
                if (car.alive && !car.isBot) this.drawDriftTrail(car);
            }
            for (const car of sorted) {
                this.drawCarShadow(car);
            }
            for (const car of sorted) {
                this.drawCar(car, cars);
                if (this.showSensors && car.alive && !car.isBot) this.drawSensors(car);
            }
        }

        ctx.restore();

        // Overlays (screen space)
        if (this.showMinimap && track.isValid()) {
            this.drawMinimap(track, cars);
        }
    }

    drawGround(camera, track) {
        const theme = track && track.theme ? track.theme : 'city';
        const ctx = this.ctx;
        const tl = camera.screenToWorld(0, 0);
        const br = camera.screenToWorld(camera.cw, camera.ch);
        const margin = 200;
        const startX = Math.floor((tl.x - margin) / this.gridSize) * this.gridSize;
        const startY = Math.floor((tl.y - margin) / this.gridSize) * this.gridSize;
        const endX = Math.ceil((br.x + margin) / this.gridSize) * this.gridSize;
        const endY = Math.ceil((br.y + margin) / this.gridSize) * this.gridSize;

        // Grid lines
        if (theme === 'hotwheels') {
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        } else {
            ctx.strokeStyle = 'rgba(40, 80, 40, 0.35)';
        }
        
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let x = startX; x <= endX; x += this.gridSize) {
            ctx.moveTo(x, startY);
            ctx.lineTo(x, endY);
        }
        for (let y = startY; y <= endY; y += this.gridSize) {
            ctx.moveTo(startX, y);
            ctx.lineTo(endX, y);
        }
        ctx.stroke();
    }
    
    draw3DWalls(track) {
        const ctx = this.ctx;
        const height = track.theme === 'hotwheels' ? 12 : 8;
        
        // Draw track shadow/outer extrusion
        ctx.beginPath();
        for (let i = 0; i < track.outerWall.length; i++) {
            const p = track.outerWall[i];
            i === 0 ? ctx.moveTo(p.x, p.y + height) : ctx.lineTo(p.x, p.y + height);
        }
        for (let i = track.innerWall.length - 1; i >= 0; i--) {
            ctx.lineTo(track.innerWall[i].x, track.innerWall[i].y + height);
        }
        ctx.closePath();
        
        if (track.theme === 'hotwheels') {
            ctx.fillStyle = '#115b9c'; // dark blue side wall
        } else {
            ctx.fillStyle = '#0f0f15'; // dark shadow
        }
        ctx.fill();
    }

    drawTrackSurface(track) {
        const ctx = this.ctx;
        ctx.beginPath();
        for (let i = 0; i < track.outerWall.length; i++) {
            const p = track.outerWall[i];
            i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y);
        }
        for (let i = track.innerWall.length - 1; i >= 0; i--) {
            ctx.lineTo(track.innerWall[i].x, track.innerWall[i].y);
        }
        ctx.closePath();

        if (track.theme === 'hotwheels') {
            ctx.fillStyle = '#ff6d00'; // Hot wheels orange
            ctx.strokeStyle = '#2196f3'; // Blue edges
        } else {
            ctx.fillStyle = '#2a2a2f'; // Asphalt
            ctx.strokeStyle = 'rgba(60, 60, 70, 0.6)';
        }
        
        ctx.fill();
        ctx.lineWidth = track.theme === 'hotwheels' ? 6 : 2;
        ctx.stroke();
    }

    drawKerbs(track) {
        if (track.theme === 'hotwheels') return; // No kerbs in hot wheels
        
        const ctx = this.ctx;
        const kerbWidth = 6;
        const segLen = 15;

        // Draw kerbs along both walls
        [track.innerWall, track.outerWall].forEach(wall => {
            let dist = 0;
            for (let i = 0; i < wall.length - 1; i++) {
                const a = wall[i], b = wall[i + 1];
                const d = a.distanceTo(b);
                const seg = Math.floor(dist / segLen);
                const isRed = seg % 2 === 0;

                ctx.strokeStyle = isRed ? '#cc2222' : '#ffffff';
                ctx.lineWidth = kerbWidth;
                ctx.beginPath();
                ctx.moveTo(a.x, a.y);
                ctx.lineTo(b.x, b.y);
                ctx.stroke();

                dist += d;
            }
        });

        // Wall edge line
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = '#555';
        [track.innerWall, track.outerWall].forEach(wall => {
            ctx.beginPath();
            for (let i = 0; i < wall.length; i++) {
                i === 0 ? ctx.moveTo(wall[i].x, wall[i].y) : ctx.lineTo(wall[i].x, wall[i].y);
            }
            ctx.stroke();
        });
    }

    drawLanes(track) {
        const ctx = this.ctx;
        const numLanes = track.lanes || 2;
        
        if (numLanes <= 1 || !track.centerline.length) return;
        
        ctx.setLineDash([12, 18]);
        if (track.theme === 'hotwheels') {
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)';
        } else {
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        }
        ctx.lineWidth = 2;
        
        for (let l = 1; l < numLanes; l++) {
            const factor = l / numLanes;
            
            ctx.beginPath();
            for (let i = 0; i < track.innerWall.length; i++) {
                const pIn = track.innerWall[i];
                const pOut = track.outerWall[i];
                if (!pOut) continue;
                
                const p = Vec2.lerp(pIn, pOut, factor);
                i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y);
            }
            ctx.stroke();
        }
        ctx.setLineDash([]);
    }

    drawCheckpoints(track, cars) {
        const ctx = this.ctx;
        // Determine next checkpoint for the best alive car
        let nextCP = -1;
        if (cars) {
            const aiCars = cars.filter(c => !c.isBot && c.alive);
            const best = aiCars.sort((a, b) => b.fitness - a.fitness)[0];
            if (best) nextCP = (best.lastCheckpoint + 1) % track.checkpoints.length;
        }

        for (const cp of track.checkpoints) {
            ctx.strokeStyle = cp.index === nextCP
                ? 'rgba(0, 212, 255, 0.5)'
                : 'rgba(255, 255, 255, 0.08)';
            ctx.lineWidth = cp.index === nextCP ? 3 : 1;
            ctx.beginPath();
            ctx.moveTo(cp.start.x, cp.start.y);
            ctx.lineTo(cp.end.x, cp.end.y);
            ctx.stroke();
        }
    }

    drawStartFinish(track) {
        if (!track.startPos) return;
        const ctx = this.ctx;
        const dir = Vec2.fromAngle(track.startAngle).perpendicular();
        const hw = track.width / 2;
        const a = track.startPos.add(dir.scale(hw));
        const b = track.startPos.add(dir.scale(-hw));

        // Checkered pattern
        const steps = Math.floor(track.width / 8);
        for (let i = 0; i < steps; i++) {
            const t0 = i / steps, t1 = (i + 1) / steps;
            const p0 = Vec2.lerp(a, b, t0);
            const p1 = Vec2.lerp(a, b, t1);
            ctx.strokeStyle = i % 2 === 0 ? '#fff' : '#333';
            ctx.lineWidth = 5;
            ctx.beginPath();
            ctx.moveTo(p0.x, p0.y);
            ctx.lineTo(p1.x, p1.y);
            ctx.stroke();
        }
    }

    drawControlPoints(track, editorState) {
        const ctx = this.ctx;
        for (let i = 0; i < track.controlPoints.length; i++) {
            const p = track.controlPoints[i];
            const isHovered = editorState && editorState.hoveredPoint === i;
            const isDragged = editorState && editorState.dragPoint === i;

            ctx.beginPath();
            ctx.arc(p.x, p.y, isDragged ? 12 : (isHovered ? 10 : 8), 0, Math.PI * 2);
            ctx.fillStyle = i === 0 ? '#00ff87' : (isDragged ? '#ff6600' : '#00d4ff');
            ctx.fill();
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.stroke();

            // Number label
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 10px Inter, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(i + 1, p.x, p.y);
        }

        // Connection lines between control points
        if (track.controlPoints.length >= 2) {
            ctx.strokeStyle = 'rgba(0, 212, 255, 0.3)';
            ctx.lineWidth = 1;
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            for (let i = 0; i < track.controlPoints.length; i++) {
                const p = track.controlPoints[i];
                i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y);
            }
            if (track.closed && track.controlPoints.length >= 3) {
                ctx.lineTo(track.controlPoints[0].x, track.controlPoints[0].y);
            }
            ctx.stroke();
            ctx.setLineDash([]);
        }
    }

    drawDriftTrail(car) {
        const ctx = this.ctx;
        for (const t of car.driftTrail) {
            ctx.beginPath();
            ctx.arc(t.pos.x, t.pos.y, 3, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(80, 80, 80, ${t.life * 0.5})`;
            ctx.fill();
        }
    }

    drawCarShadow(car) {
        const ctx = this.ctx;
        const alpha = car.alive ? 0.3 : 0.1;
        ctx.save();
        ctx.translate(car.pos.x + 4, car.pos.y + 6);
        ctx.rotate(car.angle);
        ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
        ctx.beginPath();
        const hl = car.length / 2, hw = car.width / 2;
        ctx.moveTo(hl + 2, 0);
        ctx.lineTo(-hl, -hw - 1);
        ctx.lineTo(-hl, hw + 1);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }

    drawCar(car, allCars) {
        const ctx = this.ctx;
        const hl = car.length / 2, hw = car.width / 2;

        const aiCars = allCars.filter(c => !c.isBot);
        const aliveAI = aiCars.filter(c => c.alive).sort((a, b) => b.fitness - a.fitness);
        const bestAlive = aliveAI[0];
        const isBest = car === bestAlive && !car.isBot;
        
        // Is top 3?
        const isTop3 = aliveAI.indexOf(car) > -1 && aliveAI.indexOf(car) < 3;

        ctx.save();
        ctx.translate(car.pos.x, car.pos.y);
        ctx.rotate(car.angle);

        // Car body
        const isBot = car.isBot;
        const bodyColor = car.alive ? car.color : '#444';
        
        ctx.fillStyle = bodyColor;
        
        if (isBot) {
            ctx.strokeStyle = '#222';
            ctx.lineWidth = 1.5;
        } else {
            ctx.strokeStyle = isBest ? '#00ff87' : (car.alive ? 'rgba(255,255,255,0.4)' : 'rgba(100,100,100,0.3)');
            ctx.lineWidth = isBest ? 2.5 : 1;
        }

        // Body shape (Blocky / Isometric trick)
        ctx.beginPath();
        ctx.moveTo(hl + 3, 0);
        ctx.lineTo(hl - 4, -hw);
        ctx.lineTo(-hl, -hw);
        ctx.lineTo(-hl - 2, 0);
        ctx.lineTo(-hl, hw);
        ctx.lineTo(hl - 4, hw);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        
        if (isBot) {
            // Draw a distinct pattern for bots
            ctx.fillStyle = '#ffaa00'; // Warning light
            ctx.fillRect(hl - 6, -3, 3, 6);
        }

        // Windshield
        ctx.fillStyle = isBot ? 'rgba(50, 50, 50, 0.8)' : 'rgba(100, 200, 255, 0.4)';
        ctx.beginPath();
        ctx.moveTo(hl - 3, -hw + 2);
        ctx.lineTo(hl - 8, -hw + 2);
        ctx.lineTo(hl - 8, hw - 2);
        ctx.lineTo(hl - 3, hw - 2);
        ctx.closePath();
        ctx.fill();

        // Wheels
        ctx.fillStyle = '#111';
        const wheelW = 4, wheelH = 3;
        [[-hl + 3, -hw - 1], [-hl + 3, hw - 2], [hl - 7, -hw - 1], [hl - 7, hw - 2]].forEach(([wx, wy]) => {
            ctx.fillRect(wx, wy, wheelW, wheelH);
        });

        // Best car glow
        if (isBest && car.alive) {
            ctx.shadowColor = '#00ff87';
            ctx.shadowBlur = 15;
            ctx.strokeStyle = '#00ff87';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(0, 0, hl + 3, 0, Math.PI * 2);
            ctx.stroke();
            ctx.shadowBlur = 0;
        }

        ctx.restore();

        // Labels and Speed HUD
        if (!car.isBot && car.alive) {
            ctx.fillStyle = isBest ? '#00ff87' : 'rgba(255,255,255,0.6)';
            ctx.font = '9px Inter, sans-serif';
            ctx.textAlign = 'center';
            
            if (this.showNames) {
                ctx.fillText(`#${car.id}`, car.pos.x, car.pos.y - 18);
            }
            
            // Draw Speed HUD for Top 3
            if (isTop3) {
                const speedKmh = Math.abs(car.speed * 12).toFixed(0);
                
                ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
                ctx.beginPath();
                ctx.roundRect(car.pos.x - 20, car.pos.y - 36, 40, 14, 4);
                ctx.fill();
                
                ctx.fillStyle = '#00d4ff';
                ctx.font = 'bold 9px Inter, sans-serif';
                ctx.fillText(`${speedKmh} km/h`, car.pos.x, car.pos.y - 26);
                
                // Rank crown/star
                ctx.fillStyle = '#ffaa00';
                ctx.font = '10px Inter, sans-serif';
                const ranks = ['🥇', '🥈', '🥉'];
                ctx.fillText(ranks[aliveAI.indexOf(car)], car.pos.x, car.pos.y - 40);
            }
        } else if (car.isBot && this.showNames && car.alive) {
            ctx.fillStyle = '#aaa';
            ctx.font = '9px Inter, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(`Bot`, car.pos.x, car.pos.y - 18);
        }
    }

    drawSensors(car) {
        if (!car.sensorAngles) return;
        const ctx = this.ctx;
        for (let i = 0; i < car.sensorAngles.length; i++) {
            const angle = car.angle + car.sensorAngles[i];
            const dir = Vec2.fromAngle(angle);
            const dist = car.sensors[i] * car.sensorLength;
            const end = car.pos.add(dir.scale(dist));

            const danger = 1 - car.sensors[i];
            ctx.strokeStyle = `rgba(${Math.floor(255 * danger)}, ${Math.floor(255 * (1 - danger))}, 0, 0.5)`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(car.pos.x, car.pos.y);
            ctx.lineTo(end.x, end.y);
            ctx.stroke();

            ctx.beginPath();
            ctx.arc(end.x, end.y, 3, 0, Math.PI * 2);
            ctx.fillStyle = ctx.strokeStyle;
            ctx.fill();
        }
    }

    drawMinimap(track, cars) {
        const ctx = this.ctx;
        const size = 180;
        const pad = 15;
        const mx = this.canvas.width - size - pad;
        const my = this.canvas.height - size - pad;

        // Background
        ctx.fillStyle = 'rgba(10, 14, 26, 0.85)';
        ctx.strokeStyle = 'rgba(0, 212, 255, 0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(mx, my, size, size, 8);
        ctx.fill();
        ctx.stroke();

        // Calculate bounds
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const p of track.centerline) {
            if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y;
            if (p.x > maxX) maxX = p.x; if (p.y > maxY) maxY = p.y;
        }
        const range = Math.max(maxX - minX, maxY - minY) + 40;
        const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
        const scale = (size - 20) / range;

        const toMini = (p) => ({
            x: mx + size / 2 + (p.x - cx) * scale,
            y: my + size / 2 + (p.y - cy) * scale
        });

        // Track outline
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < track.centerline.length; i++) {
            const p = toMini(track.centerline[i]);
            i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();

        // Cars as dots
        if (cars) {
            for (const car of cars) {
                if (!car.alive) continue;
                const p = toMini(car.pos);
                ctx.beginPath();
                ctx.arc(p.x, p.y, car.isBot ? 3 : 2, 0, Math.PI * 2);
                ctx.fillStyle = car.color;
                ctx.fill();
            }
        }
    }
}
