//! Schedule and countdown rules response types.

use serde::{Deserialize, Serialize};

use super::TapoResponseExt;

/// A countdown timer rule
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct CountdownRule {
    /// Rule ID
    pub id: String,
    /// Whether the rule is enabled
    pub enable: bool,
    /// Delay in seconds until the action triggers
    pub delay: u64,
    /// Seconds remaining (if timer is active)
    pub remain: u64,
    /// Action when countdown completes
    pub desired_states: Option<DesiredState>,
}

/// Desired state for countdown/schedule
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct DesiredState {
    /// Whether device should be on
    pub on: Option<bool>,
}

/// A scheduled rule
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ScheduleRule {
    /// Rule ID
    pub id: String,
    /// Whether the rule is enabled
    pub enable: bool,
    /// Weekday mask (bits for days, 127 = all days)
    #[serde(default)]
    pub week_day: u8,
    /// Start minute of day (0-1439)
    #[serde(default)]
    pub s_min: u16,
    /// End minute of day
    #[serde(default)]
    pub e_min: u16,
    /// Mode (e.g., "repeat")
    pub mode: Option<String>,
    /// Day of month
    pub day: Option<u8>,
    /// Month
    pub month: Option<u8>,
    /// Year
    pub year: Option<u16>,
    /// Action
    pub desired_states: Option<DesiredState>,
}

/// Result wrapper for countdown rules
#[derive(Debug, Clone, Deserialize)]
pub struct CountdownRulesResult {
    /// Whether countdown is enabled globally
    #[serde(default)]
    pub enable: bool,
    /// Max countdown rules
    #[serde(default)]
    pub countdown_rule_max_count: u32,
    /// List of countdown rules
    #[serde(rename = "rule_list", default)]
    pub rules: Vec<CountdownRule>,
}

impl TapoResponseExt for CountdownRulesResult {}

/// Result wrapper for schedule rules
#[derive(Debug, Clone, Deserialize)]
pub struct ScheduleRulesResult {
    /// Whether schedule is enabled globally
    #[serde(default)]
    pub enable: bool,
    /// Max schedule rules
    #[serde(default)]
    pub schedule_rule_max_count: u32,
    /// List of schedule rules
    #[serde(rename = "rule_list", default)]
    pub rules: Vec<ScheduleRule>,
    /// Total count (for pagination)
    #[serde(default)]
    pub sum: u32,
    /// Start index (for pagination)
    #[serde(default)]
    pub start_index: u32,
}

impl TapoResponseExt for ScheduleRulesResult {}
