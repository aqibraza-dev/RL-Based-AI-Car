// ui.js - UI controller: panels, stats, fitness graph, event binding

export class UIManager {
    constructor() {
        this.graphCanvas = null;
        this.graphCtx = null;
    }

    init() {
        this.graphCanvas = document.getElementById('fitnessGraph');
        if (this.graphCanvas) {
            this.graphCtx = this.graphCanvas.getContext('2d');
            this.graphCanvas.width = this.graphCanvas.parentElement.clientWidth - 20;
            this.graphCanvas.height = 100;
        }
        this.nnCanvas = document.getElementById('nnCanvas');
        if (this.nnCanvas) {
            this.nnCtx = this.nnCanvas.getContext('2d');
            this.nnCanvas.width = this.nnCanvas.parentElement.clientWidth - 12;
            this.nnCanvas.height = this.nnCanvas.width * 1.1;
        }
        
        this.previewCanvas = document.getElementById('carPreviewCanvas');
        if (this.previewCanvas) {
            this.previewCtx = this.previewCanvas.getContext('2d');
            this._loopPreview();
        }
    }

    _loopPreview() {
        this._drawCarPreview();
        requestAnimationFrame(() => this._loopPreview());
    }

    _drawCarPreview() {
        if (!this.previewCtx) return;
        const ctx = this.previewCtx;
        const w = this.previewCanvas.width;
        const h = this.previewCanvas.height;
        ctx.clearRect(0, 0, w, h);

        const cx = w / 2;
        const cy = h / 2;
        
        // Draw car
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(-Math.PI / 2); // Point upwards in UI
        
        const hl = 12 * 2; // Scaled up for preview
        const hw = 6 * 2;
        
        ctx.fillStyle = '#00ff87';
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        
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

        // Windshield
        ctx.fillStyle = 'rgba(100, 200, 255, 0.4)';
        ctx.beginPath();
        ctx.moveTo(hl - 3, -hw + 2);
        ctx.lineTo(hl - 8, -hw + 2);
        ctx.lineTo(hl - 8, hw - 2);
        ctx.lineTo(hl - 3, hw - 2);
        ctx.closePath();
        ctx.fill();
        
        // Visualize sensors
        const front = parseInt(document.getElementById('frontSensors')?.value) || 0;
        const back = parseInt(document.getElementById('backSensors')?.value) || 0;
        const left = parseInt(document.getElementById('leftSensors')?.value) || 0;
        const right = parseInt(document.getElementById('rightSensors')?.value) || 0;
        
        const drawRays = (count, baseAngle, spread) => {
            if (count === 0) return;
            const step = count > 1 ? spread / (count - 1) : 0;
            const startAngle = baseAngle - spread / 2;
            ctx.strokeStyle = 'rgba(0, 212, 255, 0.6)';
            ctx.lineWidth = 2;
            for(let i = 0; i < count; i++) {
                const a = startAngle + i * step;
                const dist = 70;
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.lineTo(Math.cos(a) * dist, Math.sin(a) * dist);
                ctx.stroke();
            }
        };
        
        drawRays(front, 0, Math.PI * 0.7); // Front layout
        drawRays(back, Math.PI, Math.PI * 0.4); // Back layout
        drawRays(left, -Math.PI/2, Math.PI * 0.2); // Left layout
        drawRays(right, Math.PI/2, Math.PI * 0.2); // Right layout

        ctx.restore();
    }

    updateStats(stats) {
        this._setText('statGen', stats.generation);
        this._setText('statAlive', `${stats.alive} / ${stats.total}`);
        this._setText('statBestFit', stats.bestFitness);
        this._setText('statBestAll', stats.bestFitnessAllTime);
        this._setText('statAvgFit', stats.avgFitness);
        this._setText('statTime', `${stats.genTime}s`);
        this._setText('statSpeed', stats.speed === -1 ? 'MAX' : `${stats.speed}x`);

        // Alive bar
        const bar = document.getElementById('aliveBar');
        if (bar) bar.style.width = `${(stats.alive / stats.total) * 100}%`;
    }

    updateLeaderboard(cars) {
        const el = document.getElementById('leaderboardList');
        if (!el) return;

        const sorted = [...cars].sort((a, b) => b.fitness - a.fitness);
        const top = sorted.slice(0, 20);

        let html = '';
        for (const car of top) {
            const status = car.alive ? 'alive' : 'crashed';
            html += `<div class="lb-row ${status}" data-car-id="${car.id}">
                <span class="lb-color" style="background:${car.color}"></span>
                <span class="lb-id">#${car.id}</span>
                <span class="lb-fit">${Math.round(car.fitness)}</span>
                <span class="lb-status ${status}">${status}</span>
            </div>`;
        }
        el.innerHTML = html;
    }

    drawFitnessGraph(history) {
        if (!this.graphCtx || !history.best.length) return;
        const ctx = this.graphCtx;
        const w = this.graphCanvas.width;
        const h = this.graphCanvas.height;

        ctx.clearRect(0, 0, w, h);

        // Background
        ctx.fillStyle = 'rgba(10, 14, 26, 0.5)';
        ctx.fillRect(0, 0, w, h);

        // Grid
        ctx.strokeStyle = 'rgba(255,255,255,0.05)';
        ctx.lineWidth = 1;
        for (let y = 0; y < h; y += 20) {
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
        }

        const maxVal = Math.max(1, Math.max(...history.best));
        const len = history.best.length;
        const dx = len > 1 ? w / (len - 1) : w;

        // Average fitness line
        ctx.strokeStyle = 'rgba(255, 170, 0, 0.6)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let i = 0; i < history.avg.length; i++) {
            const x = i * dx, y = h - (history.avg[i] / maxVal) * (h - 10);
            i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.stroke();

        // Best fitness line
        ctx.strokeStyle = '#00ff87';
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < history.best.length; i++) {
            const x = i * dx, y = h - (history.best[i] / maxVal) * (h - 10);
            i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.stroke();

        // Labels
        ctx.fillStyle = '#00ff87';
        ctx.font = '9px JetBrains Mono, monospace';
        ctx.textAlign = 'right';
        ctx.fillText(`Best: ${Math.round(history.best[history.best.length - 1])}`, w - 5, 12);
        ctx.fillStyle = '#ffaa00';
        ctx.fillText(`Avg: ${Math.round(history.avg[history.avg.length - 1])}`, w - 5, 24);
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.textAlign = 'left';
        ctx.fillText(`Gen ${history.best.length}`, 5, 12);
    }

    getSettings() {
        return {
            populationSize: parseInt(document.getElementById('popSize')?.value) || 50,
            mutationRate: parseFloat(document.getElementById('mutRate')?.value) || 0.08,
            mutationStrength: parseFloat(document.getElementById('mutStrength')?.value) || 0.4,
            trackWidth: parseInt(document.getElementById('trackWidth')?.value) || 70,
            botCount: parseInt(document.getElementById('botCount')?.value) || 0,
            sensorConfig: {
                front: parseInt(document.getElementById('frontSensors')?.value) || 0,
                back: parseInt(document.getElementById('backSensors')?.value) || 0,
                left: parseInt(document.getElementById('leftSensors')?.value) || 0,
                right: parseInt(document.getElementById('rightSensors')?.value) || 0,
                length: parseInt(document.getElementById('sensorLength')?.value) || 200
            },
            lanes: parseInt(document.getElementById('trackLanes')?.value) || 2,
            theme: document.getElementById('themeSelect')?.value || 'city'
        };
    }

    showPanel(id) {
        document.querySelectorAll('.mode-panel').forEach(p => p.classList.remove('active'));
        const el = document.getElementById(id);
        if (el) el.classList.add('active');
    }

    setActiveMode(mode) {
        document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
        const btn = document.querySelector(`.mode-btn[data-mode="${mode}"]`);
        if (btn) btn.classList.add('active');
    }

    _setText(id, text) {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    }

    updateBrain(car) {
        // Draw sensor bars
        const barsContainer = document.getElementById('sensorBars');
        if (barsContainer && car && car.sensors) {
            let html = '';
            for (let i = 0; i < car.sensors.length; i++) {
                const val = car.sensors[i];
                let color = '#00d4ff';
                if (val < 0.3) color = '#ff4455';
                else if (val < 0.6) color = '#ffaa00';
                html += `<div class="sensor-bar-wrap"><div class="sensor-bar-fill" style="height: ${Math.max(5, val * 100)}%; background: ${color};"></div></div>`;
            }
            barsContainer.innerHTML = html;
        }

        // Draw NN Canvas
        if (!this.nnCtx || !car || !car.brain || !car.brain.latestActivations) return;
        const ctx = this.nnCtx;
        const w = this.nnCanvas.width;
        const h = this.nnCanvas.height;
        ctx.clearRect(0, 0, w, h);

        const acts = car.brain.latestActivations;
        const weights = car.brain.weights;
        const radius = 5;
        
        // calculate coordinates for nodes
        const layers = [];
        for (let i = 0; i < acts.length; i++) {
            const nodes = [];
            const layerSize = acts[i].length;
            const totalH = Math.min(h - 20, Math.max(100, layerSize * 15));
            const stepY = layerSize > 1 ? totalH / (layerSize - 1) : 0;
            const startY = (h - totalH) / 2;
            const x = 10 + (i / (acts.length - 1)) * (w - 20);
            
            for (let j = 0; j < layerSize; j++) {
                nodes.push({ x, y: startY + j * stepY, act: Math.max(0, Math.min(1, acts[i][j])) });
            }
            layers.push(nodes);
        }

        // draw connections
        ctx.lineWidth = 1;
        for (let i = 0; i < weights.length; i++) {
            for (let j = 0; j < weights[i].length; j++) {
                for (let k = 0; k < weights[i][j].length; k++) {
                    const weight = weights[i][j][k];
                    const from = layers[i][k];
                    const to = layers[i+1][j];
                    
                    const alpha = Math.min(1, Math.abs(weight));
                    ctx.strokeStyle = weight > 0 ? `rgba(0, 255, 135, ${alpha * 0.5})` : `rgba(255, 68, 85, ${alpha * 0.5})`;
                    ctx.beginPath();
                    ctx.moveTo(from.x, from.y);
                    ctx.lineTo(to.x, to.y);
                    ctx.stroke();
                }
            }
        }

        // draw nodes
        for (let i = 0; i < layers.length; i++) {
            for (let j = 0; j < layers[i].length; j++) {
                const node = layers[i][j];
                ctx.beginPath();
                ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
                ctx.fillStyle = `#1a1f36`;
                ctx.fill();
                
                ctx.strokeStyle = `rgba(0, 212, 255, ${0.2 + node.act * 0.8})`;
                ctx.lineWidth = 2;
                ctx.stroke();
            }
        }
    }
}
