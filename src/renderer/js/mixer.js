class MixerController {
    constructor(audioEngine = null) {
        this.audioEngine = audioEngine;
        this.stems = [];
        this.mixerState = null;
        this.init();
    }

    init() {
        this.container = document.getElementById('mixerStrips');
    }

    updateState(state) {
        this.mixerState = state;
        
        if (state.stems && state.stems.length > 0) {
            this.stems = state.stems;
            this.renderMixerStrips();
        }
        
        this.updateControlStates();
    }

    renderMixerStrips() {
        if (!this.stems.length) {
            this.container.innerHTML = '<div class="no-song-message">Load a KAI file to see mixer controls</div>';
            return;
        }

        this.container.innerHTML = '';

        this.stems.forEach((stemId, index) => {
            const strip = this.createMixerStrip(stemId, index);
            this.container.appendChild(strip);
        });
    }

    createMixerStrip(stemId, index) {
        const strip = document.createElement('div');
        strip.className = 'mixer-strip';
        strip.dataset.stemId = stemId;
        strip.dataset.stemIndex = index;

        strip.innerHTML = `
            <div class="stem-name">${this.formatStemName(stemId)}</div>
            
            <div class="gain-control">
                <input type="range" 
                       class="gain-slider" 
                       min="-60" 
                       max="12" 
                       step="0.1" 
                       value="0"
                       data-stem="${stemId}">
                <div class="gain-value">0.0 dB</div>
            </div>
            
            <button class="mute-btn" 
                    data-stem="${stemId}" 
                    data-bus="PA">
                PA
            </button>
            
            <button class="mute-btn" 
                    data-stem="${stemId}" 
                    data-bus="IEM">
                IEM
            </button>
            
            <button class="solo-btn" 
                    data-stem="${stemId}">
                SOLO
            </button>
            
            <div class="meter" data-stem="${stemId}">
                <div class="meter-fill"></div>
            </div>
        `;

        this.setupStripEventListeners(strip);
        return strip;
    }

    setupStripEventListeners(strip) {
        const stemId = strip.dataset.stemId;

        const gainSlider = strip.querySelector('.gain-slider');
        const gainValue = strip.querySelector('.gain-value');
        
        gainSlider.addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            gainValue.textContent = `${value.toFixed(1)} dB`;
        });

        gainSlider.addEventListener('change', (e) => {
            const value = parseFloat(e.target.value);
            if (this.audioEngine) {
                this.audioEngine.setGain(stemId, value);
            }
        });

        const muteButtons = strip.querySelectorAll('.mute-btn');
        muteButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const bus = btn.dataset.bus;
                if (this.audioEngine) {
                    this.audioEngine.toggleMute(stemId, bus);
                }
            });
        });

        const soloButton = strip.querySelector('.solo-btn');
        soloButton.addEventListener('click', () => {
            if (this.audioEngine) {
                this.audioEngine.toggleSolo(stemId);
            }
        });

        gainSlider.addEventListener('dblclick', () => {
            gainSlider.value = 0;
            gainValue.textContent = '0.0 dB';
            if (this.audioEngine) {
                this.audioEngine.setGain(stemId, 0);
            }
        });
    }

    updateControlStates() {
        if (!this.mixerState) return;

        this.stems.forEach(stemId => {
            const strip = this.container.querySelector(`[data-stem-id="${stemId}"]`);
            if (!strip) return;

            const gainSlider = strip.querySelector('.gain-slider');
            const gainValue = strip.querySelector('.gain-value');
            const gain = this.mixerState.gains[stemId] || 0;
            
            if (gainSlider && Math.abs(parseFloat(gainSlider.value) - gain) > 0.1) {
                gainSlider.value = gain;
                gainValue.textContent = `${gain.toFixed(1)} dB`;
            }

            const paMuteBtn = strip.querySelector('.mute-btn[data-bus="PA"]');
            const iemMuteBtn = strip.querySelector('.mute-btn[data-bus="IEM"]');
            const soloBtn = strip.querySelector('.solo-btn');

            if (paMuteBtn) {
                const isPAMuted = this.mixerState.mutes?.PA?.[stemId] || false;
                paMuteBtn.classList.toggle('active', isPAMuted);
            }

            if (iemMuteBtn) {
                const isIEMMuted = this.mixerState.mutes?.IEM?.[stemId] || false;
                iemMuteBtn.classList.toggle('active', isIEMMuted);
            }

            if (soloBtn) {
                const isSoloed = this.mixerState.solos?.[stemId] || false;
                soloBtn.classList.toggle('active', isSoloed);
            }
        });
    }

    formatStemName(stemId) {
        return stemId
            .replace(/_/g, ' ')
            .replace(/\b\w/g, l => l.toUpperCase());
    }

    toggleStemMute(stemIndex, bus = 'PA') {
        if (stemIndex >= 0 && stemIndex < this.stems.length) {
            const stemId = this.stems[stemIndex];
            kaiAPI.mixer.toggleMute(stemId, bus);
        }
    }

    toggleStemSolo(stemIndex) {
        if (stemIndex >= 0 && stemIndex < this.stems.length) {
            const stemId = this.stems[stemIndex];
            kaiAPI.mixer.toggleSolo(stemId);
        }
    }

    updateMeters(meterData) {
        if (!meterData) return;

        Object.entries(meterData).forEach(([stemId, level]) => {
            const meter = this.container.querySelector(`[data-stem="${stemId}"] .meter-fill`);
            if (meter) {
                const percentage = Math.max(0, Math.min(100, (level + 60) / 60 * 100));
                meter.style.width = `${percentage}%`;
            }
        });
    }

    getLinkState(stemId) {
        const strip = this.container.querySelector(`[data-stem-id="${stemId}"]`);
        if (!strip) return false;
        
        const linkBtn = strip.querySelector('.link-btn');
        return linkBtn ? linkBtn.classList.contains('active') : false;
    }

    applyPreset(presetData) {
        if (!presetData || !this.mixerState) return;

        Object.entries(presetData.gains || {}).forEach(([stemId, gain]) => {
            kaiAPI.mixer.setGain(stemId, gain);
        });

        Object.entries(presetData.mutes?.PA || {}).forEach(([stemId, muted]) => {
            if (muted) {
                kaiAPI.mixer.toggleMute(stemId, 'PA');
            }
        });

        Object.entries(presetData.mutes?.IEM || {}).forEach(([stemId, muted]) => {
            if (muted) {
                kaiAPI.mixer.toggleMute(stemId, 'IEM');
            }
        });

        Object.entries(presetData.solos || {}).forEach(([stemId, soloed]) => {
            if (soloed) {
                kaiAPI.mixer.toggleSolo(stemId);
            }
        });
    }

    exportMixState() {
        if (!this.mixerState) return null;

        return {
            gains: { ...this.mixerState.gains },
            mutes: {
                PA: { ...this.mixerState.mutes.PA },
                IEM: { ...this.mixerState.mutes.IEM }
            },
            solos: { ...this.mixerState.solos },
            timestamp: Date.now()
        };
    }

    importMixState(mixState) {
        if (!mixState) return;

        this.applyPreset(mixState);
    }

    updateFromAudioEngine() {
        if (!this.audioEngine) return;
        
        const mixerState = this.audioEngine.getMixerState();
        if (mixerState && mixerState.stems) {
            this.stems = mixerState.stems.map(stem => stem.name || stem.id);
            this.renderMixerStrips();
            this.updateControlsFromEngine(mixerState.stems);
        }
    }

    updateControlsFromEngine(stems) {
        if (!stems) return;

        stems.forEach(stem => {
            const strip = this.container.querySelector(`[data-stem-id="${stem.name}"]`);
            if (!strip) return;

            const gainSlider = strip.querySelector('.gain-slider');
            const gainValue = strip.querySelector('.gain-value');
            
            if (gainSlider && gainValue) {
                gainSlider.value = stem.gain || 0;
                gainValue.textContent = `${(stem.gain || 0).toFixed(1)} dB`;
            }

            const paMuteBtn = strip.querySelector('.mute-btn[data-bus="PA"]');
            const iemMuteBtn = strip.querySelector('.mute-btn[data-bus="IEM"]');
            const soloBtn = strip.querySelector('.solo-btn');

            if (paMuteBtn) {
                paMuteBtn.classList.toggle('active', stem.muted?.PA || false);
            }

            if (iemMuteBtn) {
                iemMuteBtn.classList.toggle('active', stem.muted?.IEM || false);
            }

            if (soloBtn) {
                soloBtn.classList.toggle('active', stem.solo || false);
            }
        });
    }

    resetMixer() {
        if (this.audioEngine) {
            this.audioEngine.mixerState.stems.forEach(stem => {
                this.audioEngine.setGain(stem.name, 0);
                if (stem.muted?.PA) this.audioEngine.toggleMute(stem.name, 'PA');
                if (stem.muted?.IEM) this.audioEngine.toggleMute(stem.name, 'IEM');
                if (stem.solo) this.audioEngine.toggleSolo(stem.name);
            });
        }
    }
}