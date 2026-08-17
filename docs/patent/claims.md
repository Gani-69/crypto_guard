# Patent Technical Disclosure: Draft Claims

This document provides a draft of independent and dependent claims to support patent applications.

---

## 1. Method Claims

**Claim 1 (Independent):** A computer-implemented method for protecting digital assets during an active authenticated user session, the method comprising:
*   collecting, via a telemetry interface during the active session, a sequence of behavioral interaction metrics of a user interacting with a client application;
*   processing, via a risk estimation processor, the collected sequence of behavioral interaction metrics to compute a continuous behavioral risk score;
*   determining, via a policy engine, a session access state from a set of state options based on the continuous behavioral risk score and a set of predefined risk thresholds, wherein the set of state options comprises at least a first state representing normal access and a second state representing a decoy state;
*   in response to the session access state transitioning to the second state:
    *   modifying, via a query routing manager, database query parameters associated with database access operations triggered by the client application, wherein the modification scopes all database query inputs and outputs to a decoy database sandbox that is structurally isolated from authentic user database records; and
    *   maintaining a fully functional interactive loop with the client application using decoy data retrieved from the decoy database sandbox, wherein the transition to the second state is visually imperceptible in the client application.

**Claim 2 (Dependent):** The method of Claim 1, wherein collecting the sequence of behavioral interaction metrics comprises capturing keystroke timing dynamics from input fields in the client application.

**Claim 3 (Dependent):** The method of Claim 2, wherein the captured keystroke timing dynamics comprise:
*   dwell time, representing the duration of key presses;
*   flight time, representing the duration between key release and subsequent key press;
*   typing speed, representing characters entered per unit of time; and
*   correction rate, representing the ratio of deletion events to total inputs.

**Claim 4 (Dependent):** The method of Claim 1, further comprising:
*   collecting, via the telemetry interface, contextual session characteristics comprising at least one of client device type, time of day, client IP address, and client geographical location;
*   wherein the continuous behavioral risk score is computed based on a combination of the sequence of behavioral interaction metrics and the contextual session characteristics.

**Claim 5 (Dependent):** The method of Claim 1, wherein processing the behavioral interaction metrics comprises executing a feedforward neural network model using a normalized feature vector derived from the sequence of behavioral interaction metrics, the feedforward neural network model outputting the continuous behavioral risk score.

**Claim 6 (Dependent):** The method of Claim 1, wherein the set of state options further comprises a third state representing a step-up challenge state, wherein:
*   in response to the session access state transitioning to the third state, the client application presents a secondary verification challenge;
*   if the secondary verification challenge is successfully completed, the session access state is reverted to the first state; and
*   if the session access state is in the second state and a secondary verification challenge request is received, the client application displays a decoy verification success interface while maintaining the session access state in the second state in the decoy database sandbox.

**Claim 7 (Dependent):** The method of Claim 1, wherein transitioning the session access state to the second state is absorbing, such that subsequent behavioral interaction metrics indicating normal behavior cannot transition the session access state back to the first state during the current authenticated user session.

---

## 2. System Claims

**Claim 8 (Independent):** A security system for preventing unauthorized extraction of digital assets, the system comprising:
*   one or more processors; and
*   a memory storing instructions that, when executed by the one or more processors, cause the security system to perform operations comprising:
    *   collecting, via a telemetry interface during an active session, a sequence of behavioral dynamics of a user;
    *   processing the sequence of behavioral dynamics to calculate a live risk score;
    *   mapping the live risk score to a session access state, wherein the session access state is dynamically transitioned from a normal access state to a decoy shadow state when the live risk score exceeds a predefined security threshold;
    *   upon transitioning to the decoy shadow state, routing database queries to decoy records having a shadow flag set to true, thereby isolating authentic user records from reads and writes initiated during the decoy shadow state.

**Claim 9 (Dependent):** The system of Claim 8, wherein the digital assets are cryptographic assets, and wherein transactions initiated during the decoy shadow state generate simulated block explorer signatures that mimic real-world ledger transfers.

---

## 3. Medium Claims

**Claim 10 (Independent):** A non-transitory computer-readable medium storing instructions that, when executed by a processor, cause the processor to perform operations comprising:
*   analyzing a stream of user interaction telemetry collected continuously during an authenticated dashboard session to evaluate user stress indices;
*   updating a session status to a decoy state when the evaluated user stress indices indicate physical coercion or credentials compromise; and
*   restricting data writes and reads initiated during the decoy state to an isolated shadow database segment, while providing a fully simulated active transaction interface on a client device.
