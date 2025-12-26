use std::sync::Arc;

use async_trait::async_trait;
use tokio::sync::{RwLock, RwLockReadGuard};

use crate::error::Error;
use crate::requests::GenericSetDeviceInfoParams;
use crate::responses::{
    CountdownRulesResult, DeviceInfoPlugResult, DeviceUsageResult, ScheduleRulesResult,
};

use super::{ApiClient, ApiClientExt, DeviceManagementExt, HandlerExt};

/// Handler for the [P100](https://www.tapo.com/en/search/?q=P100) and
/// [P105](https://www.tapo.com/en/search/?q=P105) devices.
#[derive(Debug)]
pub struct PlugHandler {
    client: Arc<RwLock<ApiClient>>,
}

impl PlugHandler {
    pub(crate) fn new(client: Arc<RwLock<ApiClient>>) -> Self {
        Self { client }
    }

    /// Refreshes the authentication session.
    pub async fn refresh_session(&mut self) -> Result<&mut Self, Error> {
        self.client.write().await.refresh_session().await?;
        Ok(self)
    }

    /// Turns *on* the device.
    pub async fn on(&self) -> Result<(), Error> {
        let json = serde_json::to_value(GenericSetDeviceInfoParams::device_on(true)?)?;
        self.client.read().await.set_device_info(json).await
    }

    /// Turns *off* the device.
    pub async fn off(&self) -> Result<(), Error> {
        let json = serde_json::to_value(GenericSetDeviceInfoParams::device_on(false)?)?;
        self.client.read().await.set_device_info(json).await
    }

    /// Returns *device info* as [`DeviceInfoPlugResult`].
    /// It is not guaranteed to contain all the properties returned from the Tapo API.
    /// If the deserialization fails, or if a property that you care about it's not present, try [`PlugHandler::get_device_info_json`].
    pub async fn get_device_info(&self) -> Result<DeviceInfoPlugResult, Error> {
        self.client.read().await.get_device_info().await
    }

    /// Returns *device info* as [`serde_json::Value`].
    /// It contains all the properties returned from the Tapo API.
    pub async fn get_device_info_json(&self) -> Result<serde_json::Value, Error> {
        self.client.read().await.get_device_info().await
    }

    /// Returns *device usage* as [`DeviceUsageResult`].
    pub async fn get_device_usage(&self) -> Result<DeviceUsageResult, Error> {
        self.client.read().await.get_device_usage().await
    }

    /// Returns *countdown rules* as [`CountdownRulesResult`].
    pub async fn get_countdown_rules(&self) -> Result<CountdownRulesResult, Error> {
        self.client.read().await.get_countdown_rules().await
    }

    /// Returns *schedule rules* as [`ScheduleRulesResult`].
    pub async fn get_schedule_rules(&self) -> Result<ScheduleRulesResult, Error> {
        self.client.read().await.get_schedule_rules().await
    }

    /// Sets a countdown rule.
    /// 
    /// # Arguments
    /// * `delay` - Seconds until action
    /// * `turn_on` - true to turn on, false to turn off when countdown completes
    pub async fn set_countdown(&self, delay: u64, turn_on: bool) -> Result<(), Error> {
        self.client.read().await.add_countdown_rule(delay, turn_on).await
    }
}

#[async_trait]
impl HandlerExt for PlugHandler {
    async fn get_client(&self) -> RwLockReadGuard<'_, dyn ApiClientExt> {
        RwLockReadGuard::map(
            self.client.read().await,
            |client: &ApiClient| -> &dyn ApiClientExt { client },
        )
    }
}

impl DeviceManagementExt for PlugHandler {}
