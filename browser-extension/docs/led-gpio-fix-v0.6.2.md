# LED GPIO checks — v0.6.2

The previous engine only traced LED paths to fixed supply terminals. Arduino GPIO paths were skipped, and multiple ground aliases on one board could also suppress inference. The new engine recognizes output-capable Arduino Uno/Nano/Mega, supported ESP32 and Pico pin names and collapses equivalent same-net supply endpoints.

Polarity and series-resistance checks now cover GPIO → LED → ground and logic supply → LED → GPIO, with the resistor on either side. Ground → LED anode and GPIO → LED cathode is flagged as reversed for ordinary GPIO drive. GPIO → LED anode and logic supply → LED cathode is likewise reversed. Findings are review warnings: GPIO modes/states, firmware and external drive behavior are not simulated. Auxiliary rails with different logic voltages, GPIO-to-GPIO paths, unknown components, intermediate branches and incomplete topology remain unverified. ESP32 input-only pins are not inferred as outputs.

A resistor connected to the cathode is valid when it is in series. Sharing anodes is valid for parallel LEDs, each with its own series resistor. Wiring alone does not prove whole-circuit behavior.

## Deliberate errors in a simulator

1. Fixed-supply reversed LED: Arduino 5V → 220 Ω resistor → cathode; anode → GND. Expect an LED polarity warning. Swap the LED ends to clear it.
2. GPIO reversed LED: Arduino D8 → 220 Ω resistor → cathode; anode → GND. Expect an LED polarity warning for GPIO drive, even with simulation stopped.
3. Missing current limiting: 5V → anode; cathode → GND, with no series resistor. Expect a missing-resistance warning.
4. Open connection: disconnect one resistor leg. Expect an open-pin warning.

These tests are for simulator projects. The included led-reversed-gpio.json and led-correct-gpio.json can be opened directly in the extension or Wokwi.

## Verification

134 automated tests cover the full extension. Regression cases include captured Tinkercad net aliases, normalized Wokwi Arduino/ESP32/Pico diagrams, valid sourcing/sinking paths, reversed LEDs, missing resistance, unknown or input-only pins, shared ground aliases, intermediate branches, incomplete topology and valid parallel anodes. Rule-engine provenance is bumped so comparisons with older results require review. Browser verification uses isolated extension imports; the user's private Tinkercad project is not edited or independently inspected.
