class CoachingController {
    constructor() {
        this.canvas = document.getElementById('pitchCanvas');
        this.ctx = this.canvas.getContext('2d');
        
        this.pitchData = [];
        this.targetPitch = [];
        this.currentPosition = 0;
        
        this.metrics = {
            pitchAccuracy: 0,
            timing: 0,
            stability: 0
        };
        
        this.isActive = false;
        this.animationFrame = null;
        
        this.init();
    }

    init() {
        this.setupCanvas();
        this.setupEventListeners();
        this.drawEmptyPitchDisplay();
        this.startAnalysis();
    }

    setupCanvas() {
        const rect = this.canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        
        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;
        
        this.ctx.scale(dpr, dpr);
        this.canvas.style.width = rect.width + 'px';
        this.canvas.style.height = rect.height + 'px';
    }

    setupEventListeners() {
        window.addEventListener('resize', () => {
            this.setupCanvas();
            this.drawPitchDisplay();
        });
    }

    onSongLoaded(metadata) {
        this.songMetadata = metadata || {};
        this.generateTargetPitch();
        this.resetMetrics();
    }

    generateTargetPitch() {
        if (!this.songMetadata) return;
        
        const duration = this.songMetadata.duration || 180;
        const key = this.songMetadata.key || 'C';
        const sampleRate = 100;
        
        this.targetPitch = [];
        
        for (let i = 0; i < duration * sampleRate; i++) {
            const t = i / sampleRate;
            const baseFreq = this.keyToFrequency(key);
            
            let targetFreq = baseFreq;
            
            if (t < 30) {
                targetFreq = baseFreq;
            } else if (t < 60) {
                targetFreq = baseFreq * Math.pow(2, 2/12);
            } else if (t < 90) {
                targetFreq = baseFreq * Math.pow(2, 4/12);
            } else if (t < 120) {
                targetFreq = baseFreq * Math.pow(2, 5/12);
            } else {
                targetFreq = baseFreq;
            }
            
            const vibrato = Math.sin(t * 6) * 0.02;
            targetFreq *= (1 + vibrato);
            
            this.targetPitch.push(targetFreq);
        }
    }

    keyToFrequency(key) {
        const keyMap = {
            'C': 261.63,
            'C#': 277.18, 'Db': 277.18,
            'D': 293.66,
            'D#': 311.13, 'Eb': 311.13,
            'E': 329.63,
            'F': 349.23,
            'F#': 369.99, 'Gb': 369.99,
            'G': 392.00,
            'G#': 415.30, 'Ab': 415.30,
            'A': 440.00,
            'A#': 466.16, 'Bb': 466.16,
            'B': 493.88
        };
        
        return keyMap[key] || 261.63;
    }

    startAnalysis() {
        this.analysisTimer = setInterval(() => {
            if (this.isActive) {
                this.analyzePitch();
                this.updateMetrics();
                this.drawPitchDisplay();
            }
        }, 50);
    }

    analyzePitch() {
        const currentTime = this.currentPosition;
        const sampleIndex = Math.floor(currentTime * 100);
        
        const simulatedPitch = this.generateSimulatedPitch(currentTime);
        
        this.pitchData.push({
            time: currentTime,
            frequency: simulatedPitch,
            confidence: 0.8 + Math.random() * 0.2
        });
        
        if (this.pitchData.length > 1000) {
            this.pitchData.shift();
        }
    }

    generateSimulatedPitch(time) {
        const targetIndex = Math.floor(time * 100);
        const targetFreq = this.targetPitch[targetIndex] || 440;
        
        const error = (Math.random() - 0.5) * 100;
        const drift = Math.sin(time * 0.3) * 20;
        const vibrato = Math.sin(time * 8) * 10;
        
        return targetFreq + error + drift + vibrato;
    }

    updateMetrics() {
        if (this.pitchData.length < 10) return;
        
        const recentData = this.pitchData.slice(-100);
        const currentTime = this.currentPosition;
        
        const pitchErrors = recentData.map(data => {
            const targetIndex = Math.floor(data.time * 100);
            const targetFreq = this.targetPitch[targetIndex] || 440;
            const cents = 1200 * Math.log2(data.frequency / targetFreq);
            return Math.abs(cents);
        });
        
        const avgPitchError = pitchErrors.reduce((a, b) => a + b, 0) / pitchErrors.length;
        this.metrics.pitchAccuracy = Math.max(0, 100 - avgPitchError / 2);
        
        const stability = this.calculateStability(recentData);
        this.metrics.stability = Math.max(0, 100 - stability);
        
        this.metrics.timing = 85 + Math.random() * 10;
        
        this.updateMetricsDisplay();
    }

    calculateStability(data) {
        if (data.length < 5) return 0;
        
        const frequencies = data.map(d => d.frequency);
        const mean = frequencies.reduce((a, b) => a + b, 0) / frequencies.length;
        const variance = frequencies.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / frequencies.length;
        const stdDev = Math.sqrt(variance);
        
        return stdDev;
    }

    updateMetricsDisplay() {
        const metrics = [
            { key: 'pitchAccuracy', label: 'Pitch Accuracy' },
            { key: 'timing', label: 'Timing' },
            { key: 'stability', label: 'Stability' }
        ];
        
        metrics.forEach(({ key, label }) => {
            const value = Math.round(this.metrics[key]);
            const metricElement = document.querySelector(`.coaching-metrics .metric:nth-child(${metrics.findIndex(m => m.key === key) + 1})`);
            
            if (metricElement) {
                const fill = metricElement.querySelector('.metric-fill');
                const valueSpan = metricElement.querySelector('.metric-value');
                
                if (fill) fill.style.width = `${value}%`;
                if (valueSpan) valueSpan.textContent = `${value}%`;
            }
        });
    }

    drawEmptyPitchDisplay() {
        const width = this.canvas.width / (window.devicePixelRatio || 1);
        const height = this.canvas.height / (window.devicePixelRatio || 1);
        
        this.ctx.fillStyle = '#2a2a2a';
        this.ctx.fillRect(0, 0, width, height);
        
        this.drawPitchGrid(width, height);
    }

    drawPitchDisplay() {
        const width = this.canvas.width / (window.devicePixelRatio || 1);
        const height = this.canvas.height / (window.devicePixelRatio || 1);
        
        this.ctx.fillStyle = '#2a2a2a';
        this.ctx.fillRect(0, 0, width, height);
        
        this.drawPitchGrid(width, height);
        this.drawTargetPitch(width, height);
        this.drawUserPitch(width, height);
    }

    drawPitchGrid(width, height) {
        this.ctx.strokeStyle = '#444';
        this.ctx.lineWidth = 1;
        
        for (let i = 1; i < 10; i++) {
            const y = (i / 10) * height;
            this.ctx.beginPath();
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(width, y);
            this.ctx.stroke();
        }
        
        for (let i = 1; i < 20; i++) {
            const x = (i / 20) * width;
            this.ctx.beginPath();
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, height);
            this.ctx.stroke();
        }
        
        this.ctx.fillStyle = '#666';
        this.ctx.font = '12px monospace';
        this.ctx.fillText('Pitch (Hz)', 10, 20);
        this.ctx.fillText('Time', width - 50, height - 10);
    }

    drawTargetPitch(width, height) {
        if (!this.targetPitch.length) return;
        
        this.ctx.strokeStyle = '#007acc';
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        
        const timeWindow = 10;
        const currentTime = this.currentPosition;
        const startTime = Math.max(0, currentTime - timeWindow / 2);
        const endTime = startTime + timeWindow;
        
        const startIndex = Math.floor(startTime * 100);
        const endIndex = Math.floor(endTime * 100);
        
        let first = true;
        for (let i = startIndex; i < endIndex && i < this.targetPitch.length; i++) {
            const time = i / 100;
            const x = ((time - startTime) / timeWindow) * width;
            const freq = this.targetPitch[i];
            const y = height - ((freq - 200) / (800 - 200)) * height;
            
            if (first) {
                this.ctx.moveTo(x, y);
                first = false;
            } else {
                this.ctx.lineTo(x, y);
            }
        }
        
        this.ctx.stroke();
    }

    drawUserPitch(width, height) {
        if (!this.pitchData.length) return;
        
        this.ctx.strokeStyle = '#ff6b35';
        this.ctx.lineWidth = 3;
        this.ctx.beginPath();
        
        const timeWindow = 10;
        const currentTime = this.currentPosition;
        const startTime = Math.max(0, currentTime - timeWindow / 2);
        const endTime = startTime + timeWindow;
        
        const relevantData = this.pitchData.filter(
            d => d.time >= startTime && d.time <= endTime
        );
        
        let first = true;
        relevantData.forEach(data => {
            const x = ((data.time - startTime) / timeWindow) * width;
            const y = height - ((data.frequency - 200) / (800 - 200)) * height;
            
            if (first) {
                this.ctx.moveTo(x, y);
                first = false;
            } else {
                this.ctx.lineTo(x, y);
            }
        });
        
        this.ctx.stroke();
        
        relevantData.forEach(data => {
            const x = ((data.time - startTime) / timeWindow) * width;
            const y = height - ((data.frequency - 200) / (800 - 200)) * height;
            
            this.ctx.fillStyle = `rgba(255, 107, 53, ${data.confidence})`;
            this.ctx.beginPath();
            this.ctx.arc(x, y, 3, 0, Math.PI * 2);
            this.ctx.fill();
        });
    }

    setPosition(positionSec) {
        this.currentPosition = positionSec;
    }

    setActive(active) {
        this.isActive = active;
        if (!active) {
            this.resetMetrics();
        }
    }

    resetMetrics() {
        this.metrics = {
            pitchAccuracy: 0,
            timing: 0,
            stability: 0
        };
        
        this.pitchData = [];
        this.updateMetricsDisplay();
        this.drawEmptyPitchDisplay();
    }

    getSessionSummary() {
        const summary = {
            metrics: { ...this.metrics },
            duration: this.currentPosition,
            pitchDataPoints: this.pitchData.length,
            averageConfidence: this.pitchData.length > 0 
                ? this.pitchData.reduce((sum, d) => sum + d.confidence, 0) / this.pitchData.length
                : 0
        };
        
        return summary;
    }

    destroy() {
        if (this.analysisTimer) {
            clearInterval(this.analysisTimer);
        }
        
        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
        }
    }
}