// genetics.js - Genetic Algorithm: selection, crossover, mutation, elitism

import { NeuralNetwork } from './neural-network.js';

export class GeneticAlgorithm {
    constructor(config = {}) {
        this.populationSize = config.populationSize || 50;
        this.topology = config.topology || [7, 14, 10, 3];
        this.mutationRate = config.mutationRate || 0.08;
        this.mutationStrength = config.mutationStrength || 0.4;
        this.eliteCount = config.eliteCount || 3;
        this.tournamentSize = config.tournamentSize || 5;
        this.generation = 0;
        this.bestFitnessAllTime = 0;
        this.fitnessHistory = { best: [], avg: [] };
        this.population = [];
        this.createPopulation();
    }

    createPopulation() {
        this.population = [];
        for (let i = 0; i < this.populationSize; i++)
            this.population.push(new NeuralNetwork(this.topology));
    }

    evolve(fitnesses) {
        this.generation++;
        const bestFit = Math.max(...fitnesses);
        const avgFit = fitnesses.reduce((a,b) => a+b, 0) / fitnesses.length;
        if (bestFit > this.bestFitnessAllTime) this.bestFitnessAllTime = bestFit;
        this.fitnessHistory.best.push(bestFit);
        this.fitnessHistory.avg.push(avgFit);

        const indexed = this.population.map((nn, i) => ({ nn, fitness: fitnesses[i] }));
        indexed.sort((a, b) => b.fitness - a.fitness);

        const newPop = [];
        // Elitism
        for (let i = 0; i < this.eliteCount && i < indexed.length; i++)
            newPop.push(indexed[i].nn.clone());

        // Fill with offspring
        while (newPop.length < this.populationSize) {
            const p1 = this._tournamentSelect(indexed);
            const p2 = this._tournamentSelect(indexed);
            let child = p1 !== p2 ? NeuralNetwork.crossover(p1, p2) : p1.clone();
            child.mutate(this.mutationRate, this.mutationStrength);
            newPop.push(child);
        }
        this.population = newPop;
        return { bestFitness: bestFit, avgFitness: avgFit };
    }

    _tournamentSelect(indexed) {
        let best = null;
        for (let i = 0; i < this.tournamentSize; i++) {
            const c = indexed[Math.floor(Math.random() * indexed.length)];
            if (!best || c.fitness > best.fitness) best = c;
        }
        return best.nn;
    }

    updateConfig(cfg) {
        if (cfg.mutationRate !== undefined) this.mutationRate = cfg.mutationRate;
        if (cfg.mutationStrength !== undefined) this.mutationStrength = cfg.mutationStrength;
    }
}
