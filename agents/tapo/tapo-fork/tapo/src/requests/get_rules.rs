use serde::Serialize;

/// Parameters for getting schedule/countdown rules
#[derive(Debug, Serialize)]
pub(crate) struct GetRulesParams {
    pub start_index: u32,
}

impl GetRulesParams {
    #[allow(dead_code)]
    pub fn new(start_index: u32) -> Self {
        Self { start_index }
    }
}

impl Default for GetRulesParams {
    fn default() -> Self {
        Self { start_index: 0 }
    }
}
