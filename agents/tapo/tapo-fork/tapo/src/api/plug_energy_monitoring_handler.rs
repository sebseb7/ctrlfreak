use std::sync::Arc;

use async_trait::async_trait;
use tokio::sync::{RwLock, RwLockReadGuard};

use crate::error::Error;
use crate::requests::{EnergyDataInterval, GenericSetDeviceInfoParams, PowerDataInterval};
use crate::responses::{
    CountdownRulesResult, CurrentPowerResult, DeviceInfoPlugEnergyMonitoringResult,
    DeviceUsageEnergyMonitoringResult, EnergyDataResult, EnergyUsageResult,
    PowerDataResult, ScheduleRulesResult,
};

use super::{ApiClient, ApiClientExt, DeviceManagementExt, HandlerExt};

/// Handler for the [P110](https://www.tapo.com/en/search/?q=P110),
/// [P110M](https://www.tapo.com/en/search/?q=P110M) and
/// [P115](https://www.tapo.com/en/search/?q=P115) devices.
#[derive(Debug)]
pub struct PlugEnergyMonitoringHandler {
    client: Arc<RwLock<ApiClient>>,
}

impl PlugEnergyMonitoringHandler {
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

    /// Returns *device info* as [`DeviceInfoPlugEnergyMonitoringResult`].
    /// It is not guaranteed to contain all the properties returned from the Tapo API.
    /// If the deserialization fails, or if a property that you care about it's not present, try [`PlugEnergyMonitoringHandler::get_device_info_json`].
    pub async fn get_device_info(&self) -> Result<DeviceInfoPlugEnergyMonitoringResult, Error> {
        self.client.read().await.get_device_info().await
    }

    /// Returns *device info* as [`serde_json::Value`].
    /// It contains all the properties returned from the Tapo API.
    pub async fn get_device_info_json(&self) -> Result<serde_json::Value, Error> {
        self.client.read().await.get_device_info().await
    }

    /// Returns *current power* as [`CurrentPowerResult`].
    pub async fn get_current_power(&self) -> Result<CurrentPowerResult, Error> {
        self.client.read().await.get_current_power().await
    }

    /// Returns *device usage* as [`DeviceUsageEnergyMonitoringResult`].
    pub async fn get_device_usage(&self) -> Result<DeviceUsageEnergyMonitoringResult, Error> {
        self.client.read().await.get_device_usage().await
    }

    /// Returns *energy usage* as [`EnergyUsageResult`].
    pub async fn get_energy_usage(&self) -> Result<EnergyUsageResult, Error> {
        self.client.read().await.get_energy_usage().await
    }

    /// Returns *energy data* as [`EnergyDataResult`].
    pub async fn get_energy_data(
        &self,
        interval: EnergyDataInterval,
    ) -> Result<EnergyDataResult, Error> {
        self.client.read().await.get_energy_data(interval).await
    }

    /// Returns *power data* as [`PowerDataResult`].
    pub async fn get_power_data(
        &self,
        interval: PowerDataInterval,
    ) -> Result<PowerDataResult, Error> {
        self.client.read().await.get_power_data(interval).await
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
impl HandlerExt for PlugEnergyMonitoringHandler {
    async fn get_client(&self) -> RwLockReadGuard<'_, dyn ApiClientExt> {
        RwLockReadGuard::map(
            self.client.read().await,
            |client: &ApiClient| -> &dyn ApiClientExt { client },
        )
    }
}

impl DeviceManagementExt for PlugEnergyMonitoringHandler {}
