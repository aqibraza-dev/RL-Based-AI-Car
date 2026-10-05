// track.js - Track data model, editor interactions, presets, save/load

import { Vec2, sampleSpline, cumulativeDistances } from './utils.js';

export class Track {
    constructor() {
        this.controlPoints = [];
        this.width = 70;
        this.closed = true;
        this.centerline = [];
        this.innerWall = [];
        this.outerWall = [];
        this.checkpoints = [];
        this.startPos = null;
        this.startAngle = 0;
        this.totalLength = 0;
        this.cumDist = [];
        this.lanes = 2;
        this.theme = 'city';
    }

    addPoint(x, y) {
        this.controlPoints.push(new Vec2(x, y));
        if (this.controlPoints.length >= 3) this.generate();
    }

    removePoint(i) {
        this.controlPoints.splice(i, 1);
        if (this.controlPoints.length >= 3) this.generate();
        else { this.centerline = []; this.innerWall = []; this.outerWall = []; this.checkpoints = []; }
    }

    movePoint(i, x, y) {
        this.controlPoints[i] = new Vec2(x, y);
        if (this.controlPoints.length >= 3) this.generate();
    }

    findClosestPoint(x, y, maxDist = 25) {
        const p = new Vec2(x, y);
        let ci = -1, cd = maxDist;
        for (let i = 0; i < this.controlPoints.length; i++) {
            const d = p.distanceTo(this.controlPoints[i]);
            if (d < cd) { cd = d; ci = i; }
        }
        return ci;
    }

    generate() {
        if (this.controlPoints.length < 3) return;
        this.centerline = sampleSpline(this.controlPoints, 25, this.closed);
        if (this.centerline.length < 2) return;
        this.cumDist = cumulativeDistances(this.centerline);
        this.totalLength = this.cumDist[this.cumDist.length - 1];

        this.innerWall = [];
        this.outerWall = [];
        const hw = this.width / 2;
        for (let i = 0; i < this.centerline.length; i++) {
            const prev = i > 0 ? this.centerline[i-1] : this.centerline[this.centerline.length - 2];
            const next = i < this.centerline.length - 1 ? this.centerline[i+1] : this.centerline[1];
            const n = next.sub(prev).normalize().perpendicular();
            this.innerWall.push(this.centerline[i].add(n.scale(hw)));
            this.outerWall.push(this.centerline[i].add(n.scale(-hw)));
        }

        // Checkpoints
        this.checkpoints = [];
        const numCP = Math.max(8, Math.floor(this.totalLength / 80));
        const interval = this.totalLength / numCP;
        let nextDist = interval;
        for (let i = 1; i < this.centerline.length; i++) {
            if (this.cumDist[i] >= nextDist) {
                const prev = this.centerline[i-1], curr = this.centerline[i];
                const n = curr.sub(prev).normalize().perpendicular();
                this.checkpoints.push({
                    center: curr.clone(),
                    start: curr.add(n.scale(hw + 5)),
                    end: curr.add(n.scale(-(hw + 5))),
                    index: this.checkpoints.length,
                    distance: this.cumDist[i]
                });
                nextDist += interval;
            }
        }

        if (this.centerline.length >= 2) {
            this.startPos = this.centerline[0].clone();
            const t = this.centerline[1].sub(this.centerline[0]).normalize();
            this.startAngle = Math.atan2(t.y, t.x);
        }
    }

    isValid() { return this.controlPoints.length >= 3 && this.innerWall.length > 0; }

    getProgressAt(pos) {
        let cd = Infinity, ci = 0;
        for (let i = 0; i < this.centerline.length; i++) {
            const d = pos.distanceTo(this.centerline[i]);
            if (d < cd) { cd = d; ci = i; }
        }
        return this.cumDist[ci];
    }

    save(name) {
        const data = { controlPoints: this.controlPoints.map(p => ({x:p.x,y:p.y})), width: this.width, closed: this.closed, name };
        const all = JSON.parse(localStorage.getItem('ai_car_tracks') || '{}');
        all[name] = data;
        localStorage.setItem('ai_car_tracks', JSON.stringify(all));
    }

    load(name) {
        const all = JSON.parse(localStorage.getItem('ai_car_tracks') || '{}');
        if (!all[name]) return false;
        this.loadFromData(all[name]);
        return true;
    }

    loadFromData(data) {
        this.controlPoints = data.controlPoints.map(p => new Vec2(p.x, p.y));
        this.width = data.width || 70;
        this.closed = data.closed !== false;
        this.generate();
    }

    clear() {
        this.controlPoints = [];
        this.centerline = [];
        this.innerWall = [];
        this.outerWall = [];
        this.checkpoints = [];
        this.startPos = null;
        this.totalLength = 0;
    }

    static getSavedNames() {
        return Object.keys(JSON.parse(localStorage.getItem('ai_car_tracks') || '{}'));
    }

    static getPresets() {
        return {
            'Oval': {
                controlPoints: [{x:400,y:200},{x:700,y:200},{x:900,y:350},{x:900,y:550},{x:700,y:700},{x:400,y:700},{x:200,y:550},{x:200,y:350}],
                width: 85, closed: true
            },
            'Figure 8': {
                controlPoints: [{x:300,y:450},{x:200,y:250},{x:400,y:150},{x:600,y:350},{x:700,y:550},{x:800,y:750},{x:600,y:800},{x:400,y:600}],
                width: 70, closed: true
            },
            'Complex Circuit': {
                controlPoints: [{x:200,y:400},{x:200,y:200},{x:400,y:150},{x:600,y:200},{x:750,y:150},{x:900,y:250},{x:900,y:400},{x:800,y:550},{x:600,y:500},{x:450,y:600},{x:300,y:700},{x:150,y:600}],
                width: 65, closed: true
            },
            'Hairpin Challenge': {
                controlPoints: [{x:150,y:700},{x:150,y:500},{x:250,y:300},{x:400,y:200},{x:300,y:400},{x:500,y:500},{x:650,y:300},{x:800,y:200},{x:700,y:450},{x:850,y:600},{x:700,y:750},{x:400,y:750}],
                width: 60, closed: true
            },
            'Speed Ring': {
                controlPoints: [{x:550,y:100},{x:850,y:200},{x:950,y:450},{x:850,y:700},{x:550,y:800},{x:250,y:700},{x:150,y:450},{x:250,y:200}],
                width: 95, closed: true
            }
        };
    }
}
