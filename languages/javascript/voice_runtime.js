// Music Routines
function Voice(){
    this.on = false;
    this.osc;       // The oscillator which will generate tones
    this.gain;      // The gain node for controlling volume
    this.context = new webkitAudioContext();
    this.frequency = 400;   // Frequency to be used by oscillator
    this.volume = 0.3;      // Volume to be used by the gain node
    console.debug("Durp");
};

// Turn on the oscillator, routed through a gain node for volume
Voice.prototype.startOsc = function() {
    this.osc = this.context.createOscillator();
    this.osc.type = 0; // Sine wave
    this.osc.frequency.value = this.frequency;
    this.osc.noteOn(0);
    
    this.gain = this.context.createGainNode();
    this.gain.gain.value = this.volume;
    
    this.osc.connect(this.gain);
    this.gain.connect(this.context.destination);
    
    this.on = true;
};

// Turn off the oscillator
Voice.prototype.stopOsc = function() {
    this.osc.noteOff(0);
    this.osc.disconnect();
    this.on = false;
}

// Ensure a playing tone is updated when values change
Voice.prototype.updateTone = function() {
    if (this.on) {
        stopOsc();
        startOsc();
    }
};
