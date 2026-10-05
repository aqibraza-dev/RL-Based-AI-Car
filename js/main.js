// main.js - App entry point, game loop, state machine, event binding

import { Track } from './track.js';
import { Camera } from './camera.js';
import { Renderer } from './renderer.js';
import { TrainingManager } from './training.js';
import { UIManager } from './ui.js';
import { NeuralNetwork } from './neural-network.js';
import { Vec2 } from './utils.js';

class App {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.renderer = new Renderer(this.canvas);
        this.camera = new Camera(window.innerWidth, window.innerHeight);
        this.track = new Track();
        this.training = new TrainingManager();
        this.ui = new UIManager();
        this.mode = 'editor'; // 'editor', 'training'
        this.keys = {};
        this.lastTime = 0;
        this.editorState = {
            hoveredPoint: -1,
            dragPoint: -1,
            isDragging: false
        };
        this.uiUpdateTimer = 0;
    }

    init() {
        this.resize();
        this.ui.init();
        this.bindEvents();
        this.loadDefaultTrack();
        this.camera.setMode('overview');
        this.camera.fitToTrack(this.track);
        requestAnimationFrame((t) => this.loop(t));
    }

    loadDefaultTrack() {
        const presets = Track.getPresets();
        this.track.loadFromData(presets['Oval']);
        this.populatePresetDropdown();
        this.populateSavedTracks();
    }

    populatePresetDropdown() {
        const sel = document.getElementById('presetSelect');
        if (!sel) return;
        sel.innerHTML = '<option value="">— Select Preset —</option>';
        for (const name of Object.keys(Track.getPresets())) {
            sel.innerHTML += `<option value="${name}">${name}</option>`;
        }
    }

    populateSavedTracks() {
        const sel = document.getElementById('savedSelect');
        if (!sel) return;
        sel.innerHTML = '<option value="">— Saved Tracks —</option>';
        for (const name of Track.getSavedNames()) {
            sel.innerHTML += `<option value="${name}">${name}</option>`;
        }
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.renderer.resize(window.innerWidth, window.innerHeight);
        this.camera.resize(window.innerWidth, window.innerHeight);
    }

    bindEvents() {
        window.addEventListener('resize', () => this.resize());

        // Keyboard
        window.addEventListener('keydown', (e) => {
            this.keys[e.code] = true;
            if (e.code === 'Space') { e.preventDefault(); if (this.mode === 'training') this.training.toggle(); }
        });
        window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });

        // Canvas mouse events
        this.canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
        this.canvas.addEventListener('mouseup', (e) => this.onMouseUp(e));
        this.canvas.addEventListener('contextmenu', (e) => { e.preventDefault(); this.onRightClick(e); });
        this.canvas.addEventListener('wheel', (e) => { e.preventDefault(); this.camera.adjustZoom(-e.deltaY); });

        // Mode buttons
        document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.addEventListener('click', () => this.switchMode(btn.dataset.mode));
        });

        // Preset select
        document.getElementById('presetSelect')?.addEventListener('change', (e) => {
            if (e.target.value) {
                const presets = Track.getPresets();
                this.track.loadFromData(presets[e.target.value]);
                this.camera.fitToTrack(this.track);
                this.updateTrackWidthSlider();
            }
        });

        // Saved tracks
        document.getElementById('savedSelect')?.addEventListener('change', (e) => {
            if (e.target.value) {
                this.track.load(e.target.value);
                this.camera.fitToTrack(this.track);
                this.updateTrackWidthSlider();
            }
        });

        // Track width slider
        document.getElementById('trackWidth')?.addEventListener('input', (e) => {
            this.track.width = parseInt(e.target.value);
            document.getElementById('trackWidthVal').textContent = e.target.value;
            if (this.track.controlPoints.length >= 3) this.track.generate();
        });

        // Editor buttons
        document.getElementById('btnClear')?.addEventListener('click', () => {
            this.track.clear();
        });
        document.getElementById('btnSave')?.addEventListener('click', () => {
            const name = prompt('Track name:');
            if (name) { this.track.save(name); this.populateSavedTracks(); }
        });

        // Training controls
        document.getElementById('btnStart')?.addEventListener('click', () => {
            if (this.mode !== 'training') this.switchMode('training');
            else if (!this.training.running) this.training.resume();
        });
        document.getElementById('btnPause')?.addEventListener('click', () => this.training.pause());
        document.getElementById('btnReset')?.addEventListener('click', () => {
            if (this.track.isValid()) {
                this.training.reset(this.track, this.ui.getSettings());
                this.camera.setMode('follow', this.training.getBestCar());
            }
        });

        // Speed buttons
        document.querySelectorAll('.speed-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.speed-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.training.setSpeed(parseInt(btn.dataset.speed));
            });
        });

        // Camera buttons
        document.querySelectorAll('.cam-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.cam-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const mode = btn.dataset.cam;
                if (mode === 'follow') {
                    this.camera.setMode('follow', this.training.getBestCar());
                } else if (mode === 'overview') {
                    this.camera.setMode('overview');
                    this.camera.fitToTrack(this.track);
                } else {
                    this.camera.setMode('free');
                }
            });
        });

        // Toggle options
        document.getElementById('togSensors')?.addEventListener('change', (e) => {
            this.renderer.showSensors = e.target.checked;
        });
        document.getElementById('togMinimap')?.addEventListener('change', (e) => {
            this.renderer.showMinimap = e.target.checked;
        });
        document.getElementById('togNames')?.addEventListener('change', (e) => {
            this.renderer.showNames = e.target.checked;
        });

        // Population/mutation sliders
        document.getElementById('popSize')?.addEventListener('input', (e) => {
            document.getElementById('popSizeVal').textContent = e.target.value;
        });
        document.getElementById('mutRate')?.addEventListener('input', (e) => {
            document.getElementById('mutRateVal').textContent = (parseFloat(e.target.value) * 100).toFixed(0) + '%';
        });
        document.getElementById('mutStrength')?.addEventListener('input', (e) => {
            document.getElementById('mutStrVal').textContent = parseFloat(e.target.value).toFixed(2);
        });

        // Advanced Environment Setup
        const bindSlider = (id, suffix = '') => {
            document.getElementById(id)?.addEventListener('input', (e) => {
                const el = document.getElementById(id + 'Val');
                if (el) el.textContent = e.target.value + suffix;
            });
        };
        bindSlider('botCount');
        bindSlider('trackLanes');
        
        // Sensor UI Modal
        bindSlider('frontSensors');
        bindSlider('backSensors');
        bindSlider('leftSensors');
        bindSlider('rightSensors');
        bindSlider('sensorLength');

        const modal = document.getElementById('sensorModal');
        document.getElementById('btnConfigCar')?.addEventListener('click', () => {
            if (modal) modal.style.display = 'flex';
        });
        document.getElementById('btnCloseModal')?.addEventListener('click', () => {
            if (modal) modal.style.display = 'none';
        });
        document.getElementById('btnSaveSensors')?.addEventListener('click', () => {
            if (modal) modal.style.display = 'none';
        });

        document.getElementById('themeSelect')?.addEventListener('change', (e) => {
            this.track.theme = e.target.value;
        });
        document.getElementById('trackLanes')?.addEventListener('input', (e) => {
            this.track.lanes = parseInt(e.target.value);
        });

        // Export/Import brain
        document.getElementById('btnExport')?.addEventListener('click', () => {
            const json = this.training.exportBrain();
            if (json) {
                const blob = new Blob([json], { type: 'application/json' });
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = 'best_brain.json';
                a.click();
            }
        });
        document.getElementById('btnImport')?.addEventListener('click', () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json';
            input.onchange = (e) => {
                const reader = new FileReader();
                reader.onload = (ev) => {
                    try {
                        const data = JSON.parse(ev.target.result);
                        if (this.training.ga && this.training.ga.population.length > 0) {
                            this.training.ga.population[0] = NeuralNetwork.deserialize(ev.target.result);
                        }
                    } catch (err) { alert('Invalid brain file'); }
                };
                reader.readAsText(e.target.files[0]);
            };
            input.click();
        });

        // Leaderboard click
        document.getElementById('leaderboardList')?.addEventListener('click', (e) => {
            const row = e.target.closest('.lb-row');
            if (row) {
                const id = parseInt(row.dataset.carId);
                const car = this.training.cars.find(c => c.id === id);
                if (car) {
                    this.camera.setMode('follow', car);
                    document.querySelectorAll('.cam-btn').forEach(b => b.classList.remove('active'));
                }
            }
        });
    }

    updateTrackWidthSlider() {
        const slider = document.getElementById('trackWidth');
        const label = document.getElementById('trackWidthVal');
        if (slider) slider.value = this.track.width;
        if (label) label.textContent = this.track.width;

        const lanesSlider = document.getElementById('trackLanes');
        const lanesLabel = document.getElementById('trackLanesVal');
        if (lanesSlider) lanesSlider.value = this.track.lanes || 2;
        if (lanesLabel) lanesLabel.textContent = this.track.lanes || 2;
    }

    switchMode(mode) {
        this.mode = mode;
        this.ui.setActiveMode(mode);

        if (mode === 'editor') {
            this.ui.showPanel('editorPanel');
            this.training.pause();
            this.camera.setMode('overview');
            this.camera.fitToTrack(this.track);
        } else if (mode === 'training') {
            this.ui.showPanel('trainingPanel');
            if (!this.track.isValid()) {
                alert('Please create a valid track first (need at least 3 control points)');
                this.switchMode('editor');
                return;
            }
            if (!this.training.ga || this.training.cars.length === 0) {
                this.training.init(this.track, this.ui.getSettings());
            }
            this.training.resume();
            this.camera.setMode('follow', this.training.getBestCar());
        }
    }

    // --- Mouse handling for editor ---
    onMouseDown(e) {
        if (this.mode !== 'editor') return;
        if (e.button !== 0) return;

        const world = this.camera.screenToWorld(e.clientX, e.clientY);
        const idx = this.track.findClosestPoint(world.x, world.y, 25 / this.camera.zoom);

        if (idx >= 0) {
            this.editorState.dragPoint = idx;
            this.editorState.isDragging = true;
        } else {
            this.track.addPoint(world.x, world.y);
            this.updateTrackWidthSlider();
            if (this.track.isValid()) this.camera.fitToTrack(this.track);
        }
    }

    onMouseMove(e) {
        if (this.mode !== 'editor') return;
        const world = this.camera.screenToWorld(e.clientX, e.clientY);

        if (this.editorState.isDragging && this.editorState.dragPoint >= 0) {
            this.track.movePoint(this.editorState.dragPoint, world.x, world.y);
        } else {
            this.editorState.hoveredPoint = this.track.findClosestPoint(world.x, world.y, 25 / this.camera.zoom);
        }
    }

    onMouseUp(e) {
        this.editorState.isDragging = false;
        this.editorState.dragPoint = -1;
    }

    onRightClick(e) {
        if (this.mode !== 'editor') return;
        const world = this.camera.screenToWorld(e.clientX, e.clientY);
        const idx = this.track.findClosestPoint(world.x, world.y, 25 / this.camera.zoom);
        if (idx >= 0) this.track.removePoint(idx);
    }

    // --- Game Loop ---
    loop(timestamp) {
        const dt = Math.min((timestamp - this.lastTime) / 1000, 0.05);
        this.lastTime = timestamp;

        // Update camera
        this.camera.update(dt, this.keys);

        // Update training
        if (this.mode === 'training' && this.training.running) {
            this.training.step(dt);

            // Update camera follow target
            if (this.camera.mode === 'follow') {
                const best = this.training.getBestCar();
                if (best && best.alive) this.camera.followTarget = best;
            }
        }

        // Render
        const allCars = this.mode === 'training' && this.training.bots ? this.training.cars.concat(this.training.bots) : this.training.cars;
        this.renderer.render(this.camera, this.track, allCars, this.mode, this.editorState);

        // Update UI (throttled)
        this.uiUpdateTimer += dt;
        if (this.uiUpdateTimer > 0.1) {
            this.uiUpdateTimer = 0;
            if (this.mode === 'training') {
                const stats = this.training.getStats();
                this.ui.updateStats(stats);
                this.ui.updateLeaderboard(this.training.cars);
                this.ui.drawFitnessGraph(stats.fitnessHistory);
                
                const best = this.training.getBestCar();
                if (best && !best.isBot) {
                    this.ui.updateBrain(best);
                }
            }
        }

        requestAnimationFrame((t) => this.loop(t));
    }
}

// Boot
window.addEventListener('DOMContentLoaded', () => {
    const app = new App();
    app.init();
});
