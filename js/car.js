// car.js - Advanced Car physics, drift, sensor raycasting, bots

import { Vec2, normalizeAngle, clamp, raycastPolyline } from './utils.js';

const MAX_SPEED = 14;
const ACCEL = 18;
const BRAKE_FORCE = 30;
const TURN_RATE = 3.8;
const FRICTION = 0.98;
const DRAG = 0.96;
const CAR_LENGTH = 24;
const CAR_WIDTH = 12;

export class Car {
    constructor(id, brain, color, isBot = false, sensorConfig) {
        this.id = id;
        this.brain = brain;
        this.color = color;
        this.isBot = isBot;
        
        this.pos = new Vec2();
        this.velocity = new Vec2(); // True momentum
        this.acceleration = 0;
        this.angle = 0;
        this.speed = 0;
        this.angularVel = 0;
        this.slipAngle = 0;
        
        // RNN Context Array [steering, throttle, brake]
        this.memory = [0, 0, 0];
        
        this.alive = true;
        this.fitness = 0;
        this.lastCheckpoint = -1;
        this.checkpointCount = 0;
        this.totalDist = 0;
        this.timeAlive = 0;
        this.lapCount = 0;
        this.timeSinceCP = 0;
        
        this.length = CAR_LENGTH;
        this.width = CAR_WIDTH;
        
        this.driftTrail = [];
        this.targetNode = 0;
        this.laneOffset = (Math.random() - 0.5) * 45; // Bots pick a lane
        
        // Sensor construction
        this.sensorLength = sensorConfig?.length || 200;
        this.sensorAngles = [];
        this.buildSensors(sensorConfig || { front: 5, back: 0, left: 0, right: 0 });
        this.sensors = new Array(this.sensorAngles.length).fill(1);
    }

    buildSensors(conf) {
        const addCone = (count, baseAngle, spread) => {
            if (!count || count <= 0) return;
            if (count === 1) { this.sensorAngles.push(baseAngle); return; }
            const step = spread / (count - 1);
            const startAngle = baseAngle - spread / 2;
            for(let i = 0; i < count; i++) {
                this.sensorAngles.push(startAngle + i * step);
            }
        };
        addCone(conf.front, 0, Math.PI * 0.7);
        addCone(conf.back, Math.PI, Math.PI * 0.4);
        addCone(conf.left, -Math.PI/2, Math.PI * 0.2);
        addCone(conf.right, Math.PI/2, Math.PI * 0.2);
    }

    reset(startPos, startAngle) {
        this.pos = startPos.clone();
        this.velocity = new Vec2();
        this.angle = startAngle;
        this.speed = 0;
        this.acceleration = 0;
        this.angularVel = 0;
        this.slipAngle = 0;
        this.memory = [0, 0, 0];
        
        this.alive = true;
        this.fitness = 0;
        this.lastCheckpoint = -1;
        this.checkpointCount = 0;
        this.totalDist = 0;
        this.timeAlive = 0;
        this.lapCount = 0;
        this.timeSinceCP = 0;
        this.sensors.fill(1);
        this.driftTrail = [];
        this.targetNode = 0;
    }

    update(dt, track) {
        if (!this.alive) return;
        this.timeAlive += dt;
        this.timeSinceCP += dt;

        if (!this.isBot && this.timeSinceCP > 6) { this.alive = false; return; }

        let steering = 0, throttle = 0, brake = 0;

        if (this.isBot) {
            const botCtrl = this.getBotControls(dt, track);
            steering = botCtrl.steering;
            throttle = botCtrl.throttle;
            brake = botCtrl.brake;
        } else {
            this.castSensors(track);
            
            // Advanced NN Inputs: sensors + physics metrics + memory
            const lateralVel = this.speed * Math.sin(this.slipAngle); 
            const inputs = [
                ...this.sensors, 
                this.speed / MAX_SPEED, 
                this.angularVel / TURN_RATE,
                this.acceleration / ACCEL,
                lateralVel / MAX_SPEED,
                this.memory[0], // Recurrent Steering
                this.memory[1], // Recurrent Throttle
                this.memory[2]  // Recurrent Brake
            ];
            
            const out = this.brain.feedForward(inputs);
            steering = clamp(out[0], -1, 1);
            throttle = clamp((out[1] + 1) / 2, 0, 1);
            brake = clamp((out[2] + 1) / 2, 0, 1);
            
            // Commit to memory for next frame
            this.memory = [steering, throttle, brake];
        }

        // --- Kinematic bicycle / structural momentum model ---
        
        // 1. Engine forces (Braking logic depends on direction of travel)
        let engineForce = 0;
        if (this.speed >= 0) {
            engineForce = throttle * ACCEL - brake * BRAKE_FORCE;
        } else {
            engineForce = -throttle * ACCEL + brake * BRAKE_FORCE;
        }
        
        this.acceleration = engineForce;
        
        // 2. Compute abstract longitudinal velocity component purely from acceleration & friction
        this.speed += engineForce * dt;
        this.speed *= FRICTION;
        
        // Apply hard limits
        this.speed = clamp(this.speed, -3, MAX_SPEED);

        // 3. Angular Momentum & Kinematics
        // The steering input acts as torque rather than an instant translation.
        const steerFact = Math.min(1, Math.abs(this.speed) / 3);
        const targetAngularVel = steering * TURN_RATE * steerFact;
        
        // Blend angular velocity based on grip
        this.angularVel = this.angularVel * 0.8 + targetAngularVel * 0.2;
        this.angle = normalizeAngle(this.angle + this.angularVel * dt);
        
        // 4. Calculate desired heading vs actual momentum (Dynamic Traction/Drifting)
        const headingDir = Vec2.fromAngle(this.angle);
        const desiredVelocity = headingDir.scale(this.speed * 60); // 60 is scale factor
        
        // Rear axle traction simulation: High steering at high speeds breaks traction
        // Heavy braking also breaks traction aggressively (Handbrake style)
        let rearTraction = 1.0 - (Math.abs(this.angularVel) * 0.18) - (Math.abs(this.speed) / MAX_SPEED) * 0.15;
        if (brake > 0.5 && this.speed > 5) {
            rearTraction -= 0.6; // Brake lockup induces severe sliding
        }
        
        const grip = clamp(rearTraction, 0.02, 1.0);
        
        // Blend current true velocity towards desired heading based on grip
        // If grip is 1.0, true velocity snaps to heading (no drift).
        // If grip is low, momentum carries it sideways (drifting).
        this.velocity.x = this.velocity.x * (1 - grip) + desiredVelocity.x * grip;
        this.velocity.y = this.velocity.y * (1 - grip) + desiredVelocity.y * grip;
        
        // Apply overall drag
        this.velocity = this.velocity.scale(DRAG);

        // Compute true slip angle (difference between physical heading and movement vector)
        if (this.velocity.length() > 0.1) {
            const movingAngle = Math.atan2(this.velocity.y, this.velocity.x);
            this.slipAngle = normalizeAngle(movingAngle - this.angle);
        } else {
            this.slipAngle = 0;
        }

        // Apply spatial movement
        const prevPos = this.pos.clone();
        this.pos = this.pos.add(this.velocity.scale(dt));
        this.totalDist += this.pos.distanceTo(prevPos);

        // Drift trail visuals
        if (!this.isBot && Math.abs(this.slipAngle) > 0.35 && this.speed > 4) {
            this.driftTrail.push({ pos: this.pos.clone(), life: 1 });
        }
        for (let i = this.driftTrail.length - 1; i >= 0; i--) {
            this.driftTrail[i].life -= dt * 2;
            if (this.driftTrail[i].life <= 0) this.driftTrail.splice(i, 1);
        }

        // Resolution
        this.checkCollision(track);
        if (this.alive) this.checkCheckpoints(track);
        if (!this.isBot) this.updateFitness();
    }
    
    getBotControls(dt, track) {
        if (!track.isValid()) return { steering: 0, throttle: 0, brake: 0 };
        
        // Advance target points
        let targetCenter = track.centerline[this.targetNode];
        const distToTarget = this.pos.distanceTo(targetCenter);
        
        if (distToTarget < 50 || this.targetNode === 0) {
            let nearestIdx = 0, minDist = Infinity;
            for(let i=0; i < track.centerline.length; i++) {
                let d = this.pos.distanceTo(track.centerline[i]);
                if (d < minDist) { minDist = d; nearestIdx = i; }
            }
            // Multi-lane track implies large width, bots look safely ahead
            this.targetNode = (nearestIdx + 12) % track.centerline.length;
            targetCenter = track.centerline[this.targetNode];
        }
        
        // Apply lane offset normal to centerline
        const nextTarget = track.centerline[(this.targetNode + 1) % track.centerline.length];
        const dir = nextTarget.sub(targetCenter).normalize();
        const normal = dir.perpendicular(); 
        
        // true physical lane target
        let targetPoint = targetCenter.add(normal.scale(this.laneOffset));
        
        // P-controller steering
        const desiredDir = targetPoint.sub(this.pos);
        const desiredAngle = Math.atan2(desiredDir.y, desiredDir.x);
        let diff = normalizeAngle(desiredAngle - this.angle);
        
        return {
            steering: clamp(diff * 2.0, -1, 1),
            throttle: 0.65, // constant cruise speed
            brake: 0
        };
    }

    castSensors(track) {
        if (!track.isValid()) return;
        for (let i = 0; i < this.sensorAngles.length; i++) {
            const dir = Vec2.fromAngle(this.angle + this.sensorAngles[i]);
            const dI = raycastPolyline(this.pos, dir, this.sensorLength, track.innerWall);
            const dO = raycastPolyline(this.pos, dir, this.sensorLength, track.outerWall);
            this.sensors[i] = Math.min(dI, dO) / this.sensorLength;
        }
    }

    checkCollision(track) {
        if (!track.isValid()) return;
        
        if (!this.isBot) {
            for (const s of this.sensors) {
                // Front and side sensors crash distance is minimal, but we track everything
                if (s * this.sensorLength < 4) { this.alive = false; return; }
            }
        }
        
        let minD = Infinity;
        for (let i = 0; i < track.centerline.length; i += 3) {
            const d = this.pos.distanceTo(track.centerline[i]);
            if (d < minD) minD = d;
        }
        if (minD > track.width / 2 + 5) this.alive = false;
    }

    checkAgentCollision(otherCar) {
        const dist = this.pos.distanceTo(otherCar.pos);
        // Bounding collision checks
        if (dist < (this.width / 2 + otherCar.width / 2 + 3)) {
            // Bots are immortal traffic obstacles and do not die from impacts
            if (!this.isBot) {
                this.alive = false;
            }
        }
    }

    checkCheckpoints(track) {
        if (track.checkpoints.length === 0) return;
        const next = (this.lastCheckpoint + 1) % track.checkpoints.length;
        const cp = track.checkpoints[next];
        if (this.pos.distanceTo(cp.center) < track.width * 0.9) {
            this.lastCheckpoint = next;
            this.checkpointCount++;
            this.timeSinceCP = 0;
            if (next === 0 && this.checkpointCount > track.checkpoints.length) this.lapCount++;
        }
    }

    updateFitness() {
        this.fitness = this.checkpointCount * 100 + this.totalDist * 0.05;
        if (this.alive) this.fitness += this.speed * 2;
        this.fitness += this.lapCount * 5000;
        this.fitness -= Math.abs(this.slipAngle) * 5; // Slight penalty for excessive slipping to promote clean racing
    }

    getCorners() {
        const dir = Vec2.fromAngle(this.angle);
        const perp = dir.perpendicular();
        const hl = this.length / 2, hw = this.width / 2;
        return [
            this.pos.add(dir.scale(hl)).add(perp.scale(hw)),
            this.pos.add(dir.scale(hl)).add(perp.scale(-hw)),
            this.pos.add(dir.scale(-hl)).add(perp.scale(-hw)),
            this.pos.add(dir.scale(-hl)).add(perp.scale(hw))
        ];
    }
}
