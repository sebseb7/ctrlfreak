use clap::{Parser, Subcommand};
use futures_util::{SinkExt, StreamExt};
use log::{debug, error, info, warn};
use serde::{Deserialize, Serialize};
use std::time::Duration;
use tapo::{ApiClient, DiscoveryResult};
use tokio::time::{interval, sleep};
use tokio_tungstenite::{connect_async, tungstenite::Message};

#[derive(Parser)]
#[command(name = "tapo-agent")]
#[command(about = "Tapo smart plug sensor data collection agent")]
struct Cli {
    #[command(subcommand)]
    command: Option<Commands>,

    /// Path to config file
    #[arg(short, long, default_value = "config.toml")]
    config: String,
}

#[derive(Subcommand)]
enum Commands {
    /// Initialize configuration file by discovering devices
    Init {
        /// Server WebSocket URL
        #[arg(long)]
        server: String,

        /// API key for authentication
        #[arg(long)]
        key: String,

        /// Tapo account email
        #[arg(long)]
        email: String,

        /// Tapo account password
        #[arg(long)]
        password: String,

        /// Broadcast address for discovery (default: 192.168.1.255)
        #[arg(long, default_value = "192.168.1.255")]
        broadcast: String,

        /// Discovery timeout in seconds
        #[arg(long, default_value = "10")]
        timeout: u64,

        /// Output config file path
        #[arg(short, long, default_value = "config.toml")]
        output: String,
    },
    /// Run the agent (default if no subcommand)
    Run,
}

#[derive(Debug, Deserialize, Serialize)]
struct Config {
    server_url: String,
    api_key: String,
    poll_interval_secs: u64,
    #[serde(default)]
    command_url: Option<String>, // HTTP URL for command polling (e.g., http://localhost:3905/api/outputs/commands)
    devices: Vec<DeviceConfig>,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
struct DeviceConfig {
    ip: String,
    name: String,
    #[serde(rename = "type")]
    device_type: String,
    tapo_email: String,
    tapo_password: String,
}

#[derive(Debug, Serialize)]
struct AuthMessage {
    #[serde(rename = "type")]
    msg_type: String,
    #[serde(rename = "apiKey")]
    api_key: String,
}

#[derive(Debug, Serialize)]
struct DataMessage {
    #[serde(rename = "type")]
    msg_type: String,
    readings: Vec<Reading>,
}

#[derive(Debug, Serialize, Clone)]
struct Reading {
    device: String,
    #[serde(skip)]
    device_type: String,
    channel: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    value: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    data: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
struct ServerResponse {
    #[serde(rename = "type")]
    msg_type: String,
    success: Option<bool>,
    error: Option<String>,
}

async fn discover_and_create_config(
    server: String,
    key: String,
    email: String,
    password: String,
    broadcast: String,
    timeout: u64,
    output: String,
) -> Result<(), Box<dyn std::error::Error>> {
    println!("Discovering Tapo devices on {} ({}s timeout)...", broadcast, timeout);

    let api_client = ApiClient::new(&email, &password);
    let mut discovery = api_client.discover_devices(&broadcast, timeout).await?;

    let mut devices = Vec::new();

    while let Some(discovery_result) = discovery.next().await {
        if let Ok(device) = discovery_result {
            match device {
                DiscoveryResult::Plug { device_info, .. } => {
                    println!(
                        "  Found Plug: {} ({}) at {}",
                        device_info.nickname, device_info.model, device_info.ip
                    );
                    devices.push(DeviceConfig {
                        ip: device_info.ip,
                        name: device_info.nickname.replace(" ", "-").to_lowercase(),
                        device_type: "P100".to_string(),
                        tapo_email: email.clone(),
                        tapo_password: password.clone(),
                    });
                }
                DiscoveryResult::PlugEnergyMonitoring { device_info, .. } => {
                    println!(
                        "  Found Energy Plug: {} ({}) at {}",
                        device_info.nickname, device_info.model, device_info.ip
                    );
                    devices.push(DeviceConfig {
                        ip: device_info.ip,
                        name: device_info.nickname.replace(" ", "-").to_lowercase(),
                        device_type: "P110".to_string(),
                        tapo_email: email.clone(),
                        tapo_password: password.clone(),
                    });
                }
                DiscoveryResult::GenericDevice { device_info, .. } => {
                    println!(
                        "  Found Unknown Device: {:?} ({}) at {} - skipping",
                        device_info.nickname, device_info.model, device_info.ip
                    );
                }
                _ => {
                    // Light bulbs and other devices - skip for now
                }
            }
        }
    }

    if devices.is_empty() {
        return Err("No plugs discovered. Check your broadcast address and ensure devices are on the same network.".into());
    }

    println!("\nDiscovered {} plug(s)", devices.len());

    let config = Config {
        server_url: server,
        api_key: key,
        poll_interval_secs: 60,
        command_url: None,
        devices,
    };

    let toml_str = toml::to_string_pretty(&config)?;
    std::fs::write(&output, &toml_str)?;

    println!("✓ Config written to: {}", output);
    println!("\nRun the agent with: RUST_LOG=info ./tapo-agent");

    Ok(())
}

async fn collect_device_data(device: &DeviceConfig) -> Vec<Reading> {
    let mut readings = Vec::new();
    let client = ApiClient::new(&device.tapo_email, &device.tapo_password);

    match device.device_type.as_str() {
        "P110" => {
            match client.p110(&device.ip).await {
                Ok(plug) => {
                    if let Ok(info) = plug.get_device_info().await {
                        readings.push(Reading {
                            device: device.name.clone(),
                            device_type: device.device_type.clone(),
                            channel: "state".to_string(),
                            value: Some(if info.device_on { 1.0 } else { 0.0 }),
                            data: None,
                        });
                        // Time device has been ON since last state change (seconds)
                        readings.push(Reading {
                            device: device.name.clone(),
                            device_type: device.device_type.clone(),
                            channel: "on_time".to_string(),
                            value: Some(info.on_time as f64),
                            data: None,
                        });
                        // WiFi signal level (0-3)
                        readings.push(Reading {
                            device: device.name.clone(),
                            device_type: device.device_type.clone(),
                            channel: "signal_level".to_string(),
                            value: Some(info.signal_level as f64),
                            data: None,
                        });
                        // WiFi RSSI (dBm, negative value)
                        readings.push(Reading {
                            device: device.name.clone(),
                            device_type: device.device_type.clone(),
                            channel: "rssi".to_string(),
                            value: Some(info.rssi as f64),
                            data: None,
                        });
                    }

                    // Current power in watts (API returns milliwatts)
                    if let Ok(energy) = plug.get_current_power().await {
                        readings.push(Reading {
                            device: device.name.clone(),
                            device_type: device.device_type.clone(),
                            channel: "power".to_string(),
                            value: Some(energy.current_power as f64 / 1000.0),
                            data: None,
                        });
                    }

                    if let Ok(usage) = plug.get_energy_usage().await {
                        // Today's energy in Wh
                        readings.push(Reading {
                            device: device.name.clone(),
                            device_type: device.device_type.clone(),
                            channel: "energy_today".to_string(),
                            value: Some(usage.today_energy as f64),
                            data: None,
                        });
                        // Today's runtime in minutes
                        readings.push(Reading {
                            device: device.name.clone(),
                            device_type: device.device_type.clone(),
                            channel: "runtime_today".to_string(),
                            value: Some(usage.today_runtime as f64),
                            data: None,
                        });
                        // This month's energy in Wh
                        readings.push(Reading {
                            device: device.name.clone(),
                            device_type: device.device_type.clone(),
                            channel: "energy_month".to_string(),
                            value: Some(usage.month_energy as f64),
                            data: None,
                        });
                        // This month's runtime in minutes
                        readings.push(Reading {
                            device: device.name.clone(),
                            device_type: device.device_type.clone(),
                            channel: "runtime_month".to_string(),
                            value: Some(usage.month_runtime as f64),
                            data: None,
                        });
                    }

                    // Countdown timer - return full data or null if none
                    match plug.get_countdown_rules().await {
                        Ok(countdown) => {
                            let active = countdown.rules.iter().find(|r| r.enable);
                            readings.push(Reading {
                                device: device.name.clone(),
                            device_type: device.device_type.clone(),
                                channel: "countdown".to_string(),
                                value: None,
                                data: Some(if let Some(rule) = active {
                                    serde_json::json!({
                                        "remain": rule.remain,
                                        "action": rule.desired_states.as_ref()
                                            .and_then(|s| s.on)
                                            .map(|on| if on { "on" } else { "off" })
                                    })
                                } else {
                                    serde_json::Value::Null
                                }),
                            });
                        }
                        Err(e) => debug!("get_countdown_rules failed for {}: {}", device.name, e),
                    }

                    // Schedule rules - return full schedule list
                    match plug.get_schedule_rules().await {
                        Ok(schedules) => {
                            readings.push(Reading {
                                device: device.name.clone(),
                            device_type: device.device_type.clone(),
                                channel: "schedules".to_string(),
                                value: None,
                                data: Some(serde_json::to_value(&schedules.rules).unwrap_or_default()),
                            });
                        }
                        Err(e) => debug!("get_schedule_rules failed for {}: {}", device.name, e),
                    }
                }
                Err(e) => error!("Failed to connect to P110 {}: {}", device.name, e),
            }
        }
        "P100" | "P105" => {
            match client.p100(&device.ip).await {
                Ok(plug) => {
                    if let Ok(info) = plug.get_device_info().await {
                        readings.push(Reading {
                            device: device.name.clone(),
                            device_type: device.device_type.clone(),
                            channel: "state".to_string(),
                            value: Some(if info.device_on { 1.0 } else { 0.0 }),
                            data: None,
                        });
                        // Time device has been ON since last state change (seconds)
                        readings.push(Reading {
                            device: device.name.clone(),
                            device_type: device.device_type.clone(),
                            channel: "on_time".to_string(),
                            value: Some(info.on_time as f64),
                            data: None,
                        });
                        // WiFi signal level (0-3)
                        readings.push(Reading {
                            device: device.name.clone(),
                            device_type: device.device_type.clone(),
                            channel: "signal_level".to_string(),
                            value: Some(info.signal_level as f64),
                            data: None,
                        });
                        // WiFi RSSI (dBm, negative value)
                        readings.push(Reading {
                            device: device.name.clone(),
                            device_type: device.device_type.clone(),
                            channel: "rssi".to_string(),
                            value: Some(info.rssi as f64),
                            data: None,
                        });
                    }
                    
                    // Countdown rules
                    match plug.get_countdown_rules().await {
                        Ok(countdown) => {
                            let active = countdown.rules.iter().find(|r| r.enable);
                            readings.push(Reading {
                                device: device.name.clone(),
                                device_type: device.device_type.clone(),
                                channel: "countdown".to_string(),
                                value: None,
                                data: Some(if let Some(rule) = active {
                                    serde_json::json!({
                                        "remain": rule.remain,
                                        "action": if rule.desired_states.as_ref().and_then(|s| s.on).unwrap_or(false) { "on" } else { "off" }
                                    })
                                } else {
                                    serde_json::Value::Null
                                }),
                            });
                        }
                        Err(e) => debug!("get_countdown_rules failed for {}: {}", device.name, e),
                    }

                    // Schedule rules
                    match plug.get_schedule_rules().await {
                        Ok(schedules) => {
                            readings.push(Reading {
                                device: device.name.clone(),
                                device_type: device.device_type.clone(),
                                channel: "schedules".to_string(),
                                value: None,
                                data: Some(serde_json::to_value(&schedules.rules).unwrap_or_default()),
                            });
                        }
                        Err(e) => debug!("get_schedule_rules failed for {}: {}", device.name, e),
                    }

                    match plug.get_device_usage().await {
                        Ok(usage) => info!("P100 Usage for {}: {:?}", device.name, usage),
                        Err(e) => warn!("Failed to get P100 usage for {}: {}", device.name, e),
                    }
                }
                Err(e) => error!("Failed to connect to P100 {}: {}", device.name, e),
            }
        }
        _ => {
            warn!("Unknown device type: {}", device.device_type);
        }
    }

    readings
}

// Switch a device on or off
async fn switch_device(device: &DeviceConfig, turn_on: bool) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let client = ApiClient::new(&device.tapo_email, &device.tapo_password);
    
    match device.device_type.as_str() {
        "P110" | "P115" => {
            let plug = client.p110(&device.ip).await?;
            if turn_on {
                plug.on().await?;
            } else {
                plug.off().await?;
            }
        }
        "P100" | "P105" => {
            let plug = client.p100(&device.ip).await?;
            if turn_on {
                plug.on().await?;
            } else {
                plug.off().await?;
            }
        }
        _ => {
            return Err(format!("Unknown device type: {}", device.device_type).into());
        }
    }
    
    info!("[Switch] Device {} turned {}", device.name, if turn_on { "ON" } else { "OFF" });
    Ok(())
}

async fn run_agent(config: Config) -> Result<(), Box<dyn std::error::Error>> {
    use tokio::sync::mpsc;

    // Channel for readings from poller to sender
    let (tx, mut rx) = mpsc::channel::<Vec<Reading>>(100);

    // Spawn device polling task - runs continuously regardless of connection
    let poll_interval_secs = config.poll_interval_secs;
    let devices = config.devices.clone();
    tokio::spawn(async move {
        let mut poll_interval = interval(Duration::from_secs(poll_interval_secs));
        loop {
            poll_interval.tick().await;

            let mut all_readings = Vec::new();
            for device in &devices {
                let readings = collect_device_data(device).await;
                all_readings.extend(readings);
            }

            if !all_readings.is_empty() {
                info!("Collected {} readings from devices", all_readings.len());
                // Group readings by device for cleaner output
                let mut current_device = String::new();
                for reading in &all_readings {
                    if reading.device != current_device {
                        current_device = reading.device.clone();
                        info!("Device: {} (name: {})", reading.device_type, current_device);
                    }
                    if let Some(val) = reading.value {
                        info!("  {} = {}", reading.channel, val);
                    } else if let Some(ref data) = reading.data {
                        info!("  {} = {}", reading.channel, data);
                    }
                }
                // Try to send to connection task, drop if channel full
                let _ = tx.try_send(all_readings);
            }
        }
    });

    // Clone devices for command handling in main loop
    let devices_for_commands = config.devices.clone();

    // Connection and sending loop
    let mut reconnect_delay = Duration::from_secs(1);
    let max_reconnect_delay = Duration::from_secs(60);

    loop {
        info!("Connecting to {}...", config.server_url);

        match connect_async(&config.server_url).await {
            Ok((ws_stream, _)) => {
                info!("Connected to server");
                reconnect_delay = Duration::from_secs(1);

                let (mut write, mut read) = ws_stream.split();

                let auth = AuthMessage {
                    msg_type: "auth".to_string(),
                    api_key: config.api_key.clone(),
                };
                let auth_json = serde_json::to_string(&auth)?;
                write.send(Message::Text(auth_json)).await?;

                let authenticated = if let Some(Ok(msg)) = read.next().await {
                    if let Message::Text(text) = msg {
                        let response: ServerResponse = serde_json::from_str(&text)?;
                        if response.msg_type == "auth" && response.success == Some(true) {
                            info!("Authenticated successfully");
                            true
                        } else {
                            error!("Authentication failed: {:?}", response.error);
                            false
                        }
                    } else {
                        false
                    }
                } else {
                    false
                };

                if !authenticated {
                    sleep(reconnect_delay).await;
                    continue;
                }

                // Main send loop - receive readings from channel and send to server
                loop {
                    tokio::select! {
                        // Receive readings from polling task
                        Some(readings) = rx.recv() => {
                            info!("Sending {} readings to server", readings.len());
                            let data = DataMessage {
                                msg_type: "data".to_string(),
                                readings,
                            };
                            let data_json = serde_json::to_string(&data)?;

                            if let Err(e) = write.send(Message::Text(data_json)).await {
                                error!("Failed to send data: {}", e);
                                break;
                            }
                        }
                        // Handle incoming WebSocket messages
                        msg = read.next() => {
                            match msg {
                                Some(Ok(Message::Text(text))) => {
                                    // Handle incoming commands from server
                                    if let Ok(cmd) = serde_json::from_str::<serde_json::Value>(&text) {
                                        if cmd.get("type").and_then(|v| v.as_str()) == Some("command") {
                                            let device_name = cmd.get("device").and_then(|v| v.as_str()).unwrap_or("");
                                            let action = cmd.get("action").and_then(|v| v.as_str()).unwrap_or("");
                                            let value = cmd.get("value").and_then(|v| v.as_i64()).unwrap_or(0);
                                            
                                            info!("[Command] Received: device={}, action={}, value={}", device_name, action, value);
                                            
                                            // Find matching device in our config
                                            if let Some(device) = devices_for_commands.iter().find(|d| d.name == device_name) {
                                                if action == "set_state" {
                                                    let turn_on = value > 0;
                                                    info!("[Command] Switching {} {}", device_name, if turn_on { "ON" } else { "OFF" });
                                                    
                                                    let device_clone = device.clone();
                                                    tokio::spawn(async move {
                                                        if let Err(e) = switch_device(&device_clone, turn_on).await {
                                                            error!("[Command] Failed to switch {}: {}", device_clone.name, e);
                                                        }
                                                    });
                                                }
                                            } else {
                                                warn!("[Command] Unknown device: {}", device_name);
                                            }
                                        }
                                    }
                                }
                                Some(Ok(Message::Ping(data))) => {
                                    let _ = write.send(Message::Pong(data)).await;
                                }
                                Some(Ok(Message::Close(_))) => {
                                    info!("Server closed connection");
                                    break;
                                }
                                Some(Err(e)) => {
                                    error!("WebSocket error: {}", e);
                                    break;
                                }
                                None => {
                                    info!("Connection closed");
                                    break;
                                }
                                _ => {}
                            }
                        }
                    }
                }
            }
            Err(e) => {
                error!("Connection failed: {}", e);
            }
        }

        warn!("Reconnecting in {:?}...", reconnect_delay);
        sleep(reconnect_delay).await;
        reconnect_delay = std::cmp::min(reconnect_delay * 2, max_reconnect_delay);
    }
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    env_logger::init();

    let cli = Cli::parse();

    match cli.command {
        Some(Commands::Init {
            server,
            key,
            email,
            password,
            broadcast,
            timeout,
            output,
        }) => {
            discover_and_create_config(server, key, email, password, broadcast, timeout, output).await?;
        }
        Some(Commands::Run) | None => {
            let config_path = &cli.config;

            let config_content = match std::fs::read_to_string(config_path) {
                Ok(content) => content,
                Err(e) => {
                    eprintln!("Failed to read config file {}: {}", config_path, e);
                    eprintln!();
                    eprintln!("Create config with device discovery:");
                    eprintln!("  ./tapo-agent init --server ws://SERVER:8080 --key YOUR_KEY --email tapo@email.com --password tapopass");
                    eprintln!();
                    eprintln!("Or specify broadcast address:");
                    eprintln!("  ./tapo-agent init --server ws://SERVER:8080 --key YOUR_KEY --email tapo@email.com --password tapopass --broadcast 192.168.0.255");
                    std::process::exit(1);
                }
            };

            let config: Config = toml::from_str(&config_content)
                .map_err(|e| format!("Failed to parse config: {}", e))?;

            info!("Tapo Agent starting with {} devices", config.devices.len());

            run_agent(config).await?;
        }
    }

    Ok(())
}
