const logger = require('../logging/logger');

/**
 * USSD Navigation State Machine
 * 
 * Manages the state transitions in USSD menu navigation.
 * Implements a finite state machine for predictable menu flows.
 * 
 * STATES:
 * - Each menu is a state
 * - User input triggers transitions
 * - Valid transitions are defined
 * - Invalid transitions are rejected
 * 
 * TRANSITIONS:
 * - forward: Navigate to sub-menu
 * - back: Return to parent menu
 * - home: Return to main menu
 * - end: Terminate session
 * - error: Display error and retry
 * 
 * @example
 *   const fsm = require('@siamsiam/shared-utils').ussd.stateMachine;
 *   
 *   fsm.addState('main_menu');
 *   fsm.addTransition('main_menu', 'send_money', '1');
 *   fsm.addTransition('main_menu', 'buy_airtime', '2');
 *   
 *   const nextState = fsm.transition('main_menu', '1');
 */

class USSDStateMachine {
  constructor() {
    this.states = new Map();
    this.transitions = new Map(); // fromState:input -> toState
    this.currentState = null;
  }

  /**
   * Add a state
   * @param {string} stateName - State identifier
   * @param {Object} config - State configuration
   */
  addState(stateName, config = {}) {
    this.states.set(stateName, {
      name: stateName,
      type: config.type || 'menu', // menu, input, confirmation, end
      onEnter: config.onEnter || null,
      onExit: config.onExit || null,
      timeout: config.timeout || 30,
      retryLimit: config.retryLimit || 3,
      metadata: config.metadata || {},
    });
  }

  /**
   * Add a transition
   * @param {string} fromState - Source state
   * @param {string} toState - Target state
   * @param {string} input - Input that triggers transition
   * @param {Function} guard - Optional guard function
   */
  addTransition(fromState, toState, input, guard = null) {
    const key = `${fromState}:${input}`;
    this.transitions.set(key, {
      from: fromState,
      to: toState,
      input,
      guard,
    });
  }

  /**
   * Execute a transition
   * @param {string} fromState - Current state
   * @param {string} input - User input
   * @param {Object} context - Session context
   * @returns {Object} Transition result
   */
  transition(fromState, input, context = {}) {
    // Check direct transition
    const key = `${fromState}:${input}`;
    const transition = this.transitions.get(key);

    if (transition) {
      // Check guard condition
      if (transition.guard && !transition.guard(context)) {
        return {
          success: false,
          toState: fromState,
          error: 'Transition blocked by guard',
          retry: true,
        };
      }

      return {
        success: true,
        fromState,
        toState: transition.to,
        input,
      };
    }

    // Check wildcard transition (catch-all)
    const wildcardKey = `${fromState}:*`;
    const wildcardTransition = this.transitions.get(wildcardKey);

    if (wildcardTransition) {
      return {
        success: true,
        fromState,
        toState: wildcardTransition.to,
        input,
        wildcard: true,
      };
    }

    // Check default transitions
    if (input === '0' || input.toLowerCase() === 'back') {
      return this._handleBack(fromState);
    }

    if (input === '00' || input.toLowerCase() === 'home') {
      return {
        success: true,
        fromState,
        toState: 'main_menu',
        input,
        action: 'home',
      };
    }

    // Invalid transition
    return {
      success: false,
      fromState,
      error: `Invalid input for state: ${fromState}`,
      retry: true,
    };
  }

  /**
   * Set current state
   */
  setState(stateName) {
    if (!this.states.has(stateName)) {
      throw new Error(`State not found: ${stateName}`);
    }
    this.currentState = stateName;
  }

  /**
   * Get current state
   */
  getCurrentState() {
    return this.currentState;
  }

  /**
   * Get state configuration
   */
  getState(stateName) {
    return this.states.get(stateName) || null;
  }

  /**
   * Get valid transitions from a state
   */
  getValidTransitions(fromState) {
    const validTransitions = [];

    for (const [key, transition] of this.transitions) {
      if (transition.from === fromState) {
        validTransitions.push({
          input: transition.input,
          to: transition.to,
        });
      }
    }

    return validTransitions;
  }

  /**
   * Check if transition is valid
   */
  isValidTransition(fromState, input) {
    const key = `${fromState}:${input}`;
    return this.transitions.has(key) || this.transitions.has(`${fromState}:*`);
  }

  /**
   * Build a complete flow
   * @param {Object} flowDefinition - Flow configuration
   */
  buildFlow(flowDefinition) {
    for (const [stateName, stateConfig] of Object.entries(flowDefinition.states || {})) {
      this.addState(stateName, stateConfig);
    }

    for (const transition of flowDefinition.transitions || []) {
      this.addTransition(
        transition.from,
        transition.to,
        transition.input,
        transition.guard
      );
    }

    logger.info('USSD state machine flow built');
  }

  /**
   * Reset state machine
   */
  reset() {
    this.currentState = null;
  }

  // ==================== PRIVATE METHODS ====================

  /**
   * Handle back navigation
   * @private
   */
  _handleBack(fromState) {
    const state = this.states.get(fromState);
    if (!state) {
      return {
        success: true,
        fromState,
        toState: 'main_menu',
        action: 'back',
      };
    }

    if (state.metadata.parent) {
      return {
        success: true,
        fromState,
        toState: state.metadata.parent,
        action: 'back',
      };
    }

    return {
      success: true,
      fromState,
      toState: 'main_menu',
      action: 'back',
    };
  }
}

module.exports = new USSDStateMachine();