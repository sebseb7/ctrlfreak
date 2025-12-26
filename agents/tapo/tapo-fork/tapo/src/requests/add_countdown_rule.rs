//! Parameters for editing countdown rules

use serde::Serialize;

/// Parameters for editing a countdown rule
#[derive(Debug, Serialize)]
pub(crate) struct EditCountdownRuleParams {
    /// Rule ID to edit
    pub id: String,
    /// Delay in seconds
    pub delay: u64,
    /// Desired states when countdown completes
    pub desired_states: CountdownDesiredStates,
    /// Whether to enable the rule
    pub enable: bool,
}

/// Desired states for countdown
#[derive(Debug, Clone, Serialize)]
pub(crate) struct CountdownDesiredStates {
    /// Whether device should be on
    pub on: bool,
}

impl EditCountdownRuleParams {
    pub fn new(id: String, delay: u64, turn_on: bool) -> Self {
        Self {
            id,
            delay,
            desired_states: CountdownDesiredStates { on: turn_on },
            enable: true,
        }
    }
}

/// Parameters for adding a countdown rule
#[derive(Debug, Serialize)]
pub(crate) struct AddCountdownRuleParams {
    /// Delay in seconds
    pub delay: u64,
    /// Desired states when countdown completes
    pub desired_states: CountdownDesiredStates,
    /// Whether to enable the rule
    pub enable: bool,
}

impl AddCountdownRuleParams {
    pub fn new(delay: u64, turn_on: bool) -> Self {
        Self {
            delay,
            desired_states: CountdownDesiredStates { on: turn_on },
            enable: true,
        }
    }
}
