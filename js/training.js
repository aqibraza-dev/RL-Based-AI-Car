// training.js - Training orchestrator: manages generations, cars, fitness

import { GeneticAlgorithm } from './genetics.js';
import { Car } from './car.js';
import { Vec2, hsl } from './utils.js';

export class TrainingManager {
    constructor() {
        this.ga = null;
        this.cars = [];
        this.bots = [];
        this.track = null;
        this.running = false;
        this.speedMultiplier = 1;
        this.timeLimit = 20;
        this.genTime = 0;
        this.aliveCount = 0;
        this.bestCarIndex = 0;
        this.bestBrainJSON = null;
        this.sensorConfig = { front: 5, back: 0, left: 0, right: 0, length: 200 };
        this.botCount = 0;
        this.config = {};
    }

    init(track, config = {}) {
        this.track = track;
        this.config = config;
        this.botCount = config.botCount || 0;
        this.sensorConfig = config.sensorConfig || { front: 5, back: 0, left: 0, right: 0, length: 200 };
        
        const popSize = config.populationSize || 50;
        const totalSensors = this.sensorConfig.front + this.sensorConfig.back + this.sensorConfig.left + this.sensorConfig.right;
        
        // 4 Physical inputs + 3 RNN Memory nodes (steering, throttle, brake)
        const numInputs = totalSensors + 7; 

        this.ga = new GeneticAlgorithm({
            populationSize: popSize,
            topology: [numInputs, 14, 10, 3], // dynamic inputs
            mutationRate: config.mutationRate || 0.08,
            mutationStrength: config.mutationStrength || 0.4,
            eliteCount: Math.max(2, Math.floor(popSize * 0.06)),
            tournamentSize: Math.max(3, Math.floor(popSize * 0.1))
        });

        this.createCars();
        this.resetCarsToStart();
        this.genTime = 0;
        this.running = true;
    }

    createCars() {
        this.cars = [];
        for (let i = 0; i < this.ga.populationSize; i++) {
            const hue = (i / this.ga.populationSize) * 360;
            const color = hsl(hue, 75, 55);
            const car = new Car(i, this.ga.population[i], color, false, this.sensorConfig);
            this.cars.push(car);
        }
        this.bots = [];
        for (let i = 0; i < this.botCount; i++) {
            const bot = new Car('B'+i, null, '#ffffff', true, this.sensorConfig);
            this.bots.push(bot);
        }
    }

    resetCarsToStart() {
        if (!this.track || !this.track.centerline.length) return;
        
        const lateralMax = (this.track.width / 2) * 0.7;
        const cl = this.track.centerline;

        // Spread AI cars backward along the curved centerline
        for (let i = 0; i < this.cars.length; i++) {
            const col = i % 4;
            const row = Math.floor(i / 4);
            const lateralOffset = (col - 1.5) * (lateralMax / 1.5);
            
            // Map row to track path backward from Node 0
            // Subtract rows*3 abstract node increments backward
            let backNodeIndex = (cl.length - (row * 2) - 1) % cl.length;
            if (backNodeIndex < 0) backNodeIndex += cl.length;
            
            const posCenter = cl[backNodeIndex];
            
            // Determine tangential angle at this point
            const nextNode = cl[(backNodeIndex + 1) % cl.length];
            const dir = nextNode.sub(posCenter).normalize();
            const perp = dir.perpendicular();
            const angle = Math.atan2(dir.y, dir.x);

            const startPos = posCenter.add(perp.scale(lateralOffset));

            this.cars[i].reset(startPos, angle);
            this.cars[i].brain = this.ga.population[i];
        }

        // Spread Bots forward along the curved centerline safely
        for (let i = 0; i < this.bots.length; i++) {
            const col = i % 2;
            const row = Math.floor(i / 2);
            const lateralOffset = (col - 0.5) * lateralMax;
            
            // Map bots progressively FORWARD from Node 0 (about 10 nodes ahead)
            const forwardNodeIndex = (10 + (row * 6)) % cl.length;
            const posCenter = cl[forwardNodeIndex];
            
            const nextNode = cl[(forwardNodeIndex + 1) % cl.length];
            const dir = nextNode.sub(posCenter).normalize();
            const perp = dir.perpendicular();
            const angle = Math.atan2(dir.y, dir.x);
            
            const startPos = posCenter.add(perp.scale(lateralOffset));
            this.bots[i].reset(startPos, angle);
        }
    }

    step(dt) {
        if (!this.running || !this.track || !this.track.isValid()) return;

        const steps = this.speedMultiplier === -1 ? 20 : this.speedMultiplier;
        const subDt = dt / steps;

        for (let s = 0; s < steps; s++) {
            this.genTime += subDt;

            for (const bot of this.bots) {
                bot.update(subDt, this.track);
            }

            for (const car of this.cars) {
                car.update(subDt, this.track);
                
                if (car.alive) {
                    for (const bot of this.bots) {
                        if (bot.alive) car.checkAgentCollision(bot);
                    }
                }
            }

            this.aliveCount = this.cars.filter(c => c.alive).length;
            if (this.aliveCount === 0 || this.genTime >= this.timeLimit) {
                this.nextGeneration();
                return;
            }
        }

        // Track best car
        let bestFit = -1;
        for (let i = 0; i < this.cars.length; i++) {
            if (this.cars[i].fitness > bestFit) {
                bestFit = this.cars[i].fitness;
                this.bestCarIndex = i;
            }
        }
    }

    nextGeneration() {
        const fitnesses = this.cars.map(c => c.fitness);
        this.ga.evolve(fitnesses);

        const bestIdx = fitnesses.indexOf(Math.max(...fitnesses));
        this.bestBrainJSON = this.cars[bestIdx].brain.serialize();

        for (let i = 0; i < this.cars.length; i++) {
            this.cars[i].brain = this.ga.population[i];
        }
        this.resetCarsToStart();
        this.genTime = 0;
    }

    getBestCar() {
        let bestAlive = null, bestAll = null;
        let bestAFit = -1, bestFit = -1;
        for (const car of this.cars) {
            if (car.fitness > bestFit) { bestFit = car.fitness; bestAll = car; }
            if (car.alive && car.fitness > bestAFit) { bestAFit = car.fitness; bestAlive = car; }
        }
        return bestAlive || bestAll || this.cars[0];
    }

    getStats() {
        const alive = this.cars.filter(c => c.alive).length;
        const best = this.getBestCar();
        return {
            generation: this.ga ? this.ga.generation : 0,
            alive,
            total: this.cars.length,
            bestFitness: best ? Math.round(best.fitness) : 0,
            bestFitnessAllTime: this.ga ? Math.round(this.ga.bestFitnessAllTime) : 0,
            avgFitness: this.cars.length > 0 ? Math.round(this.cars.reduce((s, c) => s + c.fitness, 0) / this.cars.length) : 0,
            genTime: this.genTime.toFixed(1),
            fitnessHistory: this.ga ? this.ga.fitnessHistory : { best: [], avg: [] },
            speed: this.speedMultiplier
        };
    }

    setSpeed(mult) { this.speedMultiplier = mult; }
    pause() { this.running = false; }
    resume() { this.running = true; }
    toggle() { this.running = !this.running; }

    reset(track, config) {
        this.init(track, config);
    }

    exportBrain() { return this.bestBrainJSON; }
}
