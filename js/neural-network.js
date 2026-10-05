// neural-network.js - Feedforward neural network for car brains

export class NeuralNetwork {
    constructor(topology) {
        this.topology = [...topology];
        this.weights = [];
        this.biases = [];
        for (let i = 0; i < topology.length - 1; i++) {
            const inp = topology[i], out = topology[i+1];
            const scale = Math.sqrt(2 / (inp + out));
            const lw = [];
            const lb = [];
            for (let j = 0; j < out; j++) {
                const nw = [];
                for (let k = 0; k < inp; k++) nw.push((Math.random()*2-1)*scale);
                lw.push(nw);
                lb.push((Math.random()*2-1)*0.1);
            }
            this.weights.push(lw);
            this.biases.push(lb);
        }
    }

    feedForward(inputs) {
        let cur = [...inputs];
        this.latestActivations = [cur];
        for (let i = 0; i < this.weights.length; i++) {
            const next = [];
            const isOut = i === this.weights.length - 1;
            for (let j = 0; j < this.weights[i].length; j++) {
                let sum = this.biases[i][j];
                for (let k = 0; k < cur.length; k++) sum += cur[k] * this.weights[i][j][k];
                next.push(isOut ? Math.tanh(sum) : Math.max(0, sum));
            }
            cur = next;
            this.latestActivations.push(cur);
        }
        return cur;
    }

    getGenome() {
        const g = [];
        for (let i = 0; i < this.weights.length; i++)
            for (let j = 0; j < this.weights[i].length; j++) {
                for (let k = 0; k < this.weights[i][j].length; k++) g.push(this.weights[i][j][k]);
                g.push(this.biases[i][j]);
            }
        return g;
    }

    setGenome(g) {
        let idx = 0;
        for (let i = 0; i < this.weights.length; i++)
            for (let j = 0; j < this.weights[i].length; j++) {
                for (let k = 0; k < this.weights[i][j].length; k++) this.weights[i][j][k] = g[idx++];
                this.biases[i][j] = g[idx++];
            }
    }

    mutate(rate = 0.05, strength = 0.3) {
        for (let i = 0; i < this.weights.length; i++)
            for (let j = 0; j < this.weights[i].length; j++) {
                for (let k = 0; k < this.weights[i][j].length; k++)
                    if (Math.random() < rate) this.weights[i][j][k] += _rg(0, strength);
                if (Math.random() < rate) this.biases[i][j] += _rg(0, strength);
            }
    }

    clone() {
        const nn = new NeuralNetwork(this.topology);
        nn.setGenome(this.getGenome());
        return nn;
    }

    static crossover(a, b) {
        const child = new NeuralNetwork(a.topology);
        const g1 = a.getGenome(), g2 = b.getGenome(), cg = [];
        for (let i = 0; i < g1.length; i++) cg.push(Math.random() < 0.5 ? g1[i] : g2[i]);
        child.setGenome(cg);
        return child;
    }

    serialize() { return JSON.stringify({ topology: this.topology, genome: this.getGenome() }); }

    static deserialize(json) {
        const d = JSON.parse(json);
        const nn = new NeuralNetwork(d.topology);
        nn.setGenome(d.genome);
        return nn;
    }
}

function _rg(m=0,s=1){const u=Math.random(),v=Math.random();return m+s*Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);}
