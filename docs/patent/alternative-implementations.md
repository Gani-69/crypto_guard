# Patent Technical Disclosure: Alternative Implementations

This document describes alternative architectures, telemetry signals, and database isolation implementations to cover broad variations in patent filings.

---

## 1. Alternative Telemetry Inputs

While the preferred embodiment focuses on keyboard keystroke dynamics (dwell and flight times) and coarse time-of-day/device location context, alternative embodiments may utilize different telemetry feeds:

### 1.1 Touch and Gestural Dynamics (Mobile Devices)
*   **Touch pressure profile:** Measuring the surface contact area and pressure applied to a mobile screen during interactions. Stress under physical coercion correlates with firmer presses and tense muscles.
*   **Swipe/Flick velocity profiles:** Analyzing swipe patterns (scroll speed, swipe lengths, trajectory curvature) to detect hesitation, tremors, or anomalous swipe speeds.
*   **Device micro-accelerometer drift:** Reading accelerometer and gyroscope sensors continuously to detect physical device shaking or hand tremors consistent with coercive environments.

### 1.2 Mouse and Pointer Telemetry
*   **Pointer trajectory jitter:** Measuring mouse movement paths (curvature deviation, acceleration profiles, stop-start frequencies) to detect motor tension or hesitation.
*   **Click-down and click-up intervals:** Analogue to keystroke dwell times; measuring clicks, hover durations over buttons, and search patterns.

### 1.3 Behavioral Navigation Biometrics
*   **Navigation sequence mapping:** Monitoring page transition frequencies and user paths. A coercion victim may visit "Safety" or "Settings" pages abnormally, or click slowly, whereas a remote ATO attacker may navigate directly to "Trading" and "Withdraw" fields with machine-like speed.

---

## 2. Alternative Risk Modeling Architectures

In addition to static rules, Mahalanobis distance Z-scoring, and feedforward neural networks, the risk estimation engine (ARES) can be implemented via:

### 2.1 Sequential and Recurrent Neural Networks
*   **LSTM / GRU networks:** Modeling the typing telemetry as a continuous time-series sequence of keystrokes. Recurrent architectures can capture the dynamic temporal dependencies and rhythm shifts over a phrase or sentence rather than treating each key as an independent feature.
*   **Transformer-based sequence encoders:** Utilizing self-attention mechanisms to weigh specific segments of text entry (e.g., password typing vs. search query typing) dynamically.

### 2.2 Unsupervised Anomaly Detectors
*   **Autoencoders:** Training reconstruction models on legitimate baseline data. Anomalous profiles yield high reconstruction loss, triggering the policy engine automatically without requiring labeled anomaly training datasets.
*   **Isolation Forests:** Evaluating feature spacing partitions to isolate anomalous vectors from normal clusters.

---

## 3. Alternative Decoy Sandbox Implementations

While the preferred embodiment isolates records via row-level database flags (`isShadow: boolean`) in a unified SQLite database, alternative embodiments may implement:

### 3.1 Ephemeral Virtual Sandbox Instances
*   **Container/VM Isolation:** Upon transitioning to the `SHADOW` state, the user session is routed through a network proxy gateway to a separate, ephemeral micro-virtual machine (microVM) container.
*   **Decoy Database Mirror:** The container connects to a read-only mirror of the user's authentic portfolio that was snapshotted at login. All modifications or transfers executed in `SHADOW` are written to a localized, throwaway scratchpad DB inside the VM, which is discarded upon session timeout.

### 3.2 Decentralized Blockchain Simulations
*   **Simulated Testnet Rails:** Rather than simulating orders internally in a web application schema, transaction requests in `SHADOW` are dispatched to a public cryptocurrency testnet (e.g., Ethereum Sepolia testnet). The transaction hash returned matches legitimate blockchain structure, deceiving adversaries who copy the transaction hash to standard block explorers.
